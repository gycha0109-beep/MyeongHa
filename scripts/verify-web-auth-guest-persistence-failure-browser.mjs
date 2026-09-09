import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const artifactDir = resolve(process.cwd(), 'artifacts');
const artifactPath = join(artifactDir, 'web-auth-guest-persistence-failure-browser-smoke.json');
const guestTokenKey = 'myeongha.guestBearer.v1';
const pendingGuestTokenKey = 'myeongha.pendingGuestBearer.v1';
const memberSessionKey = 'myeongha.memberSession.v1';
const authChangedEvent = 'myeongha:auth-changed';
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
]);

const requests = [];
let bootstrapCount = 0;
let functionalPass = false;

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const isExpectedNavigationContextRace = (error) =>
  error instanceof Error
  && /Inspected target navigated or closed|Execution context was destroyed/u.test(error.message);

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

      if (pathname === '/api/session/bootstrap' && req.method === 'POST') {
        const body = await readJsonBody(req);
        assert(body && typeof body === 'object' && !Array.isArray(body), 'Guest bootstrap body was not an object');
        bootstrapCount += 1;
        const token = `guest-browser-persist-${bootstrapCount}`;
        requests.push({ path: pathname, method: req.method, ordinal: bootstrapCount, token });
        sendJson(res, 200, {
          ok: true,
          data: {
            kind: 'guest',
            guestSession: {
              bearerToken: token,
              expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            },
          },
        });
        return;
      }

      if (pathname.startsWith('/api/')) {
        requests.push({ path: pathname, method: req.method });
        sendJson(res, 404, { ok: false, error: { code: 'NOT_FOUND' } });
        return;
      }

      if (pathname === '/') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end('<!doctype html><html><body><main id="ready">Guest storage verification rollback harness</main></body></html>');
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

async function navigate(client, origin, timeout = 10_000) {
  const result = await client.send('Page.navigate', { url: `${origin}/` });
  assert(!result.errorText, `Navigation failed: ${result.errorText}`);
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const state = await client.evaluate(`(() => ({
        pathname: location.pathname,
        readyState: document.readyState,
        found: Boolean(document.querySelector('#ready')),
      }))()`);
      if (state?.pathname === '/' && state.readyState === 'complete' && state.found) return;
    } catch (error) {
      if (!isExpectedNavigationContextRace(error)) throw error;
    }
    await sleep(50);
  }
  throw new Error('Timed out waiting for Guest storage rollback browser harness');
}

async function stopChrome(chrome) {
  if (chrome.exitCode !== null) return;
  const exited = new Promise((done) => chrome.once('exit', done));
  chrome.kill('SIGTERM');
  await Promise.race([exited, sleep(2_000)]);
  if (chrome.exitCode === null) {
    chrome.kill('SIGKILL');
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
    console.log('MyeongHa Guest storage rollback browser assertions passed; ignoring ephemeral Chrome profile cleanup ENOTEMPTY race.');
  }
}

await stat(join(root, 'product-auth.js'));
const productAuthSource = await readFile(join(root, 'product-auth.js'), 'utf8');
assert(productAuthSource.includes('WEB_AUTH_SESSION_WRITE_ROLLBACK_FAILED'), 'product-auth.js does not expose Guest write rollback authority');
assert(productAuthSource.includes('WEB_AUTH_SESSION_CLEAR_ROLLBACK_FAILED'), 'product-auth.js does not expose Guest clear rollback authority');
assert(productAuthSource.includes('restoreSessionValueSnapshot'), 'product-auth.js does not restore exact sessionStorage snapshots');

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-auth-guest-persistence-failure-browser-'));
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
  await navigate(client, origin);

  const writeReadFailure = await client.evaluate(`(async () => {
    sessionStorage.removeItem(${JSON.stringify(guestTokenKey)});
    sessionStorage.removeItem(${JSON.stringify(pendingGuestTokenKey)});
    localStorage.removeItem(${JSON.stringify(memberSessionKey)});
    let changedEvents = 0;
    addEventListener(${JSON.stringify(authChangedEvent)}, () => { changedEvents += 1; });
    const auth = await import('/product-auth.js?guestrollback=' + Date.now());
    const nativeSetItem = Storage.prototype.setItem;
    const nativeGetItem = Storage.prototype.getItem;
    let armWrite = true;
    let failNextRead = false;
    Storage.prototype.setItem = function(key, value) {
      const result = nativeSetItem.call(this, key, value);
      if (this === sessionStorage && key === auth.PRODUCT_AUTH_STORAGE_V1.guestBearer && armWrite) {
        armWrite = false;
        failNextRead = true;
      }
      return result;
    };
    Storage.prototype.getItem = function(key) {
      if (this === sessionStorage && key === auth.PRODUCT_AUTH_STORAGE_V1.guestBearer && failNextRead) {
        failNextRead = false;
        throw new DOMException('Guest write verification read blocked', 'InvalidStateError');
      }
      return nativeGetItem.call(this, key);
    };
    let errorCode = null;
    try {
      await auth.ensureGuestBearer();
    } catch (error) {
      errorCode = error?.code ?? error?.name ?? String(error);
    } finally {
      Storage.prototype.setItem = nativeSetItem;
      Storage.prototype.getItem = nativeGetItem;
    }
    return {
      errorCode,
      stored: sessionStorage.getItem(auth.PRODUCT_AUTH_STORAGE_V1.guestBearer),
      pending: sessionStorage.getItem(auth.PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer),
      member: localStorage.getItem(auth.PRODUCT_AUTH_STORAGE_V1.memberSession),
      changedEvents,
      readyState: document.readyState,
    };
  })()`);

  assert(writeReadFailure.readyState === 'complete', `Browser harness was not complete: ${writeReadFailure.readyState}`);
  assert(bootstrapCount === 1, `Write/read failure should issue exactly one bootstrap request, got ${bootstrapCount}`);
  assert(writeReadFailure.errorCode === 'WEB_AUTH_SESSION_READ_FAILED', `Unexpected Guest verification-read failure code: ${writeReadFailure.errorCode}`);
  assert(writeReadFailure.stored === null, `Verification-read failure left a partial Guest bearer: ${writeReadFailure.stored}`);
  assert(writeReadFailure.pending === null, `Verification-read failure created pending Guest state: ${writeReadFailure.pending}`);
  assert(writeReadFailure.member === null, 'Guest verification-read failure unexpectedly created Member authority');
  assert(writeReadFailure.changedEvents === 0, `Guest verification-read failure emitted auth-changed: ${writeReadFailure.changedEvents}`);

  const recovered = await client.evaluate(`(async () => {
    const auth = await import('/product-auth.js?guestrollback=' + Date.now());
    let changedEvents = 0;
    addEventListener(${JSON.stringify(authChangedEvent)}, () => { changedEvents += 1; });
    const first = await auth.ensureGuestBearer();
    const second = await auth.ensureGuestBearer();
    return {
      first,
      second,
      stored: sessionStorage.getItem(auth.PRODUCT_AUTH_STORAGE_V1.guestBearer),
      changedEvents,
      readyState: document.readyState,
    };
  })()`);

  assert(recovered.readyState === 'complete', `Recovery harness was not complete: ${recovered.readyState}`);
  assert(bootstrapCount === 2, `Recovery should issue one fresh bootstrap after rollback, got ${bootstrapCount}`);
  assert(recovered.first === 'guest-browser-persist-2', `Recovery returned unexpected Guest bearer: ${recovered.first}`);
  assert(recovered.second === recovered.first, 'Second Guest read did not reuse persisted recovery authority');
  assert(recovered.stored === recovered.first, 'Recovered Guest bearer was not persisted');
  assert(recovered.changedEvents === 1, `Expected one auth-changed event for recovery, got ${recovered.changedEvents}`);

  const removalReadFailure = await client.evaluate(`(() => {
    const nativeRemoveItem = Storage.prototype.removeItem;
    const nativeGetItem = Storage.prototype.getItem;
    let armRemoval = true;
    let failNextRead = false;
    Storage.prototype.removeItem = function(key) {
      const result = nativeRemoveItem.call(this, key);
      if (this === sessionStorage && key === ${JSON.stringify(guestTokenKey)} && armRemoval) {
        armRemoval = false;
        failNextRead = true;
      }
      return result;
    };
    Storage.prototype.getItem = function(key) {
      if (this === sessionStorage && key === ${JSON.stringify(guestTokenKey)} && failNextRead) {
        failNextRead = false;
        throw new DOMException('Guest removal verification read blocked', 'InvalidStateError');
      }
      return nativeGetItem.call(this, key);
    };
    return import('/product-auth.js?guestrollback=' + Date.now()).then((auth) => {
      let changedEvents = 0;
      addEventListener(${JSON.stringify(authChangedEvent)}, () => { changedEvents += 1; });
      let errorCode = null;
      try {
        auth.invalidateGuestSession(${JSON.stringify('guest-browser-persist-2')});
      } catch (error) {
        errorCode = error?.code ?? error?.name ?? String(error);
      } finally {
        Storage.prototype.removeItem = nativeRemoveItem;
        Storage.prototype.getItem = nativeGetItem;
      }
      return {
        errorCode,
        stored: sessionStorage.getItem(auth.PRODUCT_AUTH_STORAGE_V1.guestBearer),
        pending: sessionStorage.getItem(auth.PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer),
        changedEvents,
        retryCleared: auth.invalidateGuestSession(${JSON.stringify('guest-browser-persist-2')}),
        afterRetry: sessionStorage.getItem(auth.PRODUCT_AUTH_STORAGE_V1.guestBearer),
        readyState: document.readyState,
      };
    });
  })()`);

  assert(removalReadFailure.readyState === 'complete', `Removal harness was not complete: ${removalReadFailure.readyState}`);
  assert(removalReadFailure.errorCode === 'WEB_AUTH_SESSION_READ_FAILED', `Unexpected Guest removal verification-read code: ${removalReadFailure.errorCode}`);
  assert(removalReadFailure.stored === 'guest-browser-persist-2', `Removal verification-read failure lost Guest authority: ${removalReadFailure.stored}`);
  assert(removalReadFailure.pending === null, `Removal verification-read failure changed pending Guest state: ${removalReadFailure.pending}`);
  assert(removalReadFailure.changedEvents === 0, `Failed Guest removal emitted auth-changed: ${removalReadFailure.changedEvents}`);
  assert(removalReadFailure.retryCleared === true, 'Guest removal did not recover after verification fault was removed');
  assert(removalReadFailure.afterRetry === null, `Recovered Guest removal left bearer: ${removalReadFailure.afterRetry}`);
  assert(requests.length === 2, `Unexpected API requests during Guest rollback verification: ${JSON.stringify(requests)}`);

  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify({
    status: 'MyeongHa_WEB_AUTH_GUEST_PERSISTENCE_FAILURE_BROWSER_PASS',
    writeReadFailure,
    recovered,
    removalReadFailure,
    bootstrapRequests: bootstrapCount,
    requests,
  }, null, 2)}\n`, 'utf8');
  functionalPass = true;
  console.log('MyeongHa_WEB_AUTH_GUEST_PERSISTENCE_FAILURE_BROWSER_PASS');
} catch (error) {
  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify({
    status: 'MyeongHa_WEB_AUTH_GUEST_PERSISTENCE_FAILURE_BROWSER_FAIL',
    error: error instanceof Error ? error.message : String(error),
    bootstrapRequests: bootstrapCount,
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
