import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const artifactDir = resolve(process.cwd(), 'artifacts');
const artifactPath = join(artifactDir, 'web-auth-malformed-member-cleanup-failure-browser-smoke.json');
const memberKey = 'myeongha.memberSession.v1';
const activeBearerKey = 'myeongha.guestBearer.v1';
const pendingGuestKey = 'myeongha.pendingGuestBearer.v1';
const changedEvent = 'myeongha:auth-changed';
const stagedGuest = 'guest-before-malformed-cleanup-failure';
const staleMemberJwt = 'stale.member.signature';
const malformedMemberRaw = JSON.stringify({
  accessToken: 'opaque-member-token',
  refreshToken: 'refresh-token',
  expiresAt: '2099-01-01T00:00:00.000Z',
  tokenType: 'bearer',
  user: { id: '11111111-1111-4111-8111-111111111111', email: 'member@example.com' },
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
let functionalPass = false;

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const pathname = decodeURIComponent(url.pathname === '/' ? '/hall.html' : url.pathname);
      if (pathname.startsWith('/api/')) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ ok: false, error: { code: 'UNEXPECTED_API_REQUEST' } }));
        return;
      }
      const relative = normalize(pathname).replace(/^[/\\]+/, '');
      const file = resolve(root, relative);
      assert(file.startsWith(`${root}/`), 'request escaped static root');
      assert((await stat(file)).isFile(), 'not a file');
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
    console.log('MyeongHa malformed Member cleanup failure assertions passed; ignoring ephemeral Chrome profile cleanup ENOTEMPTY race.');
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

async function navigate(client, origin, pathname, selector, timeout = 10_000) {
  const result = await client.send('Page.navigate', { url: `${origin}${pathname}` });
  assert(!result.errorText, `Navigation failed for ${pathname}: ${result.errorText}`);
  const cleanPath = pathname.split(/[?#]/)[0];
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
      if (!isExpectedNavigationRace(error)) throw error;
    }
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${cleanPath} ${selector}`);
}

for (const file of ['hall.html', 'product-auth.js', 'product-auth-ui.js']) {
  await stat(join(root, file));
}
const productAuthSource = await readFile(join(root, 'product-auth.js'), 'utf8');
assert(productAuthSource.includes('parsed = JSON.parse(raw);'), 'readMemberSession does not isolate JSON parsing from cleanup');
assert(productAuthSource.includes('const normalized = normalizeSession(parsed);'), 'readMemberSession does not normalize after parse boundary');

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-auth-malformed-member-cleanup-failure-browser-'));
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

  const failedCleanup = await client.evaluate(`(async () => {
    const auth = await import('/product-auth.js');
    localStorage.setItem(${JSON.stringify(memberKey)}, ${JSON.stringify(malformedMemberRaw)});
    sessionStorage.setItem(${JSON.stringify(activeBearerKey)}, ${JSON.stringify(staleMemberJwt)});
    sessionStorage.setItem(${JSON.stringify(pendingGuestKey)}, ${JSON.stringify(stagedGuest)});
    globalThis.__myeonghaMalformedCleanupEvents = 0;
    addEventListener(${JSON.stringify(changedEvent)}, () => { globalThis.__myeonghaMalformedCleanupEvents += 1; });

    const nativeSetItem = Storage.prototype.setItem;
    const failValues = new Set([${JSON.stringify(stagedGuest)}, ${JSON.stringify(staleMemberJwt)}]);
    Storage.prototype.setItem = function(key, value) {
      const normalized = String(value);
      if (this === sessionStorage && key === ${JSON.stringify(activeBearerKey)} && failValues.delete(normalized)) {
        throw new Error('forced one-shot malformed cleanup compatibility failure');
      }
      return nativeSetItem.call(this, key, value);
    };

    let failure = null;
    try {
      auth.readMemberSession();
    } catch (error) {
      failure = { name: error?.name ?? null, code: error?.code ?? null };
    }
    Storage.prototype.setItem = nativeSetItem;

    return {
      failure,
      member: localStorage.getItem(${JSON.stringify(memberKey)}),
      active: sessionStorage.getItem(${JSON.stringify(activeBearerKey)}),
      pending: sessionStorage.getItem(${JSON.stringify(pendingGuestKey)}),
      guest: auth.readGuestBearer(),
      events: globalThis.__myeonghaMalformedCleanupEvents,
      remainingFaults: failValues.size,
    };
  })()`);

  assert(failedCleanup.failure?.name === 'ProductAuthError', 'Malformed cleanup hard failure was not propagated as ProductAuthError');
  assert(failedCleanup.failure?.code === 'WEB_AUTH_MEMBER_COMPAT_DISCARD_ROLLBACK_FAILED', `Unexpected malformed cleanup error code: ${failedCleanup.failure?.code}`);
  assert(failedCleanup.member === null, 'Malformed Member raw authority was incorrectly restored');
  assert(failedCleanup.active === null, 'Failed compatibility rollback unexpectedly created an active bearer');
  assert(failedCleanup.pending === stagedGuest, 'Pending Guest lineage was lost during malformed cleanup failure');
  assert(failedCleanup.guest === stagedGuest, 'Pending Guest did not remain the fallback Guest authority');
  assert(failedCleanup.events === 0, `Failed malformed cleanup emitted ${failedCleanup.events} auth event(s)`);
  assert(failedCleanup.remainingFaults === 0, 'One-shot failure sequence did not exercise both transition and rollback writes');

  const recovered = await client.evaluate(`(async () => {
    const auth = await import('/product-auth.js');
    const healed = auth.invalidateMemberSession();
    return {
      healed,
      member: localStorage.getItem(${JSON.stringify(memberKey)}),
      active: sessionStorage.getItem(${JSON.stringify(activeBearerKey)}),
      pending: sessionStorage.getItem(${JSON.stringify(pendingGuestKey)}),
      guest: auth.readGuestBearer(),
      events: globalThis.__myeonghaMalformedCleanupEvents,
    };
  })()`);
  assert(recovered.healed === true, 'Healthy retry did not canonicalize compatibility state');
  assert(recovered.member === null, 'Recovery recreated malformed Member authority');
  assert(recovered.active === stagedGuest && recovered.pending === null, 'Recovery did not canonicalize pending Guest to active Guest');
  assert(recovered.guest === stagedGuest, 'Recovered Guest authority is incorrect');
  assert(recovered.events === 1, `Recovery expected one auth event, received ${recovered.events}`);

  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify({
    status: 'MyeongHa_WEB_AUTH_MALFORMED_MEMBER_CLEANUP_FAILURE_BROWSER_PASS',
    failedCleanup,
    recovered,
  }, null, 2)}\n`, 'utf8');
  functionalPass = true;
  console.log('MyeongHa_WEB_AUTH_MALFORMED_MEMBER_CLEANUP_FAILURE_BROWSER_PASS');
} catch (error) {
  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify({
    status: 'MyeongHa_WEB_AUTH_MALFORMED_MEMBER_CLEANUP_FAILURE_BROWSER_FAIL',
    error: error instanceof Error ? error.message : String(error),
    chromeError,
  }, null, 2)}\n`, 'utf8');
  throw error;
} finally {
  client?.close();
  await stopChrome(chrome);
  await new Promise((done) => server.close(done));
  await removeChromeProfile(profile);
}