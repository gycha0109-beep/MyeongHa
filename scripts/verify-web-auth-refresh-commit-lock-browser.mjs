import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const artifactDir = resolve(process.cwd(), 'artifacts');
const artifactPath = join(artifactDir, 'web-auth-refresh-commit-lock-browser-smoke.json');
const lockName = 'myeongha.memberSession.v1.refresh.lock';
const member = Object.freeze({
  id: '88888888-8888-4888-8888-888888888888',
  email: 'refresh-commit-lock@example.com',
});
const original = Object.freeze({
  accessToken: 'old.header.signature',
  refreshToken: 'refresh-old',
  expiresAt: '2099-01-01T00:00:00.000Z',
  tokenType: 'bearer',
  user: member,
});
const staleRefresh = Object.freeze({
  accessToken: 'stale.header.signature',
  refreshToken: 'refresh-stale',
  expiresAt: '2099-01-02T00:00:00.000Z',
  tokenType: 'bearer',
  user: member,
});
const newer = Object.freeze({
  accessToken: 'newer.header.signature',
  refreshToken: 'refresh-newer',
  expiresAt: '2099-01-03T00:00:00.000Z',
  tokenType: 'bearer',
  user: member,
});
const stagedGuest = 'refresh-lock-staged-guest';
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
]);

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
let refreshRequests = 0;
const requests = [];

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const pathname = decodeURIComponent(url.pathname);
      if (pathname === '/api/auth/refresh' && req.method === 'POST') {
        const body = await readJsonBody(req);
        refreshRequests += 1;
        requests.push({ path: pathname, refreshToken: body.refreshToken ?? null });
        sendJson(res, 200, {
          ok: true,
          data: { status: 'authenticated', session: staleRefresh },
          meta: { requestId: `refresh-lock-${refreshRequests}` },
        });
        return;
      }
      if (pathname === '/race.html') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end('<!doctype html><html><body>refresh lock race</body></html>');
        return;
      }
      const relative = normalize(pathname).replace(/^[/\\]+/, '');
      const file = resolve(root, relative);
      assert(file.startsWith(`${root}/`), 'request escaped static root');
      assert((await stat(file)).isFile(), 'not a file');
      res.setHeader('Content-Type', mime.get(extname(file).toLowerCase()) ?? 'application/octet-stream');
      createReadStream(file).pipe(res);
    } catch (error) {
      res.statusCode = 500;
      res.end(error instanceof Error ? error.message : 'Server error');
    }
  });
  await new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', done);
  });
  const address = server.address();
  assert(address && typeof address === 'object', 'browser smoke server address unavailable');
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

async function devtoolsPort(profile, process) {
  for (let index = 0; index < 100; index += 1) {
    assert(process.exitCode === null, `Chrome exited early (${process.exitCode})`);
    try {
      const [port] = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).trim().split(/\r?\n/);
      if (port) return Number(port);
    } catch {}
    await sleep(50);
  }
  throw new Error('Chrome DevTools port timeout');
}

async function stopChrome(process) {
  if (process.exitCode !== null) return;
  const exited = new Promise((done) => {
    process.once('exit', done);
    if (process.exitCode !== null) done();
  });
  process.kill('SIGTERM');
  await Promise.race([exited, sleep(3_000)]);
  if (process.exitCode === null) {
    process.kill('SIGKILL');
    await exited;
  }
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
  return { send, evaluate, close: () => ws.close() };
}

async function waitFor(client, expression, message, timeout = 8_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return;
    await sleep(50);
  }
  throw new Error(message);
}

await stat(join(root, 'product-auth.js'));
const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-auth-refresh-commit-lock-browser-'));
const chrome = spawn(chromeBin, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
let chromeError = '';
chrome.stderr.setEncoding('utf8');
chrome.stderr.on('data', (chunk) => { chromeError += chunk; });
let client;

try {
  client = await connectCdp(await devtoolsPort(profile, chrome));
  await client.send('Page.navigate', { url: `${origin}/race.html` });
  await waitFor(client, `location.pathname === '/race.html' && document.readyState === 'complete'`, 'race page did not load');
  const supportsLocks = await client.evaluate(`Boolean(navigator.locks && typeof navigator.locks.request === 'function')`);
  assert(supportsLocks, 'Chrome Web Locks API unavailable');

  await client.evaluate(`(() => {
    localStorage.setItem('myeongha.memberSession.v1', ${JSON.stringify(JSON.stringify(original))});
    sessionStorage.setItem('myeongha.guestBearer.v1', ${JSON.stringify(original.accessToken)});
    sessionStorage.setItem('myeongha.pendingGuestBearer.v1', ${JSON.stringify(stagedGuest)});
    window.__releaseRefreshCommitLock = null;
    window.__refreshCommitLockHeld = false;
    window.__refreshCommitLockHold = new Promise((resolve) => { window.__releaseRefreshCommitLock = resolve; });
    void navigator.locks.request(${JSON.stringify(lockName)}, { mode: 'exclusive' }, async () => {
      window.__refreshCommitLockHeld = true;
      await window.__refreshCommitLockHold;
    });
  })()`);
  await waitFor(client, `window.__refreshCommitLockHeld === true`, 'external refresh commit lock was not acquired');

  await client.evaluate(`(() => {
    window.__refreshRace = { done: false, value: null, error: null };
    void import('/product-auth.js').then((auth) => auth.refreshMemberSession()).then(
      (value) => { window.__refreshRace = { done: true, value, error: null }; },
      (error) => { window.__refreshRace = { done: true, value: null, error: { code: error?.code ?? null, message: error?.message ?? null } }; },
    );
  })()`);
  const requestDeadline = Date.now() + 5_000;
  while (refreshRequests < 1 && Date.now() < requestDeadline) await sleep(20);
  assert(refreshRequests === 1, `refresh request count mismatch while lock held: ${refreshRequests}`);
  await sleep(150);

  const blocked = await client.evaluate(`(() => ({
    done: window.__refreshRace?.done === true,
    accessToken: JSON.parse(localStorage.getItem('myeongha.memberSession.v1') ?? 'null')?.accessToken ?? null,
  }))()`);
  assert(blocked.done === false, 'successful refresh committed while the Member refresh lock was externally held');
  assert(blocked.accessToken === original.accessToken, 'Member authority changed before the refresh commit lock was released');

  await client.evaluate(`(() => {
    localStorage.setItem('myeongha.memberSession.v1', ${JSON.stringify(JSON.stringify(newer))});
    sessionStorage.setItem('myeongha.guestBearer.v1', ${JSON.stringify(newer.accessToken)});
    sessionStorage.setItem('myeongha.pendingGuestBearer.v1', ${JSON.stringify(stagedGuest)});
    window.__releaseRefreshCommitLock();
  })()`);
  await waitFor(client, `window.__refreshRace?.done === true`, 'refresh did not settle after lock release');

  const finalState = await client.evaluate(`(() => {
    const stored = JSON.parse(localStorage.getItem('myeongha.memberSession.v1') ?? 'null');
    return {
      resultToken: window.__refreshRace?.value?.accessToken ?? null,
      error: window.__refreshRace?.error ?? null,
      storedAccessToken: stored?.accessToken ?? null,
      storedRefreshToken: stored?.refreshToken ?? null,
      activeBearer: sessionStorage.getItem('myeongha.guestBearer.v1'),
      pendingGuest: sessionStorage.getItem('myeongha.pendingGuestBearer.v1'),
    };
  })()`);
  assert(finalState.error === null, `refresh failed after lock release: ${JSON.stringify(finalState.error)}`);
  assert(finalState.resultToken === newer.accessToken, 'stale refresh did not converge to the newer Member generation');
  assert(finalState.storedAccessToken === newer.accessToken && finalState.storedRefreshToken === newer.refreshToken, 'stale refresh overwrote newer stored Member authority');
  assert(finalState.activeBearer === newer.accessToken, 'stale refresh overwrote newer compatibility bearer authority');
  assert(finalState.pendingGuest === stagedGuest, 'stale refresh consumed the pending Guest authority');
  assert(requests[0]?.refreshToken === original.refreshToken, 'refresh did not use the original Member generation');

  const report = {
    status: 'MyeongHa_WEB_AUTH_REFRESH_COMMIT_LOCK_BROWSER_PASS',
    lockName,
    blockedBeforeRelease: true,
    preservedNewerGeneration: true,
    refreshRequests,
    requests,
    finalState,
  };
  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`MyeongHa_WEB_AUTH_REFRESH_COMMIT_LOCK_BROWSER_PASS blocked=true preserved_newer=true refresh_requests=${refreshRequests}`);
} catch (error) {
  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify({
    status: 'MyeongHa_WEB_AUTH_REFRESH_COMMIT_LOCK_BROWSER_FAIL',
    error: error instanceof Error ? error.message : String(error),
    refreshRequests,
    requests,
    chromeError,
  }, null, 2)}\n`, 'utf8');
  throw error;
} finally {
  client?.close();
  await stopChrome(chrome);
  await new Promise((done) => server.close(done));
  await rm(profile, { recursive: true, force: true, maxRetries: 12, retryDelay: 100 });
}
