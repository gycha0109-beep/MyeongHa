import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const memberKey = 'myeongha.memberSession.v1';
const activeKey = 'myeongha.guestBearer.v1';
const pendingKey = 'myeongha.pendingGuestBearer.v1';
const authEvent = 'myeongha:auth-changed';
const guestBearer = 'guest-before-member-compat-failure';
const memberSession = Object.freeze({
  accessToken: 'compat.member.signature',
  refreshToken: 'compat-refresh-token',
  expiresAt: '2099-01-01T00:00:00.000Z',
  tokenType: 'bearer',
  user: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'compat-member@example.com',
  },
});
const rotatedMemberSession = Object.freeze({
  ...memberSession,
  accessToken: 'compat.rotated.signature',
  refreshToken: 'compat-refresh-token-rotated',
  expiresAt: '2099-01-02T00:00:00.000Z',
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
let signInCount = 0;
let signOutCount = 0;

function envelope(data) {
  return { ok: true, data, meta: { apiContractVersion: 'member-compat-browser-v1' } };
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
        assert(body.email === memberSession.user.email, 'unexpected sign-in email');
        signInCount += 1;
        const session = signInCount >= 4 ? rotatedMemberSession : memberSession;
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(envelope({ status: 'authenticated', session })));
        return;
      }
      if (pathname === '/api/auth/sign-out' && req.method === 'POST') {
        signOutCount += 1;
        assert(req.headers.authorization === `Bearer ${rotatedMemberSession.accessToken}`, 'sign-out used wrong Member bearer');
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(envelope({ status: 'signed_out' })));
        return;
      }
      if (pathname.startsWith('/api/')) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ ok: false, error: { code: 'NOT_FOUND' } }));
        return;
      }

      const staticPath = pathname === '/' ? '/hall.html' : pathname;
      const relative = normalize(staticPath).replace(/^[/\\]+/, '');
      const file = resolve(root, relative);
      assert(file.startsWith(`${root}/`), 'request escaped static root');
      assert((await stat(file)).isFile(), `not a file: ${relative}`);
      res.setHeader('Content-Type', mime.get(extname(file).toLowerCase()) ?? 'application/octet-stream');
      createReadStream(file).pipe(res);
    } catch (error) {
      res.statusCode = 500;
      res.end(error instanceof Error ? error.message : 'server error');
    }
  });
  await new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', done);
  });
  const address = server.address();
  assert(address && typeof address === 'object', 'server address unavailable');
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

async function connectCdp(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/new?about%3Ablank`, { method: 'PUT' });
  assert(response.ok, `target create failed: ${response.status}`);
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

async function navigate(client, origin, pathname, selector) {
  const result = await client.send('Page.navigate', { url: `${origin}${pathname}` });
  assert(!result.errorText, `navigation failed: ${result.errorText}`);
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const state = await client.evaluate(`(() => ({
      pathname: location.pathname,
      readyState: document.readyState,
      found: Boolean(document.querySelector(${JSON.stringify(selector)})),
    }))()`);
    if (state?.pathname === pathname && state.readyState === 'complete' && state.found) return;
    await sleep(50);
  }
  throw new Error(`timed out waiting for ${pathname}`);
}

for (const file of ['hall.html', 'product-auth.js', 'product-auth-ui.js']) await stat(join(root, file));
const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-auth-member-compat-browser-'));
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
let functionalPass = false;

try {
  client = await connectCdp(await devtoolsPort(profile, chrome));
  await navigate(client, origin, '/hall.html', '.product-profile');

  const result = await client.evaluate(`(async () => {
    const auth = await import('/product-auth.js');
    const memberKey = ${JSON.stringify(memberKey)};
    const activeKey = ${JSON.stringify(activeKey)};
    const pendingKey = ${JSON.stringify(pendingKey)};
    const authEvent = ${JSON.stringify(authEvent)};
    const guestBearer = ${JSON.stringify(guestBearer)};
    const memberToken = ${JSON.stringify(memberSession.accessToken)};
    const rotatedToken = ${JSON.stringify(rotatedMemberSession.accessToken)};
    const nativeSetItem = Storage.prototype.setItem;
    const nativeGetItem = Storage.prototype.getItem;
    let eventCount = 0;
    addEventListener(authEvent, () => { eventCount += 1; });
    localStorage.removeItem(memberKey);
    sessionStorage.setItem(activeKey, guestBearer);
    sessionStorage.removeItem(pendingKey);

    let failPending = true;
    let failActive = false;
    let failPendingVerificationRead = false;
    let failMemberVerificationRead = false;
    let armedPendingVerificationRead = false;
    let armedMemberVerificationRead = false;

    Storage.prototype.setItem = function(key, value) {
      if (this === sessionStorage && failPending && key === pendingKey) {
        throw new Error('forced pending Guest preservation failure');
      }
      if (this === sessionStorage && failActive && key === activeKey) {
        throw new Error('forced Member compatibility active write failure');
      }
      const written = nativeSetItem.call(this, key, value);
      if (this === sessionStorage && failPendingVerificationRead && key === pendingKey) {
        failPendingVerificationRead = false;
        armedPendingVerificationRead = true;
      }
      if (this === localStorage && failMemberVerificationRead && key === memberKey) {
        failMemberVerificationRead = false;
        armedMemberVerificationRead = true;
      }
      return written;
    };
    Storage.prototype.getItem = function(key) {
      if (this === sessionStorage && armedPendingVerificationRead && key === pendingKey) {
        armedPendingVerificationRead = false;
        throw new Error('forced pending Guest verification read failure');
      }
      if (this === localStorage && armedMemberVerificationRead && key === memberKey) {
        armedMemberVerificationRead = false;
        throw new Error('forced Member verification read failure');
      }
      return nativeGetItem.call(this, key);
    };

    let firstCode = null;
    try {
      await auth.signInWithPassword(${JSON.stringify(memberSession.user.email)}, 'password');
    } catch (error) {
      firstCode = error?.code ?? null;
    }
    const afterFailedSignIn = {
      firstCode,
      member: localStorage.getItem(memberKey),
      active: sessionStorage.getItem(activeKey),
      pending: sessionStorage.getItem(pendingKey),
      eventCount,
    };

    failPending = false;
    failPendingVerificationRead = true;
    let stagingReadCode = null;
    try {
      await auth.signInWithPassword(${JSON.stringify(memberSession.user.email)}, 'password');
    } catch (error) {
      stagingReadCode = error?.code ?? null;
    }
    const afterFailedStagingRead = {
      stagingReadCode,
      member: localStorage.getItem(memberKey),
      active: sessionStorage.getItem(activeKey),
      pending: sessionStorage.getItem(pendingKey),
      eventCount,
    };

    await auth.signInWithPassword(${JSON.stringify(memberSession.user.email)}, 'password');
    const afterRecoveredSignIn = {
      member: JSON.parse(localStorage.getItem(memberKey) ?? 'null')?.accessToken ?? null,
      active: sessionStorage.getItem(activeKey),
      pending: sessionStorage.getItem(pendingKey),
      eventCount,
    };

    failMemberVerificationRead = true;
    let memberReadCode = null;
    try {
      await auth.signInWithPassword(${JSON.stringify(memberSession.user.email)}, 'password');
    } catch (error) {
      memberReadCode = error?.code ?? null;
    }
    const afterFailedMemberRead = {
      memberReadCode,
      member: JSON.parse(localStorage.getItem(memberKey) ?? 'null')?.accessToken ?? null,
      active: sessionStorage.getItem(activeKey),
      pending: sessionStorage.getItem(pendingKey),
      eventCount,
    };

    await auth.signInWithPassword(${JSON.stringify(memberSession.user.email)}, 'password');
    const afterRecoveredMemberWrite = {
      member: JSON.parse(localStorage.getItem(memberKey) ?? 'null')?.accessToken ?? null,
      active: sessionStorage.getItem(activeKey),
      pending: sessionStorage.getItem(pendingKey),
      eventCount,
    };

    sessionStorage.setItem(activeKey, 'stale.member.signature');
    failActive = true;
    let reconcileCode = null;
    try {
      await auth.getMemberAccessToken();
    } catch (error) {
      reconcileCode = error?.code ?? null;
    }
    const afterFailedReconcile = {
      reconcileCode,
      member: JSON.parse(localStorage.getItem(memberKey) ?? 'null')?.accessToken ?? null,
      active: sessionStorage.getItem(activeKey),
      pending: sessionStorage.getItem(pendingKey),
      eventCount,
    };

    failActive = false;
    const recoveredToken = await auth.getMemberAccessToken();
    const afterRecoveredReconcile = {
      recoveredToken,
      member: JSON.parse(localStorage.getItem(memberKey) ?? 'null')?.accessToken ?? null,
      active: sessionStorage.getItem(activeKey),
      pending: sessionStorage.getItem(pendingKey),
      eventCount,
    };

    await auth.signOutMember();
    const afterSignOut = {
      member: localStorage.getItem(memberKey),
      active: sessionStorage.getItem(activeKey),
      pending: sessionStorage.getItem(pendingKey),
      eventCount,
    };
    Storage.prototype.setItem = nativeSetItem;
    Storage.prototype.getItem = nativeGetItem;
    return {
      afterFailedSignIn,
      afterFailedStagingRead,
      afterRecoveredSignIn,
      afterFailedMemberRead,
      afterRecoveredMemberWrite,
      afterFailedReconcile,
      afterRecoveredReconcile,
      afterSignOut,
      memberToken,
      rotatedToken,
    };
  })()`);

  assert(result.afterFailedSignIn.firstCode === 'WEB_AUTH_MEMBER_COMPAT_PERSIST_FAILED', 'failed sign-in did not surface compatibility persistence error');
  assert(result.afterFailedSignIn.member === null, 'failed compatibility staging established durable Member authority');
  assert(result.afterFailedSignIn.active === guestBearer, 'failed compatibility staging lost active Guest');
  assert(result.afterFailedSignIn.pending === null, 'failed compatibility staging created pending Guest state');
  assert(result.afterFailedSignIn.eventCount === 0, 'failed compatibility staging emitted auth change');

  assert(result.afterFailedStagingRead.stagingReadCode === 'WEB_AUTH_SESSION_READ_FAILED', 'session write verification read failure did not fail closed');
  assert(result.afterFailedStagingRead.member === null, 'session verification read failure established durable Member authority');
  assert(result.afterFailedStagingRead.active === guestBearer, 'session verification read failure lost active Guest');
  assert(result.afterFailedStagingRead.pending === null, 'session verification read failure retained staged pending Guest');
  assert(result.afterFailedStagingRead.eventCount === 0, 'session verification read failure emitted auth change');

  assert(result.afterRecoveredSignIn.member === memberSession.accessToken, 'recovered sign-in did not persist Member');
  assert(result.afterRecoveredSignIn.active === memberSession.accessToken, 'recovered sign-in did not stage Member compatibility bearer');
  assert(result.afterRecoveredSignIn.pending === guestBearer, 'recovered sign-in did not preserve Guest as pending');
  assert(result.afterRecoveredSignIn.eventCount === 1, 'recovered sign-in emitted unexpected auth event count');

  assert(result.afterFailedMemberRead.memberReadCode === 'WEB_AUTH_MEMBER_READ_FAILED', 'Member write verification read failure did not surface Member read authority failure');
  assert(result.afterFailedMemberRead.member === memberSession.accessToken, 'Member write verification read failure did not restore previous durable Member generation');
  assert(result.afterFailedMemberRead.active === memberSession.accessToken, 'Member write verification read failure did not restore previous compatibility bearer');
  assert(result.afterFailedMemberRead.pending === guestBearer, 'Member write verification read failure changed pending Guest lineage');
  assert(result.afterFailedMemberRead.eventCount === 1, 'Member write verification read failure emitted auth change');

  assert(result.afterRecoveredMemberWrite.member === rotatedMemberSession.accessToken, 'recovered Member write did not persist rotated Member generation');
  assert(result.afterRecoveredMemberWrite.active === rotatedMemberSession.accessToken, 'recovered Member write did not rotate compatibility bearer');
  assert(result.afterRecoveredMemberWrite.pending === guestBearer, 'recovered Member write changed pending Guest lineage');
  assert(result.afterRecoveredMemberWrite.eventCount === 2, 'recovered Member write emitted unexpected auth event count');

  assert(result.afterFailedReconcile.reconcileCode === 'WEB_AUTH_MEMBER_COMPAT_PERSIST_FAILED', 'failed reconcile did not fail closed');
  assert(result.afterFailedReconcile.member === rotatedMemberSession.accessToken, 'failed reconcile changed durable Member generation');
  assert(result.afterFailedReconcile.active === 'stale.member.signature', 'failed reconcile did not restore stale compatibility snapshot');
  assert(result.afterFailedReconcile.pending === guestBearer, 'failed reconcile changed pending Guest');
  assert(result.afterFailedReconcile.eventCount === 2, 'failed reconcile emitted auth change');

  assert(result.afterRecoveredReconcile.recoveredToken === rotatedMemberSession.accessToken, 'reconcile recovery returned wrong Member token');
  assert(result.afterRecoveredReconcile.active === rotatedMemberSession.accessToken, 'reconcile recovery did not repair active compatibility bearer');
  assert(result.afterRecoveredReconcile.pending === guestBearer, 'reconcile recovery changed pending Guest');

  assert(result.afterSignOut.member === null, 'sign-out retained Member local authority');
  assert(result.afterSignOut.active === guestBearer, 'sign-out did not restore pre-login Guest');
  assert(result.afterSignOut.pending === null, 'sign-out retained duplicate pending Guest');
  assert(result.afterSignOut.eventCount === 3, 'sign-out emitted unexpected auth event count');
  assert(signInCount === 5, `expected five sign-ins, got ${signInCount}`);
  assert(signOutCount === 1, `expected one sign-out, got ${signOutCount}`);

  const artifactDir = resolve(process.cwd(), 'artifacts');
  await mkdir(artifactDir, { recursive: true });
  await writeFile(join(artifactDir, 'web-auth-member-compat-staging-failure-browser-smoke.json'), `${JSON.stringify({
    signInCount,
    signOutCount,
    ...result,
  }, null, 2)}\n`);

  functionalPass = true;
  console.log('MyeongHa_WEB_AUTH_MEMBER_COMPAT_STAGING_FAILURE_BROWSER_PASS');
} catch (error) {
  console.error(error);
  if (chromeError.trim()) console.error(chromeError.trim());
  process.exitCode = 1;
} finally {
  client?.close();
  chrome.kill('SIGTERM');
  await Promise.race([new Promise((done) => chrome.once('exit', done)), sleep(1_000)]);
  await new Promise((done) => server.close(done));
  try {
    await rm(profile, { recursive: true, force: true });
  } catch (error) {
    const cleanupRace = functionalPass
      && error && typeof error === 'object'
      && error.code === 'ENOTEMPTY'
      && typeof error.path === 'string'
      && error.path.startsWith(profile);
    if (!cleanupRace) throw error;
    console.warn('MyeongHa Member compatibility browser assertions passed; ignoring expected Chrome profile ENOTEMPTY cleanup race.');
  }
}
