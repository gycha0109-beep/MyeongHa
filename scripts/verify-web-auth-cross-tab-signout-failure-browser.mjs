import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const artifactDir = resolve(process.cwd(), 'artifacts');
const artifactPath = join(artifactDir, 'web-auth-cross-tab-signout-failure-browser-smoke.json');
const testIdentity = Object.freeze({
  id: '66666666-6666-4666-8666-666666666666',
  email: 'cross-tab-signout-failure@example.com',
  password: 'browser-password-12345',
});
const memberAccessToken = 'signoutfail.header.signature';
const memberRefreshToken = 'signoutfail-refresh-token';
const tabBGuestBearer = 'cross-tab-signout-failure-guest-b';
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
let remoteSignOutFailures = 0;

function successEnvelope(data) {
  apiRequestCount += 1;
  return {
    ok: true,
    data,
    meta: {
      apiContractVersion: 'browser-auth-cross-tab-signout-failure-v1',
      requestId: `web-auth-cross-tab-signout-failure-${apiRequestCount}`,
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
      apiContractVersion: 'browser-auth-cross-tab-signout-failure-v1',
      requestId: `web-auth-cross-tab-signout-failure-${apiRequestCount}`,
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

      if (pathname === '/api/auth/sign-out' && req.method === 'POST') {
        requests.push({ path: pathname, method: req.method, authorization });
        if (authorization !== `Bearer ${memberAccessToken}`) {
          sendJson(res, 401, errorEnvelope('AUTH_REQUIRED', 'auth.required'));
          return;
        }
        remoteSignOutFailures += 1;
        sendJson(res, 503, errorEnvelope('AUTH_UPSTREAM_UNAVAILABLE', 'auth.upstream_unavailable', true));
        return;
      }

      if (pathname === '/api/me' && req.method === 'GET') {
        requests.push({ path: pathname, method: req.method, authorization });
        if (authorization !== `Bearer ${memberAccessToken}`) {
          sendJson(res, 401, errorEnvelope('AUTH_REQUIRED', 'auth.required'));
          return;
        }
        sendJson(res, 200, successEnvelope({
          subjectKind: 'member',
          subjectStatus: 'active',
          profile: {
            displayName: '로그아웃 실패 교차 탭 회원',
            locale: 'ko-KR',
            timezone: 'Asia/Seoul',
            onboardingState: 'completed',
            updatedAt: '2026-09-06T00:00:00.000Z',
          },
        }));
        return;
      }

      if (pathname === '/api/me/birth-profile' && req.method === 'GET') {
        requests.push({ path: pathname, method: req.method, authorization });
        if (authorization !== `Bearer ${memberAccessToken}`) {
          sendJson(res, 401, errorEnvelope('AUTH_REQUIRED', 'auth.required'));
          return;
        }
        sendJson(res, 200, successEnvelope({ birthProfile: null }));
        return;
      }

      if (pathname === '/api/session/bootstrap' && req.method === 'POST') {
        requests.push({ path: pathname, method: req.method, authorization });
        sendJson(res, 200, successEnvelope({
          kind: 'guest',
          guestSession: { bearerToken: 'unexpected-cross-tab-signout-failure-bootstrap' },
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
  'my.html',
  'my-page.js',
  'my-runtime-client.js',
  'api-envelope.js',
]) {
  await stat(join(root, file));
}

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-auth-cross-tab-signout-failure-browser-'));
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
    'Tab B did not begin as the intended Guest session',
  );
  const initialTabB = await authSnapshot(tabB);

  tabA = await connectCdp(port);
  await navigate(tabA, origin, '/auth.html?next=hall.html', '#auth-form');
  await submitSignIn(tabA);
  await waitFor(
    tabA,
    `location.pathname === '/hall.html' && document.querySelector('.product-profile')?.dataset.authState === 'member'`,
    'Tab A sign-in did not reach Member Hall',
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
    'Tab B did not converge to Member before failed sign-out',
  );
  const memberTabB = await authSnapshot(tabB);

  await navigate(tabA, origin, '/my.html', '#my-account-email');
  await waitFor(
    tabA,
    `document.querySelector('#my-account-email')?.textContent?.trim() === ${JSON.stringify(testIdentity.email)}
      && Boolean(document.querySelector('.my-auth-actions button'))`,
    'Tab A My page did not expose the Member logout action',
  );
  await tabA.evaluate(`document.querySelector('.my-auth-actions button')?.click()`);

  await waitFor(
    tabA,
    `location.pathname === '/auth.html' && !localStorage.getItem('myeongha.memberSession.v1')`,
    'Tab A did not complete local-authoritative logout after remote sign-out failure',
  );
  const signedOutTabA = await authSnapshot(tabA);

  await waitFor(
    tabB,
    `document.querySelector('.product-profile')?.dataset.authState === 'guest'
      && !localStorage.getItem('myeongha.memberSession.v1')
      && sessionStorage.getItem('myeongha.guestBearer.v1') === ${JSON.stringify(tabBGuestBearer)}
      && sessionStorage.getItem('myeongha.pendingGuestBearer.v1') === null`,
    'Tab B did not converge to Guest after remote sign-out failure in Tab A',
  );
  const signedOutTabB = await authSnapshot(tabB);
  const guestBearer = await activeBearerSnapshot(tabB);

  assert(remoteSignOutFailures === 1, `Expected one forced remote sign-out failure, received ${remoteSignOutFailures}`);
  assert(signedOutTabA.memberAccessToken === null && signedOutTabA.memberUserId === null, 'Tab A retained Member identity after failed remote sign-out');
  assert(signedOutTabB.authState === 'guest' && signedOutTabB.authLabel === '로그인', 'Tab B did not visibly converge to Guest');
  assert(signedOutTabB.memberAccessToken === null && signedOutTabB.memberUserId === null, 'Tab B retained Member identity after failed remote sign-out');
  assert(signedOutTabB.activeBearer === tabBGuestBearer, 'Tab B did not restore its own Guest bearer');
  assert(signedOutTabB.pendingGuest === null, 'Tab B retained a pending Guest after restoration');
  assert(guestBearer.active?.kind === 'guest' && guestBearer.active?.token === tabBGuestBearer, 'Tab B active bearer resolver did not return the restored Guest');
  assert(guestBearer.ensured?.kind === 'guest' && guestBearer.ensured?.token === tabBGuestBearer, 'Tab B ensure bearer did not return the restored Guest');

  const signIns = requests.filter((request) => request.path === '/api/auth/sign-in');
  const signOuts = requests.filter((request) => request.path === '/api/auth/sign-out');
  const bootstraps = requests.filter((request) => request.path === '/api/session/bootstrap');
  assert(signIns.length === 1, `Expected one sign-in request, received ${signIns.length}`);
  assert(signOuts.length === 1, `Expected one sign-out request, received ${signOuts.length}`);
  assert(signOuts[0].authorization === `Bearer ${memberAccessToken}`, 'Failed remote sign-out did not receive the Member bearer');
  assert(bootstraps.length === 0, `Failed sign-out convergence unexpectedly bootstrapped ${bootstraps.length} Guest session(s)`);

  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify({
    status: 'MyeongHa_WEB_AUTH_CROSS_TAB_SIGNOUT_FAILURE_BROWSER_PASS',
    remoteSignOutFailures,
    initialTabB,
    memberTabB,
    signedOutTabA,
    signedOutTabB,
    signInRequests: signIns.length,
    signOutRequests: signOuts.length,
    guestBootstrapRequests: bootstraps.length,
    requests,
  }, null, 2)}\n`, 'utf8');
  console.log('MyeongHa_WEB_AUTH_CROSS_TAB_SIGNOUT_FAILURE_BROWSER_PASS');
} catch (error) {
  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify({
    status: 'MyeongHa_WEB_AUTH_CROSS_TAB_SIGNOUT_FAILURE_BROWSER_FAIL',
    error: error instanceof Error ? error.message : String(error),
    requests,
    remoteSignOutFailures,
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
