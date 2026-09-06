import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const artifactDir = resolve(process.cwd(), 'artifacts');
const artifactPath = join(artifactDir, 'web-auth-cross-tab-session-expired-browser-smoke.json');
const testIdentity = Object.freeze({
  id: '77777777-7777-4777-8777-777777777777',
  email: 'cross-tab-session-expired@example.com',
  password: 'browser-password-12345',
});
const memberAccessToken = 'sessionexpired.header.signature';
const memberRefreshToken = 'sessionexpired-refresh-token';
const tabAGuestBearer = 'cross-tab-session-expired-guest-a';
const tabBGuestBearer = 'cross-tab-session-expired-guest-b';
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
const requests = [];
let apiRequestCount = 0;
let refreshRequests = 0;
let guestBootstrapRequests = 0;

function successEnvelope(data) {
  apiRequestCount += 1;
  return {
    ok: true,
    data,
    meta: {
      apiContractVersion: 'browser-auth-cross-tab-session-expired-v1',
      requestId: `web-auth-cross-tab-session-expired-${apiRequestCount}`,
      serverTime: '2026-09-06T00:00:00.000Z',
    },
  };
}

function errorEnvelope(code, messageKey, retryable = false) {
  apiRequestCount += 1;
  return {
    ok: false,
    error: { code, messageKey, retryable },
    meta: {
      apiContractVersion: 'browser-auth-cross-tab-session-expired-v1',
      requestId: `web-auth-cross-tab-session-expired-${apiRequestCount}`,
      serverTime: '2026-09-06T00:00:00.000Z',
    },
  };
}

function memberSession() {
  return {
    accessToken: memberAccessToken,
    refreshToken: memberRefreshToken,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    tokenType: 'bearer',
    user: { id: testIdentity.id, email: testIdentity.email },
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

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const pathname = decodeURIComponent(url.pathname);
      const authorization = req.headers.authorization ?? null;

      if (pathname === '/api/auth/sign-in' && req.method === 'POST') {
        const body = await readJsonBody(req);
        requests.push({ path: pathname, method: req.method, authorization });
        if (body.email !== testIdentity.email || body.password !== testIdentity.password) {
          sendJson(res, 401, errorEnvelope('INVALID_CREDENTIALS', 'auth.invalid_credentials'));
          return;
        }
        sendJson(res, 200, successEnvelope({ status: 'authenticated', session: memberSession() }));
        return;
      }

      if (pathname === '/api/auth/refresh' && req.method === 'POST') {
        const body = await readJsonBody(req);
        refreshRequests += 1;
        requests.push({
          path: pathname,
          method: req.method,
          authorization,
          refreshToken: body.refreshToken ?? null,
        });
        sendJson(res, 401, errorEnvelope('SESSION_EXPIRED', 'auth.session_expired', false));
        return;
      }

      if (pathname === '/api/session/bootstrap' && req.method === 'POST') {
        guestBootstrapRequests += 1;
        requests.push({ path: pathname, method: req.method, authorization });
        sendJson(res, 200, successEnvelope({
          kind: 'guest',
          guestSession: { bearerToken: 'unexpected-cross-tab-session-expired-bootstrap' },
        }));
        return;
      }

      if (pathname.startsWith('/api/')) {
        requests.push({ path: pathname, method: req.method, authorization });
        sendJson(res, 404, errorEnvelope('NOT_FOUND', 'not_found'));
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

async function authSnapshot(client) {
  return client.evaluate(`(() => {
    const member = JSON.parse(localStorage.getItem('myeongha.memberSession.v1') ?? 'null');
    return {
      pathname: location.pathname,
      authState: document.querySelector('.product-profile')?.dataset.authState ?? null,
      authLabel: document.querySelector('.product-profile')?.getAttribute('aria-label') ?? null,
      memberAccessToken: member?.accessToken ?? null,
      memberRefreshToken: member?.refreshToken ?? null,
      memberUserId: member?.user?.id ?? null,
      activeBearer: sessionStorage.getItem('myeongha.guestBearer.v1'),
      pendingGuest: sessionStorage.getItem('myeongha.pendingGuestBearer.v1'),
    };
  })()`);
}

async function waitFor(client, expression, message, timeout = 8_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return;
    await sleep(50);
  }
  const diagnostics = await authSnapshot(client);
  throw new Error(`${message}; diagnostics=${JSON.stringify(diagnostics)}; requests=${JSON.stringify(requests)}`);
}

async function activeBearerSnapshot(client) {
  return client.evaluate(`(async () => {
    const auth = await import('/product-auth.js');
    return {
      active: await auth.getActiveBearer(),
      ensured: await auth.ensureActiveBearer(),
    };
  })()`);
}

async function submitSignIn(client) {
  await waitFor(
    client,
    `document.readyState === 'complete' && location.pathname === '/auth.html' && Boolean(document.querySelector('#auth-form'))`,
    'Auth form did not fully initialize before sign-in',
  );
  await client.evaluate(`(() => {
    document.querySelector('#auth-email').value = ${JSON.stringify(testIdentity.email)};
    document.querySelector('#auth-password').value = ${JSON.stringify(testIdentity.password)};
    document.querySelector('#auth-form').requestSubmit();
  })()`);
}

for (const file of [
  'auth.html',
  'auth-page.js',
  'product-auth.js',
  'product-auth-ui.js',
  'hall.html',
]) {
  await stat(join(root, file));
}

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-auth-cross-tab-session-expired-browser-'));
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
let tabA;
let tabB;

try {
  const port = await devtoolsPort(profile, chrome);

  tabB = await connectCdp(port);
  await navigate(tabB, origin, '/hall.html', '.product-profile');
  await tabB.evaluate(`(() => {
    localStorage.removeItem('myeongha.memberSession.v1');
    sessionStorage.setItem('myeongha.guestBearer.v1', ${JSON.stringify(tabBGuestBearer)});
    sessionStorage.removeItem('myeongha.pendingGuestBearer.v1');
  })()`);
  await navigate(tabB, origin, '/hall.html', '.product-profile');
  await waitFor(
    tabB,
    `document.querySelector('.product-profile')?.dataset.authState === 'guest'
      && sessionStorage.getItem('myeongha.guestBearer.v1') === ${JSON.stringify(tabBGuestBearer)}`,
    'Tab B did not begin with its intended Guest bearer',
  );
  const initialTabB = await authSnapshot(tabB);

  tabA = await connectCdp(port);
  await navigate(tabA, origin, '/hall.html', '.product-profile');
  await tabA.evaluate(`(() => {
    sessionStorage.setItem('myeongha.guestBearer.v1', ${JSON.stringify(tabAGuestBearer)});
    sessionStorage.removeItem('myeongha.pendingGuestBearer.v1');
  })()`);
  await navigate(tabA, origin, '/auth.html?next=hall.html', '#auth-form');
  await submitSignIn(tabA);
  await waitFor(
    tabA,
    `location.pathname === '/hall.html'
      && document.querySelector('.product-profile')?.dataset.authState === 'member'
      && sessionStorage.getItem('myeongha.pendingGuestBearer.v1') === ${JSON.stringify(tabAGuestBearer)}`,
    'Tab A sign-in did not stage its pre-login Guest and reach Member Hall',
  );

  await waitFor(
    tabB,
    `(() => {
      const member = JSON.parse(localStorage.getItem('myeongha.memberSession.v1') ?? 'null');
      return document.querySelector('.product-profile')?.dataset.authState === 'member'
        && member?.accessToken === ${JSON.stringify(memberAccessToken)}
        && sessionStorage.getItem('myeongha.guestBearer.v1') === ${JSON.stringify(memberAccessToken)}
        && sessionStorage.getItem('myeongha.pendingGuestBearer.v1') === ${JSON.stringify(tabBGuestBearer)};
    })()`,
    'Tab B did not converge to Member before authoritative refresh expiry',
  );
  const memberTabA = await authSnapshot(tabA);
  const memberTabB = await authSnapshot(tabB);

  const refreshResult = await tabA.evaluate(`(async () => {
    const auth = await import('/product-auth.js');
    try {
      await auth.refreshMemberSession();
      return { ok: true, code: null };
    } catch (error) {
      return { ok: false, code: error?.code ?? null };
    }
  })()`);
  assert(!refreshResult.ok && refreshResult.code === 'SESSION_EXPIRED', 'Tab A refresh did not receive authoritative SESSION_EXPIRED');

  await waitFor(
    tabA,
    `document.querySelector('.product-profile')?.dataset.authState === 'guest'
      && document.querySelector('.product-profile')?.getAttribute('aria-label') === '로그인'
      && localStorage.getItem('myeongha.memberSession.v1') === null
      && sessionStorage.getItem('myeongha.guestBearer.v1') === ${JSON.stringify(tabAGuestBearer)}
      && sessionStorage.getItem('myeongha.pendingGuestBearer.v1') === null`,
    'Tab A did not transition from rejected Member refresh to its restored Guest authority',
  );

  await waitFor(
    tabB,
    `document.querySelector('.product-profile')?.dataset.authState === 'guest'
      && document.querySelector('.product-profile')?.getAttribute('aria-label') === '로그인'
      && localStorage.getItem('myeongha.memberSession.v1') === null
      && sessionStorage.getItem('myeongha.guestBearer.v1') === ${JSON.stringify(tabBGuestBearer)}
      && sessionStorage.getItem('myeongha.pendingGuestBearer.v1') === null`,
    'Tab B did not scrub Member credentials and restore its own Guest after Tab A SESSION_EXPIRED',
  );

  const expiredTabA = await authSnapshot(tabA);
  const expiredTabB = await authSnapshot(tabB);
  const guestBearerA = await activeBearerSnapshot(tabA);
  const guestBearerB = await activeBearerSnapshot(tabB);

  assert(expiredTabA.memberAccessToken === null && expiredTabA.memberRefreshToken === null && expiredTabA.memberUserId === null, 'Tab A retained Member credentials or identity after SESSION_EXPIRED');
  assert(expiredTabB.memberAccessToken === null && expiredTabB.memberRefreshToken === null && expiredTabB.memberUserId === null, 'Tab B retained Member credentials or identity after cross-tab SESSION_EXPIRED');
  assert(expiredTabA.activeBearer === tabAGuestBearer && expiredTabA.pendingGuest === null, 'Tab A did not restore its own staged Guest exactly once');
  assert(expiredTabB.activeBearer === tabBGuestBearer && expiredTabB.pendingGuest === null, 'Tab B did not restore its own staged Guest exactly once');
  assert(guestBearerA.active?.kind === 'guest' && guestBearerA.active?.token === tabAGuestBearer, 'Tab A active bearer resolver did not expose restored Guest');
  assert(guestBearerA.ensured?.kind === 'guest' && guestBearerA.ensured?.token === tabAGuestBearer, 'Tab A ensure bearer did not expose restored Guest');
  assert(guestBearerB.active?.kind === 'guest' && guestBearerB.active?.token === tabBGuestBearer, 'Tab B active bearer resolver did not expose restored Guest');
  assert(guestBearerB.ensured?.kind === 'guest' && guestBearerB.ensured?.token === tabBGuestBearer, 'Tab B ensure bearer did not expose restored Guest');

  const signIns = requests.filter((request) => request.path === '/api/auth/sign-in');
  const refreshes = requests.filter((request) => request.path === '/api/auth/refresh');
  const bootstraps = requests.filter((request) => request.path === '/api/session/bootstrap');
  assert(signIns.length === 1, `Expected one sign-in request, received ${signIns.length}`);
  assert(refreshes.length === 1, `Expected one authoritative refresh rejection, received ${refreshes.length}`);
  assert(refreshes[0].refreshToken === memberRefreshToken, 'Authoritative refresh expiry did not reject the intended Member refresh credential');
  assert(guestBootstrapRequests === 0 && bootstraps.length === 0, `Cross-tab SESSION_EXPIRED unexpectedly bootstrapped ${guestBootstrapRequests} Guest session(s)`);

  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify({
    status: 'MyeongHa_WEB_AUTH_CROSS_TAB_SESSION_EXPIRED_BROWSER_PASS',
    initialTabB,
    memberTabA,
    memberTabB,
    expiredTabA,
    expiredTabB,
    refreshRequests,
    guestBootstrapRequests,
    requests,
  }, null, 2)}\n`, 'utf8');
  console.log('MyeongHa_WEB_AUTH_CROSS_TAB_SESSION_EXPIRED_BROWSER_PASS');
} catch (error) {
  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify({
    status: 'MyeongHa_WEB_AUTH_CROSS_TAB_SESSION_EXPIRED_BROWSER_FAIL',
    error: error instanceof Error ? error.message : String(error),
    refreshRequests,
    guestBootstrapRequests,
    requests,
    chromeError,
  }, null, 2)}\n`, 'utf8');
  throw error;
} finally {
  tabA?.close();
  tabB?.close();
  await stopChrome(chrome);
  await new Promise((done) => server.close(done));
  await rm(profile, { recursive: true, force: true });
}
