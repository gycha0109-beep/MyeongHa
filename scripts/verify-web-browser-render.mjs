import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const outputRoot = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.avif', 'image/avif'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function startStaticServer() {
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
      const pathname = decodeURIComponent(requestUrl.pathname === '/' ? '/hall.html' : requestUrl.pathname);
      const relativePath = normalize(pathname).replace(/^[/\\]+/, '');
      const absolutePath = resolve(outputRoot, relativePath);
      invariant(absolutePath === outputRoot || absolutePath.startsWith(`${outputRoot}/`), 'Static request escaped output root.');

      const fileStat = await stat(absolutePath);
      invariant(fileStat.isFile(), `Static request did not resolve to a file: ${pathname}`);

      response.statusCode = 200;
      response.setHeader('Content-Type', contentTypes.get(extname(absolutePath).toLowerCase()) ?? 'application/octet-stream');
      createReadStream(absolutePath).pipe(response);
    } catch {
      response.statusCode = 404;
      response.end('Not found');
    }
  });

  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolvePromise());
  });

  const address = server.address();
  invariant(address && typeof address === 'object', 'Static server did not expose an address.');
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

async function waitForDevToolsPort(profileDir, chromeProcess) {
  const portFile = join(profileDir, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (chromeProcess.exitCode !== null) {
      throw new Error(`Chrome exited before DevTools became ready (code ${chromeProcess.exitCode}).`);
    }
    try {
      const raw = await readFile(portFile, 'utf8');
      const [port] = raw.trim().split(/\r?\n/);
      if (port) {
        return Number(port);
      }
    } catch {
      // Chrome creates DevToolsActivePort asynchronously.
    }
    await sleep(50);
  }
  throw new Error('Timed out waiting for Chrome DevToolsActivePort.');
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();

    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) {
        return;
      }

      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }

      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(`${pending.method}: ${message.error.message}`));
      } else {
        pending.resolve(message.result ?? {});
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { method, resolve: resolvePromise, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      throw new Error(`Runtime.evaluate failed: ${result.exceptionDetails.text ?? 'unknown exception'}`);
    }
    return result.result?.value;
  }

  close() {
    this.socket.close();
  }
}

async function connectPage(devtoolsPort) {
  const response = await fetch(`http://127.0.0.1:${devtoolsPort}/json/new?about%3Ablank`, { method: 'PUT' });
  invariant(response.ok, `Failed to create Chrome page: HTTP ${response.status}`);
  const target = await response.json();
  invariant(target.webSocketDebuggerUrl, 'Chrome page did not expose a debugger websocket URL.');

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolvePromise, reject) => {
    socket.addEventListener('open', resolvePromise, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  const client = new CdpClient(socket);
  await Promise.all([client.send('Page.enable'), client.send('Runtime.enable')]);
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  return client;
}

async function waitForDocument(client, expectedPathname, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await client.evaluate(`({ pathname: location.pathname, readyState: document.readyState })`);
    if (state?.pathname === expectedPathname && state.readyState === 'complete') {
      return;
    }
    await sleep(50);
  }
  throw new Error(`Timed out waiting for browser document ${expectedPathname}.`);
}

async function navigateAndWait(client, url, expectedPathname) {
  const navigation = await client.send('Page.navigate', { url });
  invariant(!navigation.errorText, `Browser navigation failed for ${url}: ${navigation.errorText}`);
  await waitForDocument(client, expectedPathname);
}

async function run() {
  await stat(join(outputRoot, 'hall.html'));
  await stat(join(outputRoot, 'reading.html'));

  const { server, origin } = await startStaticServer();
  const profileDir = await mkdtemp(join(tmpdir(), 'myeongha-browser-smoke-'));
  const chromeProcess = spawn(chromeBin, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  let chromeError = '';
  chromeProcess.stderr.setEncoding('utf8');
  chromeProcess.stderr.on('data', (chunk) => {
    chromeError += chunk;
  });

  let client;
  try {
    const devtoolsPort = await waitForDevToolsPort(profileDir, chromeProcess);
    client = await connectPage(devtoolsPort);
    await navigateAndWait(client, `${origin}/hall.html`, '/hall.html');

    const hallState = await client.evaluate(`(() => {
      const link = document.querySelector('a.product-nav-link[href="reading.html"]');
      if (!link) return { ok: false, reason: 'missing Saju navigation link' };
      const rect = link.getBoundingClientRect();
      const style = getComputedStyle(link);
      return {
        ok: rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden',
        reason: 'Saju navigation link is not visibly rendered',
      };
    })()`);
    invariant(hallState?.ok, hallState?.reason ?? 'Hall Saju navigation check failed.');

    const clicked = await client.evaluate(`(() => {
      const link = document.querySelector('a.product-nav-link[href="reading.html"]');
      if (!link) return false;
      link.click();
      return true;
    })()`);
    invariant(clicked, 'Could not click Hall Saju navigation link.');
    await waitForDocument(client, '/reading.html');

    const readingState = await client.evaluate(`(() => {
      const inspect = (selector, minWidth = 1, minHeight = 1) => {
        const element = document.querySelector(selector);
        if (!element) return { selector, exists: false };
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          selector,
          exists: true,
          display: style.display,
          visibility: style.visibility,
          opacity: Number(style.opacity),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          visible: style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width >= minWidth && rect.height >= minHeight,
        };
      };

      return {
        pathname: location.pathname,
        bodyText: document.body.innerText,
        scopeText: document.querySelector('[data-reading-scope]')?.textContent?.trim() ?? '',
        progressText: document.querySelector('[data-reading-progress-label]')?.textContent?.trim() ?? '',
        stepTitle: document.querySelector('[data-reading-step-title]')?.textContent?.trim() ?? '',
        styleSheets: [...document.styleSheets].map((sheet) => sheet.href ? new URL(sheet.href).pathname : 'inline'),
        elements: [
          inspect('.product-header', 100, 40),
          inspect('.reading-stage', 500, 500),
          inspect('.reader-scene', 200, 400),
          inspect('.reader-identity', 100, 40),
          inspect('.reading-sheet', 300, 400),
          inspect('.reading-sheet-actions', 200, 40),
        ],
      };
    })()`);

    invariant(readingState?.pathname === '/reading.html', `Expected /reading.html after click, got ${readingState?.pathname ?? 'unknown'}.`);
    for (const stylesheet of ['/product.css', '/reading-v3.css', '/reading-scenes.css']) {
      invariant(readingState.styleSheets?.includes(stylesheet), `Browser did not load stylesheet ${stylesheet}.`);
    }
    for (const element of readingState.elements ?? []) {
      invariant(element.exists, `Missing browser-rendered element ${element.selector}.`);
      invariant(element.visible, `Browser-rendered element is not visible: ${element.selector} (${element.width}x${element.height}, display=${element.display}, visibility=${element.visibility}, opacity=${element.opacity}).`);
    }

    invariant(/^\d{4}년 · 올해$/.test(readingState.scopeText), `Unexpected reading scope: ${readingState.scopeText}`);
    invariant(readingState.progressText === '읽기 1 / 4', `Unexpected reading progress: ${readingState.progressText}`);
    invariant(readingState.stepTitle === '지금 읽히는 흐름', `Unexpected first reading title: ${readingState.stepTitle}`);
    invariant(readingState.bodyText.includes('내 명식 보기'), 'Rendered Reading is missing "내 명식 보기".');
    invariant(readingState.bodyText.includes('다음 읽기'), 'Rendered Reading is missing "다음 읽기".');
    invariant(readingState.bodyText.trim() !== readingState.scopeText, 'Reading collapsed to only the scope text.');

    const advanced = await client.evaluate(`(() => {
      const button = document.querySelector('[data-reading-next]');
      if (!button) return null;
      button.click();
      return document.querySelector('[data-reading-progress-label]')?.textContent?.trim() ?? '';
    })()`);
    invariant(advanced === '읽기 2 / 4', `Reading runtime did not advance to step 2; got ${advanced ?? 'missing'}.`);

    const screenshot = await client.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
    });
    invariant(screenshot.data, 'Chrome did not return a Reading screenshot.');
    const artifactDir = resolve(process.cwd(), 'artifacts');
    await mkdir(artifactDir, { recursive: true });
    await writeFile(
      join(artifactDir, 'web-reading-browser-smoke.png'),
      Buffer.from(screenshot.data, 'base64'),
    );

    console.log(JSON.stringify({
      status: 'MyeongHa_WEB_BROWSER_RENDER_PASS',
      pathname: readingState.pathname,
      scope: readingState.scopeText,
      progress: readingState.progressText,
      rendered: readingState.elements.map(({ selector, width, height }) => ({ selector, width, height })),
    }));
  } catch (error) {
    if (chromeError.trim()) {
      console.error(chromeError.trim());
    }
    throw error;
  } finally {
    client?.close();
    if (chromeProcess.exitCode === null) {
      chromeProcess.kill('SIGTERM');
    }
    await new Promise((resolvePromise) => server.close(() => resolvePromise()));
    await rm(profileDir, { recursive: true, force: true });
  }
}

await run();
