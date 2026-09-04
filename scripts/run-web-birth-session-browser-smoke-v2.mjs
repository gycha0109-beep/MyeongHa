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
]);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const requests = {
  bootstrap: 0,
  refresh: 0,
  current: 0,
  create: 0,
  lastCurrentAuthorization: null,
  lastCreateAuthorization: null,
};

function resetRequests() {
  Object.assign(requests, {
    bootstrap: 0,
    refresh: 0,
    current: 0,
    create: 0,
    lastCurrentAuthorization: null,
    lastCreateAuthorization: null,
  });
}

function envelope(data) {
  return JSON.stringify({
    ok: true,
    data,
    meta: {
      apiContractVersion: 'v0.9',
      requestId: 'birth-session-browser-smoke-v2',
      serverTime: '2026-09-05T00:00:00.000Z',
    },
  });
}

function currentBirthProfile() {
  return {
    birthProfile: {
      birthProfileId: '22222222-2222-4222-8222-222222222222',
      profileKind: 'self',
      label: null,
      archivedAt: null,
      currentRevision: {
        revisionId: '33333333-3333-4333-8333-333333333333',
        revisionNo: 3,
        input: {
          calendarType: 'solar',
          birthDate: '2000-01-02',
          birthTime: '03:04:00',
          timeKnown: true,
          isLeapMonth: false,
          sex: null,
        },
      },
    },
  };
}

function refreshedSession() {
  return {
    status: 'authenticated',
    session: {
      accessToken: 'refreshed.header.signature',
      refreshToken: 'refresh-token-2',
      expiresAt: '2099-01-01T00:00:00.000Z',
      tokenType: 'bearer',
      user: {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'member@example.com',
      },
    },
  };
}

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const authorization = req.headers.authorization ?? '';
      res.setHeader('Cache-Control', 'no-store');

      if (url.pathname === '/prime.html') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end('<!doctype html><title>prime</title>');
        return;
      }

      if (url.pathname === '/api/session/bootstrap' && req.method === 'POST') {
        requests.bootstrap += 1;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(envelope({ kind: 'guest', guestSession: { bearerToken: 'fresh-guest-bearer' } }));
        return;
      }

      if (url.pathname === '/api/auth/refresh' && req.method === 'POST') {
        requests.refresh += 1;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(envelope(refreshedSession()));
        return;
      }

      if (url.pathname === '/api/me/birth-profile' && req.method === 'GET') {
        requests.current += 1;
        requests.lastCurrentAuthorization = authorization;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');

        if (authorization === 'Bearer malformed-guest-bearer') {
          res.end(envelope({ unexpected: true }));
          return;
        }
        if (authorization === 'Bearer unauthorized-guest-bearer') {
          res.statusCode = 401;
          res.end(JSON.stringify({ ok: false, error: { code: 'UNAUTHORIZED' } }));
          return;
        }
        if (
          authorization === 'Bearer member.header.signature' ||
          authorization === 'Bearer refreshed.header.signature'
        ) {
          res.end(envelope(currentBirthProfile()));
          return;
        }
        if (
          authorization === 'Bearer existing-guest-bearer' ||
          authorization === 'Bearer fresh-guest-bearer'
        ) {
          res.end(envelope({ birthProfile: null }));
          return;
        }

        res.statusCode = 401;
        res.end(JSON.stringify({ ok: false, error: { code: 'UNAUTHORIZED' } }));
        return;
      }

      if (url.pathname === '/api/birth-profiles' && req.method === 'POST') {
        requests.create += 1;
        requests.lastCreateAuthorization = authorization;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        if (
          authorization !== 'Bearer existing-guest-bearer' &&
          authorization !== 'Bearer fresh-guest-bearer'
        ) {
          res.statusCode = 401;
          res.end(JSON.stringify({ ok: false, error: { code: 'UNAUTHORIZED' } }));
          return;
        }
        res.end(envelope({
          birthProfileId: '44444444-4444-4444-8444-444444444444',
          revisionId: '55555555-5555-4555-8555-555555555555',
          revisionNo: 1,
        }));
        return;
      }

      const pathname = decodeURIComponent(url.pathname === '/' ? '/birth.html' : url.pathname);
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
  assert(address && typeof address === 'object', 'server address unavailable');
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

async function connectCdp(port) {
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
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  return { send, evaluate, close: () => ws.close() };
}

async function navigate(client, url, expectedPath) {
  const result = await client.send('Page.navigate', { url });
  assert(!result.errorText, `Navigation failed: ${result.errorText}`);
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const ready = await client.evaluate(`document.readyState === 'complete' && location.pathname === ${JSON.stringify(expectedPath)}`);
    if (ready) return;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${expectedPath}`);
}

async function waitFor(client, expression, message) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return;
    await sleep(50);
  }
  throw new Error(message);
}

async function primeStorage(client, origin, setup = '') {
  await navigate(client, `${origin}/prime.html`, '/prime.html');
  await client.evaluate(`(() => {
    localStorage.clear();
    sessionStorage.clear();
    ${setup}
  })()`);
}

async function openBirth(client, origin) {
  await navigate(client, `${origin}/birth.html`, '/birth.html');
}

async function fillAndSubmit(client) {
  await client.evaluate(`(() => {
    document.querySelector('#birth-date').value = '2001-02-03';
    document.querySelector('#birth-time').value = '04:05';
    document.querySelector('#birth-sex').value = 'unspecified';
    document.querySelector('#birth-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  })()`);
}

async function capture(client, suffix) {
  const dir = resolve(process.cwd(), 'artifacts');
  await mkdir(dir, { recursive: true });
  const shot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  if (shot.data) {
    await writeFile(join(dir, `web-birth-session-browser-smoke-${suffix}.png`), Buffer.from(shot.data, 'base64'));
  }
}

for (const file of ['birth.html', 'styles.css', 'birth-page.js', 'birth-runtime-client.js', 'api-envelope.js', 'product-auth.js']) {
  await stat(join(root, file));
}

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-birth-session-browser-smoke-v2-'));
const chrome = spawn(chromeBin, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
let chromeError = '';
chrome.stderr.setEncoding('utf8');
chrome.stderr.on('data', (chunk) => { chromeError += chunk; });
let client;

try {
  client = await connectCdp(await devtoolsPort(profile, chrome));

  // Fresh guest: establish same-origin storage on a non-Birth page, then measure exactly one bootstrap.
  await primeStorage(client, origin);
  resetRequests();
  await openBirth(client, origin);
  await waitFor(client, `document.querySelector('#birth-form')?.hidden === false`, 'fresh guest create form did not open');
  assert(requests.bootstrap === 1, `fresh guest bootstrap count mismatch: ${requests.bootstrap}`);
  assert(requests.lastCurrentAuthorization === 'Bearer fresh-guest-bearer', 'fresh guest current read used the wrong bearer');
  assert(await client.evaluate(`sessionStorage.getItem('myeongha.guestBearer.v1') === 'fresh-guest-bearer'`), 'fresh guest bearer was not stored');
  await fillAndSubmit(client);
  await waitFor(client, `document.querySelector('#birth-status')?.innerText.includes('revision 1이 저장되었습니다.')`, 'fresh guest create did not render success');
  assert(requests.create === 1, `fresh guest create count mismatch: ${requests.create}`);
  assert(requests.lastCreateAuthorization === 'Bearer fresh-guest-bearer', 'fresh guest create used the wrong bearer');
  await capture(client, 'fresh-guest-created');

  // Existing guest: reuse the opaque bearer, no bootstrap, same bearer for current read and create.
  await primeStorage(client, origin, `sessionStorage.setItem('myeongha.guestBearer.v1', 'existing-guest-bearer');`);
  resetRequests();
  await openBirth(client, origin);
  await waitFor(client, `document.querySelector('#birth-form')?.hidden === false`, 'existing guest create form did not open');
  assert(requests.bootstrap === 0, 'existing guest unexpectedly bootstrapped a new session');
  assert(requests.lastCurrentAuthorization === 'Bearer existing-guest-bearer', 'existing guest current read used the wrong bearer');
  await fillAndSubmit(client);
  await waitFor(client, `document.querySelector('#birth-status')?.innerText.includes('revision 1이 저장되었습니다.')`, 'existing guest create did not render success');
  assert(requests.create === 1, 'existing guest create count mismatch');
  assert(requests.lastCreateAuthorization === 'Bearer existing-guest-bearer', 'existing guest create used the wrong bearer');

  // Member with current Birth: existing state only; even synthetic submit must produce POST=0.
  await primeStorage(client, origin, `localStorage.setItem('myeongha.memberSession.v1', JSON.stringify({
    accessToken: 'member.header.signature',
    refreshToken: 'refresh-token',
    expiresAt: '2099-01-01T00:00:00.000Z',
    tokenType: 'bearer',
    user: { id: '11111111-1111-4111-8111-111111111111', email: 'member@example.com' }
  }));`);
  resetRequests();
  await openBirth(client, origin);
  await waitFor(client, `document.querySelector('#birth-existing')?.hidden === false`, 'member current Birth state did not render');
  assert(requests.bootstrap === 0, 'member unexpectedly bootstrapped a guest session');
  assert(requests.lastCurrentAuthorization === 'Bearer member.header.signature', 'member current read used the wrong bearer');
  await client.evaluate(`document.querySelector('#birth-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))`);
  await sleep(250);
  assert(requests.create === 0, 'current Birth Profile allowed a duplicate POST');

  // Expired member session: refresh-aware continuity stays on member bearer and never bootstraps a Guest.
  await primeStorage(client, origin, `localStorage.setItem('myeongha.memberSession.v1', JSON.stringify({
    accessToken: 'expired.header.signature',
    refreshToken: 'refresh-token',
    expiresAt: '2000-01-01T00:00:00.000Z',
    tokenType: 'bearer',
    user: { id: '11111111-1111-4111-8111-111111111111', email: 'member@example.com' }
  }));`);
  resetRequests();
  await openBirth(client, origin);
  await waitFor(client, `document.querySelector('#birth-existing')?.hidden === false`, 'refreshed member current Birth state did not render');
  assert(requests.refresh === 1, `member refresh count mismatch: ${requests.refresh}`);
  assert(requests.bootstrap === 0, 'refreshed member unexpectedly bootstrapped a guest session');
  assert(requests.lastCurrentAuthorization === 'Bearer refreshed.header.signature', 'refreshed member current read used the wrong bearer');

  // Unauthorized and malformed current reads both lock create UI and never POST.
  for (const [bearer, expectedText] of [
    ['unauthorized-guest-bearer', '새 명식록 생성을 허용하지 않습니다.'],
    ['malformed-guest-bearer', '중복 생성을 막기 위해 새 명식록 입력을 잠갔습니다.'],
  ]) {
    await primeStorage(client, origin, `sessionStorage.setItem('myeongha.guestBearer.v1', ${JSON.stringify(bearer)});`);
    resetRequests();
    await openBirth(client, origin);
    await waitFor(client, `document.querySelector('#birth-status')?.innerText.includes(${JSON.stringify(expectedText)})`, `${bearer} did not fail closed`);
    assert(await client.evaluate(`document.querySelector('#birth-form')?.hidden === true`), `${bearer} exposed create form`);
    assert(requests.create === 0, `${bearer} issued create POST`);
  }

  // Mobile 390px: authoritative empty state opens a bounded form and action.
  await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await primeStorage(client, origin, `sessionStorage.setItem('myeongha.guestBearer.v1', 'existing-guest-bearer');`);
  resetRequests();
  await openBirth(client, origin);
  await waitFor(client, `document.querySelector('#birth-form')?.hidden === false`, 'mobile empty Birth form did not open');
  const mobile = await client.evaluate(`(() => {
    const form = document.querySelector('#birth-form')?.getBoundingClientRect();
    const button = document.querySelector('#birth-submit-button')?.getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth - innerWidth,
      formLeft: form?.left ?? -1,
      formRight: form?.right ?? 9999,
      buttonLeft: button?.left ?? -1,
      buttonRight: button?.right ?? 9999,
    };
  })()`);
  assert(mobile.overflow <= 2, `mobile horizontal overflow: ${mobile.overflow}px`);
  assert(mobile.formLeft >= 0 && mobile.formRight <= 390, 'Birth form escapes mobile viewport');
  assert(mobile.buttonLeft >= 0 && mobile.buttonRight <= 390, 'Birth action escapes mobile viewport');
  await capture(client, 'mobile-empty');

  console.log('MyeongHa_WEB_BIRTH_SESSION_BROWSER_PASS');
} catch (error) {
  console.error(error);
  if (chromeError.trim()) console.error(chromeError.trim().slice(-4000));
  process.exitCode = 1;
} finally {
  client?.close();
  if (chrome.exitCode === null) {
    const exited = new Promise((done) => chrome.once('exit', done));
    chrome.kill('SIGTERM');
    await Promise.race([exited, sleep(2_000)]);
  }
  await new Promise((done) => server.close(done));
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
