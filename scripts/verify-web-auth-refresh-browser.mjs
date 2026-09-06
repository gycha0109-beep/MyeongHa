import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const artifactDir = resolve(process.cwd(), 'artifacts');
const artifactPath = join(artifactDir, 'web-auth-refresh-browser-smoke.json');
const member = Object.freeze({
  id: '44444444-4444-4444-8444-444444444444',
  email: 'refresh-member@example.com',
});
const nearExpiryToken = 'near.header.signature';
const expiredToken = 'expired.header.signature';
const rotatedToken = 'rotated.header.signature';
const terminalExpiredToken = 'terminal.header.signature';
const stagedGuest = 'refresh-staged-guest';
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
]);

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
let requestNo = 0;
let refreshMode = 'unavailable';
let refreshRequests = 0;
let guestBootstrapRequests = 0;
const requests = [];

function successEnvelope(data) {
  requestNo += 1;
  return {
    ok: true,
    data,
    meta: {
      apiContractVersion: 'browser-auth-refresh-v1',
      requestId: `web-auth-refresh-${requestNo}`,
      serverTime: '2026-09-06T00:00:00.000Z',
    },
  };
}

function errorEnvelope(code, messageKey, retryable) {
  requestNo += 1;
  return {
    ok: false,
    error: { code, messageKey, retryable },
    meta: {
      apiContractVersion: 'browser-auth-refresh-v1',
      requestId: `web-auth-refresh-${requestNo}`,
      serverTime: '2026-09-06T00:00:00.000Z',
    },
  };
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function rotatedSession() {
  return {
    accessToken: rotatedToken,
    refreshToken: 'refresh-token-rotated',
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    tokenType: 'bearer',
    user: { id: member.id, email: member.email },
  };
}

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const pathname = decodeURIComponent(url.pathname);
      const authorization = req.headers.authorization ?? null;

      if (pathname === '/api/auth/refresh' && req.method === 'POST') {
        const body = await readJsonBody(req);
        refreshRequests += 1;
        requests.push({ path: pathname, method: req.method, authorization, refreshToken: body.refreshToken ?? null, mode: refreshMode });
        if (refreshMode === 'success') {
          sendJson(res, 200, successEnvelope({ status: 'authenticated', session: rotatedSession() }));
          return;
        }
        if (refreshMode === 'expired') {
          sendJson(res, 401, errorEnvelope('SESSION_EXPIRED', 'auth.session_expired', false));
          return;
        }
        sendJson(res, 503, errorEnvelope('AUTH_UPSTREAM_UNAVAILABLE', 'auth.upstream_unavailable', true));
        return;
      }

      if (pathname === '/api/session/bootstrap' && req.method === 'POST') {
        guestBootstrapRequests += 1;
        requests.push({ path: pathname, method: req.method, authorization });
        sendJson(res, 200, successEnvelope({
          kind: 'guest',
          guestSession: { bearerToken: 'unexpected-bootstrap-guest' },
        }));
        return;
      }

      if (pathname.startsWith('/api/')) {
        requests.push({ path: pathname, method: req.method, authorization });
        sendJson(res, 404, errorEnvelope('NOT_FOUND', 'not_found', false));
        return;
      }

      const staticPath = pathname === '/' ? '/hall.html' : pathname;
      const relative = normalize(staticPath).replace(/^[/\\]+/, '');
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

async function navigate(client, origin, pathname, selector, timeout = 10_000) {
  const result = await client.send('Page.navigate', { url: `${origin}${pathname}` });
  assert(!result.errorText, `Navigation failed for ${pathname}: ${result.errorText}`);
  const cleanPath = pathname.split('?')[0];
  const selectorLiteral = JSON.stringify(selector);
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const state = await client.evaluate(`(() => ({
      pathname: location.pathname,
      readyState: document.readyState,
      found: Boolean(document.querySelector(${selectorLiteral})),
    }))()`);
    if (state?.pathname === cleanPath && state.readyState === 'complete' && state.found) return;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${cleanPath} ${selector}`);
}

async function waitFor(client, expression, message, timeout = 8_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return;
    await sleep(50);
  }
  const diagnostics = await client.evaluate(`(() => ({
    pathname: location.pathname,
    authState: document.querySelector('.product-profile')?.dataset.authState ?? null,
    authLabel: document.querySelector('.product-profile')?.getAttribute('aria-label') ?? null,
    memberSession: localStorage.getItem('myeongha.memberSession.v1'),
    activeBearer: sessionStorage.getItem('myeongha.guestBearer.v1'),
    pendingGuest: sessionStorage.getItem('myeongha.pendingGuestBearer.v1'),
  }))()`);
  throw new Error(`${message}; diagnostics=${JSON.stringify(diagnostics)}; requests=${JSON.stringify(requests)}`);
}

async function seedMember(client, { token, refreshToken, expiresAt }) {
  await client.evaluate(`(() => {
    const session = {
      accessToken: ${JSON.stringify(token)},
      refreshToken: ${JSON.stringify(refreshToken)},
      expiresAt: ${JSON.stringify(expiresAt)},
      tokenType: 'bearer',
      user: { id: ${JSON.stringify(member.id)}, email: ${JSON.stringify(member.email)} },
    };
    localStorage.setItem('myeongha.memberSession.v1', JSON.stringify(session));
    sessionStorage.setItem('myeongha.guestBearer.v1', session.accessToken);
    sessionStorage.setItem('myeongha.pendingGuestBearer.v1', ${JSON.stringify(stagedGuest)});
  })()`);
}

async function authSnapshot(client) {
  return client.evaluate(`(() => {
    const session = JSON.parse(localStorage.getItem('myeongha.memberSession.v1') ?? 'null');
    return {
      authState: document.querySelector('.product-profile')?.dataset.authState ?? null,
      authLabel: document.querySelector('.product-profile')?.getAttribute('aria-label') ?? null,
      accessToken: session?.accessToken ?? null,
      refreshToken: session?.refreshToken ?? null,
      userId: session?.user?.id ?? null,
      email: session?.user?.email ?? null,
      activeBearer: sessionStorage.getItem('myeongha.guestBearer.v1'),
      pendingGuest: sessionStorage.getItem('myeongha.pendingGuestBearer.v1'),
    };
  })()`);
}

async function resolveBearer(client, fn) {
  return client.evaluate(`(async () => {
    const auth = await import('/product-auth.js');
    try {
      return { ok: true, value: await auth[${JSON.stringify(fn)}]() };
    } catch (error) {
      return { ok: false, error: { name: error?.name ?? null, code: error?.code ?? null, message: error?.message ?? null } };
    }
  })()`);
}

for (const file of ['hall.html', 'product-auth.js', 'product-auth-ui.js']) await stat(join(root, file));

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-auth-refresh-browser-'));
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
  await navigate(client, origin, '/hall.html', '.product-profile');

  refreshMode = 'unavailable';
  await seedMember(client, {
    token: nearExpiryToken,
    refreshToken: 'refresh-token-near',
    expiresAt: new Date(Date.now() + 30_000).toISOString(),
  });
  const nearRefreshBefore = refreshRequests;
  await navigate(client, origin, '/hall.html', '.product-profile');
  await waitFor(
    client,
    `document.querySelector('.product-profile')?.dataset.authState === 'member' && localStorage.getItem('myeongha.memberSession.v1') !== null`,
    'Near-expiry transient refresh failure downgraded the visible Member state',
  );
  const nearBearer = await resolveBearer(client, 'getActiveBearer');
  const nearState = await authSnapshot(client);
  assert(nearBearer.ok && nearBearer.value?.kind === 'member' && nearBearer.value?.token === nearExpiryToken, 'Near-expiry transient refresh did not continue with the still-valid Member token');
  assert(nearState.authState === 'member' && nearState.authLabel === '마이 페이지', 'Near-expiry transient refresh rendered Guest UI');
  assert(nearState.accessToken === nearExpiryToken && nearState.activeBearer === nearExpiryToken, 'Near-expiry transient refresh changed the active Member token');
  assert(nearState.pendingGuest === stagedGuest, 'Near-expiry transient refresh consumed the staged Guest bearer');
  assert(refreshRequests > nearRefreshBefore, 'Near-expiry scenario did not attempt Member refresh');
  assert(guestBootstrapRequests === 0, 'Near-expiry transient refresh bootstrapped a Guest');

  await seedMember(client, {
    token: expiredToken,
    refreshToken: 'refresh-token-expired',
    expiresAt: new Date(Date.now() - 5_000).toISOString(),
  });
  const expiredRefreshBefore = refreshRequests;
  await navigate(client, origin, '/hall.html', '.product-profile');
  await waitFor(
    client,
    `document.querySelector('.product-profile')?.dataset.authState === 'member' && localStorage.getItem('myeongha.memberSession.v1') !== null`,
    'Expired transient refresh failure deleted or downgraded the recoverable Member session',
  );
  const expiredBearer = await resolveBearer(client, 'getActiveBearer');
  const expiredEnsure = await resolveBearer(client, 'ensureActiveBearer');
  const expiredState = await authSnapshot(client);
  assert(!expiredBearer.ok && expiredBearer.error?.code === 'AUTH_UPSTREAM_UNAVAILABLE', 'Expired transient refresh did not propagate AUTH_UPSTREAM_UNAVAILABLE from getActiveBearer');
  assert(!expiredEnsure.ok && expiredEnsure.error?.code === 'AUTH_UPSTREAM_UNAVAILABLE', 'Expired transient refresh did not block Guest fallback from ensureActiveBearer');
  assert(expiredState.authState === 'member' && expiredState.authLabel === '마이 페이지', 'Expired transient refresh rendered Guest UI');
  assert(expiredState.accessToken === expiredToken && expiredState.activeBearer === expiredToken, 'Expired transient refresh deleted the recoverable Member credentials');
  assert(expiredState.pendingGuest === stagedGuest, 'Expired transient refresh consumed the staged Guest bearer');
  assert(refreshRequests > expiredRefreshBefore, 'Expired scenario did not attempt Member refresh');
  assert(guestBootstrapRequests === 0, 'Expired transient refresh bootstrapped a Guest');

  refreshMode = 'success';
  await navigate(client, origin, '/hall.html', '.product-profile');
  await waitFor(
    client,
    `(() => {
      const session = JSON.parse(localStorage.getItem('myeongha.memberSession.v1') ?? 'null');
      return document.querySelector('.product-profile')?.dataset.authState === 'member' && session?.accessToken === ${JSON.stringify(rotatedToken)};
    })()`,
    'Recovered refresh did not rotate and restore the Member session',
  );
  const recoveredBearer = await resolveBearer(client, 'getActiveBearer');
  const recoveredState = await authSnapshot(client);
  assert(recoveredBearer.ok && recoveredBearer.value?.kind === 'member' && recoveredBearer.value?.token === rotatedToken, 'Recovered refresh did not expose the rotated Member bearer');
  assert(recoveredState.authState === 'member' && recoveredState.authLabel === '마이 페이지', 'Recovered refresh did not retain Member UI');
  assert(recoveredState.userId === member.id && recoveredState.email === member.email, 'Recovered refresh changed the Member identity');
  assert(recoveredState.accessToken === rotatedToken && recoveredState.activeBearer === rotatedToken, 'Recovered refresh did not stage the rotated Member token');
  assert(recoveredState.pendingGuest === stagedGuest, 'Recovered refresh consumed the staged Guest bearer');
  assert(guestBootstrapRequests === 0, 'Refresh recovery unexpectedly bootstrapped a Guest');

  refreshMode = 'expired';
  await seedMember(client, {
    token: terminalExpiredToken,
    refreshToken: 'refresh-token-terminal',
    expiresAt: new Date(Date.now() - 5_000).toISOString(),
  });
  const authoritativeRefreshBefore = refreshRequests;
  await navigate(client, origin, '/hall.html', '.product-profile');
  await waitFor(
    client,
    `document.querySelector('.product-profile')?.dataset.authState === 'guest' &&
      document.querySelector('.product-profile')?.getAttribute('aria-label') === '로그인' &&
      localStorage.getItem('myeongha.memberSession.v1') === null &&
      sessionStorage.getItem('myeongha.guestBearer.v1') === ${JSON.stringify(stagedGuest)} &&
      sessionStorage.getItem('myeongha.pendingGuestBearer.v1') === null`,
    'Authoritative SESSION_EXPIRED did not transition the browser from Member to restored Guest authority',
  );
  const authoritativeBearer = await resolveBearer(client, 'getActiveBearer');
  const authoritativeEnsure = await resolveBearer(client, 'ensureActiveBearer');
  const authoritativeState = await authSnapshot(client);
  assert(authoritativeBearer.ok && authoritativeBearer.value?.kind === 'guest' && authoritativeBearer.value?.token === stagedGuest, 'Authoritative SESSION_EXPIRED did not expose the restored pending Guest bearer');
  assert(authoritativeEnsure.ok && authoritativeEnsure.value?.kind === 'guest' && authoritativeEnsure.value?.token === stagedGuest, 'Authoritative SESSION_EXPIRED triggered an unnecessary Guest bootstrap');
  assert(authoritativeState.authState === 'guest' && authoritativeState.authLabel === '로그인', 'Authoritative SESSION_EXPIRED did not render Guest UI');
  assert(authoritativeState.accessToken === null && authoritativeState.refreshToken === null, 'Authoritative SESSION_EXPIRED retained Member credentials');
  assert(authoritativeState.userId === null && authoritativeState.email === null, 'Authoritative SESSION_EXPIRED retained Member identity metadata');
  assert(authoritativeState.activeBearer === stagedGuest && authoritativeState.pendingGuest === null, 'Authoritative SESSION_EXPIRED did not restore pending Guest authority exactly once');
  assert(refreshRequests > authoritativeRefreshBefore, 'Authoritative expiry scenario did not attempt Member refresh');
  assert(requests.some((request) => request.path === '/api/auth/refresh' && request.refreshToken === 'refresh-token-terminal' && request.mode === 'expired'), 'Authoritative expiry scenario did not reject the intended Member refresh credential');
  assert(guestBootstrapRequests === 0, 'Authoritative SESSION_EXPIRED bootstrapped a new Guest instead of restoring the staged Guest');

  const report = {
    status: 'MyeongHa_WEB_AUTH_REFRESH_BROWSER_PASS',
    nearExpiry: nearState,
    expired: expiredState,
    recovered: recoveredState,
    authoritativeExpiry: authoritativeState,
    refreshRequests,
    guestBootstrapRequests,
    requests,
  };
  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log('MyeongHa_WEB_AUTH_REFRESH_BROWSER_PASS');
} catch (error) {
  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify({
    status: 'MyeongHa_WEB_AUTH_REFRESH_BROWSER_FAIL',
    error: error instanceof Error ? error.message : String(error),
    refreshMode,
    refreshRequests,
    guestBootstrapRequests,
    requests,
    chromeError,
  }, null, 2)}\n`, 'utf8');
  throw error;
} finally {
  client?.close();
  await stopChrome(chrome);
  server.close();
  await rm(profile, { recursive: true, force: true });
}