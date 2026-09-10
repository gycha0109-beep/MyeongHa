import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const artifactDir = resolve(process.cwd(), 'artifacts');
const artifactPath = join(artifactDir, 'web-auth-guest-rollback-replacement-browser-smoke.json');
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
]);

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const pathname = decodeURIComponent(url.pathname);
      const staticPath = pathname === '/' ? '/hall.html' : pathname;
      const relative = normalize(staticPath).replace(/^[/\\]+/, '');
      const file = resolve(root, relative);
      assert(file.startsWith(`${root}/`), 'request escaped static root');
      assert((await stat(file)).isFile(), `not a file: ${relative}`);
      res.setHeader('Content-Type', mime.get(extname(file).toLowerCase()) ?? 'application/octet-stream');
      createReadStream(file).pipe(res);
    } catch (error) {
      res.statusCode = 404;
      res.end(error instanceof Error ? error.message : 'Not found');
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

async function navigate(client, origin, pathname, timeout = 10_000) {
  const result = await client.send('Page.navigate', { url: `${origin}${pathname}` });
  assert(!result.errorText, `Navigation failed for ${pathname}: ${result.errorText}`);
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const ready = await client.evaluate(`location.pathname === ${JSON.stringify(pathname)} && document.readyState === 'complete'`);
      if (ready) return;
    } catch (error) {
      if (!/Inspected target navigated or closed|Execution context was destroyed/u.test(error instanceof Error ? error.message : '')) throw error;
    }
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${pathname}`);
}

for (const file of ['hall.html', 'product-auth.js']) await stat(join(root, file));

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-auth-guest-rollback-replacement-browser-'));
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
  const port = await devtoolsPort(profile, chrome);
  client = await connectCdp(port);
  await navigate(client, origin, '/hall.html');

  const result = await client.evaluate(`(async () => {
    const auth = await import('/product-auth.js');
    const keys = auth.PRODUCT_AUTH_STORAGE_V1;
    const MEMBER_ACCESS = 'member.rollback.token';
    const BOOTSTRAP_GUEST = 'guest-bootstrap-token';
    const OLD_GUEST = 'guest-before-member';
    const PENDING_GUEST = 'guest-pending-lineage';
    const REPLACEMENT_GUEST = 'guest-newer-replacement';
    const member = {
      accessToken: MEMBER_ACCESS,
      refreshToken: 'member-refresh-token',
      expiresAt: '2099-01-01T00:00:00.000Z',
      tokenType: 'bearer',
      user: { id: '88888888-8888-4888-8888-888888888888', email: 'guest-rollback-browser@example.com' },
    };
    const memberRaw = JSON.stringify(member);
    const originalGet = Storage.prototype.getItem;
    const originalSet = Storage.prototype.setItem;
    const originalRemove = Storage.prototype.removeItem;
    const originalFetch = globalThis.fetch;
    const restoreMethods = () => {
      Storage.prototype.getItem = originalGet;
      Storage.prototype.setItem = originalSet;
      Storage.prototype.removeItem = originalRemove;
      globalThis.fetch = originalFetch;
    };
    const clear = () => {
      originalRemove.call(localStorage, keys.memberSession);
      originalRemove.call(sessionStorage, keys.guestBearer);
      originalRemove.call(sessionStorage, keys.pendingGuestBearer);
    };
    const guestBootstrapResponse = () => Response.json({
      ok: true,
      data: {
        kind: 'guest',
        guestSession: { bearerToken: BOOTSTRAP_GUEST, expiresAt: '2099-01-01T00:00:00.000Z' },
      },
    });
    const memberResponse = () => Response.json({
      ok: true,
      data: { status: 'authenticated', session: member },
    });

    clear();
    let writeReadFaultArmed = false;
    Storage.prototype.setItem = function(key, value) {
      const result = originalSet.call(this, key, value);
      if (this === sessionStorage && key === keys.guestBearer && String(value) === BOOTSTRAP_GUEST) {
        originalSet.call(sessionStorage, key, REPLACEMENT_GUEST);
        writeReadFaultArmed = true;
      }
      return result;
    };
    Storage.prototype.getItem = function(key) {
      if (this === sessionStorage && key === keys.guestBearer && writeReadFaultArmed) {
        writeReadFaultArmed = false;
        throw new Error('guest write verification read blocked');
      }
      return originalGet.call(this, key);
    };
    globalThis.fetch = async () => guestBootstrapResponse();
    let writeReadFaultCode = null;
    try { await auth.ensureGuestBearer(); } catch (error) { writeReadFaultCode = error?.code ?? null; }
    const writeReadFaultGuest = originalGet.call(sessionStorage, keys.guestBearer);
    restoreMethods();

    clear();
    originalSet.call(sessionStorage, keys.guestBearer, OLD_GUEST);
    let removeReadFaultArmed = false;
    Storage.prototype.removeItem = function(key) {
      const result = originalRemove.call(this, key);
      if (this === sessionStorage && key === keys.guestBearer) {
        originalSet.call(sessionStorage, key, REPLACEMENT_GUEST);
        removeReadFaultArmed = true;
      }
      return result;
    };
    Storage.prototype.getItem = function(key) {
      if (this === sessionStorage && key === keys.guestBearer && removeReadFaultArmed) {
        removeReadFaultArmed = false;
        throw new Error('guest removal verification read blocked');
      }
      return originalGet.call(this, key);
    };
    let removeReadFaultCode = null;
    try { auth.invalidateGuestSession(OLD_GUEST); } catch (error) { removeReadFaultCode = error?.code ?? null; }
    const removeReadFaultGuest = originalGet.call(sessionStorage, keys.guestBearer);
    restoreMethods();

    clear();
    originalSet.call(sessionStorage, keys.pendingGuestBearer, PENDING_GUEST);
    originalSet.call(sessionStorage, keys.guestBearer, OLD_GUEST);
    let multiReplacementArmed = true;
    Storage.prototype.removeItem = function(key) {
      const result = originalRemove.call(this, key);
      if (this === sessionStorage && key === keys.guestBearer && multiReplacementArmed) {
        multiReplacementArmed = false;
        originalSet.call(sessionStorage, key, REPLACEMENT_GUEST);
      }
      return result;
    };
    let multiClearCode = null;
    try { auth.clearPromotedGuestBearer(); } catch (error) { multiClearCode = error?.code ?? null; }
    const multiClearGuest = originalGet.call(sessionStorage, keys.guestBearer);
    const multiClearPending = originalGet.call(sessionStorage, keys.pendingGuestBearer);
    restoreMethods();

    clear();
    originalSet.call(sessionStorage, keys.guestBearer, OLD_GUEST);
    let memberPersistArmed = true;
    Storage.prototype.setItem = function(key, value) {
      const result = originalSet.call(this, key, value);
      if (this === localStorage && key === keys.memberSession && memberPersistArmed) {
        memberPersistArmed = false;
        originalRemove.call(localStorage, key);
        originalSet.call(sessionStorage, keys.guestBearer, REPLACEMENT_GUEST);
      }
      return result;
    };
    globalThis.fetch = async () => memberResponse();
    let memberPersistCode = null;
    try { await auth.signInWithPassword('guest-rollback-browser@example.com', 'password'); } catch (error) { memberPersistCode = error?.code ?? null; }
    const memberPersistGuest = originalGet.call(sessionStorage, keys.guestBearer);
    const memberPersistPending = originalGet.call(sessionStorage, keys.pendingGuestBearer);
    const memberPersistLocal = originalGet.call(localStorage, keys.memberSession);
    restoreMethods();

    clear();
    originalSet.call(localStorage, keys.memberSession, memberRaw);
    originalSet.call(sessionStorage, keys.guestBearer, MEMBER_ACCESS);
    originalSet.call(sessionStorage, keys.pendingGuestBearer, PENDING_GUEST);
    let discardReplacementArmed = true;
    Storage.prototype.removeItem = function(key) {
      const result = originalRemove.call(this, key);
      if (this === sessionStorage && key === keys.pendingGuestBearer && discardReplacementArmed) {
        discardReplacementArmed = false;
        originalSet.call(sessionStorage, key, PENDING_GUEST);
        originalSet.call(sessionStorage, keys.guestBearer, REPLACEMENT_GUEST);
      }
      return result;
    };
    const discardResult = auth.invalidateMemberSession(MEMBER_ACCESS);
    const discardMemberRaw = originalGet.call(localStorage, keys.memberSession);
    const discardGuest = originalGet.call(sessionStorage, keys.guestBearer);
    const discardPending = originalGet.call(sessionStorage, keys.pendingGuestBearer);
    restoreMethods();
    clear();

    return {
      writeReadFaultCode,
      writeReadFaultGuest,
      removeReadFaultCode,
      removeReadFaultGuest,
      multiClearCode,
      multiClearGuest,
      multiClearPending,
      memberPersistCode,
      memberPersistGuest,
      memberPersistPending,
      memberPersistLocal,
      discardResult,
      discardMemberRaw,
      discardGuest,
      discardPending,
      memberRaw,
    };
  })()`);

  assert(result?.writeReadFaultCode === 'WEB_AUTH_SESSION_READ_FAILED', `Guest write read-fault returned unexpected result: ${JSON.stringify(result)}`);
  assert(result?.writeReadFaultGuest === 'guest-newer-replacement', `Guest write rollback clobbered replacement: ${JSON.stringify(result)}`);
  assert(result?.removeReadFaultCode === 'WEB_AUTH_SESSION_READ_FAILED', `Guest removal read-fault returned unexpected result: ${JSON.stringify(result)}`);
  assert(result?.removeReadFaultGuest === 'guest-newer-replacement', `Guest removal rollback clobbered replacement: ${JSON.stringify(result)}`);
  assert(result?.multiClearCode === 'WEB_AUTH_GUEST_CLEAR_FAILED', `Multi-key clear returned unexpected result: ${JSON.stringify(result)}`);
  assert(result?.multiClearGuest === 'guest-newer-replacement', `Multi-key clear clobbered replacement Guest: ${JSON.stringify(result)}`);
  assert(result?.multiClearPending === 'guest-pending-lineage', `Multi-key clear did not restore earlier removed pending lineage: ${JSON.stringify(result)}`);
  assert(result?.memberPersistCode === 'WEB_AUTH_MEMBER_PERSIST_FAILED', `Member persistence rollback returned unexpected result: ${JSON.stringify(result)}`);
  assert(result?.memberPersistGuest === 'guest-newer-replacement', `Member persistence rollback clobbered replacement Guest: ${JSON.stringify(result)}`);
  assert(result?.memberPersistPending === null, `Member persistence rollback leaked staged pending Guest: ${JSON.stringify(result)}`);
  assert(result?.memberPersistLocal === null, `Member persistence rollback left failed Member authority: ${JSON.stringify(result)}`);
  assert(result?.discardResult === false, `Member discard compatibility rollback should fail closed: ${JSON.stringify(result)}`);
  assert(result?.discardMemberRaw === result?.memberRaw, `Member discard rollback did not restore Member authority: ${JSON.stringify(result)}`);
  assert(result?.discardGuest === 'guest-newer-replacement', `Member discard rollback clobbered replacement Guest: ${JSON.stringify(result)}`);
  assert(result?.discardPending === 'guest-pending-lineage', `Member discard rollback changed pending lineage: ${JSON.stringify(result)}`);

  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify({
    status: 'MyeongHa_WEB_AUTH_GUEST_ROLLBACK_REPLACEMENT_BROWSER_PASS',
    result,
  }, null, 2)}\n`, 'utf8');
  console.log('MyeongHa_WEB_AUTH_GUEST_ROLLBACK_REPLACEMENT_BROWSER_PASS');
} catch (error) {
  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify({
    status: 'MyeongHa_WEB_AUTH_GUEST_ROLLBACK_REPLACEMENT_BROWSER_FAIL',
    error: error instanceof Error ? error.message : String(error),
    chromeError,
  }, null, 2)}\n`, 'utf8');
  throw error;
} finally {
  client?.close();
  if (chrome.exitCode === null) chrome.kill('SIGTERM');
  await Promise.race([
    new Promise((done) => chrome.once('exit', done)),
    sleep(1_000),
  ]);
  await new Promise((done) => server.close(done));
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
