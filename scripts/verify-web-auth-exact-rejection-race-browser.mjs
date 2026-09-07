import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
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

for (const file of [
  'hall.html',
  'product-theme.js',
  'product-auth-ui.js',
  'product-auth.js',
  'my-runtime-client.js',
  'birth-runtime-client.js',
  'api-envelope.js',
]) {
  await stat(join(root, file));
}

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-auth-exact-rejection-race-browser-'));
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
  await navigate(client, origin, '/hall.html', '.product-profile');

  const result = await client.evaluate(`(async () => {
    const auth = await import('/product-auth.js');
    const { createMyRuntimeClient } = await import('/my-runtime-client.js');
    const { createBirthRuntimeClient } = await import('/birth-runtime-client.js');
    const keys = auth.PRODUCT_AUTH_STORAGE_V1;
    const oldMember = {
      accessToken: 'old.header.signature',
      refreshToken: 'old-refresh-token',
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
      tokenType: 'bearer',
      user: { id: '11111111-1111-4111-8111-111111111111', email: 'member@example.com' },
    };
    const rotatedMember = {
      ...oldMember,
      accessToken: 'rotated.header.signature',
      refreshToken: 'rotated-refresh-token',
      expiresAt: '2099-01-02T00:00:00.000Z',
    };
    const staleRefreshResult = {
      ...oldMember,
      accessToken: 'stale.header.signature',
      refreshToken: 'stale-refresh-token',
      expiresAt: '2099-01-03T00:00:00.000Z',
    };
    const seedMember = (session, pendingGuest = null) => {
      localStorage.setItem(keys.memberSession, JSON.stringify(session));
      sessionStorage.setItem(keys.guestBearer, session.accessToken);
      if (pendingGuest === null) sessionStorage.removeItem(keys.pendingGuestBearer);
      else sessionStorage.setItem(keys.pendingGuestBearer, pendingGuest);
    };
    const storedMember = () => JSON.parse(localStorage.getItem(keys.memberSession) ?? 'null');
    const authError = (code, status) => Response.json({
      ok: false,
      error: { code, messageKey: 'auth.required', retryable: false },
    }, { status });

    seedMember(oldMember);
    const myClient = createMyRuntimeClient({
      resolveBearer: async () => ({ kind: 'member', token: oldMember.accessToken }),
      fetchImpl: async () => {
        seedMember(rotatedMember);
        return authError('AUTH_REQUIRED', 401);
      },
    });
    let member401Code = null;
    try { await myClient.readProfile(); } catch (error) { member401Code = error?.code ?? null; }
    const memberAfterStale401 = storedMember();

    localStorage.removeItem(keys.memberSession);
    sessionStorage.removeItem(keys.pendingGuestBearer);
    sessionStorage.setItem(keys.guestBearer, 'old-opaque-guest');
    const birthClient = createBirthRuntimeClient({
      resolveBearer: async () => ({ kind: 'guest', token: 'old-opaque-guest' }),
      fetchImpl: async () => {
        sessionStorage.setItem(keys.guestBearer, 'replacement-opaque-guest');
        return authError('AUTH_REQUIRED', 401);
      },
    });
    let guest401Code = null;
    try { await birthClient.readCurrentBirthProfile(); } catch (error) { guest401Code = error?.code ?? null; }
    const guestAfterStale401 = sessionStorage.getItem(keys.guestBearer);

    const originalFetch = globalThis.fetch;
    seedMember(oldMember, 'guest-before-member');
    globalThis.fetch = async () => {
      seedMember(rotatedMember, 'guest-before-member');
      return authError('SESSION_EXPIRED', 401);
    };
    let staleRefresh401Code = null;
    try { await auth.refreshMemberSession(); } catch (error) { staleRefresh401Code = error?.code ?? null; }
    const memberAfterStaleRefresh401 = storedMember();

    seedMember(oldMember, 'guest-before-member');
    globalThis.fetch = async () => {
      seedMember(rotatedMember, 'guest-before-member');
      return Response.json({
        ok: true,
        data: { status: 'authenticated', session: staleRefreshResult },
      });
    };
    const staleSuccessResult = await auth.refreshMemberSession();
    const memberAfterStaleRefreshSuccess = storedMember();

    seedMember(oldMember, 'guest-before-member');
    globalThis.fetch = async () => {
      auth.invalidateMemberSession(oldMember.accessToken);
      throw new Error('offline');
    };
    let signoutWinsCode = null;
    try { await auth.getMemberAccessToken(); } catch (error) { signoutWinsCode = error?.code ?? null; }
    const memberAfterSignoutWins = storedMember();
    const activeAfterSignoutWins = sessionStorage.getItem(keys.guestBearer);
    const pendingAfterSignoutWins = sessionStorage.getItem(keys.pendingGuestBearer);
    globalThis.fetch = originalFetch;

    return {
      member401Code,
      memberAfterStale401,
      guest401Code,
      guestAfterStale401,
      staleRefresh401Code,
      memberAfterStaleRefresh401,
      staleSuccessResult,
      memberAfterStaleRefreshSuccess,
      signoutWinsCode,
      memberAfterSignoutWins,
      activeAfterSignoutWins,
      pendingAfterSignoutWins,
    };
  })()`);

  assert(result?.member401Code === 'WEB_MY_SESSION_REQUIRED', `Member stale 401 did not reach My session boundary: ${JSON.stringify(result)}`);
  assert(result?.memberAfterStale401?.accessToken === 'rotated.header.signature', `Stale Member 401 deleted rotated credential: ${JSON.stringify(result)}`);
  assert(result?.memberAfterStale401?.refreshToken === 'rotated-refresh-token', `Stale Member 401 changed rotated refresh token: ${JSON.stringify(result)}`);
  assert(result?.guest401Code === 'WEB_BIRTH_SESSION_REQUIRED', `Guest stale 401 did not reach Birth session boundary: ${JSON.stringify(result)}`);
  assert(result?.guestAfterStale401 === 'replacement-opaque-guest', `Stale Guest 401 deleted replacement Guest: ${JSON.stringify(result)}`);
  assert(result?.staleRefresh401Code === 'SESSION_EXPIRED', `Stale refresh rejection did not preserve error authority: ${JSON.stringify(result)}`);
  assert(result?.memberAfterStaleRefresh401?.accessToken === 'rotated.header.signature', `Stale refresh 401 deleted rotated Member: ${JSON.stringify(result)}`);
  assert(result?.staleSuccessResult?.accessToken === 'rotated.header.signature', `Stale refresh success returned stale credentials: ${JSON.stringify(result)}`);
  assert(result?.memberAfterStaleRefreshSuccess?.accessToken === 'rotated.header.signature', `Stale refresh success overwrote rotated Member: ${JSON.stringify(result)}`);
  assert(result?.signoutWinsCode === 'WEB_AUTH_NETWORK_FAILED', `Transient refresh race returned unexpected error: ${JSON.stringify(result)}`);
  assert(result?.memberAfterSignoutWins === null, `Transient refresh resurrected signed-out Member: ${JSON.stringify(result)}`);
  assert(result?.activeAfterSignoutWins === 'guest-before-member', `Sign-out race did not restore pending Guest: ${JSON.stringify(result)}`);
  assert(result?.pendingAfterSignoutWins === null, `Sign-out race retained pending Guest slot: ${JSON.stringify(result)}`);

  const artifactDir = resolve(process.cwd(), 'artifacts');
  await mkdir(artifactDir, { recursive: true });
  await writeFile(join(artifactDir, 'web-auth-exact-rejection-race-browser-smoke.json'), `${JSON.stringify({
    status: 'MyeongHa_WEB_AUTH_EXACT_REJECTION_RACE_BROWSER_PASS',
    result,
  }, null, 2)}\n`);

  console.log('MyeongHa_WEB_AUTH_EXACT_REJECTION_RACE_BROWSER_PASS');
} catch (error) {
  console.error(error);
  if (chromeError.trim()) console.error(chromeError.trim());
  process.exitCode = 1;
} finally {
  client?.close();
  chrome.kill('SIGTERM');
  await Promise.race([
    new Promise((done) => chrome.once('exit', done)),
    sleep(1_000),
  ]);
  await new Promise((done) => server.close(done));
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}