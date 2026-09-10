import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const artifactDir = resolve(process.cwd(), 'artifacts');
const artifactPath = join(artifactDir, 'web-auth-promotion-member-generation-browser-smoke.json');
const memberKey = 'myeongha.memberSession.v1';
const guestKey = 'myeongha.guestBearer.v1';
const pendingGuestKey = 'myeongha.pendingGuestBearer.v1';
const guestBearer = 'promotion-generation-guest';
const accountA = Object.freeze({
  email: 'promotion-a@example.com',
  password: 'browser-password-12345',
  session: Object.freeze({
    accessToken: 'promotionA.member.signature',
    refreshToken: 'promotion-refresh-a',
    expiresAt: '2099-01-01T00:00:00.000Z',
    tokenType: 'bearer',
    user: Object.freeze({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'promotion-a@example.com' }),
  }),
});
const accountB = Object.freeze({
  email: 'promotion-b@example.com',
  password: 'browser-password-67890',
  session: Object.freeze({
    accessToken: 'promotionB.member.signature',
    refreshToken: 'promotion-refresh-b',
    expiresAt: '2099-01-02T00:00:00.000Z',
    tokenType: 'bearer',
    user: Object.freeze({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', email: 'promotion-b@example.com' }),
  }),
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
let accountASignInRequests = 0;
let accountBSignInRequests = 0;
let promotionRequests = 0;
let promotionAuthorization = null;
let promotedGuest = null;
let releasePromotion;
let markPromotionStarted;
const promotionStarted = new Promise((resolve) => { markPromotionStarted = resolve; });
const promotionGate = new Promise((resolve) => { releasePromotion = resolve; });

function envelope(data) {
  return {
    ok: true,
    data,
    meta: {
      apiContractVersion: 'browser-auth-promotion-member-generation-v1',
      requestId: `promotion-member-generation-${Date.now()}`,
      serverTime: new Date().toISOString(),
    },
  };
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

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const pathname = decodeURIComponent(url.pathname);
      if (pathname === '/api/auth/sign-in' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const account = body.email === accountA.email ? accountA : body.email === accountB.email ? accountB : null;
        assert(account && body.password === account.password, `unexpected sign-in credentials: ${body.email}`);
        if (account === accountA) accountASignInRequests += 1;
        else accountBSignInRequests += 1;
        sendJson(res, 200, envelope({ status: 'authenticated', session: account.session }));
        return;
      }
      if (pathname === '/api/auth/promote-guest' && req.method === 'POST') {
        promotionRequests += 1;
        promotionAuthorization = req.headers.authorization ?? null;
        promotedGuest = req.headers['x-myeongha-guest-bearer'] ?? null;
        markPromotionStarted();
        await promotionGate;
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
      assert((await stat(file)).isFile(), `not a file: ${pathname}`);
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

async function waitFor(client, expression, message, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      if (await client.evaluate(expression)) return;
    } catch {}
    await sleep(50);
  }
  throw new Error(message);
}

async function navigateAuth(client, origin) {
  await client.send('Page.navigate', { url: `${origin}/auth.html?next=hall.html` });
  await waitFor(client, `location.pathname === '/auth.html' && document.readyState === 'complete' && Boolean(document.querySelector('#auth-form'))`, 'auth page did not load');
}

async function submitSignIn(client, account) {
  await client.evaluate(`(() => {
    document.querySelector('#auth-email').value = ${JSON.stringify(account.email)};
    document.querySelector('#auth-password').value = ${JSON.stringify(account.password)};
    document.querySelector('#auth-form').requestSubmit();
  })()`);
}

async function removeChromeProfile(profile) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      return;
    } catch (error) {
      if (!['ENOTEMPTY', 'EBUSY', 'EPERM'].includes(error?.code)) throw error;
      await sleep(100 * (attempt + 1));
    }
  }
}

for (const file of ['auth.html', 'auth-page.js', 'product-auth.js']) await stat(join(root, file));
const authPageSource = await readFile(join(root, 'auth-page.js'), 'utf8');
assert(authPageSource.includes("const MEMBER_MUTATION_LOCK_NAME = 'myeongha.memberSession.v1.refresh.lock';"), 'promotion lock namespace contract missing');
assert(authPageSource.includes('async function withCanonicalMemberPromotionAuthority(expectedSession, operation)'), 'canonical promotion authority wrapper missing');
assert(authPageSource.includes('const promotion = await withCanonicalMemberPromotionAuthority('), 'finishAuthenticated does not use canonical promotion authority wrapper');

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-auth-promotion-member-generation-browser-'));
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
  await navigateAuth(tabA, origin);
  await navigateAuth(tabB, origin);
  const supportsLocks = await tabA.evaluate(`Boolean(navigator.locks && typeof navigator.locks.request === 'function')`);
  assert(supportsLocks, 'Chrome Web Locks API unavailable');

  await tabA.evaluate(`(() => {
    localStorage.removeItem(${JSON.stringify(memberKey)});
    sessionStorage.setItem(${JSON.stringify(guestKey)}, ${JSON.stringify(guestBearer)});
    sessionStorage.removeItem(${JSON.stringify(pendingGuestKey)});
  })()`);

  await submitSignIn(tabA, accountA);
  await Promise.race([
    promotionStarted,
    sleep(10_000).then(() => { throw new Error('account A promotion request did not start'); }),
  ]);
  assert(accountASignInRequests === 1, `expected one account A sign-in request, got ${accountASignInRequests}`);
  assert(promotionRequests === 1, `expected one promotion request, got ${promotionRequests}`);
  assert(promotionAuthorization === `Bearer ${accountA.session.accessToken}`, `promotion used wrong Member bearer: ${promotionAuthorization}`);
  assert(promotedGuest === guestBearer, `promotion used wrong Guest bearer: ${promotedGuest}`);

  await submitSignIn(tabB, accountB);
  await sleep(250);
  assert(accountBSignInRequests === 0, 'newer Member sign-in request started while older Member promotion held the shared lock');
  const duringPromotion = await tabB.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(memberKey)}) ?? 'null')?.accessToken ?? null`);
  assert(duringPromotion === accountA.session.accessToken, `canonical Member changed during promotion: ${duringPromotion}`);

  releasePromotion();
  const deadline = Date.now() + 10_000;
  while (accountBSignInRequests < 1 && Date.now() < deadline) await sleep(25);
  assert(accountBSignInRequests === 1, `queued account B sign-in did not start after promotion release: ${accountBSignInRequests}`);
  await waitFor(tabB, `JSON.parse(localStorage.getItem(${JSON.stringify(memberKey)}) ?? 'null')?.accessToken === ${JSON.stringify(accountB.session.accessToken)}`, 'newer account B did not become canonical after promotion released');
  await sleep(100);

  const finalA = await tabA.evaluate(`(() => ({
    member: JSON.parse(localStorage.getItem(${JSON.stringify(memberKey)}) ?? 'null')?.accessToken ?? null,
    guest: sessionStorage.getItem(${JSON.stringify(guestKey)}),
    pendingGuest: sessionStorage.getItem(${JSON.stringify(pendingGuestKey)}),
  }))()`);
  const finalB = await tabB.evaluate(`(() => ({
    member: JSON.parse(localStorage.getItem(${JSON.stringify(memberKey)}) ?? 'null')?.accessToken ?? null,
    guest: sessionStorage.getItem(${JSON.stringify(guestKey)}),
    pendingGuest: sessionStorage.getItem(${JSON.stringify(pendingGuestKey)}),
  }))()`);
  assert(finalA.member === accountB.session.accessToken && finalB.member === accountB.session.accessToken, 'newer account B was not canonical in both tabs');
  assert(finalA.pendingGuest === null, 'promoted Guest remained pending in account A tab');

  const report = {
    status: 'MyeongHa_WEB_AUTH_PROMOTION_MEMBER_GENERATION_BROWSER_PASS',
    promotionHeldMemberMutationLock: true,
    accountBRequestBlockedUntilPromotionSettled: true,
    promotionMember: accountA.session.accessToken,
    finalCanonicalMember: accountB.session.accessToken,
    guestPromoted: promotedGuest,
    accountASignInRequests,
    accountBSignInRequests,
    promotionRequests,
    finalA,
    finalB,
  };
  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log('MyeongHa_WEB_AUTH_PROMOTION_MEMBER_GENERATION_BROWSER_PASS promotion_locked=true newer_signin_blocked=true final_newer_member=true');
} catch (error) {
  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify({
    status: 'MyeongHa_WEB_AUTH_PROMOTION_MEMBER_GENERATION_BROWSER_FAIL',
    error: error instanceof Error ? error.message : String(error),
    accountASignInRequests,
    accountBSignInRequests,
    promotionRequests,
    promotionAuthorization,
    promotedGuest,
    chromeError,
  }, null, 2)}\n`, 'utf8');
  throw error;
} finally {
  releasePromotion?.();
  tabA?.close();
  tabB?.close();
  if (chrome.exitCode === null) {
    chrome.kill('SIGTERM');
    await Promise.race([new Promise((done) => chrome.once('exit', done)), sleep(3_000)]);
    if (chrome.exitCode === null) chrome.kill('SIGKILL');
  }
  await new Promise((done) => server.close(done));
  await removeChromeProfile(profile);
}
