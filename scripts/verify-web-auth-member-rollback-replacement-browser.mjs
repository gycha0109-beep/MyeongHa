import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const artifactDir = resolve(process.cwd(), 'artifacts');
const artifactPath = join(artifactDir, 'web-auth-member-rollback-replacement-browser-smoke.json');
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
    const ready = await client.evaluate(`location.pathname === ${JSON.stringify(pathname)} && document.readyState === 'complete'`);
    if (ready) return;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${pathname}`);
}

for (const file of ['hall.html', 'product-auth.js']) await stat(join(root, file));

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-auth-member-rollback-replacement-browser-'));
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
    const OLD_ACCESS = 'old.browser.member';
    const NEW_ACCESS = 'new.browser.member';
    const REPLACEMENT_ACCESS = 'replacement.browser.member';
    const PENDING_GUEST = 'browser-guest-before-member';
    const oldMember = {
      accessToken: OLD_ACCESS,
      refreshToken: 'old-browser-refresh',
      expiresAt: '2099-01-01T00:00:00.000Z',
      tokenType: 'bearer',
      user: { id: '77777777-7777-4777-8777-777777777777', email: 'rollback-browser@example.com' },
    };
    const newMember = {
      ...oldMember,
      accessToken: NEW_ACCESS,
      refreshToken: 'new-browser-refresh',
      expiresAt: '2099-01-02T00:00:00.000Z',
    };
    const replacementMember = {
      ...oldMember,
      accessToken: REPLACEMENT_ACCESS,
      refreshToken: 'replacement-browser-refresh',
      expiresAt: '2099-01-03T00:00:00.000Z',
    };
    const oldRaw = JSON.stringify(oldMember);
    const replacementRaw = JSON.stringify(replacementMember);
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
    const seed = () => {
      clear();
      originalSet.call(localStorage, keys.memberSession, oldRaw);
      originalSet.call(sessionStorage, keys.guestBearer, OLD_ACCESS);
      originalSet.call(sessionStorage, keys.pendingGuestBearer, PENDING_GUEST);
    };
    const storedAccess = () => {
      const raw = originalGet.call(localStorage, keys.memberSession);
      return raw ? JSON.parse(raw).accessToken : null;
    };
    const refreshResponse = () => Response.json({
      ok: true,
      data: { status: 'authenticated', session: newMember },
    });

    seed();
    let writeReplacementArmed = false;
    Storage.prototype.setItem = function(key, value) {
      const result = originalSet.call(this, key, value);
      if (this === localStorage && key === keys.memberSession && String(value).includes(NEW_ACCESS)) {
        writeReplacementArmed = true;
      }
      return result;
    };
    Storage.prototype.getItem = function(key) {
      if (this === localStorage && key === keys.memberSession && writeReplacementArmed) {
        writeReplacementArmed = false;
        originalSet.call(localStorage, key, replacementRaw);
      }
      return originalGet.call(this, key);
    };
    globalThis.fetch = async () => refreshResponse();
    let writeReplacementCode = null;
    try { await auth.refreshMemberSession(); } catch (error) { writeReplacementCode = error?.code ?? null; }
    const writeReplacementStored = storedAccess();
    restoreMethods();

    seed();
    let writeReadFaultArmed = false;
    Storage.prototype.setItem = function(key, value) {
      const result = originalSet.call(this, key, value);
      if (this === localStorage && key === keys.memberSession && String(value).includes(NEW_ACCESS)) {
        writeReadFaultArmed = true;
      }
      return result;
    };
    Storage.prototype.getItem = function(key) {
      if (this === localStorage && key === keys.memberSession && writeReadFaultArmed) {
        writeReadFaultArmed = false;
        originalSet.call(localStorage, key, replacementRaw);
        throw new Error('browser member write verification read blocked');
      }
      return originalGet.call(this, key);
    };
    globalThis.fetch = async () => refreshResponse();
    let writeReadFaultCode = null;
    try { await auth.refreshMemberSession(); } catch (error) { writeReadFaultCode = error?.code ?? null; }
    const writeReadFaultStored = storedAccess();
    restoreMethods();

    seed();
    let removeReplacementArmed = true;
    Storage.prototype.removeItem = function(key) {
      if (this === localStorage && key === keys.memberSession && removeReplacementArmed) {
        removeReplacementArmed = false;
        originalRemove.call(localStorage, key);
        originalSet.call(localStorage, key, replacementRaw);
        throw new Error('browser member removal mutated then replacement won');
      }
      return originalRemove.call(this, key);
    };
    const removeReplacementResult = auth.invalidateMemberSession(OLD_ACCESS);
    const removeReplacementStored = storedAccess();
    restoreMethods();

    seed();
    let memberRemoved = false;
    let postRemovalReads = 0;
    Storage.prototype.removeItem = function(key) {
      if (this === localStorage && key === keys.memberSession) {
        originalRemove.call(localStorage, key);
        memberRemoved = true;
        postRemovalReads = 0;
        return;
      }
      if (this === sessionStorage && key === keys.pendingGuestBearer) return;
      return originalRemove.call(this, key);
    };
    Storage.prototype.getItem = function(key) {
      if (this === localStorage && key === keys.memberSession && memberRemoved) {
        postRemovalReads += 1;
        if (postRemovalReads === 2) originalSet.call(localStorage, key, replacementRaw);
      }
      return originalGet.call(this, key);
    };
    const compatibilityRollbackResult = auth.invalidateMemberSession(OLD_ACCESS);
    const compatibilityRollbackStored = storedAccess();
    const compatibilityGuest = originalGet.call(sessionStorage, keys.guestBearer);
    const compatibilityPending = originalGet.call(sessionStorage, keys.pendingGuestBearer);
    restoreMethods();
    clear();

    return {
      writeReplacementCode,
      writeReplacementStored,
      writeReadFaultCode,
      writeReadFaultStored,
      removeReplacementResult,
      removeReplacementStored,
      compatibilityRollbackResult,
      compatibilityRollbackStored,
      compatibilityGuest,
      compatibilityPending,
    };
  })()`);

  assert(result?.writeReplacementCode === 'WEB_AUTH_MEMBER_PERSIST_FAILED', `Write replacement returned unexpected result: ${JSON.stringify(result)}`);
  assert(result?.writeReplacementStored === 'replacement.browser.member', `Write verification clobbered replacement Member: ${JSON.stringify(result)}`);
  assert(result?.writeReadFaultCode === 'WEB_AUTH_MEMBER_READ_FAILED', `Write read-fault returned unexpected result: ${JSON.stringify(result)}`);
  assert(result?.writeReadFaultStored === 'replacement.browser.member', `Write read-fault rollback clobbered replacement Member: ${JSON.stringify(result)}`);
  assert(result?.removeReplacementResult === false, `Removal replacement should fail closed without deleting newer Member: ${JSON.stringify(result)}`);
  assert(result?.removeReplacementStored === 'replacement.browser.member', `Removal rollback clobbered replacement Member: ${JSON.stringify(result)}`);
  assert(result?.compatibilityRollbackResult === false, `Compatibility rollback should fail closed while preserving newer Member: ${JSON.stringify(result)}`);
  assert(result?.compatibilityRollbackStored === 'replacement.browser.member', `Compatibility rollback resurrected stale Member over replacement: ${JSON.stringify(result)}`);
  assert(result?.compatibilityGuest === 'old.browser.member', `Compatibility rollback changed original active bearer: ${JSON.stringify(result)}`);
  assert(result?.compatibilityPending === 'browser-guest-before-member', `Compatibility rollback changed pending Guest lineage: ${JSON.stringify(result)}`);

  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify({
    status: 'MyeongHa_WEB_AUTH_MEMBER_ROLLBACK_REPLACEMENT_BROWSER_PASS',
    result,
  }, null, 2)}\n`, 'utf8');
  console.log('MyeongHa_WEB_AUTH_MEMBER_ROLLBACK_REPLACEMENT_BROWSER_PASS');
} catch (error) {
  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify({
    status: 'MyeongHa_WEB_AUTH_MEMBER_ROLLBACK_REPLACEMENT_BROWSER_FAIL',
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
