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

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function meta() {
  requestNo += 1;
  return {
    apiContractVersion: 'browser-auth-rejection-v1',
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
    accessToken: 'rejectheader.rejectpayload.rejectsignature',
    refreshToken: 'reject-refresh-token',
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
        if (rejectCurrentSubject || authorization !== 'Bearer rejectheader.rejectpayload.rejectsignature') {
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
        if (authorization !== 'Bearer rejectheader.rejectpayload.rejectsignature') {
          sendJson(res, 401, failure('AUTH_REQUIRED', 'auth.required'));
          return;
        }
        sendJson(res, 200, success({ birthProfile: null }));
        return;
      }

      if (pathname.startsWith('/api/')) {
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

async function waitFor(client, expression, message, timeout = 8_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return;
    await sleep(50);
  }
  const diagnostics = await client.evaluate(`(() => ({
    pathname: location.pathname,
    authState: document.querySelector('.product-profile')?.dataset.authState ?? null,
    myStatus: document.querySelector('#my-status')?.textContent?.trim() ?? null,
    authActions: document.querySelector('.my-auth-actions')?.textContent?.trim() ?? null,
    memberSession: localStorage.getItem('myeongha.memberSession.v1'),
    activeBearer: sessionStorage.getItem('myeongha.guestBearer.v1'),
  }))()`);
  throw new Error(`${message}; diagnostics=${JSON.stringify(diagnostics)}; requests=${JSON.stringify(requests)}`);
}

async function submitSignIn(client) {
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
let client;

try {
  client = await connectCdp(await devtoolsPort(profile, chrome));

  await navigate(client, origin, '/auth.html?next=hall.html', '#auth-form');
  await submitSignIn(client);
  await waitFor(
    client,
    `location.pathname === '/hall.html' && document.querySelector('.product-profile')?.dataset.authState === 'member'`,
    'Sign-in did not reach visible Member state',
  );

  await navigate(client, origin, '/my.html', '#my-account-email');
  await waitFor(
    client,
    `document.querySelector('#my-account-email')?.textContent?.trim() === ${JSON.stringify(identity.email)} && Boolean(document.querySelector('.my-auth-actions button'))`,
    'Canonical Member profile did not render before rejection',
  );

  const beforeRejection = await client.evaluate(`(() => ({
    memberSession: JSON.parse(localStorage.getItem('myeongha.memberSession.v1') ?? 'null'),
    activeBearer: sessionStorage.getItem('myeongha.guestBearer.v1'),
  }))()`);
  assert(beforeRejection.memberSession?.user?.id === identity.id, 'Pre-rejection Member identity was not stored');
  assert(beforeRejection.activeBearer === 'rejectheader.rejectpayload.rejectsignature', 'Pre-rejection Member bearer was not active');

  rejectCurrentSubject = true;
  await navigate(client, origin, '/my.html?canonical-rejection=1', '#my-status');
  await waitFor(
    client,
    `!localStorage.getItem('myeongha.memberSession.v1') && document.querySelector('#my-status')?.textContent?.includes('현재 세션이 필요합니다.') && document.querySelector('.my-auth-actions a')?.textContent?.includes('로그인하기')`,
    'Canonical /api/me 401 did not invalidate stale Member state and render login-required UI',
  );

  const afterRejection = await client.evaluate(`(() => ({
    memberSession: localStorage.getItem('myeongha.memberSession.v1'),
    activeBearer: sessionStorage.getItem('myeongha.guestBearer.v1'),
    pendingBearer: sessionStorage.getItem('myeongha.pendingGuestBearer.v1'),
    status: document.querySelector('#my-status')?.textContent?.trim() ?? null,
    loginHref: document.querySelector('.my-auth-actions a')?.getAttribute('href') ?? null,
    logoutPresent: Boolean(document.querySelector('.my-auth-actions button')),
  }))()`);
  assert(afterRejection.memberSession === null, 'Canonical rejection left stale Member localStorage');
  assert(afterRejection.activeBearer === null, 'Canonical rejection left stale Member bearer active');
  assert(afterRejection.pendingBearer === null, 'Canonical rejection left an unexpected pending Guest bearer');
  assert(afterRejection.loginHref === 'auth.html?next=my.html', `Unexpected post-rejection login href: ${afterRejection.loginHref}`);
  assert(afterRejection.logoutPresent === false, 'Canonical rejection left a logout action for an invalidated Member');

  await navigate(client, origin, '/hall.html', '.product-profile');
  await waitFor(
    client,
    `document.querySelector('.product-profile')?.dataset.authState === 'guest' && document.querySelector('.product-profile')?.getAttribute('aria-label') === '로그인'`,
    'Hall retained stale Member presentation after canonical rejection',
  );

  const hallState = await client.evaluate(`(() => ({
    authState: document.querySelector('.product-profile')?.dataset.authState ?? null,
    href: document.querySelector('.product-profile')?.getAttribute('href') ?? null,
    label: document.querySelector('.product-profile-mark + span')?.textContent?.trim() ?? null,
  }))()`);
  assert(hallState.authState === 'guest', 'Hall did not become Guest after canonical rejection');
  assert(hallState.href?.startsWith('auth.html?next='), `Hall login href is invalid after rejection: ${hallState.href}`);
  assert(hallState.label === '로그인', `Hall retained a stale Member label: ${hallState.label}`);

  const rejectionReads = requests.filter((request) => request.path === '/api/me' && request.rejectCurrentSubject);
  assert(rejectionReads.length >= 1, 'Verifier never exercised canonical /api/me rejection');
  assert(
    rejectionReads.some((request) => request.authorization === 'Bearer rejectheader.rejectpayload.rejectsignature'),
    'Canonical rejection was not exercised against the stored Member bearer',
  );

  const artifactDir = resolve(process.cwd(), 'artifacts');
  await mkdir(artifactDir, { recursive: true });
  await writeFile(join(artifactDir, 'web-auth-rejection-browser-smoke.json'), `${JSON.stringify({
    canonicalRejectionReads: rejectionReads.length,
    memberSessionCleared: afterRejection.memberSession === null,
    memberBearerCleared: afterRejection.activeBearer === null,
    myLoginRequiredRendered: afterRejection.status?.includes('현재 세션이 필요합니다.') ?? false,
    finalHallAuthState: hallState.authState,
    finalHallLabel: hallState.label,
  }, null, 2)}\n`);

  console.log('MyeongHa_WEB_AUTH_REJECTION_BROWSER_PASS');
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
