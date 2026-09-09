import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.webp', 'image/webp'],
]);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const pathname = decodeURIComponent(url.pathname === '/' ? '/hall.html' : url.pathname);
      const relative = normalize(pathname).replace(/^[/\\]+/, '');
      const file = resolve(root, relative);
      assert(file.startsWith(`${root}/`), 'request escaped static root');
      assert((await stat(file)).isFile(), 'not a file');
      res.setHeader('Content-Type', mime.get(extname(file).toLowerCase()) ?? 'application/octet-stream');
      createReadStream(file).pipe(res);
    } catch {
      res.statusCode = 404;
      res.end('Not found');
    }
  });
  await new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', done);
  });
  const address = server.address();
  assert(address && typeof address === 'object', 'static server address unavailable');
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

async function devtoolsPort(profile, process) {
  for (let i = 0; i < 100; i += 1) {
    assert(process.exitCode === null, `Chrome exited early (${process.exitCode})`);
    try {
      const [port] = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).trim().split(/\r?\n/);
      if (port) return Number(port);
    } catch {}
    await sleep(50);
  }
  throw new Error('Chrome DevTools port timeout');
}

async function cdp(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/new?about%3Ablank`, { method: 'PUT' });
  assert(response.ok, `Chrome target create failed: ${response.status}`);
  const target = await response.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, reject) => {
    ws.addEventListener('open', done, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(`${request.method}: ${message.error.message}`));
    else request.resolve(message.result ?? {});
  });
  const send = (method, params = {}) => new Promise((done, reject) => {
    const requestId = ++id;
    pending.set(requestId, { method, resolve: done, reject });
    ws.send(JSON.stringify({ id: requestId, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert(!result.exceptionDetails, `Runtime.evaluate failed: ${result.exceptionDetails?.text ?? 'unknown'}`);
    return result.result?.value;
  };
  await Promise.all([send('Page.enable'), send('Runtime.enable')]);
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  return { send, evaluate, close: () => ws.close() };
}

async function navigate(client, origin, pathname) {
  const result = await client.send('Page.navigate', { url: `${origin}${pathname}` });
  assert(!result.errorText, `Navigation failed for ${pathname}: ${result.errorText}`);
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const ready = await client.evaluate(`(() => ({
      pathname: location.pathname,
      ready: document.readyState === 'complete',
      header: Boolean(document.querySelector('.product-header-inner')),
      auth: document.querySelector('.product-profile')?.dataset.authState ?? null,
    }))()`);
    if (ready?.pathname === pathname && ready.ready && ready.header && ready.auth) return;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for shared header on ${pathname}`);
}

async function inspectHeader(client, origin, pathname) {
  await navigate(client, origin, pathname);
  return client.evaluate(`(() => {
    const header = document.querySelector('.product-header');
    const inner = document.querySelector('.product-header-inner');
    const profile = document.querySelector('.product-profile');
    const brandSub = document.querySelector('.product-brand-sub');
    const headerRect = header?.getBoundingClientRect();
    const innerRect = inner?.getBoundingClientRect();
    const profileRect = profile?.getBoundingClientRect();
    const profileStyle = profile ? getComputedStyle(profile) : null;
    const viewportWidth = document.documentElement.clientWidth;
    return {
      pathname: location.pathname,
      viewportWidth,
      headerHeight: Math.round(headerRect?.height ?? 0),
      innerHeight: Math.round(innerRect?.height ?? 0),
      innerWidth: Math.round(innerRect?.width ?? 0),
      innerLeft: innerRect?.left ?? -1,
      innerRight: innerRect?.right ?? -1,
      centeredDelta: innerRect ? Math.abs(innerRect.left - ((viewportWidth - innerRect.width) / 2)) : 999,
      brandSub: brandSub?.textContent?.trim() ?? '',
      profileVisible: Boolean(profileRect && profileRect.width > 0 && profileRect.height > 0 && profileStyle?.display !== 'none' && profileStyle?.visibility !== 'hidden'),
      profileText: profile?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
      profileHref: profile?.getAttribute('href') ?? '',
      profileAuthState: profile?.dataset.authState ?? null,
      overflow: document.documentElement.scrollWidth - viewportWidth,
    };
  })()`);
}

for (const file of ['hall.html', 'reading.html', 'chat-hub.html', 'product-auth-ui.js', 'product-theme.js']) {
  await stat(join(root, file));
}

const { server, origin } = await serve();
const profileDir = await mkdtemp(join(tmpdir(), 'myeongha-header-browser-'));
const chrome = spawn(chromeBin, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--remote-debugging-port=0', `--user-data-dir=${profileDir}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
let client;
try {
  client = await cdp(await devtoolsPort(profileDir, chrome));
  const home = await inspectHeader(client, origin, '/hall.html');
  const saju = await inspectHeader(client, origin, '/reading.html');
  const chat = await inspectHeader(client, origin, '/chat-hub.html');
  const pages = [home, saju, chat];

  for (const state of pages) {
    assert(state.headerHeight === 93, `${state.pathname} shared header outer height must be 93px including border, got ${state.headerHeight}`);
    assert(state.innerHeight === 92, `${state.pathname} shared header inner height must be 92px, got ${state.innerHeight}`);
    assert(state.innerWidth === 1320, `${state.pathname} shared header shell must be 1320px, got ${state.innerWidth}`);
    assert(state.centeredDelta <= 1, `${state.pathname} header shell is not viewport-centered: delta ${state.centeredDelta}px`);
    assert(state.brandSub === 'MyeongHa', `${state.pathname} brand subtitle drifted: ${state.brandSub}`);
    assert(state.profileVisible, `${state.pathname} login/profile control is hidden`);
    assert(state.profileAuthState === 'guest', `${state.pathname} expected guest auth state, got ${state.profileAuthState}`);
    assert(state.profileText.includes('로그인'), `${state.pathname} guest Login label missing: ${state.profileText}`);
    assert(state.profileHref.startsWith('auth.html?next='), `${state.pathname} guest Login does not route to auth.html: ${state.profileHref}`);
    assert(state.overflow <= 2, `${state.pathname} horizontal overflow: ${state.overflow}px`);
  }

  assert(home.headerHeight === chat.headerHeight && saju.headerHeight === chat.headerHeight, 'Home/Saju header outer height differs from Chat');
  assert(home.innerHeight === chat.innerHeight && saju.innerHeight === chat.innerHeight, 'Home/Saju header inner height differs from Chat');
  assert(home.innerWidth === chat.innerWidth && saju.innerWidth === chat.innerWidth, 'Home/Saju header shell width differs from Chat');
  assert(Math.abs(home.innerLeft - chat.innerLeft) <= 1 && Math.abs(saju.innerLeft - chat.innerLeft) <= 1, 'Home/Saju header alignment differs from Chat');

  const evidence = { status: 'MYEONGHA_SHARED_HEADER_BROWSER_PASS', home, saju, chat };
  await mkdir(resolve(process.cwd(), 'artifacts'), { recursive: true });
  await writeFile(resolve(process.cwd(), 'artifacts/web-golden-master-header-browser-smoke.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence));
} finally {
  client?.close();
  if (chrome.exitCode === null) {
    const exited = new Promise((done) => chrome.once('exit', done));
    chrome.kill('SIGTERM');
    await Promise.race([exited, sleep(2_000)]);
  }
  await new Promise((done) => server.close(done));
  await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
