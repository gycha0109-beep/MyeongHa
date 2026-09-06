import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const identity = Object.freeze({
  id: '22222222-2222-4222-8222-222222222222',
  email: 'rejected-member@example.com',
  password: 'browser-password-12345',
});
const memberAccessToken = 'rejectheader.rejectpayload.rejectsignature';
const memberRefreshToken = 'reject-refresh-token';
const tabAGuestBearer = 'canonical-rejection-guest-a';
const tabBGuestBearer = 'canonical-rejection-guest-b';
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
]);
const requests = [];
let rejectCurrentSubject = false;
let requestNo = 0;
let guestBootstrapRequests = 0;

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function meta() {
  requestNo += 1;
  return {
    apiContractVersion: 'browser-auth-rejection-v2',
    requestId: `web-auth-rejection-${requestNo}`,
    serverTime: '2026-09-06T00:00:00.000Z',
  };
}

function success(data) {
  return { ok: true, data, meta: meta() };
}

function failure(code, messageKey, retryable = false) {
  return { ok: false, error: { code, messageKey, retryable }, meta: meta() };
}

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

function memberSession() {
  return {
    accessToken: memberAccessToken,
    refreshToken: memberRefreshToken,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    tokenType: 'bearer',
    user: { id: identity.id, email: identity.email },
  };
}

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const pathname = decodeURIComponent(url.pathname);
      const authorization = req.headers.authorization ?? null;

      if (pathname === '/api/auth/sign-in' && req.method === 'POST') {
        const body = await readJsonBody(req);
        requests.push({ path: pathname, method: req.method, authorization, rejectCurrentSubject });
        if (body.email !== identity.email || body.password !== identity.password) {
          sendJson(res, 401, failure('INVALID_CREDENTIALS', 'auth.invalid_credentials'));
          return;
        }
        sendJson(res, 200, success({ status: 'authenticated', session: memberSession() }));
        return;
      }

      if (pathname === '/api/me' && req.method === 'GET') {
        requests.push({ path: pathname, method: req.method, authorization, rejectCurrentSubject });
        if (rejectCurrentSubject || authorization !== `Bearer ${memberAccessToken}`) {
          sendJson(res, 401, failure('AUTH_REQUIRED', 'auth.required'));
          return;
        }
        sendJson(res, 200, success({
          subjectKind: 'member',
          subjectStatus: 'active',
          profile: {
            displayName: '거부 경계 회원',
            locale: 'ko-KR',
            timezone: 'Asia/Seoul',
            onboardingState: 'completed',
            updatedAt: '2026-09-06T00:00:00.000Z',
          },
        }));
        return;
      }

      if (pathname === '/api/me/birth-profile' && req.method === 'GET') {
        requests.push({ path: pathname, method: req.method, authorization, rejectCurrentSubject });
        if (authorization !== `Bearer ${memberAccessToken}`) {
          sendJson(res, 401, failure('AUTH_REQUIRED', 'auth.required'));
          return;
        }
        sendJson(res, 200, success({ birthProfile: null }));
        return;
      }

      if (pathname === '/api/session/bootstrap' && req.method === 'POST') {
        guestBootstrapRequests += 1;
        requests.push({ path: pathname, method: req.method, authorization, rejectCurrentSubject });
        sendJson(res, 200, success({
          kind: 'guest',
          guestSession: { bearerToken: 'unexpected-canonical-rejection-bootstrap' },
        }));
        return;
      }

      if (pathname.startsWith('/api/')) {
        requests.push({ path: pathname, method: req.method, authorization, rejectCurrentSubject });
        sendJson(res, 404, failure('NOT_FOUND', 'not_found'));
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
      myStatus: document.querySelector('#my-status')?.textContent?.trim() ?? null,
      myActions: document.querySelector('.my-auth-actions')?.textContent?.trim() ?? null,
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
    document.querySelector('#auth-email').value = ${JSON.stringify(identity.email)};
    document.querySelector('#auth-password').value = ${JSON.stringify(identity.password)};
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
const profile = await mkdtemp(join(tmpdir(), 'myeongha-auth-rejection-browser-'));
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
    'Tab A sign-in did not reach visible Member state while preserving its Guest',
  );

  await waitFor(
    tabB,
    `(() => {
      const member = JSON.parse(localStorage.getItem('myeongha.memberSession.v1') ?? 'null');
      return document.querySelector('.product-profile')?.dataset.authState === 'member'
        && member?.user?.id === ${JSON.stringify(identity.id)}
        && sessionStorage.getItem('myeongha.guestBearer.v1') === ${JSON.stringify(memberAccessToken)}
        && sessionStorage.getItem('myeongha.pendingGuestBearer.v1') === ${JSON.stringify(tabBGuestBearer)};
    })()`,
    'Tab B did not converge to Member before canonical rejection',
  );

  await navigate(tabA, origin, '/my.html', '#my-account-email');
  await waitFor(
    tabA,
    `document.querySelector('#my-account-email')?.textContent?.trim() === ${JSON.stringify(identity.email)} && Boolean(document.querySelector('.my-auth-actions button'))`,
    'Canonical Member profile did not render before rejection',
  );

  const beforeRejectionA = await authSnapshot(tabA);
  const beforeRejectionB = await authSnapshot(tabB);
  assert(beforeRejectionA.memberUserId === identity.id, 'Tab A pre-rejection Member identity was not stored');
  assert(beforeRejectionB.memberUserId === identity.id, 'Tab B pre-rejection Member identity was not stored');
  assert(beforeRejectionA.activeBearer === memberAccessToken, 'Tab A pre-rejection Member bearer was not active');
  assert(beforeRejectionB.activeBearer === memberAccessToken, 'Tab B pre-rejection Member bearer was not active');

  rejectCurrentSubject = true;
  await navigate(tabA, origin, '/my.html?canonical-rejection=1', '#my-status');
  await waitFor(
    tabA,
    `!localStorage.getItem('myeongha.memberSession.v1')
      && document.querySelector('#my-status')?.textContent?.includes('현재 세션이 필요합니다.')
      && document.querySelector('.my-auth-actions a')?.textContent?.includes('로그인하기')
      && sessionStorage.getItem('myeongha.guestBearer.v1') === ${JSON.stringify(tabAGuestBearer)}
      && sessionStorage.getItem('myeongha.pendingGuestBearer.v1') === null`,
    'Canonical /api/me 401 did not invalidate Tab A and restore its Guest authority',
  );

  await waitFor(
    tabB,
    `document.querySelector('.product-profile')?.dataset.authState === 'guest'
      && document.querySelector('.product-profile')?.getAttribute('aria-label') === '로그인'
      && !localStorage.getItem('myeongha.memberSession.v1')
      && sessionStorage.getItem('myeongha.guestBearer.v1') === ${JSON.stringify(tabBGuestBearer)}
      && sessionStorage.getItem('myeongha.pendingGuestBearer.v1') === null`,
    'Tab B did not scrub Member credentials and restore its own Guest after Tab A canonical rejection',
  );

  const afterRejectionA = await authSnapshot(tabA);
  const afterRejectionB = await authSnapshot(tabB);
  const bearerA = await activeBearerSnapshot(tabA);
  const bearerB = await activeBearerSnapshot(tabB);

  assert(afterRejectionA.memberAccessToken === null && afterRejectionA.memberRefreshToken === null && afterRejectionA.memberUserId === null, 'Tab A retained Member credentials after canonical rejection');
  assert(afterRejectionB.memberAccessToken === null && afterRejectionB.memberRefreshToken === null && afterRejectionB.memberUserId === null, 'Tab B retained Member credentials after cross-tab canonical rejection');
  assert(afterRejectionA.activeBearer === tabAGuestBearer && afterRejectionA.pendingGuest === null, 'Tab A did not restore its own Guest after canonical rejection');
  assert(afterRejectionB.activeBearer === tabBGuestBearer && afterRejectionB.pendingGuest === null, 'Tab B did not restore its own Guest after canonical rejection');
  assert(afterRejectionA.myStatus?.includes('현재 세션이 필요합니다.'), 'Tab A did not render login-required My state');
  assert(bearerA.active?.kind === 'guest' && bearerA.active?.token === tabAGuestBearer, 'Tab A active bearer did not resolve restored Guest');
  assert(bearerA.ensured?.kind === 'guest' && bearerA.ensured?.token === tabAGuestBearer, 'Tab A ensured bearer did not resolve restored Guest');
  assert(bearerB.active?.kind === 'guest' && bearerB.active?.token === tabBGuestBearer, 'Tab B active bearer did not resolve restored Guest');
  assert(bearerB.ensured?.kind === 'guest' && bearerB.ensured?.token === tabBGuestBearer, 'Tab B ensured bearer did not resolve restored Guest');

  const rejectionReads = requests.filter((request) => request.path === '/api/me' && request.rejectCurrentSubject);
  assert(rejectionReads.length >= 1, 'Verifier never exercised canonical /api/me rejection');
  assert(
    rejectionReads.some((request) => request.authorization === `Bearer ${memberAccessToken}`),
    'Canonical rejection was not exercised against the stored Member bearer',
  );
  assert(guestBootstrapRequests === 0, `Canonical rejection convergence unexpectedly bootstrapped ${guestBootstrapRequests} Guest session(s)`);

  const artifactDir = resolve(process.cwd(), 'artifacts');
  await mkdir(artifactDir, { recursive: true });
  await writeFile(join(artifactDir, 'web-auth-rejection-browser-smoke.json'), `${JSON.stringify({
    status: 'MyeongHa_WEB_AUTH_REJECTION_BROWSER_PASS',
    canonicalRejectionReads: rejectionReads.length,
    initialTabB,
    beforeRejectionA,
    beforeRejectionB,
    afterRejectionA,
    afterRejectionB,
    guestBootstrapRequests,
  }, null, 2)}\n`);

  console.log('MyeongHa_WEB_AUTH_REJECTION_BROWSER_PASS');
} catch (error) {
  console.error(error);
  if (chromeError.trim()) console.error(chromeError.trim());
  process.exitCode = 1;
} finally {
  tabA?.close();
  tabB?.close();
  chrome.kill('SIGTERM');
  await Promise.race([
    new Promise((done) => chrome.once('exit', done)),
    sleep(1_000),
  ]);
  await new Promise((done) => server.close(done));
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
