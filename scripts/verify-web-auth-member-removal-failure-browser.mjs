import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const artifactDir = resolve(process.cwd(), 'artifacts');
const artifactPath = join(artifactDir, 'web-auth-member-removal-failure-browser-smoke.json');
const memberSessionKey = 'myeongha.memberSession.v1';
const guestTokenKey = 'myeongha.guestBearer.v1';
const pendingGuestTokenKey = 'myeongha.pendingGuestBearer.v1';
const authChangedEvent = 'myeongha:auth-changed';
const memberAccessToken = 'memberclear.header.signature';
const memberRefreshToken = 'member-clear-refresh';
const pendingGuestBearer = 'member-clear-pending-guest';
const identity = Object.freeze({
  id: '77777777-7777-4777-8777-777777777777',
  email: 'member-clear@example.com',
  password: 'browser-password-12345',
});
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
let functionalPass = false;

function successEnvelope(data) {
  apiRequestCount += 1;
  return {
    ok: true,
    data,
    meta: {
      apiContractVersion: 'browser-auth-member-removal-failure-v1',
      requestId: `web-auth-member-removal-${apiRequestCount}`,
      serverTime: '2026-09-08T00:00:00.000Z',
    },
  };
}

function errorEnvelope(code, messageKey, retryable = false) {
  apiRequestCount += 1;
  return {
    ok: false,
    error: { code, messageKey, retryable },
    meta: {
      apiContractVersion: 'browser-auth-member-removal-failure-v1',
      requestId: `web-auth-member-removal-${apiRequestCount}`,
      serverTime: '2026-09-08T00:00:00.000Z',
    },
  };
}

function memberSession() {
  return {
    accessToken: memberAccessToken,
    refreshToken: memberRefreshToken,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    tokenType: 'bearer',
    user: { id: identity.id, email: identity.email },
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
        if (body.email !== identity.email || body.password !== identity.password) {
          sendJson(res, 401, errorEnvelope('INVALID_CREDENTIALS', 'auth.invalid_credentials'));
          return;
        }
        sendJson(res, 200, successEnvelope({ status: 'authenticated', session: memberSession() }));
        return;
      }

      if (pathname === '/api/auth/sign-out' && req.method === 'POST') {
        requests.push({ path: pathname, method: req.method, authorization });
        sendJson(res, 503, errorEnvelope('AUTH_UPSTREAM_UNAVAILABLE', 'auth.upstream_unavailable', true));
        return;
      }

      if (pathname === '/api/auth/refresh' && req.method === 'POST') {
        requests.push({ path: pathname, method: req.method, authorization });
        sendJson(res, 401, errorEnvelope('SESSION_EXPIRED', 'auth.session_expired'));
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
            displayName: '로컬 세션 삭제 실패 회원',
            locale: 'ko-KR',
            timezone: 'Asia/Seoul',
            onboardingState: 'completed',
            updatedAt: '2026-09-08T00:00:00.000Z',
          },
        }));
        return;
      }

      if (pathname === '/api/me/birth-profile' && req.method === 'GET') {
        requests.push({ path: pathname, method: req.method, authorization });
        sendJson(res, 200, successEnvelope({ birthProfile: null }));
        return;
      }

      if (pathname === '/api/session/bootstrap' && req.method === 'POST') {
        requests.push({ path: pathname, method: req.method, authorization });
        sendJson(res, 500, errorEnvelope('UNEXPECTED_GUEST_BOOTSTRAP', 'unexpected.guest_bootstrap'));
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
  assert(address && typeof address === 'object', 'browser server address unavailable');
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

async function removeChromeProfile(profile) {
  try {
    await rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
  } catch (error) {
    const narrowCleanupRace = functionalPass
      && error?.code === 'ENOTEMPTY'
      && String(error?.path ?? '').startsWith(profile);
    if (!narrowCleanupRace) throw error;
    console.log('MyeongHa Member removal browser assertions passed; ignoring ephemeral Chrome profile cleanup ENOTEMPTY race.');
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
  throw new Error(message);
}

function snapshotExpression() {
  return `(() => {
    const member = JSON.parse(localStorage.getItem(${JSON.stringify(memberSessionKey)}) ?? 'null');
    return {
      pathname: location.pathname,
      memberAccessToken: member?.accessToken ?? null,
      activeBearer: sessionStorage.getItem(${JSON.stringify(guestTokenKey)}),
      pendingGuest: sessionStorage.getItem(${JSON.stringify(pendingGuestTokenKey)}),
      authEvents: globalThis.__myeonghaMemberClearEvents ?? 0,
    };
  })()`;
}

for (const file of ['hall.html', 'my.html', 'my-page.js', 'my-runtime-client.js', 'product-auth.js', 'product-auth-ui.js']) {
  await stat(join(root, file));
}

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-auth-member-removal-failure-browser-'));
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
  const port = await devtoolsPort(profile, chrome);
  client = await connectCdp(port);
  await navigate(client, origin, '/hall.html', '.product-profile');

  const signedIn = await client.evaluate(`(async () => {
    sessionStorage.setItem(${JSON.stringify(guestTokenKey)}, ${JSON.stringify(pendingGuestBearer)});
    sessionStorage.removeItem(${JSON.stringify(pendingGuestTokenKey)});
    const auth = await import('/product-auth.js');
    const session = await auth.signInWithPassword(${JSON.stringify(identity.email)}, ${JSON.stringify(identity.password)});
    return session.accessToken;
  })()`);
  assert(signedIn === memberAccessToken, 'Production sign-in did not establish the expected Member generation');

  await navigate(client, origin, '/my.html', '#my-account-email');
  await waitFor(
    client,
    `document.readyState === 'complete'
      && location.pathname === '/my.html'
      && document.querySelector('#my-account-email')?.textContent?.trim() === ${JSON.stringify(identity.email)}
      && Boolean(document.querySelector('.my-auth-actions button'))`,
    'My page did not fully initialize with a Member logout button',
  );

  await client.evaluate(`(() => {
    globalThis.__myeonghaMemberClearEvents = 0;
    addEventListener(${JSON.stringify(authChangedEvent)}, () => { globalThis.__myeonghaMemberClearEvents += 1; });
    const originalRemoveItem = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function(key) {
      if (this === localStorage && key === ${JSON.stringify(memberSessionKey)}) {
        throw new Error('forced Member localStorage removal failure');
      }
      return originalRemoveItem.call(this, key);
    };
  })()`);

  await client.evaluate(`document.querySelector('.my-auth-actions button')?.click()`);
  await sleep(800);
  const afterSignOutFailure = await client.evaluate(snapshotExpression());
  assert(afterSignOutFailure.pathname === '/my.html', 'My page redirected despite failed local Member removal');
  assert(afterSignOutFailure.memberAccessToken === memberAccessToken, 'Failed sign-out removed the Member authority');
  assert(afterSignOutFailure.activeBearer === memberAccessToken, 'Failed sign-out mutated the active compatibility bearer');
  assert(afterSignOutFailure.pendingGuest === pendingGuestBearer, 'Failed sign-out mutated the pending Guest lineage');
  assert(afterSignOutFailure.authEvents === 0, 'Failed sign-out emitted auth-changed despite retained Member authority');

  const exactInvalidation = await client.evaluate(`(async () => {
    const auth = await import('/product-auth.js');
    return auth.invalidateMemberSession(${JSON.stringify(memberAccessToken)});
  })()`);
  assert(exactInvalidation === false, 'Exact invalidation reported success despite failed local Member removal');
  const afterExactInvalidation = await client.evaluate(snapshotExpression());
  assert(afterExactInvalidation.memberAccessToken === memberAccessToken, 'Exact invalidation removed Member state unexpectedly');
  assert(afterExactInvalidation.activeBearer === memberAccessToken, 'Exact invalidation restored Guest compatibility state unexpectedly');
  assert(afterExactInvalidation.pendingGuest === pendingGuestBearer, 'Exact invalidation mutated pending Guest state');
  assert(afterExactInvalidation.authEvents === 0, 'Exact invalidation emitted auth-changed despite failed Member removal');

  const refreshError = await client.evaluate(`(async () => {
    const auth = await import('/product-auth.js');
    try {
      await auth.refreshMemberSession();
      return null;
    } catch (error) {
      return { name: error?.name ?? null, code: error?.code ?? null };
    }
  })()`);
  assert(refreshError?.name === 'ProductAuthError' && refreshError?.code === 'SESSION_EXPIRED', 'Refresh did not preserve authoritative SESSION_EXPIRED error');
  const afterRefreshFailure = await client.evaluate(snapshotExpression());
  assert(afterRefreshFailure.memberAccessToken === memberAccessToken, 'SESSION_EXPIRED removal failure dropped the Member generation');
  assert(afterRefreshFailure.activeBearer === memberAccessToken, 'SESSION_EXPIRED removal failure restored Guest compatibility state');
  assert(afterRefreshFailure.pendingGuest === pendingGuestBearer, 'SESSION_EXPIRED removal failure mutated pending Guest state');
  assert(afterRefreshFailure.authEvents === 0, 'SESSION_EXPIRED removal failure emitted auth-changed');

  const signOuts = requests.filter((request) => request.path === '/api/auth/sign-out');
  const refreshes = requests.filter((request) => request.path === '/api/auth/refresh');
  const bootstraps = requests.filter((request) => request.path === '/api/session/bootstrap');
  assert(signOuts.length === 1, `Expected one sign-out request, received ${signOuts.length}`);
  assert(signOuts[0].authorization === `Bearer ${memberAccessToken}`, 'Sign-out did not send the Member bearer');
  assert(refreshes.length === 1, `Expected one refresh request, received ${refreshes.length}`);
  assert(bootstraps.length === 0, `Member removal failure unexpectedly bootstrapped ${bootstraps.length} Guest session(s)`);

  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify({
    status: 'MyeongHa_WEB_AUTH_MEMBER_REMOVAL_FAILURE_BROWSER_PASS',
    afterSignOutFailure,
    afterExactInvalidation,
    afterRefreshFailure,
    signOutRequests: signOuts.length,
    refreshRequests: refreshes.length,
    guestBootstrapRequests: bootstraps.length,
    requests,
  }, null, 2)}\n`, 'utf8');
  functionalPass = true;
  console.log('MyeongHa_WEB_AUTH_MEMBER_REMOVAL_FAILURE_BROWSER_PASS');
} catch (error) {
  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify({
    status: 'MyeongHa_WEB_AUTH_MEMBER_REMOVAL_FAILURE_BROWSER_FAIL',
    error: error instanceof Error ? error.message : String(error),
    requests,
    chromeError,
  }, null, 2)}\n`, 'utf8');
  throw error;
} finally {
  client?.close();
  await stopChrome(chrome);
  await new Promise((done) => server.close(done));
  await removeChromeProfile(profile);
}
