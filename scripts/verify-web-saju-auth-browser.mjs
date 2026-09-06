import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const member = Object.freeze({
  id: '33333333-3333-4333-8333-333333333333',
  email: 'saju-member@example.com',
  accessToken: 'saju-member.payload.signature',
});
const initiallyStaleJwt = 'stale-member.payload.signature';
const guestTokens = Object.freeze([
  'saju-browser-guest-token-1',
  'saju-browser-guest-token-2',
]);
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
let requestNo = 0;
let bootstrapCount = 0;

function successEnvelope(data) {
  requestNo += 1;
  return {
    ok: true,
    data,
    meta: {
      apiContractVersion: 'saju-browser-auth-v2',
      requestId: `saju-browser-${requestNo}`,
      serverTime: '2026-09-06T00:00:00.000Z',
    },
  };
}

function errorEnvelope(code, messageKey = 'not_found') {
  requestNo += 1;
  return {
    ok: false,
    error: { code, messageKey, retryable: false },
    meta: {
      apiContractVersion: 'saju-browser-auth-v2',
      requestId: `saju-browser-${requestNo}`,
      serverTime: '2026-09-06T00:00:00.000Z',
    },
  };
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const pathname = decodeURIComponent(url.pathname);
      const authorization = req.headers.authorization ?? null;

      if (pathname === '/api/session/bootstrap' && req.method === 'POST') {
        requests.push({ path: pathname, method: req.method, authorization });
        const token = guestTokens[Math.min(bootstrapCount, guestTokens.length - 1)];
        bootstrapCount += 1;
        sendJson(res, 200, successEnvelope({
          kind: 'guest',
          guestSession: { bearerToken: token },
        }));
        return;
      }

      if (pathname === '/api/birth-profiles' && req.method === 'POST') {
        requests.push({ path: pathname, method: req.method, authorization });
        if (!guestTokens.some((token) => authorization === `Bearer ${token}`)) {
          sendJson(res, 401, errorEnvelope('AUTH_REQUIRED', 'auth.required'));
          return;
        }
        sendJson(res, 200, successEnvelope({
          birthProfileId: '44444444-4444-4444-8444-444444444444',
        }));
        return;
      }

      if (pathname === '/api/me/saju/calculation' && req.method === 'POST') {
        requests.push({ path: pathname, method: req.method, authorization });
        if (authorization === `Bearer ${member.accessToken}`) {
          sendJson(res, 404, errorEnvelope('NOT_FOUND'));
          return;
        }
        if (authorization === `Bearer ${guestTokens[0]}`) {
          sendJson(res, 401, errorEnvelope('AUTH_REQUIRED', 'auth.required'));
          return;
        }
        if (authorization === `Bearer ${guestTokens[1]}`) {
          sendJson(res, 404, errorEnvelope('NOT_FOUND'));
          return;
        }
        sendJson(res, 401, errorEnvelope('AUTH_REQUIRED', 'auth.required'));
        return;
      }

      if (pathname.startsWith('/api/')) {
        requests.push({ path: pathname, method: req.method, authorization });
        sendJson(res, 404, errorEnvelope('NOT_FOUND'));
        return;
      }

      const staticPath = pathname === '/' ? '/auth.html' : pathname;
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
  assert(address && typeof address === 'object', 'Saju browser server address unavailable');
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

async function waitFor(client, expression, message, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return;
    await sleep(50);
  }
  const diagnostics = await client.evaluate(`(() => ({
    pathname: location.pathname,
    readyState: document.readyState,
    emptyHidden: document.querySelector('#saju-empty')?.hidden ?? null,
    formError: document.querySelector('#saju-form-error')?.textContent?.trim() ?? null,
    memberSession: localStorage.getItem('myeongha.memberSession.v1'),
    activeBearer: sessionStorage.getItem('myeongha.guestBearer.v1'),
    pendingBearer: sessionStorage.getItem('myeongha.pendingGuestBearer.v1'),
  }))()`);
  throw new Error(`${message}; diagnostics=${JSON.stringify(diagnostics)}; requests=${JSON.stringify(requests)}`);
}

async function waitForRequest(predicate, message, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const index = requests.findIndex(predicate);
    if (index >= 0) return { request: requests[index], index };
    await sleep(50);
  }
  throw new Error(`${message}; requests=${JSON.stringify(requests)}`);
}

async function submitBirthForm(client) {
  await waitFor(
    client,
    `document.readyState === 'complete' && Boolean(document.querySelector('#saju-birth-form')) && !document.querySelector('#saju-create-button')?.disabled`,
    'Saju Birth form was not ready to submit',
  );
  await client.evaluate(`(() => {
    document.querySelector('#saju-birth-year').value = '1996';
    document.querySelector('#saju-birth-month').value = '01';
    document.querySelector('#saju-birth-day').value = '09';
    const unknown = document.querySelector('#saju-time-unknown');
    unknown.checked = true;
    unknown.dispatchEvent(new Event('change', { bubbles: true }));
    const sex = document.querySelector('#saju-birth-sex');
    if (sex) sex.value = 'male';
    document.querySelector('#saju-birth-form').requestSubmit();
  })()`);
}

for (const file of ['auth.html', 'reading.html', 'saju-hub.js', 'product-auth.js']) {
  await stat(join(root, file));
}

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-saju-auth-browser-'));
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
  await navigate(client, origin, '/auth.html', '#auth-form');

  await client.evaluate(`(() => {
    localStorage.setItem('myeongha.memberSession.v1', JSON.stringify({
      accessToken: ${JSON.stringify(member.accessToken)},
      refreshToken: 'saju-refresh-token',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      tokenType: 'bearer',
      user: { id: ${JSON.stringify(member.id)}, email: ${JSON.stringify(member.email)} },
    }));
    sessionStorage.setItem('myeongha.guestBearer.v1', ${JSON.stringify(initiallyStaleJwt)});
  })()`);

  await navigate(client, origin, '/reading.html', '#saju-birth-form');
  const memberCalculation = await waitForRequest(
    (request) => request.path === '/api/me/saju/calculation',
    'Saju did not attempt Member calculation',
  );
  assert(
    memberCalculation.request.authorization === `Bearer ${member.accessToken}`,
    `Saju used stale sessionStorage JWT instead of Member authority; requests=${JSON.stringify(requests)}`,
  );

  const stagedMemberBearer = await client.evaluate(`sessionStorage.getItem('myeongha.guestBearer.v1')`);
  assert(stagedMemberBearer === member.accessToken, 'Saju did not restage the canonical Member bearer through product-auth');

  await client.evaluate(`localStorage.removeItem('myeongha.memberSession.v1')`);
  const requestCountBeforeCrossTabReload = requests.length;
  await navigate(client, origin, '/reading.html', '#saju-birth-form');
  await waitFor(client, `document.querySelector('#saju-empty')?.hidden === false`, 'Signed-out Saju did not settle into the empty state');
  await sleep(250);

  const reloadRequests = requests.slice(requestCountBeforeCrossTabReload);
  const orphanedMemberReuse = reloadRequests.find((request) =>
    request.authorization === `Bearer ${member.accessToken}` ||
    request.authorization === `Bearer ${initiallyStaleJwt}`
  );
  assert(!orphanedMemberReuse, `Saju reused an orphaned Member JWT after local Member removal; requests=${JSON.stringify(reloadRequests)}`);

  await submitBirthForm(client);
  const firstBootstrap = await waitForRequest(
    (request) => request.path === '/api/session/bootstrap',
    'Saju did not bootstrap first fresh Guest',
  );
  assert(firstBootstrap.request.authorization === null, `First Guest bootstrap carried stale Authorization: ${firstBootstrap.request.authorization}`);

  const firstCreate = await waitForRequest(
    (request) => request.path === '/api/birth-profiles' && request.authorization === `Bearer ${guestTokens[0]}`,
    'Saju did not create Birth Profile with Guest1',
  );
  const firstGuestCalculation = await waitForRequest(
    (request) => request.path === '/api/me/saju/calculation' && request.authorization === `Bearer ${guestTokens[0]}`,
    'Saju did not calculate with Guest1',
  );
  assert(firstGuestCalculation.index > firstCreate.index, 'Guest1 calculation did not follow Guest1 Birth create');

  await waitFor(
    client,
    `sessionStorage.getItem('myeongha.guestBearer.v1') === null && sessionStorage.getItem('myeongha.pendingGuestBearer.v1') === null`,
    'Guest1 AUTH_REQUIRED did not invalidate Guest credentials',
  );

  const requestCountAfterGuest1Rejection = requests.length;
  await submitBirthForm(client);

  const secondBootstrap = await waitForRequest(
    (request, index) => index >= requestCountAfterGuest1Rejection && request.path === '/api/session/bootstrap',
    'Saju did not bootstrap Guest2 after Guest1 rejection',
  );
  assert(secondBootstrap.request.authorization === null, `Second Guest bootstrap carried rejected Guest1 Authorization: ${secondBootstrap.request.authorization}`);

  const secondCreate = await waitForRequest(
    (request, index) => index >= requestCountAfterGuest1Rejection && request.path === '/api/birth-profiles' && request.authorization === `Bearer ${guestTokens[1]}`,
    'Saju did not create Birth Profile with Guest2',
  );
  const secondCalculation = await waitForRequest(
    (request, index) => index >= requestCountAfterGuest1Rejection && request.path === '/api/me/saju/calculation' && request.authorization === `Bearer ${guestTokens[1]}`,
    'Saju did not calculate with Guest2',
  );
  assert(secondCalculation.index > secondCreate.index, 'Guest2 calculation did not follow Guest2 Birth create');

  const afterGuest1Rejection = requests.slice(requestCountAfterGuest1Rejection);
  const rejectedGuestReuse = afterGuest1Rejection.find((request) => request.authorization === `Bearer ${guestTokens[0]}`);
  assert(!rejectedGuestReuse, `Rejected Guest1 bearer was reused after canonical 401; requests=${JSON.stringify(afterGuest1Rejection)}`);

  const finalBearer = await client.evaluate(`sessionStorage.getItem('myeongha.guestBearer.v1')`);
  assert(finalBearer === guestTokens[1], 'Guest2 did not become the final active Guest bearer');
  assert(bootstrapCount === 2, `Expected exactly two Guest bootstraps, received ${bootstrapCount}`);

  const artifactDir = resolve(process.cwd(), 'artifacts');
  await mkdir(artifactDir, { recursive: true });
  await writeFile(join(artifactDir, 'web-saju-auth-browser-smoke.json'), `${JSON.stringify({
    memberBearerUsed: true,
    orphanedMemberBearerRejected: !orphanedMemberReuse,
    firstGuestRejected: true,
    firstGuestCredentialsCleared: true,
    secondBootstrapAuthorization: secondBootstrap.request.authorization,
    rejectedGuestReused: Boolean(rejectedGuestReuse),
    bootstrapCount,
    finalBearer,
  }, null, 2)}\n`);

  console.log('MyeongHa_WEB_SAJU_AUTH_BROWSER_PASS');
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
