import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const artifactDir = resolve(process.cwd(), 'artifacts');
const artifactPath = join(artifactDir, 'web-auth-refresh-malformed-browser-smoke.json');
const member = Object.freeze({
  id: '99999999-9999-4999-8999-999999999999',
  email: 'malformed-refresh-member@example.com',
});
const stagedGuest = 'malformed-refresh-staged-guest';
const rotatedToken = 'healthy.rotated.signature';
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
let mode = 'malformed-json';
let requestNo = 0;
let refreshRequests = 0;
let guestBootstrapRequests = 0;
const requests = [];

function successEnvelope(data) {
  requestNo += 1;
  return {
    ok: true,
    data,
    meta: {
      apiContractVersion: 'browser-auth-refresh-malformed-v1',
      requestId: `web-auth-refresh-malformed-${requestNo}`,
      serverTime: '2026-09-07T00:00:00.000Z',
    },
  };
}

function errorEnvelope(code, messageKey) {
  requestNo += 1;
  return {
    ok: false,
    error: { code, messageKey, retryable: false },
    meta: {
      apiContractVersion: 'browser-auth-refresh-malformed-v1',
      requestId: `web-auth-refresh-malformed-${requestNo}`,
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

function healthySession() {
  return {
    accessToken: rotatedToken,
    refreshToken: 'healthy-rotated-refresh-token',
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    tokenType: 'bearer',
    user: { id: member.id, email: member.email },
  };
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
        requests.push({ path: pathname, method: req.method, authorization, refreshToken: body.refreshToken ?? null, mode });

        if (mode === 'malformed-json') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end('{"ok":true,"data":');
          return;
        }
        if (mode === 'malformed-session') {
          sendJson(res, 200, successEnvelope({
            status: 'authenticated',
            session: {
              accessToken: '',
              refreshToken: 'invalid-refresh-token',
              expiresAt: 'not-a-date',
              tokenType: 'bearer',
              user: { id: member.id, email: member.email },
            },
          }));
          return;
        }
        if (mode === 'success') {
          sendJson(res, 200, successEnvelope({ status: 'authenticated', session: healthySession() }));
          return;
        }
        throw new Error(`unexpected refresh mode: ${mode}`);
      }

      if (pathname === '/api/session/bootstrap' && req.method === 'POST') {
        guestBootstrapRequests += 1;
        requests.push({ path: pathname, method: req.method, authorization, mode });
        sendJson(res, 200, successEnvelope({
          kind: 'guest',
          guestSession: { bearerToken: 'unexpected-malformed-refresh-bootstrap' },
        }));
        return;
      }

      if (pathname.startsWith('/api/')) {
        requests.push({ path: pathname, method: req.method, authorization, mode });
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

function isExpectedNavigationContextRace(error) {
  return error instanceof Error
    && /Inspected target navigated or closed|Execution context was destroyed/u.test(error.message);
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
      if (!isExpectedNavigationContextRace(error)) throw error;
    }
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${cleanPath} ${selector}`);
}

async function seedMember(client, { token, refreshToken, expiresAt }) {
  await client.evaluate(`(() => {
    const session = {
      accessToken: ${JSON.stringify(token)},
      refreshToken: ${JSON.stringify(refreshToken)},
      expiresAt: ${JSON.stringify(expiresAt)},
      tokenType: 'bearer',
      user: { id: ${JSON.stringify(member.id)}, email: ${JSON.stringify(member.email)} },
    };
    localStorage.setItem('myeongha.memberSession.v1', JSON.stringify(session));
    sessionStorage.setItem('myeongha.guestBearer.v1', session.accessToken);
    sessionStorage.setItem('myeongha.pendingGuestBearer.v1', ${JSON.stringify(stagedGuest)});
  })()`);
}

async function authSnapshot(client) {
  return client.evaluate(`(() => {
    const session = JSON.parse(localStorage.getItem('myeongha.memberSession.v1') ?? 'null');
    return {
      authState: document.querySelector('.product-profile')?.dataset.authState ?? null,
      authLabel: document.querySelector('.product-profile')?.getAttribute('aria-label') ?? null,
      accessToken: session?.accessToken ?? null,
      refreshToken: session?.refreshToken ?? null,
      userId: session?.user?.id ?? null,
      email: session?.user?.email ?? null,
      activeBearer: sessionStorage.getItem('myeongha.guestBearer.v1'),
      pendingGuest: sessionStorage.getItem('myeongha.pendingGuestBearer.v1'),
    };
  })()`);
}

async function waitForHealthyRefreshRecovery(client, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  let lastState = null;
  while (Date.now() < deadline) {
    try {
      lastState = await authSnapshot(client);
      if (
        lastState?.accessToken === rotatedToken
        && lastState.activeBearer === rotatedToken
        && lastState.userId === member.id
        && lastState.email === member.email
        && lastState.pendingGuest === stagedGuest
      ) {
        return lastState;
      }
    } catch (error) {
      if (!isExpectedNavigationContextRace(error)) throw error;
    }
    await sleep(50);
  }
  throw new Error(`Timed out waiting for healthy malformed-refresh recovery convergence: ${JSON.stringify(lastState)}`);
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

async function assertMalformedScenario(client, origin, { scenarioMode, token, refreshToken, expiresAt, expectedCode, stillValid }) {
  mode = scenarioMode;
  await seedMember(client, { token, refreshToken, expiresAt });
  const refreshBefore = refreshRequests;
  await navigate(client, origin, '/hall.html', '.product-profile');

  const active = await resolveBearer(client, 'getActiveBearer');
  const ensured = await resolveBearer(client, 'ensureActiveBearer');
  const state = await authSnapshot(client);

  if (stillValid) {
    assert(active.ok && active.value?.kind === 'member' && active.value?.token === token, `${scenarioMode} near-expiry refresh did not continue the valid Member bearer`);
    assert(ensured.ok && ensured.value?.kind === 'member' && ensured.value?.token === token, `${scenarioMode} near-expiry ensureActiveBearer downgraded Member authority`);
  } else {
    assert(!active.ok && active.error?.code === expectedCode, `${scenarioMode} expired getActiveBearer did not propagate ${expectedCode}`);
    assert(!ensured.ok && ensured.error?.code === expectedCode, `${scenarioMode} expired ensureActiveBearer did not propagate ${expectedCode}`);
  }

  assert(state.authState === 'member' && state.authLabel === '마이 페이지', `${scenarioMode} refresh rendered Guest UI`);
  assert(state.userId === member.id && state.email === member.email, `${scenarioMode} refresh changed Member identity metadata`);
  assert(state.accessToken === token && state.refreshToken === refreshToken, `${scenarioMode} refresh changed recoverable Member credentials`);
  assert(state.activeBearer === token, `${scenarioMode} refresh substituted active Member bearer`);
  assert(state.pendingGuest === stagedGuest, `${scenarioMode} refresh consumed staged Guest authority`);
  assert(refreshRequests > refreshBefore, `${scenarioMode} scenario did not attempt refresh`);
  assert(guestBootstrapRequests === 0, `${scenarioMode} refresh bootstrapped Guest authority`);
  return state;
}

for (const file of ['hall.html', 'product-auth.js', 'product-auth-ui.js']) await stat(join(root, file));

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-auth-refresh-malformed-browser-'));
const chrome = spawn(chromeBin, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
let chromeError = '';
chrome.stderr.setEncoding('utf8');
chrome.stderr.on('data', (chunk) => { chromeError += chunk; });
let client;

try {
  client = await connectCdp(await devtoolsPort(profile, chrome));
  await navigate(client, origin, '/hall.html', '.product-profile');

  const malformedJsonNear = await assertMalformedScenario(client, origin, {
    scenarioMode: 'malformed-json', token: 'json.near.signature', refreshToken: 'refresh-json-near',
    expiresAt: new Date(Date.now() + 30_000).toISOString(), expectedCode: 'WEB_AUTH_MALFORMED_RESPONSE', stillValid: true,
  });
  const malformedJsonExpired = await assertMalformedScenario(client, origin, {
    scenarioMode: 'malformed-json', token: 'json.expired.signature', refreshToken: 'refresh-json-expired',
    expiresAt: new Date(Date.now() - 5_000).toISOString(), expectedCode: 'WEB_AUTH_MALFORMED_RESPONSE', stillValid: false,
  });
  const malformedSessionNear = await assertMalformedScenario(client, origin, {
    scenarioMode: 'malformed-session', token: 'session.near.signature', refreshToken: 'refresh-session-near',
    expiresAt: new Date(Date.now() + 30_000).toISOString(), expectedCode: 'WEB_AUTH_MALFORMED_SESSION', stillValid: true,
  });
  const malformedSessionExpired = await assertMalformedScenario(client, origin, {
    scenarioMode: 'malformed-session', token: 'session.expired.signature', refreshToken: 'refresh-session-expired',
    expiresAt: new Date(Date.now() - 5_000).toISOString(), expectedCode: 'WEB_AUTH_MALFORMED_SESSION', stillValid: false,
  });

  mode = 'success';
  const recoveryRefreshBefore = refreshRequests;
  await navigate(client, origin, '/hall.html', '.product-profile');
  const recovered = await waitForHealthyRefreshRecovery(client);
  const recoveredBearer = await resolveBearer(client, 'getActiveBearer');
  assert(refreshRequests > recoveryRefreshBefore, 'Healthy recovery did not attempt refresh after malformed failures');
  assert(recovered.accessToken === rotatedToken && recovered.activeBearer === rotatedToken, 'Healthy refresh did not rotate Member credentials after malformed failures');
  assert(recovered.userId === member.id && recovered.email === member.email, 'Healthy refresh changed Member identity after malformed failures');
  assert(recovered.pendingGuest === stagedGuest, 'Healthy refresh consumed staged Guest after malformed failures');
  assert(recoveredBearer.ok && recoveredBearer.value?.kind === 'member' && recoveredBearer.value?.token === rotatedToken, 'Healthy refresh did not restore active Member authority');
  assert(guestBootstrapRequests === 0, 'Malformed refresh scenarios triggered Guest bootstrap');

  const report = { status: 'MyeongHa_WEB_AUTH_REFRESH_MALFORMED_BROWSER_PASS', malformedJsonNear, malformedJsonExpired, malformedSessionNear, malformedSessionExpired, recovered, refreshRequests, guestBootstrapRequests, requests };
  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log('MyeongHa_WEB_AUTH_REFRESH_MALFORMED_BROWSER_PASS');
} catch (error) {
  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify({ status: 'MyeongHa_WEB_AUTH_REFRESH_MALFORMED_BROWSER_FAIL', error: error instanceof Error ? error.message : String(error), mode, refreshRequests, guestBootstrapRequests, requests, chromeError }, null, 2)}\n`, 'utf8');
  throw error;
} finally {
  client?.close();
  await stopChrome(chrome);
  server.close();
  await removeProfile(profile);
}
