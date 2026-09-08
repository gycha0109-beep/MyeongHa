import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const artifactDir = resolve(process.cwd(), 'artifacts');
const artifactPath = join(artifactDir, 'web-auth-malformed-guest-cleanup-failure-browser-smoke.json');
const activeBearerKey = 'myeongha.guestBearer.v1';
const pendingGuestKey = 'myeongha.pendingGuestBearer.v1';
const changedEvent = 'myeongha:auth-changed';
const validExistingGuest = 'guest-valid-before-malformed-cleanup';
const bootstrappedGuest = `myeongha_guest_v1_${'B'.repeat(43)}`;

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
let bootstrapRequests = 0;
let functionalPass = false;

function bootstrapEnvelope() {
  return {
    ok: true,
    data: {
      kind: 'guest',
      guestSession: {
        bearerToken: bootstrappedGuest,
        expiresAt: '2099-01-01T00:00:00.000Z',
      },
    },
  };
}

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/probe.html' || url.pathname === '/') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end('<!doctype html><html><body><main id="probe">auth probe</main></body></html>');
        return;
      }
      if (url.pathname === '/product-auth.js') {
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        res.end(await readFile(join(root, 'product-auth.js'), 'utf8'));
        return;
      }
      if (url.pathname === '/api/session/bootstrap' && req.method === 'POST') {
        bootstrapRequests += 1;
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(bootstrapEnvelope()));
        return;
      }
      res.statusCode = 404;
      res.end('Not found');
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
    console.log('MyeongHa malformed Guest cleanup failure assertions passed; ignoring ephemeral Chrome profile cleanup ENOTEMPTY race.');
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

async function navigate(client, origin, pathname, timeout = 10_000) {
  const result = await client.send('Page.navigate', { url: `${origin}${pathname}` });
  assert(!result.errorText, `Navigation failed for ${pathname}: ${result.errorText}`);
  const cleanPath = pathname.split(/[?#]/)[0];
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const state = await client.evaluate(`({ pathname: location.pathname, readyState: document.readyState })`);
      if (state?.pathname === cleanPath && state.readyState === 'complete') return;
    } catch (error) {
      if (!isExpectedNavigationRace(error)) throw error;
    }
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${cleanPath}`);
}

await stat(join(root, 'product-auth.js'));
const productAuthSource = await readFile(join(root, 'product-auth.js'), 'utf8');
assert(
  productAuthSource.includes('pendingRaw !== null && !removeSession(PENDING_GUEST_TOKEN_KEY)')
    && productAuthSource.includes('throw guestClearFailure();'),
  'readGuestBearer does not fail closed on malformed pending Guest cleanup',
);
assert(
  productAuthSource.includes('tokenRaw !== null && !isJwtLike(tokenRaw) && !removeSession(GUEST_TOKEN_KEY)'),
  'readGuestBearer does not fail closed on malformed active Guest cleanup',
);

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-auth-malformed-guest-cleanup-failure-browser-'));
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
  await navigate(client, origin, '/probe.html');

  const readFailure = await client.evaluate(`(async () => {
    const auth = await import('/product-auth.js');
    sessionStorage.setItem(${JSON.stringify(pendingGuestKey)}, '   ');
    sessionStorage.setItem(${JSON.stringify(activeBearerKey)}, ${JSON.stringify(validExistingGuest)});
    globalThis.__myeonghaMalformedGuestEvents = 0;
    addEventListener(${JSON.stringify(changedEvent)}, () => { globalThis.__myeonghaMalformedGuestEvents += 1; });

    const nativeRemoveItem = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function(key) {
      if (this === sessionStorage && key === ${JSON.stringify(pendingGuestKey)}) {
        throw new Error('forced malformed pending Guest cleanup failure');
      }
      return nativeRemoveItem.call(this, key);
    };

    let failure = null;
    try {
      auth.readGuestBearer();
    } catch (error) {
      failure = { name: error?.name ?? null, code: error?.code ?? null };
    }
    const pendingAfterFailure = sessionStorage.getItem(${JSON.stringify(pendingGuestKey)});
    const activeAfterFailure = sessionStorage.getItem(${JSON.stringify(activeBearerKey)});
    Storage.prototype.removeItem = nativeRemoveItem;

    const recoveredGuest = auth.readGuestBearer();
    return {
      failure,
      pendingAfterFailure,
      activeAfterFailure,
      recoveredGuest,
      pending: sessionStorage.getItem(${JSON.stringify(pendingGuestKey)}),
      active: sessionStorage.getItem(${JSON.stringify(activeBearerKey)}),
      events: globalThis.__myeonghaMalformedGuestEvents,
    };
  })()`);

  assert(readFailure.failure?.name === 'ProductAuthError', 'Malformed pending cleanup did not throw ProductAuthError');
  assert(readFailure.failure?.code === 'WEB_AUTH_GUEST_CLEAR_FAILED', `Unexpected pending cleanup error: ${readFailure.failure?.code}`);
  assert(readFailure.pendingAfterFailure === '   ', 'Failed malformed pending cleanup did not preserve the malformed value');
  assert(readFailure.activeAfterFailure === validExistingGuest, 'Failed malformed pending cleanup disturbed valid active Guest');
  assert(readFailure.recoveredGuest === validExistingGuest, 'Healthy retry did not recover the existing valid Guest');
  assert(readFailure.pending === null, 'Healthy retry did not remove malformed pending Guest');
  assert(readFailure.active === validExistingGuest, 'Healthy retry disturbed valid active Guest');
  assert(readFailure.events === 0, `Malformed Guest read cleanup emitted ${readFailure.events} auth event(s)`);

  const bootstrapFailure = await client.evaluate(`(async () => {
    const auth = await import('/product-auth.js');
    sessionStorage.removeItem(${JSON.stringify(activeBearerKey)});
    sessionStorage.setItem(${JSON.stringify(pendingGuestKey)}, '   ');

    const nativeRemoveItem = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function(key) {
      if (this === sessionStorage && key === ${JSON.stringify(pendingGuestKey)}) {
        throw new Error('forced malformed pending Guest cleanup failure before bootstrap');
      }
      return nativeRemoveItem.call(this, key);
    };

    let failure = null;
    try {
      await auth.ensureGuestBearer();
    } catch (error) {
      failure = { name: error?.name ?? null, code: error?.code ?? null };
    }
    Storage.prototype.removeItem = nativeRemoveItem;

    return {
      failure,
      pending: sessionStorage.getItem(${JSON.stringify(pendingGuestKey)}),
      active: sessionStorage.getItem(${JSON.stringify(activeBearerKey)}),
      events: globalThis.__myeonghaMalformedGuestEvents,
    };
  })()`);

  assert(bootstrapFailure.failure?.name === 'ProductAuthError', 'Pre-bootstrap malformed cleanup did not throw ProductAuthError');
  assert(bootstrapFailure.failure?.code === 'WEB_AUTH_GUEST_CLEAR_FAILED', `Unexpected pre-bootstrap cleanup error: ${bootstrapFailure.failure?.code}`);
  assert(bootstrapRequests === 0, `Guest bootstrap transport started ${bootstrapRequests} time(s) despite cleanup failure`);
  assert(bootstrapFailure.pending === '   ', 'Failed pre-bootstrap cleanup silently removed malformed pending Guest');
  assert(bootstrapFailure.active === null, 'Failed pre-bootstrap cleanup unexpectedly created active Guest authority');
  assert(bootstrapFailure.events === 0, `Failed pre-bootstrap cleanup emitted ${bootstrapFailure.events} auth event(s)`);

  const recoveredBootstrap = await client.evaluate(`(async () => {
    const auth = await import('/product-auth.js');
    const token = await auth.ensureGuestBearer();
    return {
      token,
      pending: sessionStorage.getItem(${JSON.stringify(pendingGuestKey)}),
      active: sessionStorage.getItem(${JSON.stringify(activeBearerKey)}),
      events: globalThis.__myeonghaMalformedGuestEvents,
    };
  })()`);

  assert(bootstrapRequests === 1, `Healthy retry expected exactly one bootstrap request, got ${bootstrapRequests}`);
  assert(recoveredBootstrap.token === bootstrappedGuest, 'Healthy retry returned unexpected Guest bearer');
  assert(recoveredBootstrap.pending === null, 'Healthy retry retained malformed pending Guest');
  assert(recoveredBootstrap.active === bootstrappedGuest, 'Healthy retry did not persist bootstrap Guest bearer');
  assert(recoveredBootstrap.events === 1, `Healthy bootstrap expected one auth event, got ${recoveredBootstrap.events}`);

  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify({
    status: 'MyeongHa_WEB_AUTH_MALFORMED_GUEST_CLEANUP_FAILURE_BROWSER_PASS',
    readFailure,
    bootstrapFailure,
    recoveredBootstrap,
    bootstrapRequests,
  }, null, 2)}\n`, 'utf8');
  functionalPass = true;
  console.log('MyeongHa_WEB_AUTH_MALFORMED_GUEST_CLEANUP_FAILURE_BROWSER_PASS');
} catch (error) {
  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify({
    status: 'MyeongHa_WEB_AUTH_MALFORMED_GUEST_CLEANUP_FAILURE_BROWSER_FAIL',
    error: error instanceof Error ? error.message : String(error),
    bootstrapRequests,
    chromeError,
  }, null, 2)}\n`, 'utf8');
  throw error;
} finally {
  client?.close();
  await stopChrome(chrome);
  await new Promise((done) => server.close(done));
  await removeChromeProfile(profile);
}