import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const fixturePath = resolve(
  process.env.FE034_CANARY_IMAGE ?? (() => { throw new Error('FE034_CANARY_IMAGE is required'); })(),
);
const expectedSha256 = process.env.FE034_CANARY_SHA256?.trim() ?? '';
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const fixtureBytes = await readFile(fixturePath);
const fixtureSha256 = createHash('sha256').update(fixtureBytes).digest('hex');

if (expectedSha256 && fixtureSha256 !== expectedSha256) {
  throw new Error(
    `FE034 fixture SHA-256 mismatch: expected ${expectedSha256}, got ${fixtureSha256}`,
  );
}

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
]);

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/__fe034_fixture.png') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'no-store');
        res.end(fixtureBytes);
        return;
      }

      const pathname = decodeURIComponent(
        url.pathname === '/' ? '/face-reading.html' : url.pathname,
      );
      const relative = normalize(pathname).replace(/^[/\\]+/, '');
      const file = resolve(root, relative);
      assert(file.startsWith(`${root}${sep}`), 'request escaped static root');
      assert((await stat(file)).isFile(), 'not a file');
      res.setHeader(
        'Content-Type',
        mime.get(extname(file).toLowerCase()) ?? 'application/octet-stream',
      );
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
  for (let i = 0; i < 120; i += 1) {
    assert(process.exitCode === null, `Chrome exited early (${process.exitCode})`);
    try {
      const [port] = (
        await readFile(join(profile, 'DevToolsActivePort'), 'utf8')
      ).trim().split(/\r?\n/);
      if (port) return Number(port);
    } catch {}
    await sleep(50);
  }
  throw new Error('Chrome DevTools port timeout');
}

async function cdp(port) {
  const response = await fetch(
    `http://127.0.0.1:${port}/json/new?about%3Ablank`,
    { method: 'PUT' },
  );
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

  const send = (method, params = {}) =>
    new Promise((done, reject) => {
      const requestId = ++id;
      pending.set(requestId, { method, resolve: done, reject });
      ws.send(JSON.stringify({ id: requestId, method, params }));
    });

  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    assert(
      !result.exceptionDetails,
      `Runtime.evaluate failed: ${result.exceptionDetails?.text ?? 'unknown'}`,
    );
    return result.result?.value;
  };

  await Promise.all([send('Page.enable'), send('Runtime.enable')]);
  return { send, evaluate, close: () => ws.close() };
}

async function waitForPage(client, origin) {
  const result = await client.send('Page.navigate', {
    url: `${origin}/face-reading.html`,
  });
  assert(!result.errorText, `navigation failed: ${result.errorText}`);

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const ready = await client.evaluate(`(() => ({
      path: location.pathname,
      state: document.readyState,
      workspace: Boolean(document.querySelector('.phys-workspace')),
    }))()`);
    if (
      ready?.path === '/face-reading.html' &&
      ready.state === 'complete' &&
      ready.workspace
    ) {
      return;
    }
    await sleep(100);
  }
  throw new Error('FE034 physiognomy page readiness timeout');
}

await stat(join(root, 'face-reading.html'));
await stat(join(root, 'face-preview', 'runtime-assets.json'));

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-fe034-canary-'));
const chrome = spawn(
  chromeBin,
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);
let chromeError = '';
chrome.stderr.setEncoding('utf8');
chrome.stderr.on('data', (chunk) => {
  chromeError += chunk;
});
let client;

try {
  client = await cdp(await devtoolsPort(profile, chrome));
  await waitForPage(client, origin);

  const intake = await client.evaluate(`(async () => {
    const response = await fetch('/__fe034_fixture.png', { cache: 'no-store' });
    if (!response.ok) throw new Error('fixture fetch failed: ' + response.status);
    const blob = await response.blob();
    const file = new File([blob], 'fe034-astronaut.png', { type: 'image/png' });
    const inputs = [...document.querySelectorAll('.phys-file-input')];
    if (inputs.length !== 2) throw new Error('unexpected file input count: ' + inputs.length);
    const transfer = new DataTransfer();
    transfer.items.add(file);
    inputs[1].files = transfer.files;
    inputs[1].dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((done) => setTimeout(done, 80));
    const button = document.querySelector('.phys-primary');
    if (!button || button.disabled) throw new Error('analysis button unavailable');
    button.click();
    return { fixtureBytes: blob.size, selected: inputs[1].files?.length ?? 0 };
  })()`);

  assert(intake?.fixtureBytes === fixtureBytes.length, 'browser fixture byte count drift.');
  assert(intake?.selected === 1, 'browser fixture selection failed.');

  const deadline = Date.now() + 60_000;
  let state = null;
  while (Date.now() < deadline) {
    state = await client.evaluate(`(() => ({
      ready: Boolean(document.querySelector('.phys-result.is-ready')),
      rejected: Boolean(document.querySelector('.phys-result.is-rejected')),
      processing: Boolean(document.querySelector('.phys-processing')),
      text: document.querySelector('.phys-result')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
    }))()`);

    if (state?.ready) break;
    if (state?.rejected) {
      throw new Error(`FE034 real-face canary rejected: ${state.text}`);
    }
    await sleep(150);
  }

  assert(state?.ready === true, 'FE034 real-face canary timed out before successful observation.');
  assert(
    state.text.includes('얼굴 관측이 완료되었습니다.'),
    `FE034 success copy missing: ${state.text}`,
  );
  assert(
    state.text.includes('확인 가능한 영역'),
    `FE034 observation summary missing: ${state.text}`,
  );

  process.stdout.write(
    JSON.stringify({
      status: 'FE034_REAL_BROWSER_FACE_LANDMARKER_CANARY_PASS',
      fixtureSha256,
      fixtureBytes: fixtureBytes.length,
      realEnginePackage: true,
      realRuntimeAssets: true,
      faceObservationSucceeded: true,
      userImagePersisted: false,
      identityEmbeddingCreated: false,
      resultText: state.text,
    }) + '\n',
  );
} catch (error) {
  if (chromeError) process.stderr.write(chromeError.slice(-6000));
  throw error;
} finally {
  client?.close();
  server.close();
  if (chrome.exitCode === null) chrome.kill('SIGTERM');
  await rm(profile, { recursive: true, force: true });
}
