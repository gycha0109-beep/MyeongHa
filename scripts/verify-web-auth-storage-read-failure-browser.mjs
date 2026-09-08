import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const artifactDir = resolve(process.cwd(), 'artifacts');
const artifactPath = join(artifactDir, 'web-auth-storage-read-failure-browser-smoke.json');
const memberKey = 'myeongha.memberSession.v1';
const activeBearerKey = 'myeongha.guestBearer.v1';
const pendingGuestKey = 'myeongha.pendingGuestBearer.v1';
const changedEvent = 'myeongha:auth-changed';
const memberAccessToken = 'member.read.token';
const memberRaw = JSON.stringify({
  accessToken: memberAccessToken,
  refreshToken: 'refresh-browser-read-authority',
  expiresAt: '2099-01-01T00:00:00.000Z',
  tokenType: 'bearer',
  user: { id: 'auth-user-browser-read', email: 'browser-read@example.com' },
});
const existingGuest = 'guest-browser-read-existing';
const bootstrappedGuest = `myeongha_guest_v1_${'R'.repeat(43)}`;

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
        res.end('<!doctype html><html><body><main id="probe">auth storage read probe</main></body></html>');
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
    console.log('MyeongHa storage read failure assertions passed; ignoring ephemeral Chrome profile cleanup ENOTEMPTY race.');
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
  productAuthSource.includes("'WEB_AUTH_MEMBER_READ_FAILED'")
    && productAuthSource.includes("'WEB_AUTH_SESSION_READ_FAILED'"),
  'product-auth storage reads do not fail closed with explicit authority errors',
);

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-auth-storage-read-failure-browser-'));
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

  const memberReadFailure = await client.evaluate(`(async () => {
    const auth = await import('/product-auth.js');
    localStorage.setItem(${JSON.stringify(memberKey)}, ${JSON.stringify(memberRaw)});
    globalThis.__myeonghaStorageReadEvents = 0;
    addEventListener(${JSON.stringify(changedEvent)}, () => { globalThis.__myeonghaStorageReadEvents += 1; });

    const nativeGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function(key) {
      if (this === localStorage && key === ${JSON.stringify(memberKey)}) {
        throw new Error('forced Member localStorage read failure');
      }
      return nativeGetItem.call(this, key);
    };

    let failure = null;
    try {
      await auth.ensureActiveBearer();
    } catch (error) {
      failure = { name: error?.name ?? null, code: error?.code ?? null };
    }
    const memberAfterFailure = nativeGetItem.call(localStorage, ${JSON.stringify(memberKey)});
    Storage.prototype.getItem = nativeGetItem;
    const recovered = await auth.ensureActiveBearer();

    return {
      failure,
      memberAfterFailure,
      memberAfterRecovery: localStorage.getItem(${JSON.stringify(memberKey)}),
      recovered,
      activeCompatibility: sessionStorage.getItem(${JSON.stringify(activeBearerKey)}),
      pendingGuest: sessionStorage.getItem(${JSON.stringify(pendingGuestKey)}),
      events: globalThis.__myeonghaStorageReadEvents,
    };
  })()`);

  assert(memberReadFailure.failure?.name === 'ProductAuthError', 'Member read failure did not throw ProductAuthError');
  assert(memberReadFailure.failure?.code === 'WEB_AUTH_MEMBER_READ_FAILED', `Unexpected Member read error: ${memberReadFailure.failure?.code}`);
  assert(memberReadFailure.memberAfterFailure === memberRaw, 'Member read failure mutated durable Member storage');
  assert(memberReadFailure.memberAfterRecovery === memberRaw, 'Member storage changed after read recovery');
  assert(memberReadFailure.recovered?.kind === 'member', 'Recovered authority was not Member');
  assert(memberReadFailure.recovered?.token === memberAccessToken, 'Recovered Member bearer mismatch');
  assert(memberReadFailure.activeCompatibility === memberAccessToken, 'Recovered Member did not stage compatibility bearer');
  assert(memberReadFailure.pendingGuest === null, 'Member read recovery unexpectedly created pending Guest state');
  assert(memberReadFailure.events === 0, `Member read failure/recovery emitted ${memberReadFailure.events} auth event(s)`);
  assert(bootstrapRequests === 0, `Member read failure started ${bootstrapRequests} Guest bootstrap request(s)`);

  const guestReadFailure = await client.evaluate(`(async () => {
    const auth = await import('/product-auth.js');
    localStorage.removeItem(${JSON.stringify(memberKey)});
    sessionStorage.removeItem(${JSON.stringify(activeBearerKey)});
    sessionStorage.removeItem(${JSON.stringify(pendingGuestKey)});
    sessionStorage.setItem(${JSON.stringify(activeBearerKey)}, ${JSON.stringify(existingGuest)});

    const nativeGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function(key) {
      if (this === sessionStorage && key === ${JSON.stringify(pendingGuestKey)}) {
        throw new Error('forced Guest sessionStorage read failure');
      }
      return nativeGetItem.call(this, key);
    };

    let failure = null;
    try {
      await auth.getActiveBearer();
    } catch (error) {
      failure = { name: error?.name ?? null, code: error?.code ?? null };
    }
    const activeAfterFailure = nativeGetItem.call(sessionStorage, ${JSON.stringify(activeBearerKey)});
    Storage.prototype.getItem = nativeGetItem;
    const recovered = await auth.getActiveBearer();

    return {
      failure,
      activeAfterFailure,
      recovered,
      activeAfterRecovery: sessionStorage.getItem(${JSON.stringify(activeBearerKey)}),
      events: globalThis.__myeonghaStorageReadEvents,
    };
  })()`);

  assert(guestReadFailure.failure?.name === 'ProductAuthError', 'Guest read failure did not throw ProductAuthError');
  assert(guestReadFailure.failure?.code === 'WEB_AUTH_SESSION_READ_FAILED', `Unexpected Guest read error: ${guestReadFailure.failure?.code}`);
  assert(guestReadFailure.activeAfterFailure === existingGuest, 'Guest read failure mutated existing Guest storage');
  assert(guestReadFailure.recovered?.kind === 'guest', 'Recovered authority was not Guest');
  assert(guestReadFailure.recovered?.token === existingGuest, 'Recovered Guest bearer mismatch');
  assert(guestReadFailure.activeAfterRecovery === existingGuest, 'Guest storage changed after read recovery');
  assert(guestReadFailure.events === 0, `Guest read failure/recovery emitted ${guestReadFailure.events} auth event(s)`);
  assert(bootstrapRequests === 0, `Guest read failure started ${bootstrapRequests} bootstrap request(s)`);

  const bootstrapReadFailure = await client.evaluate(`(async () => {
    const auth = await import('/product-auth.js');
    sessionStorage.removeItem(${JSON.stringify(activeBearerKey)});
    sessionStorage.removeItem(${JSON.stringify(pendingGuestKey)});

    const nativeGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function(key) {
      if (this === sessionStorage && key === ${JSON.stringify(pendingGuestKey)}) {
        throw new Error('forced pre-bootstrap sessionStorage read failure');
      }
      return nativeGetItem.call(this, key);
    };

    let failure = null;
    try {
      await auth.ensureGuestBearer();
    } catch (error) {
      failure = { name: error?.name ?? null, code: error?.code ?? null };
    }
    Storage.prototype.getItem = nativeGetItem;

    const recoveredToken = await auth.ensureGuestBearer();
    return {
      failure,
      recoveredToken,
      active: sessionStorage.getItem(${JSON.stringify(activeBearerKey)}),
      pending: sessionStorage.getItem(${JSON.stringify(pendingGuestKey)}),
      events: globalThis.__myeonghaStorageReadEvents,
    };
  })()`);

  assert(bootstrapReadFailure.failure?.name === 'ProductAuthError', 'Pre-bootstrap read failure did not throw ProductAuthError');
  assert(bootstrapReadFailure.failure?.code === 'WEB_AUTH_SESSION_READ_FAILED', `Unexpected pre-bootstrap read error: ${bootstrapReadFailure.failure?.code}`);
  assert(bootstrapRequests === 1, `Read recovery expected exactly one bootstrap request total, got ${bootstrapRequests}`);
  assert(bootstrapReadFailure.recoveredToken === bootstrappedGuest, 'Read recovery returned unexpected Guest bearer');
  assert(bootstrapReadFailure.active === bootstrappedGuest, 'Read recovery did not persist Guest bearer');
  assert(bootstrapReadFailure.pending === null, 'Read recovery unexpectedly created pending Guest state');
  assert(bootstrapReadFailure.events === 1, `Healthy bootstrap expected one auth event, got ${bootstrapReadFailure.events}`);

  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify({
    status: 'MyeongHa_WEB_AUTH_STORAGE_READ_FAILURE_BROWSER_PASS',
    memberReadFailure,
    guestReadFailure,
    bootstrapReadFailure,
    bootstrapRequests,
  }, null, 2)}\n`, 'utf8');
  functionalPass = true;
  console.log('MyeongHa_WEB_AUTH_STORAGE_READ_FAILURE_BROWSER_PASS');
} catch (error) {
  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify({
    status: 'MyeongHa_WEB_AUTH_STORAGE_READ_FAILURE_BROWSER_FAIL',
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