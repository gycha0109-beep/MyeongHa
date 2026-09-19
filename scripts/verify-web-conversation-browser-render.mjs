import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const chromeBin = process.env.CHROME_BIN;
if (!chromeBin) throw new Error('CHROME_BIN is required.');

const publicDir = new URL('../public/', import.meta.url);
const artifactDir = new URL('../artifacts/', import.meta.url);
const artifactPrefix = 'web-conversation-browser-smoke';

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
]);

function contentType(pathname) {
  return mime.get(extname(pathname).toLowerCase()) ?? 'application/octet-stream';
}

async function startStaticServer() {
  const root = resolve(fileURLToPath(publicDir));
  const server = createServer(async (req, res) => {
    try {
      const rawPath = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
      const relative = rawPath === '/' ? 'hall.html' : rawPath.replace(/^\/+/, '');
      const path = resolve(root, relative);
      if (!path.startsWith(`${root}${sep}`)) {
        res.writeHead(403).end('Forbidden');
        return;
      }
      const body = await readFile(path);
      res.writeHead(200, {
        'content-type': contentType(path),
        'cache-control': 'no-store',
      });
      res.end(body);
    } catch {
      res.writeHead(404).end('Not found');
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Static server did not expose a TCP port.');
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

function waitForDevTools(child) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timeout = setTimeout(() => reject(new Error(`Chrome DevTools endpoint timed out. stderr=${buffer}`)), 15_000);

    const onData = (chunk) => {
      buffer += chunk.toString();
      const match = buffer.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:(\d+)\/devtools\/browser\/[^\s]+)/);
      if (!match) return;
      clearTimeout(timeout);
      child.stderr.off('data', onData);
      resolve({ browserWs: match[1], port: Number(match[2]) });
    };

    child.stderr.on('data', onData);
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Chrome exited before DevTools was ready: ${code}. stderr=${buffer}`));
    });
  });
}

async function startChrome() {
  const profileDir = await mkdtemp(join(tmpdir(), 'myeongha-conversation-chrome-'));
  const child = spawn(chromeBin, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const devtools = await waitForDevTools(child);
  return {
    child,
    profileDir,
    port: devtools.port,
    async close() {
      child.kill('SIGTERM');
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 2_000);
        child.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
      await rm(profileDir, { recursive: true, force: true });
    },
  };
}

class CdpPage {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`${pending.method}: ${JSON.stringify(message.error)}`));
      else pending.resolve(message.result ?? {});
    });
  }

  static async open(debugPort, url) {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
    if (!response.ok) throw new Error(`Unable to create Chrome target: ${response.status}`);
    const target = await response.json();
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    const page = new CdpPage(ws);
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    return page;
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async viewport(width, height, mobile = false) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile,
      screenWidth: width,
      screenHeight: height,
    });
  }

  async navigate(url) {
    await this.send('Page.navigate', { url });
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const ready = await this.evaluate('document.readyState');
      if (ready === 'complete') {
        await new Promise((resolve) => setTimeout(resolve, 250));
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 75));
    }
    throw new Error(`Page did not finish loading: ${url}`);
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(`Browser evaluation failed: ${expression}`);
    return result.result?.value;
  }

  async screenshot(path) {
    const result = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(path, Buffer.from(result.data, 'base64'));
  }

  close() {
    this.ws.close();
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitFor(page, expression, message, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await page.evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const diagnostics = await page.evaluate(`(() => ({
    readyState: document.readyState,
    bodyText: document.body?.innerText?.slice(0, 240) ?? '',
    rootChildren: document.querySelector('#chat-hub-react-root')?.children.length ?? null,
    controllerReady: Boolean(window.MyeongHaChatHub),
    resources: performance.getEntriesByType('resource').map((entry) => entry.name),
  }))()`);
  throw new Error(`${message}; diagnostics=${JSON.stringify(diagnostics)}`);
}

async function verifyHub(page, origin, suffix, width, height, mobile) {
  await page.viewport(width, height, mobile);
  await page.navigate(`${origin}/chat-hub.html`);
  await waitFor(
    page,
    `Boolean(document.querySelector('.conversation-primary') && document.querySelector('.chat-person-art[data-character="seyeon"]') && document.querySelector('.chat-person-art[data-character="baekheon"]'))`,
    `${suffix}: conversation hub React/controller mount did not finish`,
  );

  const state = await page.evaluate(`(() => {
    const expectedPortraits = {
      seyeon: 'seyeon-portrait.webp',
      baekheon: 'baekheon-portrait.webp',
      yeoul: 'yeoul-portrait.webp',
      seorin: 'seorin-portrait.webp',
      rahyeon: 'rahyeon-portrait.webp',
      mira: 'mira-portrait.webp',
      taegyeom: 'taegyeom-portrait.webp',
      yunho: 'yunho-portrait.webp',
      doyoon: 'doyoon-portrait.webp',
    };
    const portraits = Object.entries(expectedPortraits).map(([key, filename]) => {
      const art = document.querySelector('.chat-person-art[data-character="' + key + '"]');
      const image = art?.querySelector('.chat-person-art-image');
      const artRect = art?.getBoundingClientRect();
      const imageRect = image?.getBoundingClientRect();
      const style = image ? getComputedStyle(image) : null;
      return {
        key,
        filename,
        present: image instanceof HTMLImageElement,
        src: image instanceof HTMLImageElement ? image.currentSrc || image.src : '',
        complete: image instanceof HTMLImageElement ? image.complete : false,
        naturalWidth: image instanceof HTMLImageElement ? image.naturalWidth : 0,
        naturalHeight: image instanceof HTMLImageElement ? image.naturalHeight : 0,
        artWidth: artRect?.width ?? 0,
        artHeight: artRect?.height ?? 0,
        imageWidth: imageRect?.width ?? 0,
        imageHeight: imageRect?.height ?? 0,
        objectFit: style?.objectFit ?? '',
        transform: style?.transform ?? '',
        overflow: art ? getComputedStyle(art).overflow : '',
      };
    });

    const root = document.documentElement;
    const previousTheme = root.dataset.theme;
    root.dataset.theme = 'dark';
    const firstTag = document.querySelector('.chat-person-tag');
    const darkTagStyle = firstTag ? getComputedStyle(firstTag) : null;
    const darkTag = {
      color: darkTagStyle?.color ?? '',
      backgroundColor: darkTagStyle?.backgroundColor ?? '',
      borderColor: darkTagStyle?.borderColor ?? '',
      fontWeight: darkTagStyle?.fontWeight ?? '',
    };
    if (previousTheme) root.dataset.theme = previousTheme;
    else delete root.dataset.theme;

    return {
      title: document.title,
      text: document.body.innerText,
      intro: Boolean(document.querySelector('.conversation-hub-intro')),
      primary: Boolean(document.querySelector('.conversation-primary')),
      featured: Boolean(document.querySelector('.conversation-featured')),
      threads: Boolean(document.querySelector('.conversation-thread-panel')),
      discovery: Boolean(document.querySelector('.conversation-people')),
      portraits,
      darkTag,
      incomingHidden: document.querySelector('[data-incoming-section]')?.hidden === true,
    };
  })()`);

  assert(state.intro && state.primary && state.featured && state.threads && state.discovery, `${suffix}: conversation hub surfaces missing`);
  assert(state.text.includes('누구와 이야기를 이어갈까요?'), `${suffix}: relationship-first subtitle missing`);
  assert(state.text.includes('내 대화'), `${suffix}: 내 대화 heading missing`);
  assert(state.text.includes('다른 사람 만나기'), `${suffix}: discovery entry missing`);
  assert(state.incomingHidden, `${suffix}: incoming stories must stay hidden without runtime authority`);
  assert(state.portraits.length === 9, `${suffix}: expected nine finalized portrait cards`);
  for (const portrait of state.portraits) {
    assert(portrait.present, `${suffix}: ${portrait.key} portrait image element missing`);
    assert(portrait.src.includes('/assets/characters/' + portrait.filename), `${suffix}: ${portrait.key} portrait mapping drifted`);
    assert(portrait.complete && portrait.naturalWidth > 0 && portrait.naturalHeight > 0, `${suffix}: ${portrait.key} portrait did not decode`);
    assert(portrait.objectFit === 'cover', `${suffix}: ${portrait.key} portrait must cover its rail`);
    assert(portrait.overflow === 'hidden', `${suffix}: ${portrait.key} portrait rail must clip crop overflow`);
    assert(portrait.artWidth > 0 && portrait.artHeight > 0 && portrait.imageWidth >= portrait.artWidth && portrait.imageHeight >= portrait.artHeight, `${suffix}: ${portrait.key} portrait does not fill its rail`);
    assert(portrait.transform !== 'none', `${suffix}: ${portrait.key} portrait crop zoom is missing`);
  }
  assert(state.darkTag.color === 'rgb(243, 231, 213)', `${suffix}: dark trait-chip text contrast regressed`);
  assert(state.darkTag.backgroundColor !== 'rgba(0, 0, 0, 0)', `${suffix}: dark trait-chip background contrast regressed`);
  assert(Number.parseInt(state.darkTag.fontWeight, 10) >= 600, `${suffix}: trait-chip weight regressed`);
  await page.screenshot(fileURLToPath(new URL(`../artifacts/${artifactPrefix}-${suffix}.png`, import.meta.url)));
  return state;
}

async function verifyRoom(page, origin, suffix, width, height, mobile) {
  await page.viewport(width, height, mobile);
  await page.navigate(`${origin}/chat.html?character=seyeon`);

  const state = await page.evaluate(`(() => {
    const scene = document.querySelector('.conversation-room-scene');
    const panel = document.querySelector('.conversation-chat-panel');
    const stream = document.querySelector('[data-chat-stream]');
    const composer = document.querySelector('[data-composer]');
    const globalHeader = document.querySelector('.conversation-room-product-header');
    return {
      character: document.body.dataset.character,
      title: document.title,
      scene: Boolean(scene),
      panel: Boolean(panel),
      stream: Boolean(stream),
      composer: Boolean(composer),
      sceneBg: scene ? getComputedStyle(scene).backgroundImage : '',
      contextHidden: document.querySelector('[data-context-pill]')?.hidden === true,
      threadHidden: document.querySelector('[data-thread-bar]')?.hidden === true,
      globalHeaderDisplay: globalHeader ? getComputedStyle(globalHeader).display : '',
      streamOverflow: stream ? getComputedStyle(stream).overflowY : '',
    };
  })()`);

  assert(state.character === 'seyeon', `${suffix}: character identity did not bind to Se-yeon`);
  assert(state.scene && state.panel && state.stream && state.composer, `${suffix}: room surfaces missing`);
  assert(state.sceneBg.includes('seyeon-chat.webp'), `${suffix}: approved Se-yeon scene asset is not rendered`);
  assert(state.contextHidden && state.threadHidden, `${suffix}: unverified continuation context became visible`);
  assert(['auto', 'scroll'].includes(state.streamOverflow), `${suffix}: conversation stream is not scrollable`);
  if (mobile) assert(state.globalHeaderDisplay === 'none', `${suffix}: desktop product header should be hidden in mobile room`);
  await page.screenshot(fileURLToPath(new URL(`../artifacts/${artifactPrefix}-${suffix}.png`, import.meta.url)));

  await page.navigate(`${origin}/chat.html?character=baekheon`);
  const baekheonScene = await page.evaluate(`getComputedStyle(document.querySelector('.conversation-room-scene')).backgroundImage`);
  assert(!baekheonScene.includes('seyeon-chat.webp'), `${suffix}: Se-yeon scene leaked onto Baekheon placeholder`);
  return state;
}

await mkdir(artifactDir, { recursive: true });
const server = await startStaticServer();
const chrome = await startChrome();
let page;
try {
  page = await CdpPage.open(chrome.port, `${server.origin}/chat-hub.html`);
  const results = {
    desktopHub: await verifyHub(page, server.origin, 'hub-desktop', 1440, 1000, false),
    mobileHub: await verifyHub(page, server.origin, 'hub-mobile', 390, 844, true),
    desktopRoom: await verifyRoom(page, server.origin, 'seyeon-room-desktop', 1440, 1000, false),
    mobileRoom: await verifyRoom(page, server.origin, 'seyeon-room-mobile', 390, 844, true),
  };
  await writeFile(new URL(`../artifacts/${artifactPrefix}.json`, import.meta.url), `${JSON.stringify(results, null, 2)}\n`);
  console.log('MyeongHa conversation browser smoke: PASS');
} finally {
  page?.close();
  await chrome.close();
  await new Promise((resolve) => server.server.close(resolve));
}
