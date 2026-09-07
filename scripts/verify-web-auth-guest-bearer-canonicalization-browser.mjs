import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const handoffKey = 'myeongha.pendingGuestConfirmation.v1';
const memberKey = 'myeongha.memberSession.v1';
const activeBearerKey = 'myeongha.guestBearer.v1';
const pendingGuestKey = 'myeongha.pendingGuestBearer.v1';
const validGuest = `myeongha_guest_v1_${'A'.repeat(43)}`;
const identity = Object.freeze({
  id: '66666666-6666-4666-8666-666666666666',
  email: 'guest-bearer-canonicalization@example.com',
  password: 'browser-password-12345',
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
const requests = [];
let scenario = 'stale-storage-whitespace';
let apiRequestCount = 0;
let signInCount = 0;

function sessionFor(attempt) {
  return {
    accessToken: `canonical${attempt}.member.signature`,
    refreshToken: `canonical-refresh-${attempt}`,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    tokenType: 'bearer',
    user: { id: identity.id, email: identity.email },
  };
}

function envelope(data) {
  apiRequestCount += 1;
  return {
    ok: true,
    data,
    meta: {
      apiContractVersion: 'browser-auth-guest-bearer-canonicalization-v1',
      requestId: `web-auth-guest-bearer-canonicalization-${apiRequestCount}`,
      serverTime: '2026-09-07T09:00:00.000Z',
    },
  };
}

function errorEnvelope(code) {
  apiRequestCount += 1;
  return {
    ok: false,
    error: { code, messageKey: `auth.${code.toLowerCase()}`, retryable: false },
    meta: {
      apiContractVersion: 'browser-auth-guest-bearer-canonicalization-v1',
      requestId: `web-auth-guest-bearer-canonicalization-${apiRequestCount}`,
      serverTime: '2026-09-07T09:00:00.000Z',
    },
  };
}

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
      const authorization = req.headers.authorization ?? null;

      if (pathname === '/api/auth/sign-in' && req.method === 'POST') {
        const body = await readJsonBody(req);
        assert(body.email === identity.email && body.password === identity.password, 'Unexpected sign-in credentials');
        signInCount += 1;
        const session = sessionFor(signInCount);
        requests.push({ scenario, path: pathname, authorization });
        sendJson(res, 200, envelope({ status: 'authenticated', session }));
        return;
      }

      if (pathname === '/api/auth/promote-guest' && req.method === 'POST') {
        const promotedGuest = req.headers['x-myeongha-guest-bearer'] ?? null;
        requests.push({ scenario, path: pathname, authorization, promotedGuest });
        if (scenario !== 'stale-storage-whitespace') {
          sendJson(res, 500, errorEnvelope('UNEXPECTED_PROMOTION'));
          return;
        }
        const expectedMember = sessionFor(signInCount);
        assert(authorization === `Bearer ${expectedMember.accessToken}`, 'Canonicalization promotion used unexpected Member bearer');
        assert(promotedGuest === validGuest, `Canonicalization promotion used ${promotedGuest} instead of the valid confirmation handoff`);
        sendJson(res, 200, envelope({ status: 'promoted' }));
        return;
      }

      if (pathname.startsWith('/api/')) {
        sendJson(res, 404, errorEnvelope('NOT_FOUND'));
        return;
      }

      const staticPath = pathname === '/' ? '/hall.html' : pathname;
      const relative = normalize(staticPath).replace(/^[/\\]+/, '');
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

async function navigate(client, origin, pathname, selector, timeout = 10_000) {
  const result = await client.send('Page.navigate', { url: `${origin}${pathname}` });
  assert(!result.errorText, `Navigation failed for ${pathname}: ${result.errorText}`);
  const cleanPath = pathname.split(/[?#]/)[0];
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

async function waitFor(client, expression, message, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return;
    await sleep(50);
  }
  const diagnostics = await client.evaluate(`(() => ({
    pathname: location.pathname,
    status: document.querySelector('#auth-status')?.textContent?.trim() ?? null,
    member: localStorage.getItem(${JSON.stringify(memberKey)}),
    handoff: localStorage.getItem(${JSON.stringify(handoffKey)}),
    active: sessionStorage.getItem(${JSON.stringify(activeBearerKey)}),
    pending: sessionStorage.getItem(${JSON.stringify(pendingGuestKey)}),
  }))()`);
  throw new Error(`${message}; diagnostics=${JSON.stringify(diagnostics)}; requests=${JSON.stringify(requests)}`);
}

function validHandoff(expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()) {
  return JSON.stringify({
    version: 2,
    entries: [{ guestBearer: validGuest, email: identity.email, expiresAt }],
  });
}

async function prepareScenario(client, origin, nextScenario, { handoffRaw = null, activeRaw = null, pendingRaw = null } = {}) {
  scenario = nextScenario;
  await navigate(client, origin, '/auth.html?next=hall.html', '#auth-form');
  await client.evaluate(`(() => {
    localStorage.removeItem(${JSON.stringify(memberKey)});
    localStorage.removeItem(${JSON.stringify(handoffKey)});
    sessionStorage.removeItem(${JSON.stringify(activeBearerKey)});
    sessionStorage.removeItem(${JSON.stringify(pendingGuestKey)});
    ${handoffRaw !== null ? `localStorage.setItem(${JSON.stringify(handoffKey)}, ${JSON.stringify(handoffRaw)});` : ''}
    ${activeRaw !== null ? `sessionStorage.setItem(${JSON.stringify(activeBearerKey)}, ${JSON.stringify(activeRaw)});` : ''}
    ${pendingRaw !== null ? `sessionStorage.setItem(${JSON.stringify(pendingGuestKey)}, ${JSON.stringify(pendingRaw)});` : ''}
  })()`);
}

async function submitSignIn(client) {
  await client.evaluate(`(() => {
    document.querySelector('#auth-email').value = ${JSON.stringify(identity.email)};
    document.querySelector('#auth-password').value = ${JSON.stringify(identity.password)};
    document.querySelector('#auth-form').requestSubmit();
  })()`);
}

async function readAuthority(client) {
  return client.evaluate(`(() => ({
    member: JSON.parse(localStorage.getItem(${JSON.stringify(memberKey)}) ?? 'null'),
    handoff: localStorage.getItem(${JSON.stringify(handoffKey)}),
    active: sessionStorage.getItem(${JSON.stringify(activeBearerKey)}),
    pending: sessionStorage.getItem(${JSON.stringify(pendingGuestKey)}),
  }))()`);
}

for (const file of ['auth.html', 'auth-page.js', 'product-auth.js', 'product-auth-ui.js', 'hall.html']) {
  await stat(join(root, file));
}

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-auth-guest-bearer-canonicalization-browser-'));
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

  await prepareScenario(client, origin, 'stale-storage-whitespace', {
    handoffRaw: validHandoff(),
    activeRaw: '   ',
    pendingRaw: '\t',
  });
  await submitSignIn(client);
  await waitFor(client, `location.pathname === '/hall.html'`, 'Whitespace storage scenario did not finish Member login');
  const staleStorage = await readAuthority(client);
  assert(staleStorage.member?.user?.id === identity.id, 'Whitespace storage scenario lost Member identity');
  assert(staleStorage.handoff === null, 'Valid confirmation handoff was not consumed after invalid storage was discarded');
  assert(staleStorage.pending === null, 'Whitespace pending Guest bearer survived canonicalization');
  assert(staleStorage.active === sessionFor(1).accessToken, 'Member bearer was not authoritative after whitespace storage cleanup');

  const afterFallbackPromotionCount = requests.filter((request) => request.path === '/api/auth/promote-guest').length;
  assert(afterFallbackPromotionCount === 1, `Expected one valid fallback promotion, got ${afterFallbackPromotionCount}`);

  await prepareScenario(client, origin, 'whitespace-handoff', {
    handoffRaw: JSON.stringify({
      version: 2,
      entries: [{
        guestBearer: '   ',
        email: identity.email,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }],
    }),
  });
  await submitSignIn(client);
  await waitFor(client, `location.pathname === '/hall.html'`, 'Whitespace handoff scenario did not finish Member login');
  const whitespaceHandoff = await readAuthority(client);
  assert(whitespaceHandoff.member?.user?.id === identity.id, 'Whitespace handoff scenario lost Member identity');
  assert(whitespaceHandoff.handoff === null, 'Whitespace confirmation handoff was not removed');
  assert(requests.filter((request) => request.path === '/api/auth/promote-guest').length === 1, 'Whitespace confirmation handoff triggered promotion');

  await prepareScenario(client, origin, 'malformed-handoff', { handoffRaw: '{not-json' });
  await submitSignIn(client);
  await waitFor(client, `location.pathname === '/hall.html'`, 'Malformed handoff scenario did not finish Member login');
  const malformedHandoff = await readAuthority(client);
  assert(malformedHandoff.member?.user?.id === identity.id, 'Malformed handoff scenario lost Member identity');
  assert(malformedHandoff.handoff === null, 'Malformed confirmation handoff was not removed');
  assert(requests.filter((request) => request.path === '/api/auth/promote-guest').length === 1, 'Malformed confirmation handoff triggered promotion');

  await prepareScenario(client, origin, 'expired-handoff', {
    handoffRaw: validHandoff(new Date(Date.now() - 60 * 60 * 1000).toISOString()),
  });
  await submitSignIn(client);
  await waitFor(client, `location.pathname === '/hall.html'`, 'Expired handoff scenario did not finish Member login');
  const expiredHandoff = await readAuthority(client);
  assert(expiredHandoff.member?.user?.id === identity.id, 'Expired handoff scenario lost Member identity');
  assert(expiredHandoff.handoff === null, 'Expired confirmation handoff was not removed');
  assert(requests.filter((request) => request.path === '/api/auth/promote-guest').length === 1, 'Expired confirmation handoff triggered promotion');

  const promotions = requests.filter((request) => request.path === '/api/auth/promote-guest');
  assert(promotions.length === 1, `Expected exactly one promotion request, got ${promotions.length}`);
  assert(promotions[0].scenario === 'stale-storage-whitespace', 'Only the valid handoff fallback should have promoted');
  assert(promotions[0].promotedGuest === validGuest, 'Valid handoff fallback did not preserve the exact Guest bearer');

  await mkdir(join(process.cwd(), 'artifacts'), { recursive: true });
  await writeFile(join(process.cwd(), 'artifacts', 'web-auth-guest-bearer-canonicalization-browser-smoke.json'), `${JSON.stringify({
    status: 'PASS',
    staleStorageWhitespace: { invalidStorageDiscarded: true, validHandoffPromoted: true },
    whitespaceHandoff: { removed: true, promotionSuppressed: true },
    malformedHandoff: { removed: true, promotionSuppressed: true },
    expiredHandoff: { removed: true, promotionSuppressed: true },
    requests,
  }, null, 2)}\n`, 'utf8');

  console.log('MyeongHa_WEB_AUTH_GUEST_BEARER_CANONICALIZATION_BROWSER_PASS');
} catch (error) {
  console.error(error);
  if (chromeError.trim()) console.error(chromeError.trim());
  process.exitCode = 1;
} finally {
  client?.close();
  if (chrome.exitCode === null) chrome.kill('SIGTERM');
  await Promise.race([
    new Promise((done) => chrome.once('exit', done)),
    sleep(2_000),
  ]);
  await new Promise((done) => server.close(done));
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
}
