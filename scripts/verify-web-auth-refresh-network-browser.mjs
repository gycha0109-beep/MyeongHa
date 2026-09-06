import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const artifactDir = resolve(process.cwd(), 'artifacts');
const artifactPath = join(artifactDir, 'web-auth-refresh-network-browser-smoke.json');
const member = Object.freeze({
  id: '88888888-8888-4888-8888-888888888888',
  email: 'refresh-network-member@example.com',
});
const accessToken = 'network.header.signature';
const rotatedToken = 'networkrotated.header.signature';
const refreshToken = 'network-refresh-token';
const rotatedRefreshToken = 'network-refresh-token-rotated';
const stagedGuest = 'refresh-network-staged-guest';
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
let requestNo = 0;
let refreshRequests = 0;
let guestBootstrapRequests = 0;
let refreshMode = 'network';

function successEnvelope(data) {
  requestNo += 1;
  return {
    ok: true,
    data,
    meta: {
      apiContractVersion: 'browser-auth-refresh-network-v1',
      requestId: `web-auth-refresh-network-${requestNo}`,
      serverTime: '2026-09-07T00:00:00.000Z',
    },
  };
}

function errorEnvelope(code, messageKey, retryable = false) {
  requestNo += 1;
  return {
    ok: false,
    error: { code, messageKey, retryable },
    meta: {
      apiContractVersion: 'browser-auth-refresh-network-v1',
      requestId: `web-auth-refresh-network-${requestNo}`,
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

function rotatedSession() {
  return {
    accessToken: rotatedToken,
    refreshToken: rotatedRefreshToken,
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
        requests.push({
          path: pathname,
          method: req.method,
          authorization,
          refreshToken: body.refreshToken ?? null,
          mode: refreshMode,
        });
        if (refreshMode === 'network') {
          req.socket.destroy();
          return;
        }
        sendJson(res, 200, successEnvelope({ status: 'authenticated', session: rotatedSession() }));
        return;
      }

      if (pathname === '/api/session/bootstrap' && req.method === 'POST') {
        guestBootstrapRequests += 1;
        requests.push({ path: pathname, method: req.method, authorization });
        sendJson(res, 200, successEnvelope({
          kind: 'guest',
          guestSession: { bearerToken: 'unexpected-refresh-network-bootstrap' },
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
      if (!res.headersSent && !res.destroyed) {
        res.statusCode = 500;
        res.end(error instanceof Error ? error.message : 'Server error');
      }
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

async function seedMember(client, expiresAt) {
  await client.evaluate(`(() => {
    const session = {
      accessToken: ${JSON.stringify(accessToken)},
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

async function resolveBearer(client, fn) {
  return client.evaluate(`(async () => {
    const auth = await import('/product-auth.js');
    try {
      return { ok: true, value: await auth[${JSON.stringify(fn)}]() };
    } catch (error) {
      return {
        ok: false,
        error: {
          name: error?.name ?? null,
          code: error?.code ?? null,
          message: error?.message ?? null,
        },
      };
    }
  })()`);
}

for (const file of ['hall.html', 'product-auth.js', 'product-auth-ui.js']) await stat(join(root, file));

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-auth-refresh-network-browser-'));
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
  await navigate(client, origin, '/hall.html', '.product-profile');

  refreshMode = 'network';
  await seedMember(client, new Date(Date.now() + 30_000).toISOString());
  const nearBefore = refreshRequests;
  await navigate(client, origin, '/hall.html', '.product-profile');
  await waitFor(
    client,
    `document.querySelector('.product-profile')?.dataset.authState === 'member' && localStorage.getItem('myeongha.memberSession.v1') !== null`,
    'Near-expiry network refresh failure downgraded Member UI',
  );
  const nearActive = await resolveBearer(client, 'getActiveBearer');
  const nearEnsure = await resolveBearer(client, 'ensureActiveBearer');
  const nearState = await authSnapshot(client);
  assert(nearActive.ok && nearActive.value?.kind === 'member' && nearActive.value?.token === accessToken, 'Near-expiry network failure did not retain the still-valid Member bearer');
  assert(nearEnsure.ok && nearEnsure.value?.kind === 'member' && nearEnsure.value?.token === accessToken, 'Near-expiry network failure caused Guest fallback from ensureActiveBearer');
  assert(nearState.authState === 'member' && nearState.authLabel === '마이 페이지', 'Near-expiry network failure rendered Guest UI');
  assert(nearState.accessToken === accessToken && nearState.activeBearer === accessToken, 'Near-expiry network failure changed Member credentials');
  assert(nearState.pendingGuest === stagedGuest, 'Near-expiry network failure consumed staged Guest authority');
  assert(refreshRequests > nearBefore, 'Near-expiry network scenario did not exercise refresh transport failure');
  assert(guestBootstrapRequests === 0, 'Near-expiry network failure bootstrapped a Guest');

  await seedMember(client, new Date(Date.now() - 5_000).toISOString());
  const expiredBefore = refreshRequests;
  await navigate(client, origin, '/hall.html', '.product-profile');
  await waitFor(
    client,
    `document.querySelector('.product-profile')?.dataset.authState === 'member' && localStorage.getItem('myeongha.memberSession.v1') !== null`,
    'Expired network refresh failure deleted or downgraded recoverable Member UI',
  );
  const expiredActive = await resolveBearer(client, 'getActiveBearer');
  const expiredEnsure = await resolveBearer(client, 'ensureActiveBearer');
  const expiredState = await authSnapshot(client);
  assert(!expiredActive.ok && expiredActive.error?.code === 'WEB_AUTH_NETWORK_FAILED', 'Expired network failure did not propagate WEB_AUTH_NETWORK_FAILED from getActiveBearer');
  assert(!expiredEnsure.ok && expiredEnsure.error?.code === 'WEB_AUTH_NETWORK_FAILED', 'Expired network failure allowed Guest fallback from ensureActiveBearer');
  assert(expiredState.authState === 'member' && expiredState.authLabel === '마이 페이지', 'Expired network failure rendered Guest UI');
  assert(expiredState.userId === member.id && expiredState.email === member.email, 'Expired network failure deleted Member identity');
  assert(expiredState.accessToken === accessToken && expiredState.refreshToken === refreshToken, 'Expired network failure deleted recoverable Member credentials');
  assert(expiredState.activeBearer === accessToken && expiredState.pendingGuest === stagedGuest, 'Expired network failure substituted Guest authority');
  assert(refreshRequests > expiredBefore, 'Expired network scenario did not exercise refresh transport failure');
  assert(guestBootstrapRequests === 0, 'Expired network failure bootstrapped a Guest');

  refreshMode = 'success';
  await navigate(client, origin, '/hall.html', '.product-profile');
  await waitFor(
    client,
    `(() => {
      const session = JSON.parse(localStorage.getItem('myeongha.memberSession.v1') ?? 'null');
      return document.querySelector('.product-profile')?.dataset.authState === 'member'
        && session?.accessToken === ${JSON.stringify(rotatedToken)};
    })()`,
    'Member did not recover and rotate after network transport returned',
  );
  const recovered = await authSnapshot(client);
  const recoveredBearer = await resolveBearer(client, 'getActiveBearer');
  assert(recoveredBearer.ok && recoveredBearer.value?.kind === 'member' && recoveredBearer.value?.token === rotatedToken, 'Recovered network refresh did not expose rotated Member bearer');
  assert(recovered.userId === member.id && recovered.email === member.email, 'Network recovery changed Member identity');
  assert(recovered.accessToken === rotatedToken && recovered.refreshToken === rotatedRefreshToken, 'Network recovery did not persist rotated credentials');
  assert(recovered.activeBearer === rotatedToken && recovered.pendingGuest === stagedGuest, 'Network recovery consumed or substituted staged Guest authority');
  assert(guestBootstrapRequests === 0, 'Network recovery unexpectedly bootstrapped a Guest');
  assert(
    requests.filter((request) => request.path === '/api/auth/refresh').every((request) => request.refreshToken === refreshToken),
    'Network refresh scenario used an unexpected refresh credential',
  );

  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify({
    status: 'MyeongHa_WEB_AUTH_REFRESH_NETWORK_BROWSER_PASS',
    nearExpiry: nearState,
    expired: expiredState,
    recovered,
    refreshRequests,
    guestBootstrapRequests,
    requests,
  }, null, 2)}\n`, 'utf8');
  console.log('MyeongHa_WEB_AUTH_REFRESH_NETWORK_BROWSER_PASS');
} catch (error) {
  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify({
    status: 'MyeongHa_WEB_AUTH_REFRESH_NETWORK_BROWSER_FAIL',
    error: error instanceof Error ? error.message : String(error),
    refreshMode,
    refreshRequests,
    guestBootstrapRequests,
    requests,
    chromeError,
  }, null, 2)}\n`, 'utf8');
  throw error;
} finally {
  client?.close();
  await stopChrome(chrome);
  await new Promise((done) => server.close(done));
  await removeProfile(profile);
}
