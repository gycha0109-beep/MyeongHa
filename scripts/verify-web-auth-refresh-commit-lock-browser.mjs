import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const artifactDir = resolve(process.cwd(), 'artifacts');
const artifactPath = join(artifactDir, 'web-auth-refresh-commit-lock-browser-smoke.json');
const lockName = 'myeongha.memberSession.v1.refresh.lock';
const identity = Object.freeze({
  id: '88888888-8888-4888-8888-888888888888',
  email: 'member-mutation-lock@example.com',
  password: 'browser-password-12345',
});
const member = Object.freeze({ id: identity.id, email: identity.email });
const original = Object.freeze({
  accessToken: 'old.header.signature',
  refreshToken: 'refresh-old',
  expiresAt: '2099-01-01T00:00:00.000Z',
  tokenType: 'bearer',
  user: member,
});
const staleRefresh = Object.freeze({
  accessToken: 'stale.header.signature',
  refreshToken: 'refresh-stale',
  expiresAt: '2099-01-02T00:00:00.000Z',
  tokenType: 'bearer',
  user: member,
});
const newerLogin = Object.freeze({
  accessToken: 'newlogin.header.signature',
  refreshToken: 'refresh-new-login',
  expiresAt: '2099-01-03T00:00:00.000Z',
  tokenType: 'bearer',
  user: member,
});
const stagedGuest = 'member-mutation-lock-staged-guest';
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
]);

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
let refreshRequests = 0;
let signInRequests = 0;
let signOutRequests = 0;
const requests = [];

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
      if (pathname === '/api/auth/refresh' && req.method === 'POST') {
        const body = await readJsonBody(req);
        refreshRequests += 1;
        requests.push({ path: pathname, refreshToken: body.refreshToken ?? null });
        sendJson(res, 200, {
          ok: true,
          data: { status: 'authenticated', session: staleRefresh },
          meta: { requestId: `member-mutation-refresh-${refreshRequests}` },
        });
        return;
      }
      if (pathname === '/api/auth/sign-in' && req.method === 'POST') {
        const body = await readJsonBody(req);
        signInRequests += 1;
        requests.push({ path: pathname, email: body.email ?? null });
        assert(body.email === identity.email && body.password === identity.password, 'unexpected sign-in credentials');
        sendJson(res, 200, {
          ok: true,
          data: { status: 'authenticated', session: newerLogin },
          meta: { requestId: `member-mutation-sign-in-${signInRequests}` },
        });
        return;
      }
      if (pathname === '/api/auth/sign-out' && req.method === 'POST') {
        signOutRequests += 1;
        requests.push({ path: pathname, authorization: req.headers.authorization ?? null });
        sendJson(res, 200, {
          ok: true,
          data: { status: 'signed_out' },
          meta: { requestId: `member-mutation-sign-out-${signOutRequests}` },
        });
        return;
      }
      if (pathname === '/race.html') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end('<!doctype html><html><body>member mutation lock race</body></html>');
        return;
      }
      const relative = normalize(pathname).replace(/^[/\\]+/, '');
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

async function waitUntil(predicate, message, timeout = 8_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(20);
  }
  throw new Error(message);
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
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(profile, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
      return;
    } catch (error) {
      if (!['ENOTEMPTY', 'EBUSY', 'EPERM'].includes(error?.code)) throw error;
      await sleep(100 * (attempt + 1));
    }
  }
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
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

async function waitFor(client, expression, message, timeout = 8_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return;
    await sleep(50);
  }
  throw new Error(message);
}

async function seed(client, session = original) {
  await client.evaluate(`(() => {
    localStorage.setItem('myeongha.memberSession.v1', ${JSON.stringify(JSON.stringify(session))});
    sessionStorage.setItem('myeongha.guestBearer.v1', ${JSON.stringify(session.accessToken)});
    sessionStorage.setItem('myeongha.pendingGuestBearer.v1', ${JSON.stringify(stagedGuest)});
  })()`);
}

async function holdLock(client, label) {
  await client.evaluate(`(() => {
    const state = { held: false, release: null };
    state.gate = new Promise((resolve) => { state.release = resolve; });
    window[${JSON.stringify(`__lock_${label}`)}] = state;
    void navigator.locks.request(${JSON.stringify(lockName)}, { mode: 'exclusive' }, async () => {
      state.held = true;
      await state.gate;
    });
  })()`);
  await waitFor(client, `window[${JSON.stringify(`__lock_${label}`)}]?.held === true`, `${label}: external Member mutation lock was not acquired`);
  return () => client.evaluate(`window[${JSON.stringify(`__lock_${label}`)}].release()`);
}

async function storedState(client) {
  return client.evaluate(`(() => {
    const stored = JSON.parse(localStorage.getItem('myeongha.memberSession.v1') ?? 'null');
    return {
      storedAccessToken: stored?.accessToken ?? null,
      storedRefreshToken: stored?.refreshToken ?? null,
      activeBearer: sessionStorage.getItem('myeongha.guestBearer.v1'),
      pendingGuest: sessionStorage.getItem('myeongha.pendingGuestBearer.v1'),
    };
  })()`);
}

await stat(join(root, 'product-auth.js'));
const productAuthSource = await readFile(join(root, 'product-auth.js'), 'utf8');
assert(productAuthSource.includes('export async function signInWithPassword(email, password) {\n  return withMemberMutationLock(async () => {'), 'sign-in request-start lock contract missing');
assert(productAuthSource.includes('return withMemberMutationLock(() => {\n      const racedExisting = readGuestBearer();'), 'Guest bootstrap commit lock contract missing');

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-auth-member-mutation-lock-browser-'));
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
  await client.send('Page.navigate', { url: `${origin}/race.html` });
  await waitFor(client, `location.pathname === '/race.html' && document.readyState === 'complete'`, 'race page did not load');
  const supportsLocks = await client.evaluate(`Boolean(navigator.locks && typeof navigator.locks.request === 'function')`);
  assert(supportsLocks, 'Chrome Web Locks API unavailable');

  await seed(client);
  const releaseDirect = await holdLock(client, 'direct');
  await client.evaluate(`(() => {
    window.__directRefresh = { done: false, value: null, error: null };
    void import('/product-auth.js').then((auth) => auth.refreshMemberSession()).then(
      (value) => { window.__directRefresh = { done: true, value, error: null }; },
      (error) => { window.__directRefresh = { done: true, value: null, error: { code: error?.code ?? null, message: error?.message ?? null } }; },
    );
  })()`);
  await waitUntil(() => refreshRequests >= 1, 'direct refresh request did not start');
  await sleep(100);
  let state = await client.evaluate(`(() => ({
    done: window.__directRefresh?.done === true,
    accessToken: JSON.parse(localStorage.getItem('myeongha.memberSession.v1') ?? 'null')?.accessToken ?? null,
  }))()`);
  assert(state.done === false, 'successful refresh committed while the Member mutation lock was externally held');
  assert(state.accessToken === original.accessToken, 'Member authority changed before direct-race lock release');
  await client.evaluate(`(() => {
    localStorage.setItem('myeongha.memberSession.v1', ${JSON.stringify(JSON.stringify(newerLogin))});
    sessionStorage.setItem('myeongha.guestBearer.v1', ${JSON.stringify(newerLogin.accessToken)});
    sessionStorage.setItem('myeongha.pendingGuestBearer.v1', ${JSON.stringify(stagedGuest)});
  })()`);
  await releaseDirect();
  await waitFor(client, `window.__directRefresh?.done === true`, 'direct replacement refresh did not settle');
  const directState = await storedState(client);
  const directResult = await client.evaluate(`window.__directRefresh`);
  assert(directResult.error === null && directResult.value?.accessToken === newerLogin.accessToken, 'stale refresh did not converge to direct newer Member replacement');
  assert(directState.storedAccessToken === newerLogin.accessToken, 'stale refresh overwrote direct newer Member replacement');
  console.log('MyeongHa_WEB_AUTH_REFRESH_COMMIT_LOCK_BROWSER_PASS blocked=true preserved_newer=true refresh_requests=1');

  await seed(client);
  const releaseSignIn = await holdLock(client, 'signin');
  await client.evaluate(`(() => {
    window.__signInRace = { done: false, value: null, error: null };
    void import('/product-auth.js').then((auth) => auth.signInWithPassword(
      ${JSON.stringify(identity.email)},
      ${JSON.stringify(identity.password)},
    )).then(
      (value) => { window.__signInRace = { done: true, value, error: null }; },
      (error) => { window.__signInRace = { done: true, value: null, error: { code: error?.code ?? null, message: error?.message ?? null } }; },
    );
  })()`);
  await client.evaluate(`(() => {
    window.__signInRefresh = { done: false, value: null, error: null };
    void import('/product-auth.js').then((auth) => auth.refreshMemberSession()).then(
      (value) => { window.__signInRefresh = { done: true, value, error: null }; },
      (error) => { window.__signInRefresh = { done: true, value: null, error: { code: error?.code ?? null, message: error?.message ?? null } }; },
    );
  })()`);
  await waitUntil(() => refreshRequests >= 2, 'refresh did not start while sign-in was queued');
  await sleep(100);
  state = await client.evaluate(`(() => ({
    signInDone: window.__signInRace?.done === true,
    refreshDone: window.__signInRefresh?.done === true,
    accessToken: JSON.parse(localStorage.getItem('myeongha.memberSession.v1') ?? 'null')?.accessToken ?? null,
  }))()`);
  assert(signInRequests === 0, 'sign-in remote request escaped the shared Member mutation lock');
  assert(state.signInDone === false && state.refreshDone === false, 'sign-in/refresh race settled before lock release');
  assert(state.accessToken === original.accessToken, 'sign-in/refresh changed Member authority while the shared lock was held');
  await releaseSignIn();
  await waitFor(client, `window.__signInRace?.done === true && window.__signInRefresh?.done === true`, 'sign-in/refresh race did not settle after lock release');
  const signInState = await storedState(client);
  const signInRace = await client.evaluate(`({ signIn: window.__signInRace, refresh: window.__signInRefresh })`);
  assert(signInRequests === 1, `expected one serialized sign-in request, received ${signInRequests}`);
  assert(signInRace.signIn.error === null && signInRace.signIn.value?.accessToken === newerLogin.accessToken, 'serialized sign-in failed');
  assert(signInRace.refresh.error === null && signInRace.refresh.value?.accessToken === newerLogin.accessToken, 'stale refresh did not converge after serialized sign-in');
  assert(signInState.storedAccessToken === newerLogin.accessToken && signInState.storedRefreshToken === newerLogin.refreshToken, 'stale refresh overwrote the newer sign-in generation');
  assert(signInState.activeBearer === newerLogin.accessToken && signInState.pendingGuest === stagedGuest, 'serialized sign-in compatibility authority mismatch');
  console.log('Member mutation lock sign-in request-start precedence: PASS');

  await seed(client);
  const releaseSignOut = await holdLock(client, 'signout');
  await client.evaluate(`(() => {
    window.__signOutRace = { done: false, error: null };
    void import('/product-auth.js').then((auth) => auth.signOutMember()).then(
      () => { window.__signOutRace = { done: true, error: null }; },
      (error) => { window.__signOutRace = { done: true, error: { code: error?.code ?? null, message: error?.message ?? null } }; },
    );
    window.__signOutRefresh = { done: false, value: null, error: null };
    void import('/product-auth.js').then((auth) => auth.refreshMemberSession()).then(
      (value) => { window.__signOutRefresh = { done: true, value, error: null }; },
      (error) => { window.__signOutRefresh = { done: true, value: null, error: { code: error?.code ?? null, message: error?.message ?? null } }; },
    );
  })()`);
  await waitUntil(() => refreshRequests >= 3, 'refresh did not start while sign-out was queued');
  await sleep(100);
  state = await client.evaluate(`(() => ({
    signOutDone: window.__signOutRace?.done === true,
    refreshDone: window.__signOutRefresh?.done === true,
    accessToken: JSON.parse(localStorage.getItem('myeongha.memberSession.v1') ?? 'null')?.accessToken ?? null,
  }))()`);
  assert(signOutRequests === 0, 'sign-out remote request escaped the shared Member mutation lock');
  assert(state.signOutDone === false && state.refreshDone === false, 'sign-out/refresh race settled before lock release');
  assert(state.accessToken === original.accessToken, 'sign-out/refresh changed Member authority while the shared lock was held');
  await releaseSignOut();
  await waitFor(client, `window.__signOutRace?.done === true && window.__signOutRefresh?.done === true`, 'sign-out/refresh race did not settle after lock release');
  const signOutState = await storedState(client);
  const signOutRace = await client.evaluate(`({ signOut: window.__signOutRace, refresh: window.__signOutRefresh })`);
  assert(signOutRace.signOut.error === null, `serialized sign-out failed: ${JSON.stringify(signOutRace.signOut.error)}`);
  assert(signOutRace.refresh.error === null && signOutRace.refresh.value === null, 'stale refresh did not converge to signed-out authority');
  assert(signOutState.storedAccessToken === null && signOutState.storedRefreshToken === null, 'stale refresh resurrected Member authority after sign-out');
  assert(signOutState.activeBearer === stagedGuest && signOutState.pendingGuest === null, 'sign-out did not restore staged Guest authority');
  assert(signOutRequests === 1, `expected one serialized sign-out request, received ${signOutRequests}`);
  assert(requests.find((request) => request.path === '/api/auth/sign-out')?.authorization === `Bearer ${original.accessToken}`, 'sign-out did not use the locked canonical Member bearer');
  console.log('Member mutation lock sign-out request-start precedence: PASS');

  const report = {
    status: 'MyeongHa_WEB_AUTH_MEMBER_MUTATION_LOCK_BROWSER_PASS',
    compatibilityStatus: 'MyeongHa_WEB_AUTH_REFRESH_COMMIT_LOCK_BROWSER_PASS',
    lockName,
    legacyNamespaceRetained: true,
    directReplacementPreserved: true,
    signInRequestStartSerialized: true,
    signOutRequestStartSerialized: true,
    signOutNoResurrection: true,
    refreshRequests,
    signInRequests,
    signOutRequests,
    requests,
    directState,
    signInState,
    signOutState,
  };
  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`MyeongHa_WEB_AUTH_MEMBER_MUTATION_LOCK_BROWSER_PASS signin_request_start=true signout_request_start=true signout_no_resurrection=true direct_replacement=true refresh_requests=${refreshRequests}`);
} catch (error) {
  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify({
    status: 'MyeongHa_WEB_AUTH_MEMBER_MUTATION_LOCK_BROWSER_FAIL',
    error: error instanceof Error ? error.message : String(error),
    refreshRequests,
    signInRequests,
    signOutRequests,
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
