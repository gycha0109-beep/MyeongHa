import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const artifactDir = resolve(process.cwd(), 'artifacts');
const artifactPath = join(artifactDir, 'web-auth-member-compat-discard-failure-browser-smoke.json');
const memberSessionKey = 'myeongha.memberSession.v1';
const guestTokenKey = 'myeongha.guestBearer.v1';
const pendingGuestTokenKey = 'myeongha.pendingGuestBearer.v1';
const authChangedEvent = 'myeongha:auth-changed';
const memberAccessToken = 'discardbrowser.member.signature';
const memberRefreshToken = 'discard-browser-refresh';
const tabAGuestBearer = 'discard-browser-tab-a-guest';
const tabBGuestBearer = 'discard-browser-tab-b-guest';
const identity = Object.freeze({
  id: '88888888-8888-4888-8888-888888888888',
  email: 'member-discard@example.com',
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
      apiContractVersion: 'browser-auth-member-compat-discard-v1',
      requestId: `web-auth-member-compat-discard-${apiRequestCount}`,
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
      apiContractVersion: 'browser-auth-member-compat-discard-v1',
      requestId: `web-auth-member-compat-discard-${apiRequestCount}`,
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
    console.log('MyeongHa Member compatibility discard browser assertions passed; ignoring ephemeral Chrome profile cleanup ENOTEMPTY race.');
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

function isExpectedNavigationRace(error) {
  return error instanceof Error && error.message === 'Runtime.evaluate: Inspected target navigated or closed';
}

async function navigate(client, origin, pathname, selector, timeout = 10_000) {
  const result = await client.send('Page.navigate', { url: `${origin}${pathname}` });
  assert(!result.errorText, `Navigation failed for ${pathname}: ${result.errorText}`);
  const cleanPath = pathname.split('?')[0];
  const selectorLiteral = JSON.stringify(selector);
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const state = await client.evaluate(`(() => ({
        pathname: location.pathname,
        readyState: document.readyState,
        found: Boolean(document.querySelector(${selectorLiteral})),
      }))()`);
      if (state?.pathname === cleanPath && state.readyState === 'complete' && state.found) return;
    } catch (error) {
      if (!isExpectedNavigationRace(error)) throw error;
    }
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${cleanPath} ${selector}`);
}

async function waitFor(client, expression, message, timeout = 8_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      if (await client.evaluate(expression)) return;
    } catch (error) {
      if (!isExpectedNavigationRace(error)) throw error;
    }
    await sleep(50);
  }
  throw new Error(message);
}

async function snapshot(client) {
  return client.evaluate(`(async () => {
    const auth = await import('/product-auth.js');
    const member = JSON.parse(localStorage.getItem(${JSON.stringify(memberSessionKey)}) ?? 'null');
    return {
      pathname: location.pathname,
      authState: document.querySelector('.product-profile')?.dataset.authState ?? null,
      memberAccessToken: member?.accessToken ?? null,
      activeBearer: sessionStorage.getItem(${JSON.stringify(guestTokenKey)}),
      pendingGuest: sessionStorage.getItem(${JSON.stringify(pendingGuestTokenKey)}),
      guestBearer: auth.readGuestBearer(),
      resolvedBearer: await auth.getActiveBearer(),
      authEvents: globalThis.__myeonghaDiscardEvents ?? 0,
    };
  })()`);
}

for (const file of ['hall.html', 'product-auth.js', 'product-auth-ui.js']) {
  await stat(join(root, file));
}

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-auth-member-compat-discard-browser-'));
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
    localStorage.removeItem(${JSON.stringify(memberSessionKey)});
    sessionStorage.setItem(${JSON.stringify(guestTokenKey)}, ${JSON.stringify(tabBGuestBearer)});
    sessionStorage.removeItem(${JSON.stringify(pendingGuestTokenKey)});
    globalThis.__myeonghaDiscardEvents = 0;
    addEventListener(${JSON.stringify(authChangedEvent)}, () => { globalThis.__myeonghaDiscardEvents += 1; });
  })()`);
  await navigate(tabB, origin, '/hall.html', '.product-profile');

  tabA = await connectCdp(port);
  await navigate(tabA, origin, '/hall.html', '.product-profile');
  await tabA.evaluate(`(() => {
    sessionStorage.setItem(${JSON.stringify(guestTokenKey)}, ${JSON.stringify(tabAGuestBearer)});
    sessionStorage.removeItem(${JSON.stringify(pendingGuestTokenKey)});
    globalThis.__myeonghaDiscardEvents = 0;
    addEventListener(${JSON.stringify(authChangedEvent)}, () => { globalThis.__myeonghaDiscardEvents += 1; });
  })()`);

  const signedIn = await tabA.evaluate(`(async () => {
    const auth = await import('/product-auth.js');
    return (await auth.signInWithPassword(${JSON.stringify(identity.email)}, ${JSON.stringify(identity.password)})).accessToken;
  })()`);
  assert(signedIn === memberAccessToken, 'Tab A did not establish the expected Member generation');

  await waitFor(
    tabA,
    `document.readyState === 'complete'
      && localStorage.getItem(${JSON.stringify(memberSessionKey)}) !== null
      && sessionStorage.getItem(${JSON.stringify(guestTokenKey)}) === ${JSON.stringify(memberAccessToken)}
      && sessionStorage.getItem(${JSON.stringify(pendingGuestTokenKey)}) === ${JSON.stringify(tabAGuestBearer)}`,
    'Tab A did not establish Member compatibility state',
  );
  await waitFor(
    tabB,
    `document.readyState === 'complete'
      && document.querySelector('.product-profile')?.dataset.authState === 'member'
      && sessionStorage.getItem(${JSON.stringify(guestTokenKey)}) === ${JSON.stringify(memberAccessToken)}
      && sessionStorage.getItem(${JSON.stringify(pendingGuestTokenKey)}) === ${JSON.stringify(tabBGuestBearer)}`,
    'Tab B did not converge to Member with its own pending Guest lineage',
  );

  await tabA.evaluate(`(() => {
    globalThis.__myeonghaNativeSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (this === sessionStorage && key === ${JSON.stringify(guestTokenKey)} && String(value) === ${JSON.stringify(tabAGuestBearer)}) {
        throw new Error('forced Tab A Guest restoration write failure');
      }
      return globalThis.__myeonghaNativeSetItem.call(this, key, value);
    };
  })()`);

  const localFailure = await tabA.evaluate(`(async () => {
    const auth = await import('/product-auth.js');
    try {
      await auth.signOutMember();
      return null;
    } catch (error) {
      return { name: error?.name ?? null, code: error?.code ?? null };
    }
  })()`);
  assert(localFailure?.name === 'ProductAuthError' && localFailure?.code === 'WEB_AUTH_MEMBER_CLEAR_FAILED', 'Local compatibility failure did not fail closed');

  await waitFor(
    tabB,
    `document.querySelector('.product-profile')?.dataset.authState === 'member'
      && localStorage.getItem(${JSON.stringify(memberSessionKey)}) !== null
      && sessionStorage.getItem(${JSON.stringify(guestTokenKey)}) === ${JSON.stringify(memberAccessToken)}
      && sessionStorage.getItem(${JSON.stringify(pendingGuestTokenKey)}) === ${JSON.stringify(tabBGuestBearer)}`,
    'Tab B did not reconverge to the rolled-back Member authority',
  );
  const localFailureTabA = await snapshot(tabA);
  const localFailureTabB = await snapshot(tabB);
  assert(localFailureTabA.memberAccessToken === memberAccessToken, 'Tab A failed discard did not restore Member authority');
  assert(localFailureTabA.activeBearer === memberAccessToken && localFailureTabA.pendingGuest === tabAGuestBearer, 'Tab A failed discard did not restore compatibility snapshot');
  assert(localFailureTabA.authEvents === 1, 'Tab A emitted an extra auth event for the failed local discard');
  assert(localFailureTabB.memberAccessToken === memberAccessToken, 'Tab B lost rolled-back shared Member authority');

  await tabA.evaluate(`(() => {
    Storage.prototype.setItem = globalThis.__myeonghaNativeSetItem;
  })()`);
  await tabB.evaluate(`(() => {
    globalThis.__myeonghaNativeSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (this === sessionStorage && key === ${JSON.stringify(guestTokenKey)} && String(value) === ${JSON.stringify(tabBGuestBearer)}) {
        throw new Error('forced Tab B cross-tab Guest restoration write failure');
      }
      return globalThis.__myeonghaNativeSetItem.call(this, key, value);
    };
  })()`);

  const healthyTabASignOut = await tabA.evaluate(`(async () => {
    const auth = await import('/product-auth.js');
    await auth.signOutMember();
    return {
      member: auth.readMemberSession(),
      guest: auth.readGuestBearer(),
    };
  })()`);
  assert(healthyTabASignOut.member === null && healthyTabASignOut.guest === tabAGuestBearer, 'Tab A healthy sign-out did not restore its Guest lineage');

  await waitFor(
    tabB,
    `document.querySelector('.product-profile')?.dataset.authState === 'guest'
      && localStorage.getItem(${JSON.stringify(memberSessionKey)}) === null
      && sessionStorage.getItem(${JSON.stringify(guestTokenKey)}) === ${JSON.stringify(memberAccessToken)}
      && sessionStorage.getItem(${JSON.stringify(pendingGuestTokenKey)}) === ${JSON.stringify(tabBGuestBearer)}`,
    'Tab B cross-tab failure did not preserve no-Member authority plus compatibility snapshot',
  );
  const crossTabFailure = await snapshot(tabB);
  assert(crossTabFailure.memberAccessToken === null, 'Tab B resurrected Member authority after cross-tab removal');
  assert(crossTabFailure.authState === 'guest', 'Tab B UI did not converge to Guest after cross-tab removal won');
  assert(crossTabFailure.guestBearer === tabBGuestBearer, 'Tab B did not retain its pending Guest as fallback authority');
  assert(crossTabFailure.resolvedBearer?.kind === 'guest' && crossTabFailure.resolvedBearer?.token === tabBGuestBearer, 'Tab B active bearer did not resolve to pending Guest after cross-tab compatibility failure');

  await tabB.evaluate(`(() => {
    Storage.prototype.setItem = globalThis.__myeonghaNativeSetItem;
  })()`);
  const healed = await tabB.evaluate(`(async () => {
    const auth = await import('/product-auth.js');
    return auth.invalidateMemberSession();
  })()`);
  assert(healed === true, 'Tab B compatibility state did not heal after storage recovered');
  const recoveredTabB = await snapshot(tabB);
  assert(recoveredTabB.memberAccessToken === null, 'Tab B recovery recreated Member authority');
  assert(recoveredTabB.activeBearer === tabBGuestBearer && recoveredTabB.pendingGuest === null, 'Tab B recovery did not canonicalize its Guest bearer');

  const signIns = requests.filter((request) => request.path === '/api/auth/sign-in');
  const signOuts = requests.filter((request) => request.path === '/api/auth/sign-out');
  const bootstraps = requests.filter((request) => request.path === '/api/session/bootstrap');
  assert(signIns.length === 1, `Expected one sign-in request, received ${signIns.length}`);
  assert(signOuts.length === 2, `Expected two sign-out requests, received ${signOuts.length}`);
  assert(signOuts.every((request) => request.authorization === `Bearer ${memberAccessToken}`), 'Sign-out request did not use the Member bearer');
  assert(bootstraps.length === 0, `Discard failure flow unexpectedly bootstrapped ${bootstraps.length} Guest session(s)`);

  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify({
    status: 'MyeongHa_WEB_AUTH_MEMBER_COMPAT_DISCARD_FAILURE_BROWSER_PASS',
    localFailure,
    localFailureTabA,
    localFailureTabB,
    crossTabFailure,
    recoveredTabB,
    signInRequests: signIns.length,
    signOutRequests: signOuts.length,
    guestBootstrapRequests: bootstraps.length,
    requests,
  }, null, 2)}\n`, 'utf8');
  functionalPass = true;
  console.log('MyeongHa_WEB_AUTH_MEMBER_COMPAT_DISCARD_FAILURE_BROWSER_PASS');
} catch (error) {
  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify({
    status: 'MyeongHa_WEB_AUTH_MEMBER_COMPAT_DISCARD_FAILURE_BROWSER_FAIL',
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
  await removeChromeProfile(profile);
}