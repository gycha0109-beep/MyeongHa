import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const testIdentity = Object.freeze({
  id: '11111111-1111-4111-8111-111111111111',
  email: 'browser-member@example.com',
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
let signInCount = 0;
let apiRequestCount = 0;

function sessionFor(loginNo) {
  return {
    accessToken: `header${loginNo}.payload${loginNo}.signature${loginNo}`,
    refreshToken: `refresh-token-${loginNo}`,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    tokenType: 'bearer',
    user: { id: testIdentity.id, email: testIdentity.email },
  };
}

function successEnvelope(data) {
  apiRequestCount += 1;
  return {
    ok: true,
    data,
    meta: {
      apiContractVersion: 'browser-auth-continuity-v1',
      requestId: `web-auth-continuity-${apiRequestCount}`,
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
      apiContractVersion: 'browser-auth-continuity-v1',
      requestId: `web-auth-continuity-${apiRequestCount}`,
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
        signInCount += 1;
        sendJson(res, 200, successEnvelope({ status: 'authenticated', session: sessionFor(signInCount) }));
        return;
      }

      if (pathname === '/api/auth/sign-out' && req.method === 'POST') {
        requests.push({ path: pathname, method: req.method, authorization });
        sendJson(res, 200, successEnvelope({ status: 'signed_out' }));
        return;
      }

      if (pathname === '/api/me' && req.method === 'GET') {
        requests.push({ path: pathname, method: req.method, authorization });
        if (!authorization?.startsWith('Bearer header')) {
          sendJson(res, 401, errorEnvelope('AUTH_REQUIRED', 'auth.required'));
          return;
        }
        sendJson(res, 200, successEnvelope({
          subjectKind: 'member',
          subjectStatus: 'active',
          profile: {
            displayName: '브라우저 회원',
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
        if (!authorization?.startsWith('Bearer header')) {
          sendJson(res, 401, errorEnvelope('AUTH_REQUIRED', 'auth.required'));
          return;
        }
        sendJson(res, 200, successEnvelope({ birthProfile: null }));
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
    status: document.querySelector('#my-status')?.textContent?.trim() ?? null,
    accountEmail: document.querySelector('#my-account-email')?.textContent?.trim() ?? null,
    authAction: document.querySelector('.my-auth-actions')?.textContent?.trim() ?? null,
  }))()`);
  throw new Error(`${message}; diagnostics=${JSON.stringify(diagnostics)}; requests=${JSON.stringify(requests)}`);
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
const profile = await mkdtemp(join(tmpdir(), 'myeongha-auth-continuity-browser-'));
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
    'Initial sign-in did not reach the Member hall state',
  );

  const firstMember = await client.evaluate(`(() => {
    const session = JSON.parse(localStorage.getItem('myeongha.memberSession.v1') ?? 'null');
    return {
      state: document.querySelector('.product-profile')?.dataset.authState ?? null,
      accessToken: session?.accessToken ?? null,
      userId: session?.user?.id ?? null,
      email: session?.user?.email ?? null,
      activeBearer: sessionStorage.getItem('myeongha.guestBearer.v1'),
    };
  })()`);
  assert(firstMember.state === 'member', 'Initial login did not render Member header state');
  assert(firstMember.userId === testIdentity.id, 'Initial login stored the wrong Member identity');
  assert(firstMember.email === testIdentity.email, 'Initial login stored the wrong Member email');
  assert(firstMember.accessToken === 'header1.payload1.signature1', 'Initial login stored an unexpected access token');
  assert(firstMember.activeBearer === firstMember.accessToken, 'Initial login did not stage the Member bearer');

  await navigate(client, origin, '/my.html', '#my-account-email');
  await waitFor(
    client,
    `document.querySelector('#my-account-email')?.textContent?.trim() === ${JSON.stringify(testIdentity.email)} && Boolean(document.querySelector('.my-auth-actions button'))`,
    'My page did not resolve the signed-in Member account and logout action',
  );
  await client.evaluate(`document.querySelector('.my-auth-actions button')?.click()`);
  await waitFor(
    client,
    `location.pathname === '/auth.html' && !localStorage.getItem('myeongha.memberSession.v1')`,
    'Sign-out did not clear the browser Member session and return to auth',
  );
  const afterSignOut = await client.evaluate(`(() => ({
    memberSession: localStorage.getItem('myeongha.memberSession.v1'),
    activeBearer: sessionStorage.getItem('myeongha.guestBearer.v1'),
  }))()`);
  assert(afterSignOut.memberSession === null, 'Sign-out left the Member session in localStorage');
  assert(afterSignOut.activeBearer === null, 'Sign-out left the Member bearer active in sessionStorage');

  await navigate(client, origin, '/hall.html', '.product-profile');
  await waitFor(
    client,
    `document.querySelector('.product-profile')?.dataset.authState === 'guest'`,
    'Signed-out hall did not render Guest state',
  );
  await client.evaluate(`document.querySelector('.product-profile')?.click()`);
  await waitFor(client, `location.pathname === '/auth.html' && Boolean(document.querySelector('#auth-form'))`, 'Guest login action did not navigate to auth');

  await submitSignIn(client);
  await waitFor(
    client,
    `location.pathname === '/hall.html' && document.querySelector('.product-profile')?.dataset.authState === 'member'`,
    'Re-login did not return to the Member hall state',
  );
  const secondMember = await client.evaluate(`(() => {
    const session = JSON.parse(localStorage.getItem('myeongha.memberSession.v1') ?? 'null');
    return {
      state: document.querySelector('.product-profile')?.dataset.authState ?? null,
      accessToken: session?.accessToken ?? null,
      userId: session?.user?.id ?? null,
      email: session?.user?.email ?? null,
      activeBearer: sessionStorage.getItem('myeongha.guestBearer.v1'),
    };
  })()`);
  assert(secondMember.state === 'member', 'Re-login did not render Member state');
  assert(secondMember.userId === firstMember.userId, 'Re-login changed the browser Member identity');
  assert(secondMember.email === firstMember.email, 'Re-login changed the browser Member email');
  assert(secondMember.accessToken === 'header2.payload2.signature2', 'Re-login did not persist the rotated access token');
  assert(secondMember.accessToken !== firstMember.accessToken, 'Re-login reused the first access token');
  assert(secondMember.activeBearer === secondMember.accessToken, 'Re-login did not stage the rotated Member bearer');

  const signIns = requests.filter((request) => request.path === '/api/auth/sign-in');
  const signOuts = requests.filter((request) => request.path === '/api/auth/sign-out');
  const profileReads = requests.filter((request) => request.path === '/api/me');
  assert(signIns.length === 2, `Expected two sign-in requests, received ${signIns.length}`);
  assert(signOuts.length === 1, `Expected one sign-out request, received ${signOuts.length}`);
  assert(signOuts[0].authorization === 'Bearer header1.payload1.signature1', 'Sign-out did not authorize with the first Member token');
  assert(profileReads.some((request) => request.authorization === 'Bearer header1.payload1.signature1'), 'My page did not read canonical Member profile with the signed-in bearer');

  const artifactDir = resolve(process.cwd(), 'artifacts');
  await mkdir(artifactDir, { recursive: true });
  await writeFile(join(artifactDir, 'web-auth-continuity-browser-smoke.json'), `${JSON.stringify({
    signInRequests: signIns.length,
    signOutRequests: signOuts.length,
    sameUserId: firstMember.userId === secondMember.userId,
    rotatedAccessToken: firstMember.accessToken !== secondMember.accessToken,
    finalAuthState: secondMember.state,
  }, null, 2)}\n`);

  console.log('MyeongHa_WEB_AUTH_CONTINUITY_BROWSER_PASS');
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
