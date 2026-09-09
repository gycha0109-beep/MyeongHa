import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const artifactDir = resolve(process.cwd(), 'artifacts');
const artifactPath = join(artifactDir, 'web-auth-guest-bootstrap-singleflight-browser-smoke-rollback-readback.json');
const memberKey = 'myeongha.memberSession.v1';
const activeKey = 'myeongha.guestBearer.v1';
const pendingKey = 'myeongha.pendingGuestBearer.v1';
const changedEvent = 'myeongha:auth-changed';
const guestToken = 'rollback-test-guest-token-not-a-secret';
const memberSession = Object.freeze({
  accessToken: 'member.rollback.payload',
  refreshToken: 'member-rollback-refresh',
  expiresAt: '2099-01-01T00:00:00.000Z',
  tokenType: 'bearer',
  user: Object.freeze({ id: 'auth-user-rollback-browser', email: 'rollback-browser@example.com' }),
});
const memberRaw = JSON.stringify(memberSession);

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
let functionalPass = false;
let bootstrapRequests = 0;
let signInRequests = 0;

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/' || url.pathname === '/probe.html') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end('<!doctype html><html><body><main id="probe">rollback readback probe</main></body></html>');
        return;
      }
      if (url.pathname === '/product-auth.js') {
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        res.end(await readFile(join(root, 'product-auth.js'), 'utf8'));
        return;
      }
      if (url.pathname === '/api/session/bootstrap' && req.method === 'POST') {
        bootstrapRequests += 1;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({
          ok: true,
          data: {
            kind: 'guest',
            guestSession: { bearerToken: guestToken, expiresAt: '2099-01-01T00:00:00.000Z' },
          },
        }));
        return;
      }
      if (url.pathname === '/api/auth/sign-in' && req.method === 'POST') {
        signInRequests += 1;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ ok: true, data: { status: 'authenticated', session: memberSession } }));
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
    console.log('MyeongHa rollback readback assertions passed; ignoring ephemeral Chrome profile cleanup ENOTEMPTY race.');
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
  return error instanceof Error
    && /Inspected target navigated or closed|Execution context was destroyed/u.test(error.message);
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
const source = await readFile(join(root, 'product-auth.js'), 'utf8');
assert(source.includes('Exact read-back remains authoritative.'), 'rollback helper read-back contract missing from product-auth.js');

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-auth-storage-rollback-readback-browser-'));
const chrome = spawn(chromeBin, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
let chromeError = '';
chrome.stderr.setEncoding('utf8');
chrome.stderr.on('data', (chunk) => { chromeError += chunk; });
let client;

async function runGuestScenario(mode) {
  return client.evaluate(`(async () => {
    const auth = await import('/product-auth.js');
    const memberKey = ${JSON.stringify(memberKey)};
    const activeKey = ${JSON.stringify(activeKey)};
    const pendingKey = ${JSON.stringify(pendingKey)};
    const guestToken = ${JSON.stringify(guestToken)};
    const changedEvent = ${JSON.stringify(changedEvent)};
    const mode = ${JSON.stringify(mode)};
    const nativeGet = Storage.prototype.getItem;
    const nativeSet = Storage.prototype.setItem;
    const nativeRemove = Storage.prototype.removeItem;
    nativeRemove.call(localStorage, memberKey);
    nativeRemove.call(sessionStorage, activeKey);
    nativeRemove.call(sessionStorage, pendingKey);
    let events = 0;
    const onChanged = () => { events += 1; };
    addEventListener(changedEvent, onChanged);
    let verificationReadPending = false;
    let rollbackPending = false;
    Storage.prototype.setItem = function(key, value) {
      if (this === sessionStorage && key === activeKey && value === guestToken) {
        nativeSet.call(this, key, value);
        verificationReadPending = true;
        return;
      }
      return nativeSet.call(this, key, value);
    };
    Storage.prototype.getItem = function(key) {
      if (this === sessionStorage && key === activeKey && verificationReadPending) {
        verificationReadPending = false;
        rollbackPending = true;
        throw new Error('forced Guest verification read failure');
      }
      return nativeGet.call(this, key);
    };
    Storage.prototype.removeItem = function(key) {
      if (this === sessionStorage && key === activeKey && rollbackPending) {
        rollbackPending = false;
        if (mode === 'silent-noop') return;
        nativeRemove.call(this, key);
        throw new Error('forced Guest rollback remove mutation-then-throw');
      }
      return nativeRemove.call(this, key);
    };
    let failure = null;
    try { await auth.ensureGuestBearer(); }
    catch (error) { failure = { name: error?.name ?? null, code: error?.code ?? null }; }
    const activeAfter = nativeGet.call(sessionStorage, activeKey);
    const pendingAfter = nativeGet.call(sessionStorage, pendingKey);
    Storage.prototype.getItem = nativeGet;
    Storage.prototype.setItem = nativeSet;
    Storage.prototype.removeItem = nativeRemove;
    removeEventListener(changedEvent, onChanged);
    nativeRemove.call(sessionStorage, activeKey);
    nativeRemove.call(sessionStorage, pendingKey);
    return { failure, activeAfter, pendingAfter, events };
  })()`);
}

async function runMemberScenario(mode) {
  return client.evaluate(`(async () => {
    const auth = await import('/product-auth.js');
    const memberKey = ${JSON.stringify(memberKey)};
    const activeKey = ${JSON.stringify(activeKey)};
    const pendingKey = ${JSON.stringify(pendingKey)};
    const memberRaw = ${JSON.stringify(memberRaw)};
    const changedEvent = ${JSON.stringify(changedEvent)};
    const mode = ${JSON.stringify(mode)};
    const nativeGet = Storage.prototype.getItem;
    const nativeSet = Storage.prototype.setItem;
    const nativeRemove = Storage.prototype.removeItem;
    nativeRemove.call(localStorage, memberKey);
    nativeRemove.call(sessionStorage, activeKey);
    nativeRemove.call(sessionStorage, pendingKey);
    let events = 0;
    const onChanged = () => { events += 1; };
    addEventListener(changedEvent, onChanged);
    let verificationReadPending = false;
    let rollbackPending = false;
    Storage.prototype.setItem = function(key, value) {
      if (this === localStorage && key === memberKey && value === memberRaw) {
        nativeSet.call(this, key, value);
        verificationReadPending = true;
        return;
      }
      return nativeSet.call(this, key, value);
    };
    Storage.prototype.getItem = function(key) {
      if (this === localStorage && key === memberKey && verificationReadPending) {
        verificationReadPending = false;
        rollbackPending = true;
        throw new Error('forced Member verification read failure');
      }
      return nativeGet.call(this, key);
    };
    Storage.prototype.removeItem = function(key) {
      if (this === localStorage && key === memberKey && rollbackPending) {
        rollbackPending = false;
        if (mode === 'silent-noop') return;
        nativeRemove.call(this, key);
        throw new Error('forced Member rollback remove mutation-then-throw');
      }
      return nativeRemove.call(this, key);
    };
    let failure = null;
    try { await auth.signInWithPassword('rollback-browser@example.com', 'password'); }
    catch (error) { failure = { name: error?.name ?? null, code: error?.code ?? null }; }
    const memberAfter = nativeGet.call(localStorage, memberKey);
    const activeAfter = nativeGet.call(sessionStorage, activeKey);
    const pendingAfter = nativeGet.call(sessionStorage, pendingKey);
    Storage.prototype.getItem = nativeGet;
    Storage.prototype.setItem = nativeSet;
    Storage.prototype.removeItem = nativeRemove;
    removeEventListener(changedEvent, onChanged);
    nativeRemove.call(localStorage, memberKey);
    nativeRemove.call(sessionStorage, activeKey);
    nativeRemove.call(sessionStorage, pendingKey);
    return { failure, memberAfter, activeAfter, pendingAfter, events };
  })()`);
}

try {
  client = await connectCdp(await devtoolsPort(profile, chrome));
  await navigate(client, origin, '/probe.html');

  const guestSilentNoop = await runGuestScenario('silent-noop');
  assert(guestSilentNoop.failure?.code === 'WEB_AUTH_SESSION_WRITE_ROLLBACK_FAILED', `Guest silent no-op rollback was not surfaced: ${guestSilentNoop.failure?.code}`);
  assert(guestSilentNoop.activeAfter === guestToken, 'Guest silent no-op rollback unexpectedly changed partial state');
  assert(guestSilentNoop.pendingAfter === null, 'Guest silent no-op rollback created pending state');
  assert(guestSilentNoop.events === 0, 'Guest silent no-op rollback emitted auth event');

  const guestMutationThrow = await runGuestScenario('mutate-then-throw');
  assert(guestMutationThrow.failure?.code === 'WEB_AUTH_SESSION_READ_FAILED', `Guest mutation-then-throw rollback lost original read error: ${guestMutationThrow.failure?.code}`);
  assert(guestMutationThrow.activeAfter === null, 'Guest mutation-then-throw rollback was not accepted after exact read-back');
  assert(guestMutationThrow.events === 0, 'Guest mutation-then-throw rollback emitted auth event');

  const memberSilentNoop = await runMemberScenario('silent-noop');
  assert(memberSilentNoop.failure?.code === 'WEB_AUTH_MEMBER_WRITE_ROLLBACK_FAILED', `Member silent no-op rollback was not surfaced: ${memberSilentNoop.failure?.code}`);
  assert(memberSilentNoop.memberAfter === memberRaw, 'Member silent no-op rollback unexpectedly changed partial state');
  assert(memberSilentNoop.activeAfter === null && memberSilentNoop.pendingAfter === null, 'Member compatibility lineage was not rolled back');
  assert(memberSilentNoop.events === 0, 'Member silent no-op rollback emitted auth event');

  const memberMutationThrow = await runMemberScenario('mutate-then-throw');
  assert(memberMutationThrow.failure?.code === 'WEB_AUTH_MEMBER_READ_FAILED', `Member mutation-then-throw rollback lost original read error: ${memberMutationThrow.failure?.code}`);
  assert(memberMutationThrow.memberAfter === null, 'Member mutation-then-throw rollback was not accepted after exact read-back');
  assert(memberMutationThrow.activeAfter === null && memberMutationThrow.pendingAfter === null, 'Member compatibility lineage changed after rollback');
  assert(memberMutationThrow.events === 0, 'Member mutation-then-throw rollback emitted auth event');

  assert(bootstrapRequests === 2, `Expected two Guest bootstrap requests, got ${bootstrapRequests}`);
  assert(signInRequests === 2, `Expected two Member sign-in requests, got ${signInRequests}`);

  const evidence = {
    status: 'MyeongHa_WEB_AUTH_STORAGE_ROLLBACK_READBACK_BROWSER_PASS',
    guestSilentNoop,
    guestMutationThrow,
    memberSilentNoop,
    memberMutationThrow,
    bootstrapRequests,
    signInRequests,
  };
  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  functionalPass = true;
  console.log('MyeongHa_WEB_AUTH_STORAGE_ROLLBACK_READBACK_BROWSER_PASS');
} catch (error) {
  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify({
    status: 'MyeongHa_WEB_AUTH_STORAGE_ROLLBACK_READBACK_BROWSER_FAIL',
    error: error instanceof Error ? error.message : String(error),
    bootstrapRequests,
    signInRequests,
    chromeError,
  }, null, 2)}\n`, 'utf8');
  throw error;
} finally {
  client?.close();
  await stopChrome(chrome);
  await new Promise((done) => server.close(done));
  await removeChromeProfile(profile);
}
