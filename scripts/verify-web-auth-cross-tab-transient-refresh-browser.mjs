import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const artifactDir = resolve(process.cwd(), 'artifacts');
const artifactPath = join(artifactDir, 'web-auth-cross-tab-transient-refresh-browser-smoke.json');
const member = Object.freeze({
  id: '77777777-7777-4777-8777-777777777777',
  email: 'cross-tab-transient-refresh@example.com',
});
const memberAccessToken = 'transient.header.signature';
const memberRefreshToken = 'transient-refresh-token';
const tabAGuestBearer = 'cross-tab-transient-refresh-guest-a';
const tabBGuestBearer = 'cross-tab-transient-refresh-guest-b';
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
      apiContractVersion: 'browser-auth-cross-tab-transient-refresh-v1',
      requestId: `web-auth-cross-tab-transient-refresh-${apiRequestCount}`,
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
      apiContractVersion: 'browser-auth-cross-tab-transient-refresh-v1',
      requestId: `web-auth-cross-tab-transient-refresh-${apiRequestCount}`,
      serverTime: '2026-09-07T00:00:00.000Z',
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
      const authorization = req.headers.authorization ?? null;

      if (pathname === '/api/auth/refresh' && req.method === 'POST') {
        const body = await readJsonBody(req);
        refreshRequests += 1;
        requests.push({ path: pathname, method: req.method, authorization, refreshToken: body.refreshToken ?? null });
        sendJson(res, 503, errorEnvelope('AUTH_UPSTREAM_UNAVAILABLE', 'auth.upstream_unavailable', true));
        return;
      }

      if (pathname === '/api/session/bootstrap' && req.method === 'POST') {
        guestBootstrapRequests += 1;
        requests.push({ path: pathname, method: req.method, authorization });
        sendJson(res, 200, successEnvelope({
          kind: 'guest',
          guestSession: { bearerToken: 'unexpected-cross-tab-transient-refresh-bootstrap' },
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

async function removeProfile(profile) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await rm(profile, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 9) throw error;
      await sleep(100);
    }
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
  const diagnostics = await authSnapshot(client);
  throw new Error(`${message}; diagnostics=${JSON.stringify(diagnostics)}; requests=${JSON.stringify(requests)}`);
}

async function authSnapshot(client) {
  return client.evaluate(`(() => {
    const session = JSON.parse(localStorage.getItem('myeongha.memberSession.v1') ?? 'null');
    return {
      pathname: location.pathname,
      authState: document.querySelector('.product-profile')?.dataset.authState ?? null,
      authLabel: document.querySelector('.product-profile')?.getAttribute('aria-label') ?? null,
      accessToken: session?.accessToken ?? null,
      refreshToken: session?.refreshToken ?? null,
      expiresAt: session?.expiresAt ?? null,
      userId: session?.user?.id ?? null,
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

async function seedGuest(client, bearer) {
  await client.evaluate(`(() => {
    localStorage.removeItem('myeongha.memberSession.v1');
    sessionStorage.setItem('myeongha.guestBearer.v1', ${JSON.stringify(bearer)});
    sessionStorage.removeItem('myeongha.pendingGuestBearer.v1');
  })()`);
}

async function promoteMemberFromTabA(client, expiresAt) {
  await client.evaluate(`(() => {
    const session = {
      accessToken: ${JSON.stringify(memberAccessToken)},
      refreshToken: ${JSON.stringify(memberRefreshToken)},
      expiresAt: ${JSON.stringify(expiresAt)},
      tokenType: 'bearer',
      user: { id: ${JSON.stringify(member.id)}, email: ${JSON.stringify(member.email)} },
    };
    localStorage.setItem('myeongha.memberSession.v1', JSON.stringify(session));
    const current = sessionStorage.getItem('myeongha.guestBearer.v1');
    if (current && !sessionStorage.getItem('myeongha.pendingGuestBearer.v1')) {
      sessionStorage.setItem('myeongha.pendingGuestBearer.v1', current);
    }
    sessionStorage.setItem('myeongha.guestBearer.v1', session.accessToken);
  })()`);
}

async function updateSharedExpiry(client, expiresAt) {
  await client.evaluate(`(() => {
    const session = JSON.parse(localStorage.getItem('myeongha.memberSession.v1') ?? 'null');
    if (!session) throw new Error('Member session missing before expiry update');
    session.expiresAt = ${JSON.stringify(expiresAt)};
    localStorage.setItem('myeongha.memberSession.v1', JSON.stringify(session));
  })()`);
}

for (const file of ['hall.html', 'product-auth.js', 'product-auth-ui.js']) await stat(join(root, file));

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-auth-cross-tab-transient-refresh-browser-'));
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
  await seedGuest(tabB, tabBGuestBearer);
  await navigate(tabB, origin, '/hall.html', '.product-profile');

  tabA = await connectCdp(port);
  await navigate(tabA, origin, '/hall.html', '.product-profile');
  await seedGuest(tabA, tabAGuestBearer);
  await navigate(tabA, origin, '/hall.html', '.product-profile');

  await promoteMemberFromTabA(tabA, new Date(Date.now() + 10 * 60 * 1000).toISOString());
  await navigate(tabA, origin, '/hall.html', '.product-profile');
  await waitFor(
    tabA,
    `document.querySelector('.product-profile')?.dataset.authState === 'member'
      && sessionStorage.getItem('myeongha.guestBearer.v1') === ${JSON.stringify(memberAccessToken)}
      && sessionStorage.getItem('myeongha.pendingGuestBearer.v1') === ${JSON.stringify(tabAGuestBearer)}`,
    'Tab A did not enter Member authority before transient refresh scenarios',
  );
  await waitFor(
    tabB,
    `document.querySelector('.product-profile')?.dataset.authState === 'member'
      && sessionStorage.getItem('myeongha.guestBearer.v1') === ${JSON.stringify(memberAccessToken)}
      && sessionStorage.getItem('myeongha.pendingGuestBearer.v1') === ${JSON.stringify(tabBGuestBearer)}`,
    'Tab B did not converge to Member authority before transient refresh scenarios',
  );

  const initialTabA = await authSnapshot(tabA);
  const initialTabB = await authSnapshot(tabB);
  assert(initialTabA.userId === member.id && initialTabB.userId === member.id, 'Tabs did not share the same Member identity');

  const nearExpiry = new Date(Date.now() + 30_000).toISOString();
  const nearRefreshBefore = refreshRequests;
  await updateSharedExpiry(tabA, nearExpiry);
  await navigate(tabA, origin, '/hall.html', '.product-profile');
  await waitFor(tabA, `document.querySelector('.product-profile')?.dataset.authState === 'member'`, 'Tab A rendered Guest after near-expiry transient refresh failure');
  await waitFor(tabB, `document.querySelector('.product-profile')?.dataset.authState === 'member'`, 'Tab B rendered Guest after near-expiry transient refresh failure');

  const nearAActive = await resolveBearer(tabA, 'getActiveBearer');
  const nearAEnsure = await resolveBearer(tabA, 'ensureActiveBearer');
  const nearBActive = await resolveBearer(tabB, 'getActiveBearer');
  const nearBEnsure = await resolveBearer(tabB, 'ensureActiveBearer');
  const nearTabA = await authSnapshot(tabA);
  const nearTabB = await authSnapshot(tabB);
  for (const [label, resolved] of [
    ['Tab A getActiveBearer', nearAActive],
    ['Tab A ensureActiveBearer', nearAEnsure],
    ['Tab B getActiveBearer', nearBActive],
    ['Tab B ensureActiveBearer', nearBEnsure],
  ]) {
    assert(resolved.ok && resolved.value?.kind === 'member' && resolved.value?.token === memberAccessToken, `${label} did not retain the still-valid Member bearer`);
  }
  assert(nearTabA.authState === 'member' && nearTabB.authState === 'member', 'Near-expiry transient refresh changed visible Member authority');
  assert(nearTabA.activeBearer === memberAccessToken && nearTabB.activeBearer === memberAccessToken, 'Near-expiry transient refresh changed the active Member bearer');
  assert(nearTabA.pendingGuest === tabAGuestBearer && nearTabB.pendingGuest === tabBGuestBearer, 'Near-expiry transient refresh consumed a staged Guest bearer');
  assert(refreshRequests > nearRefreshBefore, 'Near-expiry cross-tab scenario did not exercise refresh failure');
  assert(guestBootstrapRequests === 0, 'Near-expiry cross-tab scenario bootstrapped a Guest');

  const expiredAt = new Date(Date.now() - 5_000).toISOString();
  const expiredRefreshBefore = refreshRequests;
  await updateSharedExpiry(tabA, expiredAt);
  await navigate(tabA, origin, '/hall.html', '.product-profile');
  await waitFor(tabA, `document.querySelector('.product-profile')?.dataset.authState === 'member'`, 'Tab A rendered Guest after expired transient refresh failure');
  await waitFor(tabB, `document.querySelector('.product-profile')?.dataset.authState === 'member'`, 'Tab B rendered Guest after expired transient refresh failure');

  const expiredAActive = await resolveBearer(tabA, 'getActiveBearer');
  const expiredAEnsure = await resolveBearer(tabA, 'ensureActiveBearer');
  const expiredBActive = await resolveBearer(tabB, 'getActiveBearer');
  const expiredBEnsure = await resolveBearer(tabB, 'ensureActiveBearer');
  const expiredTabA = await authSnapshot(tabA);
  const expiredTabB = await authSnapshot(tabB);
  for (const [label, resolved] of [
    ['Tab A getActiveBearer', expiredAActive],
    ['Tab A ensureActiveBearer', expiredAEnsure],
    ['Tab B getActiveBearer', expiredBActive],
    ['Tab B ensureActiveBearer', expiredBEnsure],
  ]) {
    assert(!resolved.ok && resolved.error?.code === 'AUTH_UPSTREAM_UNAVAILABLE', `${label} did not propagate recoverable AUTH_UPSTREAM_UNAVAILABLE`);
  }
  assert(expiredTabA.authState === 'member' && expiredTabB.authState === 'member', 'Expired transient refresh visibly downgraded a recoverable Member tab');
  assert(expiredTabA.userId === member.id && expiredTabB.userId === member.id, 'Expired transient refresh deleted shared Member identity');
  assert(expiredTabA.accessToken === memberAccessToken && expiredTabB.accessToken === memberAccessToken, 'Expired transient refresh deleted shared Member credentials');
  assert(expiredTabA.activeBearer === memberAccessToken && expiredTabB.activeBearer === memberAccessToken, 'Expired transient refresh replaced a Member bearer with Guest authority');
  assert(expiredTabA.pendingGuest === tabAGuestBearer && expiredTabB.pendingGuest === tabBGuestBearer, 'Expired transient refresh consumed a staged Guest bearer');
  assert(refreshRequests > expiredRefreshBefore, 'Expired cross-tab scenario did not exercise refresh failure');
  assert(guestBootstrapRequests === 0, 'Expired cross-tab scenario bootstrapped a Guest');
  assert(requests.filter((request) => request.path === '/api/auth/refresh').every((request) => request.refreshToken === memberRefreshToken), 'Transient refresh used an unexpected refresh credential');

  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify({
    status: 'MyeongHa_WEB_AUTH_CROSS_TAB_TRANSIENT_REFRESH_BROWSER_PASS',
    initialTabA,
    initialTabB,
    nearExpiry: { tabA: nearTabA, tabB: nearTabB },
    expired: { tabA: expiredTabA, tabB: expiredTabB },
    refreshRequests,
    guestBootstrapRequests,
    requests,
  }, null, 2)}\n`, 'utf8');
  console.log('MyeongHa_WEB_AUTH_CROSS_TAB_TRANSIENT_REFRESH_BROWSER_PASS');
} catch (error) {
  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify({
    status: 'MyeongHa_WEB_AUTH_CROSS_TAB_TRANSIENT_REFRESH_BROWSER_FAIL',
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
  await removeProfile(profile);
}
