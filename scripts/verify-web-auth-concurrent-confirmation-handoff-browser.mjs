import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const artifactDir = resolve(process.cwd(), 'artifacts');
const artifactPath = join(artifactDir, 'web-auth-concurrent-confirmation-handoff-browser-smoke.json');
const handoffKey = 'myeongha.pendingGuestConfirmation.v1';
const memberKey = 'myeongha.memberSession.v1';
const activeBearerKey = 'myeongha.guestBearer.v1';
const pendingGuestKey = 'myeongha.pendingGuestBearer.v1';
const password = 'browser-password-12345';
const emailA = 'concurrent-a@example.com';
const emailB = 'concurrent-b@example.com';
const guestA = 'guest-concurrent-confirmation-a';
const guestB = 'guest-concurrent-confirmation-b';
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
const signUpWaiters = [];
let apiRequestCount = 0;
let lastSignInEmail = null;

function identityFor(email) {
  const key = email === emailA ? 'a' : 'b';
  return {
    id: `77777777-7777-4777-8777-77777777777${key === 'a' ? '1' : '2'}`,
    email,
    accessToken: `concurrent-${key}.member.signature`,
    refreshToken: `concurrent-refresh-${key}`,
  };
}

function sessionFor(email) {
  const identity = identityFor(email);
  return {
    accessToken: identity.accessToken,
    refreshToken: identity.refreshToken,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    tokenType: 'bearer',
    user: { id: identity.id, email: identity.email },
  };
}

function envelope(data) {
  apiRequestCount += 1;
  return {
    ok: true,
    data,
    meta: {
      apiContractVersion: 'browser-auth-concurrent-confirmation-handoff-v1',
      requestId: `web-auth-concurrent-confirmation-handoff-${apiRequestCount}`,
      serverTime: '2026-09-08T00:00:00.000Z',
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

function releaseConcurrentSignUps() {
  if (signUpWaiters.length !== 2) return;
  const waiters = signUpWaiters.splice(0, 2);
  for (const { res, email } of waiters) {
    sendJson(res, 200, envelope({ status: 'verification_required', email }));
  }
}

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const pathname = decodeURIComponent(url.pathname);

      if (pathname === '/api/session/bootstrap' && req.method === 'POST') {
        requests.push({ path: pathname, unexpected: true });
        sendJson(res, 500, { ok: false, error: { code: 'UNEXPECTED_BOOTSTRAP' } });
        return;
      }

      if (pathname === '/api/auth/sign-up' && req.method === 'POST') {
        const body = await readJsonBody(req);
        assert(body.password === password, 'Unexpected sign-up password');
        assert(body.email === emailA || body.email === emailB, `Unexpected sign-up email: ${body.email}`);
        requests.push({ path: pathname, email: body.email });
        signUpWaiters.push({ res, email: body.email });
        releaseConcurrentSignUps();
        return;
      }

      if (pathname === '/api/auth/sign-in' && req.method === 'POST') {
        const body = await readJsonBody(req);
        assert(body.password === password, 'Unexpected sign-in password');
        assert(body.email === emailA || body.email === emailB, `Unexpected sign-in email: ${body.email}`);
        lastSignInEmail = body.email;
        requests.push({ path: pathname, email: body.email });
        sendJson(res, 200, envelope({ status: 'authenticated', session: sessionFor(body.email) }));
        return;
      }

      if (pathname === '/api/auth/promote-guest' && req.method === 'POST') {
        const promotedGuest = req.headers['x-myeongha-guest-bearer'] ?? null;
        const expectedGuest = lastSignInEmail === emailA ? guestA : guestB;
        assert(promotedGuest === expectedGuest, `Promoted ${promotedGuest} instead of ${expectedGuest}`);
        assert(
          req.headers.authorization === `Bearer ${sessionFor(lastSignInEmail).accessToken}`,
          'Promotion used an unexpected Member bearer',
        );
        requests.push({ path: pathname, email: lastSignInEmail, promotedGuest });
        sendJson(res, 200, envelope({ status: 'promoted' }));
        return;
      }

      if (pathname.startsWith('/api/')) {
        sendJson(res, 404, { ok: false, error: { code: 'NOT_FOUND' } });
        return;
      }

      const staticPath = pathname === '/' ? '/auth.html' : pathname;
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
  const cleanPath = pathname.split(/[?#]/)[0];
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

async function waitFor(client, expression, message, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return;
    await sleep(50);
  }
  const diagnostics = await client.evaluate(`(() => ({
    pathname: location.pathname,
    status: document.querySelector('#auth-status')?.textContent?.trim() ?? null,
    handoff: localStorage.getItem(${JSON.stringify(handoffKey)}),
    member: localStorage.getItem(${JSON.stringify(memberKey)}),
    active: sessionStorage.getItem(${JSON.stringify(activeBearerKey)}),
    pending: sessionStorage.getItem(${JSON.stringify(pendingGuestKey)}),
  }))()`);
  throw new Error(`${message}; diagnostics=${JSON.stringify(diagnostics)}; requests=${JSON.stringify(requests)}`);
}

async function prepareGuestTab(client, origin, guestBearer, { clearShared = false } = {}) {
  await navigate(client, origin, '/auth.html?next=hall.html', '#auth-form');
  await client.evaluate(`(() => {
    ${clearShared ? `localStorage.removeItem(${JSON.stringify(handoffKey)}); localStorage.removeItem(${JSON.stringify(memberKey)});` : ''}
    sessionStorage.setItem(${JSON.stringify(activeBearerKey)}, ${JSON.stringify(guestBearer)});
    sessionStorage.removeItem(${JSON.stringify(pendingGuestKey)});
  })()`);
  assert(
    await client.evaluate(`typeof navigator.locks?.request === 'function'`),
    'Chrome Web Locks API is unavailable',
  );
}

async function scheduleSignUp(client, email) {
  const scheduled = await client.evaluate(`(() => {
    document.querySelector('#auth-tab-signup').click();
    const emailInput = document.querySelector('#auth-email');
    const passwordInput = document.querySelector('#auth-password');
    const confirmation = document.querySelector('#auth-password-confirm');
    const form = document.querySelector('#auth-form');
    if (!(emailInput instanceof HTMLInputElement) || !(passwordInput instanceof HTMLInputElement) || !(confirmation instanceof HTMLInputElement) || !(form instanceof HTMLFormElement)) return false;
    emailInput.value = ${JSON.stringify(email)};
    passwordInput.value = ${JSON.stringify(password)};
    confirmation.value = ${JSON.stringify(password)};
    setTimeout(() => form.requestSubmit(), 0);
    return true;
  })()`);
  assert(scheduled === true, `Concurrent sign-up was not scheduled for ${email}`);
}

async function scheduleSignIn(client, email) {
  await waitFor(
    client,
    `document.readyState === 'complete' && location.pathname === '/auth.html' && Boolean(document.querySelector('#auth-form'))`,
    `Auth form was not ready before sign-in for ${email}`,
  );
  const scheduled = await client.evaluate(`(() => {
    document.querySelector('#auth-tab-signin').click();
    const emailInput = document.querySelector('#auth-email');
    const passwordInput = document.querySelector('#auth-password');
    const form = document.querySelector('#auth-form');
    if (!(emailInput instanceof HTMLInputElement) || !(passwordInput instanceof HTMLInputElement) || !(form instanceof HTMLFormElement)) return false;
    emailInput.value = ${JSON.stringify(email)};
    passwordInput.value = ${JSON.stringify(password)};
    setTimeout(() => form.requestSubmit(), 0);
    return true;
  })()`);
  assert(scheduled === true, `Sign-in was not scheduled for ${email}`);
}

async function readStore(client) {
  return client.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(handoffKey)}) ?? 'null')`);
}

function assertEntries(store, expected) {
  assert(store?.version === 2, `Expected v2 handoff store, got ${JSON.stringify(store)}`);
  assert(Array.isArray(store.entries), 'Handoff entries are missing');
  assert(store.entries.length === expected.length, `Expected ${expected.length} entries, got ${store.entries.length}`);
  for (const [email, guestBearer] of expected) {
    assert(
      store.entries.some((entry) => entry.email === email && entry.guestBearer === guestBearer && Date.parse(entry.expiresAt) > Date.now()),
      `Missing concurrent handoff ${email}/${guestBearer}`,
    );
  }
}

for (const file of ['auth.html', 'auth-page.js', 'product-auth.js', 'hall.html']) {
  await stat(join(root, file));
}
const authPageSource = await readFile(join(root, 'auth-page.js'), 'utf8');
assert(authPageSource.includes('CONFIRMATION_GUEST_HANDOFF_LOCK_NAME'), 'auth-page.js does not declare a handoff lock');
assert(authPageSource.includes("{ mode: 'exclusive' }"), 'auth-page.js does not request an exclusive handoff lock');
assert(authPageSource.includes('if (!await stageConfirmationGuestHandoff(result.email))'), 'verification-required signup does not await locked handoff staging');

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-auth-concurrent-confirmation-handoff-browser-'));
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
  tabA = await connectCdp(port);
  tabB = await connectCdp(port);

  await prepareGuestTab(tabA, origin, guestA, { clearShared: true });
  await prepareGuestTab(tabB, origin, guestB);

  await Promise.all([
    scheduleSignUp(tabA, emailA),
    scheduleSignUp(tabB, emailB),
  ]);
  await Promise.all([
    waitFor(tabA, `document.querySelector('#auth-status')?.textContent?.includes('확인 메일을 보냈습니다') === true`, 'Tab A verification-required signup did not finish'),
    waitFor(tabB, `document.querySelector('#auth-status')?.textContent?.includes('확인 메일을 보냈습니다') === true`, 'Tab B verification-required signup did not finish'),
  ]);

  const signUps = requests.filter((request) => request.path === '/api/auth/sign-up');
  assert(signUps.length === 2, `Expected two concurrent sign-up requests, got ${signUps.length}`);
  assert(signUpWaiters.length === 0, 'Concurrent sign-up barrier did not release both responses');
  assertEntries(await readStore(tabA), [[emailA, guestA], [emailB, guestB]]);
  assert(requests.filter((request) => request.path === '/api/session/bootstrap').length === 0, 'Concurrent signup unexpectedly bootstrapped a Guest');

  await tabA.evaluate(`sessionStorage.removeItem(${JSON.stringify(activeBearerKey)}); sessionStorage.removeItem(${JSON.stringify(pendingGuestKey)}); localStorage.removeItem(${JSON.stringify(memberKey)});`);
  await navigate(tabA, origin, '/auth.html?next=hall.html', '#auth-form');
  await scheduleSignIn(tabA, emailA);
  await waitFor(tabA, `location.pathname === '/hall.html'`, 'Tab A Member login did not finish');
  assertEntries(await readStore(tabA), [[emailB, guestB]]);

  await tabB.evaluate(`sessionStorage.removeItem(${JSON.stringify(activeBearerKey)}); sessionStorage.removeItem(${JSON.stringify(pendingGuestKey)}); localStorage.removeItem(${JSON.stringify(memberKey)});`);
  await navigate(tabB, origin, '/auth.html?next=hall.html', '#auth-form');
  await scheduleSignIn(tabB, emailB);
  await waitFor(tabB, `location.pathname === '/hall.html'`, 'Tab B Member login did not finish');
  assert(await readStore(tabB) === null, 'Final concurrent handoff was not cleared after exact promotion');

  const promotions = requests.filter((request) => request.path === '/api/auth/promote-guest');
  assert(promotions.length === 2, `Expected two exact promotions, got ${promotions.length}`);
  assert(promotions[0].email === emailA && promotions[0].promotedGuest === guestA, 'Tab A did not consume Guest A');
  assert(promotions[1].email === emailB && promotions[1].promotedGuest === guestB, 'Tab B did not consume Guest B');

  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify({
    status: 'MyeongHa_WEB_AUTH_CONCURRENT_CONFIRMATION_HANDOFF_BROWSER_PASS',
    concurrentTabs: 2,
    concurrentSignups: signUps.length,
    bothHandoffsPreservedBeforePromotion: true,
    exactPromotionOrder: promotions.map((entry) => ({ email: entry.email, guestBearer: entry.promotedGuest })),
    requests,
  }, null, 2)}\n`, 'utf8');
  console.log('MyeongHa_WEB_AUTH_CONCURRENT_CONFIRMATION_HANDOFF_BROWSER_PASS');
} catch (error) {
  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify({
    status: 'MyeongHa_WEB_AUTH_CONCURRENT_CONFIRMATION_HANDOFF_BROWSER_FAIL',
    error: error instanceof Error ? error.message : String(error),
    requests,
    chromeError,
  }, null, 2)}\n`, 'utf8');
  throw error;
} finally {
  tabA?.close();
  tabB?.close();
  await stopChrome(chrome);
  await new Promise((done) => server.close(done));
  await rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 125 });
}
