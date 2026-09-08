import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const MEMBER_ACCESS = 'member.browser.payload';
const requests = [];
let bootstrapCount = 0;
let signInCount = 0;

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
]);

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const isNavigationContextError = (error) =>
  error instanceof Error && error.message === 'Runtime.evaluate: Inspected target navigated or closed';

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
        requests.push({ path: pathname, method: req.method, ordinal: bootstrapCount });
        const token = `guest-browser-single-flight-${bootstrapCount}`;
        await sleep(200);
        sendJson(res, 200, {
          ok: true,
          data: {
            kind: 'guest',
            guestSession: {
              bearerToken: token,
              expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            },
          },
          meta: {
            apiContractVersion: 'browser-auth-guest-bootstrap-singleflight-v1',
            requestId: `guest-bootstrap-singleflight-${bootstrapCount}`,
            serverTime: new Date().toISOString(),
          },
        });
        return;
      }

      if (pathname === '/api/auth/sign-in' && req.method === 'POST') {
        const body = await readJsonBody(req);
        assert(body?.email === 'member@example.com', `Unexpected sign-in email: ${body?.email}`);
        signInCount += 1;
        requests.push({ path: pathname, method: req.method, ordinal: signInCount });
        sendJson(res, 200, {
          ok: true,
          data: {
            status: 'authenticated',
            session: {
              accessToken: MEMBER_ACCESS,
              refreshToken: 'refresh-browser-member-wins',
              expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
              tokenType: 'bearer',
              user: {
                id: 'auth-user-browser-member-wins',
                email: 'member@example.com',
              },
            },
          },
          meta: {
            apiContractVersion: 'browser-auth-member-wins-v1',
            requestId: `member-wins-sign-in-${signInCount}`,
            serverTime: new Date().toISOString(),
          },
        });
        return;
      }

      if (pathname.startsWith('/api/')) {
        sendJson(res, 404, { ok: false, error: { code: 'NOT_FOUND' } });
        return;
      }

      if (pathname === '/') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end('<!doctype html><html><body><main id="ready">Guest bootstrap single-flight harness</main></body></html>');
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
      if (!isNavigationContextError(error)) throw error;
    }
    await sleep(50);
  }
  throw new Error('Timed out waiting for single-flight browser harness');
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

await stat(join(root, 'product-auth.js'));
const productAuthSource = await readFile(join(root, 'product-auth.js'), 'utf8');
assert(productAuthSource.includes('let guestBootstrapInFlight = null;'), 'product-auth.js does not declare Guest bootstrap single-flight state');
assert(productAuthSource.includes('guestBootstrapInFlight ??='), 'product-auth.js does not share concurrent Guest bootstrap requests');
assert(productAuthSource.includes('const racedExisting = readGuestBearer();'), 'product-auth.js does not preserve newer Guest authority before bootstrap write');
assert(productAuthSource.includes('if (readMemberSession()) return null;'), 'product-auth.js does not let Member authority suppress a late Guest bootstrap write');
assert(productAuthSource.includes('const converged = await getActiveBearer();'), 'product-auth.js does not re-resolve active identity after Guest bootstrap');

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-auth-guest-bootstrap-singleflight-browser-'));
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

  const authority = await client.evaluate(`(async () => {
    sessionStorage.removeItem('myeongha.guestBearer.v1');
    sessionStorage.removeItem('myeongha.pendingGuestBearer.v1');
    localStorage.removeItem('myeongha.memberSession.v1');
    let changedEvents = 0;
    addEventListener('myeongha:auth-changed', () => { changedEvents += 1; });
    const auth = await import('/product-auth.js?singleflight=' + Date.now());
    const [first, active, third] = await Promise.all([
      auth.ensureGuestBearer(),
      auth.ensureActiveBearer(),
      auth.ensureGuestBearer(),
    ]);
    return {
      first,
      active,
      third,
      stored: sessionStorage.getItem(auth.PRODUCT_AUTH_STORAGE_V1.guestBearer),
      pending: sessionStorage.getItem(auth.PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer),
      member: localStorage.getItem(auth.PRODUCT_AUTH_STORAGE_V1.memberSession),
      changedEvents,
      readyState: document.readyState,
    };
  })()`);

  assert(requests.length === 1, `Expected exactly one Guest bootstrap request, got ${JSON.stringify(requests)}`);
  assert(authority.readyState === 'complete', `Browser harness was not complete: ${authority.readyState}`);
  assert(authority.first === 'guest-browser-single-flight-1', `Unexpected direct Guest bearer: ${authority.first}`);
  assert(authority.third === authority.first, 'Concurrent ensureGuestBearer callers diverged');
  assert(authority.active?.kind === 'guest', `Concurrent active bearer kind diverged: ${JSON.stringify(authority.active)}`);
  assert(authority.active?.token === authority.first, 'ensureActiveBearer did not converge on the shared Guest bearer');
  assert(authority.stored === authority.first, 'Stored Guest bearer did not match the shared result');
  assert(authority.pending === null, 'Single-flight bootstrap unexpectedly created a pending Guest bearer');
  assert(authority.member === null, 'Single-flight Guest bootstrap unexpectedly created a Member session');
  assert(authority.changedEvents === 1, `Expected one auth-changed event, got ${authority.changedEvents}`);

  const memberWins = await client.evaluate(`(async () => {
    sessionStorage.removeItem('myeongha.guestBearer.v1');
    sessionStorage.removeItem('myeongha.pendingGuestBearer.v1');
    localStorage.removeItem('myeongha.memberSession.v1');
    let changedEvents = 0;
    addEventListener('myeongha:auth-changed', () => { changedEvents += 1; });
    const auth = await import('/product-auth.js?memberwins=' + Date.now());
    const originalFetch = globalThis.fetch.bind(globalThis);
    let markBootstrapStarted;
    const bootstrapStarted = new Promise((resolve) => { markBootstrapStarted = resolve; });
    globalThis.fetch = (input, init) => {
      if (String(input) === '/api/session/bootstrap') markBootstrapStarted();
      return originalFetch(input, init);
    };
    try {
      const pendingActive = auth.ensureActiveBearer();
      await bootstrapStarted;
      const signedIn = await auth.signInWithPassword('member@example.com', 'password');
      const active = await pendingActive;
      return {
        signedIn: signedIn.accessToken,
        active,
        stored: sessionStorage.getItem(auth.PRODUCT_AUTH_STORAGE_V1.guestBearer),
        pending: sessionStorage.getItem(auth.PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer),
        guest: auth.readGuestBearer(),
        member: auth.readMemberSession()?.accessToken ?? null,
        changedEvents,
        readyState: document.readyState,
      };
    } finally {
      globalThis.fetch = originalFetch;
    }
  })()`);

  assert(bootstrapCount === 2, `Member-wins scenario should add exactly one bootstrap request, got ${bootstrapCount}`);
  assert(signInCount === 1, `Member-wins scenario should issue exactly one sign-in request, got ${signInCount}`);
  assert(memberWins.readyState === 'complete', `Member-wins harness was not complete: ${memberWins.readyState}`);
  assert(memberWins.signedIn === MEMBER_ACCESS, `Unexpected signed-in Member bearer: ${memberWins.signedIn}`);
  assert(memberWins.active?.kind === 'member', `Late Guest bootstrap won active identity: ${JSON.stringify(memberWins.active)}`);
  assert(memberWins.active?.token === MEMBER_ACCESS, `Active identity did not converge to Member: ${JSON.stringify(memberWins.active)}`);
  assert(memberWins.member === MEMBER_ACCESS, `Member storage lost authority: ${memberWins.member}`);
  assert(memberWins.guest === null, `Late Guest bootstrap remained authoritative: ${memberWins.guest}`);
  assert(memberWins.stored === MEMBER_ACCESS, `Late Guest bootstrap overwrote compatibility bearer: ${memberWins.stored}`);
  assert(memberWins.pending === null, `Late Guest bootstrap unexpectedly created pending Guest state: ${memberWins.pending}`);
  assert(memberWins.changedEvents === 1, `Late Guest bootstrap emitted an extra auth change: ${memberWins.changedEvents}`);

  await mkdir(join(process.cwd(), 'artifacts'), { recursive: true });
  await writeFile(join(process.cwd(), 'artifacts', 'web-auth-guest-bootstrap-singleflight-browser-smoke.json'), `${JSON.stringify({
    status: 'PASS',
    bootstrapRequests: bootstrapCount,
    signInRequests: signInCount,
    convergedBearer: authority.first,
    changedEvents: authority.changedEvents,
    memberWins,
    requests,
  }, null, 2)}\n`, 'utf8');

  console.log('MyeongHa_WEB_AUTH_GUEST_BOOTSTRAP_SINGLEFLIGHT_BROWSER_PASS');
  console.log('MyeongHa_WEB_AUTH_MEMBER_WINS_GUEST_BOOTSTRAP_BROWSER_PASS');
} catch (error) {
  console.error(error);
  if (chromeError.trim()) console.error(chromeError.trim());
  process.exitCode = 1;
} finally {
  client?.close();
  await stopChrome(chrome);
  await new Promise((done) => server.close(done));
  await rm(profile, { recursive: true, force: true });
}
