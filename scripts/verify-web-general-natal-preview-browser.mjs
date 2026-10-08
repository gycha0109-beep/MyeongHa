import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'], ['.webp', 'image/webp'],
]);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const bearer = 'synthetic-natal-browser-bearer';
const observedRequests = [];
let malformed = false;

function reading() {
  return {
    responseId: 'reading_response_' + 'b'.repeat(24),
    responseVersion: 'myeonghwa-product-reading-response-v2',
    state: 'delivered',
    messageCode: 'READING_DELIVERED',
    requiredAction: 'none',
    reading: {
      readingId: 'synthetic-general-natal',
      sections: [
        { sectionType: 'overview', state: 'complete', title: '프리뷰 안내',
          blocks: [{ type: 'paragraph', text: '테스트 전용 프리뷰입니다.' }] },
        { sectionType: 'personality', state: 'complete', title: '원국의 구조',
          blocks: malformed
            ? [{ type: 'invented_claim', text: '첫사랑과 재회가 확정됩니다' }]
            : [
              { type: 'paragraph', text: '테스트 전용 원국 해석입니다.' },
              { type: 'source_hint', text: '근거 구조: 테스트 근거' },
            ] },
      ],
      disclosures: [{ type: 'scope_limitation', text: '원국 범위만 표시합니다.' }],
    },
  };
}
function envelope(data) {
  return JSON.stringify({
    ok: true, data, meta: { apiContractVersion: 'v0.9', requestId: 'synthetic-browser-2a' },
  });
}

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/prime.html') {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end('<!doctype html><title>Reading Browser Test</title>');
        return;
      }
      if (url.pathname === '/api/me/saju/preview-reading') {
        let body = '';
        for await (const chunk of req) body += chunk;
        observedRequests.push({
          method: req.method,
          authorization: req.headers.authorization,
          body: JSON.parse(body),
        });
        if (req.method !== 'POST' ||
            req.headers.authorization !== 'Bearer ' + bearer ||
            JSON.parse(body).readingText !== '전체 사주') {
          res.statusCode = 409;
          res.end(JSON.stringify({ ok: false, error: { code: 'SAJU_PREVIEW_READING_UNAVAILABLE' } }));
          return;
        }
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.setHeader('cache-control', 'no-store');
        res.end(envelope({ lifecycle: 'preview', reading: reading() }));
        return;
      }
      if (url.pathname.startsWith('/api/')) {
        observedRequests.push({ unexpected: url.pathname });
        res.statusCode = 404;
        res.end(JSON.stringify({ ok: false, error: { code: 'NOT_FOUND' } }));
        return;
      }
      const relative = normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '');
      const file = resolve(root, relative);
      assert(file.startsWith(root + sep), 'path escapes root');
      assert((await stat(file)).isFile(), 'not a file');
      res.setHeader('content-type', mime.get(extname(file).toLowerCase()) ?? 'application/octet-stream');
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
  assert(address && typeof address === 'object', 'no server address');
  return { server, origin: 'http://127.0.0.1:' + address.port };
}

async function connect(port) {
  const response = await fetch('http://127.0.0.1:' + port + '/json/new?about%3Ablank', { method: 'PUT' });
  assert(response.ok, 'chrome target create failed');
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
    const p = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) p.reject(new Error(message.error.message));
    else p.resolve(message.result ?? {});
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    pending.set(requestId, { resolve, reject });
    ws.send(JSON.stringify({ id: requestId, method, params }));
  });
  const evaluate = async (expression) => {
    const value = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert(!value.exceptionDetails, 'browser expression failed');
    return value.result?.value;
  };
  await Promise.all([send('Page.enable'), send('Runtime.enable')]);
  return { send, evaluate, close: () => ws.close() };
}

async function waitFor(client, expression, label) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return;
    await sleep(100);
  }
  throw new Error('Browser state timeout: ' + label);
}

for (const filename of ['reading-detail.html', 'reading-character.js', 'saju-preview-response-admission.js']) {
  await stat(join(root, filename));
}
const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-natal-browser-'));
const chrome = spawn(chromeBin, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
let chromeLog = '';
chrome.stderr.setEncoding('utf8');
chrome.stderr.on('data', (chunk) => { chromeLog += chunk; });
let client;

try {
  let port = null;
  for (let i = 0; i < 120; i += 1) {
    assert(chrome.exitCode === null, 'Chrome exited prematurely');
    try {
      const value = await readFile(join(profile, 'DevToolsActivePort'), 'utf8');
      port = Number(value.split(/\r?\n/u)[0]);
      if (port) break;
    } catch {}
    await sleep(50);
  }
  assert(port, 'Chrome DevTools port timed out');
  client = await connect(port);

  await client.send('Page.navigate', { url: origin + '/prime.html' });
  await waitFor(client, 'location.pathname === "/prime.html" && document.readyState === "complete"', 'prime');
  await client.evaluate('sessionStorage.setItem("myeongha.guestBearer.v1", ' + JSON.stringify(bearer) + ')');

  await client.send('Page.navigate', { url: origin + '/reading-detail.html?topic=temperament&scope=original' });
  await waitFor(client,
    'document.body?.dataset.readingRouteState === "preview" && document.querySelector("[data-reading-stage]")?.hidden === false',
    'delivered General Natal reading');
  const visible = await client.evaluate('(() => ({ state: document.body.dataset.readingRouteState, ' +
    'title: document.querySelector("[data-reading-step-title]")?.textContent,' +
    'text: document.querySelector("[data-reading-step-body]")?.textContent,' +
    'notice: document.querySelector("[data-reading-authority-note]")?.title }))()');
  assert(visible.title === '원국의 구조', 'Wrong reading title: ' + JSON.stringify(visible));
  assert(visible.text === '테스트 전용 원국 해석입니다.', 'Wrong reading content: ' + JSON.stringify(visible));
  assert(visible.notice === '테스트 전용 프리뷰입니다.', 'Preview notice missing');
  assert(observedRequests.length === 1, 'Expected one General Natal request');
  assert(observedRequests[0].body.readingText === '전체 사주', 'Request was not General Natal');

  malformed = true;
  await client.send('Page.navigate', { url: origin + '/reading-detail.html?topic=temperament&scope=original' });
  await waitFor(client, 'document.body?.dataset.readingRouteState === "preview_unavailable"', 'invalid delivery rejection');
  const hidden = await client.evaluate('document.querySelector("[data-reading-stage]")?.hidden === true');
  assert(hidden, 'Malformed Reading became visible');

  const previousCalls = observedRequests.length;
  await client.send('Page.navigate', { url: origin + '/reading-detail.html?scope=year' });
  await waitFor(client, 'document.body?.dataset.readingRouteState === "blocked_by_authority"', 'unavailable annual');
  assert(observedRequests.length === previousCalls, 'Annual Reading must not call Preview endpoint');
  console.log('MYEONGHA_GENERAL_NATAL_PREVIEW_BROWSER_PASS');
} catch (error) {
  console.error(error);
  if (chromeLog.trim()) console.error(chromeLog.slice(-1200));
  process.exitCode = 1;
} finally {
  client?.close();
  chrome.kill('SIGTERM');
  await Promise.race([new Promise((done) => chrome.once('exit', done)), sleep(1000)]);
  await new Promise((done) => server.close(done));
  await rm(profile, { recursive: true, force: true }).catch(() => undefined);
}
