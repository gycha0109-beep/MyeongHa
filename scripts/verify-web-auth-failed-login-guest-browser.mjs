import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const guestBearer = 'guest-failed-login-retention-token';
const testIdentity = Object.freeze({
  id: '33333333-3333-4333-8333-333333333333',
  email: 'failed-login-member@example.com',
  password: 'browser-password-12345',
  networkPassword: 'network-failure-password',
  upstreamPassword: 'upstream-failure-password',
  wrongPassword: 'definitely-wrong-password',
});
const memberSession = Object.freeze({
  accessToken: 'failedlogin.member.signature',
  refreshToken: 'failed-login-refresh-token',
  expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  tokenType: 'bearer',
  user: { id: testIdentity.id, email: testIdentity.email },
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
let networkTransportAttempts = 0;

function successEnvelope(data) {
  apiRequestCount += 1;
  return {
    ok: true,
    data,
    meta: {
      apiContractVersion: 'browser-auth-failed-login-guest-v2',
      requestId: `web-auth-failed-login-guest-${apiRequestCount}`,
      serverTime: '2026-09-07T00:00:00.000Z',
    },
  };
}

function errorEnvelope(code, messageKey, retryable = false) {
  apiRequestCount += 1;
  return {
    ok: false,
    error: { code, messageKey, retryable },
    meta: {
      apiContractVersion: 'browser-auth-failed-login-guest-v2',
      requestId: `web-auth-failed-login-guest-${apiRequestCount}`,
      serverTime: '2026-09-07T00:00:00.000Z',
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

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const pathname = decodeURIComponent(url.pathname);
      const authorization = req.headers.authorization ?? null;

      if (pathname === '/api/auth/sign-in' && req.method === 'POST') {
        const body = await readJsonBody(req);
        let outcome = 'invalid';
        if (body.email === testIdentity.email && body.password === testIdentity.password) outcome = 'valid';
        else if (body.email === testIdentity.email && body.password === testIdentity.networkPassword) outcome = 'network';
        else if (body.email === testIdentity.email && body.password === testIdentity.upstreamPassword) outcome = 'upstream';

        if (outcome === 'network') {
          networkTransportAttempts += 1;
          if (!requests.some((request) => request.path === pathname && request.outcome === 'network')) {
            requests.push({ path: pathname, method: req.method, authorization, outcome });
          }
          req.socket.destroy();
          return;
        }

        requests.push({ path: pathname, method: req.method, authorization, outcome });
        if (outcome === 'upstream') {
          sendJson(res, 503, errorEnvelope('AUTH_UPSTREAM_UNAVAILABLE', 'auth.upstream_unavailable', true));
          return;
        }
        if (outcome === 'invalid') {
          sendJson(res, 401, errorEnvelope('INVALID_CREDENTIALS', 'auth.invalid_credentials'));
          return;
        }
        sendJson(res, 200, successEnvelope({ status: 'authenticated', session: memberSession }));
        return;
      }

      if (pathname === '/api/auth/promote-guest' && req.method === 'POST') {
        const promotedGuest = req.headers['x-myeongha-guest-bearer'] ?? null;
        requests.push({ path: pathname, method: req.method, authorization, promotedGuest });
        if (authorization !== `Bearer ${memberSession.accessToken}` || promotedGuest !== guestBearer) {
          sendJson(res, 401, errorEnvelope('AUTH_REQUIRED', 'auth.required'));
          return;
        }
        sendJson(res, 200, successEnvelope({ status: 'promoted' }));
        return;
      }

      if (pathname.startsWith('/api/')) {
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
    status: document.querySelector('#auth-status')?.textContent?.trim() ?? null,
    memberSession: localStorage.getItem('myeongha.memberSession.v1'),
    activeBearer: sessionStorage.getItem('myeongha.guestBearer.v1'),
    pendingGuest: sessionStorage.getItem('myeongha.pendingGuestBearer.v1'),
  }))()`);
  throw new Error(`${message}; diagnostics=${JSON.stringify(diagnostics)}; requests=${JSON.stringify(requests)}`);
}

async function submitSignIn(client, password) {
  await waitFor(
    client,
    `document.readyState === 'complete' && location.pathname === '/auth.html' && Boolean(document.querySelector('#auth-form'))`,
    'Auth form did not fully initialize before sign-in',
  );
  await client.evaluate(`(() => {
    document.querySelector('#auth-email').value = ${JSON.stringify(testIdentity.email)};
    document.querySelector('#auth-password').value = ${JSON.stringify(password)};
    document.querySelector('#auth-form').requestSubmit();
  })()`);
}

async function readAuthorityState(client) {
  return client.evaluate(`(() => ({
    pathname: location.pathname,
    memberSession: localStorage.getItem('myeongha.memberSession.v1'),
    activeBearer: sessionStorage.getItem('myeongha.guestBearer.v1'),
    pendingGuest: sessionStorage.getItem('myeongha.pendingGuestBearer.v1'),
    status: document.querySelector('#auth-status')?.textContent?.trim() ?? null,
  }))()`);
}

function assertGuestPreserved(state, label) {
  assert(state.pathname === '/auth.html', `${label} navigated away from auth`);
  assert(state.memberSession === null, `${label} created a Member session`);
  assert(state.activeBearer === guestBearer, `${label} changed the active Guest bearer`);
  assert(state.pendingGuest === null, `${label} staged or consumed a pending Guest bearer`);
  assert(!requests.some((request) => request.path === '/api/auth/promote-guest'), `${label} attempted Guest promotion`);
  assert(!requests.some((request) => request.path === '/api/session/bootstrap'), `${label} attempted Guest bootstrap`);
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
const profile = await mkdtemp(join(tmpdir(), 'myeongha-auth-failed-login-guest-browser-'));
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
  await navigate(client, origin, '/auth.html?next=hall.html', '#auth-form');
  await client.evaluate(`(() => {
    localStorage.removeItem('myeongha.memberSession.v1');
    sessionStorage.setItem('myeongha.guestBearer.v1', ${JSON.stringify(guestBearer)});
    sessionStorage.removeItem('myeongha.pendingGuestBearer.v1');
  })()`);

  await submitSignIn(client, testIdentity.networkPassword);
  await waitFor(
    client,
    `document.querySelector('#auth-status')?.textContent?.trim() === '인증 서버에 연결할 수 없습니다. 잠시 뒤 다시 시도해 주세요.' && !document.querySelector('#auth-submit')?.disabled`,
    'Network sign-in failure was not surfaced on the auth page',
  );
  const afterNetworkFailure = await readAuthorityState(client);
  assertGuestPreserved(afterNetworkFailure, 'Network sign-in failure');

  await submitSignIn(client, testIdentity.upstreamPassword);
  await waitFor(
    client,
    `document.querySelector('#auth-status')?.textContent?.trim() === '인증 서버에 연결할 수 없습니다. 잠시 뒤 다시 시도해 주세요.' && !document.querySelector('#auth-submit')?.disabled`,
    'Upstream sign-in failure was not surfaced on the auth page',
  );
  const afterUpstreamFailure = await readAuthorityState(client);
  assertGuestPreserved(afterUpstreamFailure, 'Upstream sign-in failure');

  await submitSignIn(client, testIdentity.wrongPassword);
  await waitFor(
    client,
    `document.querySelector('#auth-status')?.textContent?.trim() === '이메일 또는 비밀번호를 확인해 주세요.' && !document.querySelector('#auth-submit')?.disabled`,
    'Invalid credentials were not surfaced on the auth page',
  );
  const afterInvalidCredentials = await readAuthorityState(client);
  assertGuestPreserved(afterInvalidCredentials, 'Invalid-credentials sign-in failure');

  await submitSignIn(client, testIdentity.password);
  await waitFor(
    client,
    `location.pathname === '/hall.html' && document.querySelector('.product-profile')?.dataset.authState === 'member'`,
    'Healthy retry did not reach the Member hall state',
  );

  const afterSuccess = await client.evaluate(`(() => {
    const session = JSON.parse(localStorage.getItem('myeongha.memberSession.v1') ?? 'null');
    return {
      state: document.querySelector('.product-profile')?.dataset.authState ?? null,
      userId: session?.user?.id ?? null,
      email: session?.user?.email ?? null,
      accessToken: session?.accessToken ?? null,
      activeBearer: sessionStorage.getItem('myeongha.guestBearer.v1'),
      pendingGuest: sessionStorage.getItem('myeongha.pendingGuestBearer.v1'),
    };
  })()`);
  assert(afterSuccess.state === 'member', 'Healthy retry did not render Member state');
  assert(afterSuccess.userId === testIdentity.id, 'Healthy retry stored the wrong Member identity');
  assert(afterSuccess.email === testIdentity.email, 'Healthy retry stored the wrong Member email');
  assert(afterSuccess.accessToken === memberSession.accessToken, 'Healthy retry stored an unexpected Member access token');
  assert(afterSuccess.activeBearer === memberSession.accessToken, 'Healthy retry did not stage the Member bearer');
  assert(afterSuccess.pendingGuest === null, 'Successful Guest promotion left a pending Guest bearer');

  const signIns = requests.filter((request) => request.path === '/api/auth/sign-in');
  const promotions = requests.filter((request) => request.path === '/api/auth/promote-guest');
  assert(networkTransportAttempts >= 1, 'Network failure did not exercise a transport-level sign-in attempt');
  assert(signIns.length === 4, `Expected four logical sign-in outcomes, received ${signIns.length}`);
  assert(signIns[0].outcome === 'network', 'First sign-in outcome was not the network-failure case');
  assert(signIns[1].outcome === 'upstream', 'Second sign-in outcome was not the upstream-failure case');
  assert(signIns[2].outcome === 'invalid', 'Third sign-in outcome was not the invalid-credentials case');
  assert(signIns[3].outcome === 'valid', 'Fourth sign-in outcome was not the healthy retry');
  assert(promotions.length === 1, `Expected one Guest promotion after healthy retry, received ${promotions.length}`);
  assert(promotions[0].authorization === `Bearer ${memberSession.accessToken}`, 'Guest promotion did not authorize with the Member token');
  assert(promotions[0].promotedGuest === guestBearer, 'Guest promotion did not use the preserved Guest bearer');

  const artifactDir = resolve(process.cwd(), 'artifacts');
  await mkdir(artifactDir, { recursive: true });
  await writeFile(join(artifactDir, 'web-auth-failed-login-guest-browser-smoke.json'), `${JSON.stringify({
    networkTransportAttempts,
    networkFailurePreservedGuest: afterNetworkFailure.activeBearer === guestBearer,
    upstreamFailurePreservedGuest: afterUpstreamFailure.activeBearer === guestBearer,
    invalidCredentialsPreservedGuest: afterInvalidCredentials.activeBearer === guestBearer,
    memberCreatedOnNetworkFailure: afterNetworkFailure.memberSession !== null,
    memberCreatedOnUpstreamFailure: afterUpstreamFailure.memberSession !== null,
    memberCreatedOnInvalidCredentials: afterInvalidCredentials.memberSession !== null,
    guestPromotionRequests: promotions.length,
    finalAuthState: afterSuccess.state,
    finalMemberId: afterSuccess.userId,
  }, null, 2)}\n`);

  console.log('MyeongHa_WEB_AUTH_FAILED_LOGIN_GUEST_BROWSER_PASS');
} catch (error) {
  console.error(error);
  if (chromeError.trim()) console.error(chromeError.trim());
  process.exitCode = 1;
} finally {
  client?.close();
  chrome.kill('SIGTERM');
  await Promise.race([
    new Promise((done) => chrome.once('exit', done)),
    sleep(1_000),
  ]);
  await new Promise((done) => server.close(done));
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
