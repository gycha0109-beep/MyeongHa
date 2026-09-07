import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const guestBearer = 'guest-promotion-failure-retention-token';
const traceKey = 'myeongha.test.promotionStatusTrace';
const memberKey = 'myeongha.memberSession.v1';
const activeBearerKey = 'myeongha.guestBearer.v1';
const pendingGuestKey = 'myeongha.pendingGuestBearer.v1';
const testIdentity = Object.freeze({
  id: '44444444-4444-4444-8444-444444444444',
  email: 'promotion-member@example.com',
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
let apiRequestCount = 0;
let signInCount = 0;
let promotionNetworkAttempts = 0;

function sessionFor(attempt) {
  return {
    accessToken: `promotion${attempt}.member.signature`,
    refreshToken: `promotion-refresh-${attempt}`,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    tokenType: 'bearer',
    user: { id: testIdentity.id, email: testIdentity.email },
  };
}

function successEnvelope(data) {
  apiRequestCount += 1;
  return {
    ok: true,
    data,
    meta: {
      apiContractVersion: 'browser-auth-promotion-failure-v2',
      requestId: `web-auth-promotion-failure-${apiRequestCount}`,
      serverTime: '2026-09-08T00:00:00.000Z',
    },
  };
}

function errorEnvelope(code, messageKey, retryable = false) {
  apiRequestCount += 1;
  return {
    ok: false,
    error: { code, messageKey, retryable },
    meta: {
      apiContractVersion: 'browser-auth-promotion-failure-v2',
      requestId: `web-auth-promotion-failure-${apiRequestCount}`,
      serverTime: '2026-09-08T00:00:00.000Z',
    },
  };
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
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
        const valid = body.email === testIdentity.email && body.password === testIdentity.password;
        if (!valid) {
          sendJson(res, 401, errorEnvelope('INVALID_CREDENTIALS', 'auth.invalid_credentials'));
          return;
        }
        signInCount += 1;
        const session = sessionFor(signInCount);
        requests.push({ path: pathname, outcome: 'success', signInCount, authorization });
        sendJson(res, 200, successEnvelope({ status: 'authenticated', session }));
        return;
      }

      if (pathname === '/api/auth/promote-guest' && req.method === 'POST') {
        const promotedGuest = req.headers['x-myeongha-guest-bearer'] ?? null;
        const expectedSession = sessionFor(signInCount);
        assert(
          authorization === `Bearer ${expectedSession.accessToken}`,
          `Promotion used unexpected Member bearer on login ${signInCount}`,
        );
        assert(
          promotedGuest === guestBearer,
          `Promotion lost the preserved Guest bearer on login ${signInCount}`,
        );

        if (signInCount === 1) {
          promotionNetworkAttempts += 1;
          if (!requests.some((request) => request.path === pathname && request.outcome === 'network')) {
            requests.push({ path: pathname, outcome: 'network', signInCount, authorization, promotedGuest });
          }
          req.socket.destroy();
          return;
        }

        if (signInCount === 2) {
          requests.push({ path: pathname, outcome: 'upstream', signInCount, authorization, promotedGuest });
          sendJson(res, 503, errorEnvelope('AUTH_UPSTREAM_UNAVAILABLE', 'auth.upstream_unavailable', true));
          return;
        }

        if (signInCount === 3) {
          requests.push({ path: pathname, outcome: 'member-rejected', signInCount, authorization, promotedGuest });
          sendJson(res, 401, errorEnvelope('MEMBER_AUTH_REQUIRED', 'auth.member_auth_required'));
          return;
        }

        if (signInCount === 4) {
          requests.push({ path: pathname, outcome: 'guest-rejected', signInCount, authorization, promotedGuest });
          sendJson(res, 401, errorEnvelope('GUEST_AUTH_REQUIRED', 'auth.guest_auth_required'));
          return;
        }

        requests.push({ path: pathname, outcome: 'success', signInCount, authorization, promotedGuest });
        sendJson(res, 200, successEnvelope({ status: 'promoted' }));
        return;
      }

      if (pathname.startsWith('/api/')) {
        sendJson(res, 404, errorEnvelope('NOT_FOUND', 'not_found'));
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
    readyState: document.readyState,
    status: document.querySelector('#auth-status')?.textContent?.trim() ?? null,
    memberSession: localStorage.getItem(${JSON.stringify(memberKey)}),
    activeBearer: sessionStorage.getItem(${JSON.stringify(activeBearerKey)}),
    pendingGuest: sessionStorage.getItem(${JSON.stringify(pendingGuestKey)}),
    trace: sessionStorage.getItem(${JSON.stringify(traceKey)}),
  }))()`);
  throw new Error(`${message}; diagnostics=${JSON.stringify(diagnostics)}; requests=${JSON.stringify(requests)}`);
}

async function prepareAuthAttempt(client) {
  await navigate(client, origin, '/auth.html?next=hall.html', '#auth-form');
  await client.evaluate(`(() => {
    if (document.readyState !== 'complete') throw new Error('Auth document is not complete before attempt setup');
    sessionStorage.setItem(${JSON.stringify(traceKey)}, '[]');
    const status = document.querySelector('#auth-status');
    const record = () => {
      const trace = JSON.parse(sessionStorage.getItem(${JSON.stringify(traceKey)}) ?? '[]');
      trace.push({ text: status?.textContent?.trim() ?? '', className: status?.className ?? '' });
      sessionStorage.setItem(${JSON.stringify(traceKey)}, JSON.stringify(trace));
    };
    record();
    new MutationObserver(record).observe(status, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });
  })()`);
}

async function submitSignIn(client) {
  await client.evaluate(`(() => {
    if (document.readyState !== 'complete') throw new Error('Auth document is not complete before submit');
    document.querySelector('#auth-email').value = ${JSON.stringify(testIdentity.email)};
    document.querySelector('#auth-password').value = ${JSON.stringify(testIdentity.password)};
    document.querySelector('#auth-form').requestSubmit();
  })()`);
}

async function readAuthority(client) {
  return client.evaluate(`(() => {
    const session = JSON.parse(localStorage.getItem(${JSON.stringify(memberKey)}) ?? 'null');
    return {
      pathname: location.pathname,
      readyState: document.readyState,
      profileState: document.querySelector('.product-profile')?.dataset.authState ?? null,
      memberId: session?.user?.id ?? null,
      memberEmail: session?.user?.email ?? null,
      memberAccessToken: session?.accessToken ?? null,
      activeBearer: sessionStorage.getItem(${JSON.stringify(activeBearerKey)}),
      pendingGuest: sessionStorage.getItem(${JSON.stringify(pendingGuestKey)}),
      trace: JSON.parse(sessionStorage.getItem(${JSON.stringify(traceKey)}) ?? '[]'),
    };
  })()`);
}

function assertPreservedAttempt(state, attempt, label) {
  const expected = sessionFor(attempt);
  assert(state.pathname === '/hall.html', `${label} did not navigate to Hall`);
  assert(state.profileState === 'member', `${label} did not render Member state`);
  assert(state.memberId === testIdentity.id, `${label} changed Member identity`);
  assert(state.memberEmail === testIdentity.email, `${label} changed Member email`);
  assert(state.memberAccessToken === expected.accessToken, `${label} stored unexpected Member access token`);
  assert(state.activeBearer === expected.accessToken, `${label} did not keep Member as active bearer`);
  assert(state.pendingGuest === guestBearer, `${label} did not preserve the exact Guest as pending`);
  assert(
    state.trace.some((entry) => entry.text === '로그인되었습니다. 게스트 기록 연결은 완료되지 않아 현재 브라우저에 그대로 보존했습니다.' && entry.className.includes('is-success')),
    `${label} did not surface preserved Guest state as successful Member authentication`,
  );
}

for (const file of ['auth.html', 'auth-page.js', 'product-auth.js', 'product-auth-ui.js', 'hall.html']) {
  await stat(join(root, file));
}

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-auth-promotion-failure-browser-'));
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
  await client.evaluate(`(() => {
    localStorage.removeItem(${JSON.stringify(memberKey)});
    sessionStorage.setItem(${JSON.stringify(activeBearerKey)}, ${JSON.stringify(guestBearer)});
    sessionStorage.removeItem(${JSON.stringify(pendingGuestKey)});
  })()`);

  await prepareAuthAttempt(client);
  await submitSignIn(client);
  await waitFor(
    client,
    `location.pathname === '/hall.html' && document.querySelector('.product-profile')?.dataset.authState === 'member'`,
    'Promotion transport failure prevented successful Member navigation',
  );
  const afterNetworkFailure = await readAuthority(client);
  assertPreservedAttempt(afterNetworkFailure, 1, 'Promotion transport failure');
  assert(promotionNetworkAttempts >= 1, 'Promotion transport failure did not exercise a socket-level failure');

  await prepareAuthAttempt(client);
  await submitSignIn(client);
  await waitFor(
    client,
    `location.pathname === '/hall.html' && document.querySelector('.product-profile')?.dataset.authState === 'member'`,
    'Promotion upstream failure prevented successful Member navigation',
  );
  const afterUpstreamFailure = await readAuthority(client);
  assertPreservedAttempt(afterUpstreamFailure, 2, 'Promotion upstream failure');

  await prepareAuthAttempt(client);
  await submitSignIn(client);
  await waitFor(
    client,
    `location.pathname === '/auth.html'
      && localStorage.getItem(${JSON.stringify(memberKey)}) === null
      && sessionStorage.getItem(${JSON.stringify(activeBearerKey)}) === ${JSON.stringify(guestBearer)}
      && sessionStorage.getItem(${JSON.stringify(pendingGuestKey)}) === null
      && document.querySelector('#auth-status')?.className.includes('is-error') === true`,
    'Rejected Member promotion credential was not invalidated exactly',
  );
  const afterMemberRejected = await readAuthority(client);
  assert(afterMemberRejected.pathname === '/auth.html', 'Rejected Member unexpectedly navigated away from auth page');
  assert(afterMemberRejected.memberAccessToken === null, 'Rejected Member session remained stored');
  assert(afterMemberRejected.activeBearer === guestBearer, 'Rejected Member invalidation did not restore the pending Guest');
  assert(afterMemberRejected.pendingGuest === null, 'Rejected Member invalidation left duplicate pending Guest state');
  assert(
    afterMemberRejected.trace.some((entry) => entry.text === '로그인 세션이 서버에서 거부되었습니다. 다시 로그인해 주세요.' && entry.className.includes('is-error')),
    'Rejected Member did not surface the authoritative rejection state',
  );

  await prepareAuthAttempt(client);
  await submitSignIn(client);
  await waitFor(
    client,
    `location.pathname === '/hall.html' && document.querySelector('.product-profile')?.dataset.authState === 'member'`,
    'Rejected Guest credential prevented valid Member navigation',
  );
  const afterGuestRejected = await readAuthority(client);
  const expectedGuestRejectedSession = sessionFor(4);
  assert(afterGuestRejected.memberAccessToken === expectedGuestRejectedSession.accessToken, 'Guest rejection changed valid Member session');
  assert(afterGuestRejected.activeBearer === expectedGuestRejectedSession.accessToken, 'Guest rejection changed valid Member active bearer');
  assert(afterGuestRejected.pendingGuest === null, 'Rejected Guest remained pending after authoritative 401');
  assert(
    afterGuestRejected.trace.some((entry) => entry.text === '로그인되었습니다. 더 이상 유효하지 않은 게스트 연결 정보는 해제했습니다.' && entry.className.includes('is-success')),
    'Rejected Guest did not surface exact Guest invalidation while retaining Member login',
  );

  await client.evaluate(`(() => {
    if (document.readyState !== 'complete') throw new Error('Hall document is not complete before recovery setup');
    sessionStorage.setItem(${JSON.stringify(activeBearerKey)}, ${JSON.stringify(guestBearer)});
    sessionStorage.removeItem(${JSON.stringify(pendingGuestKey)});
  })()`);
  await prepareAuthAttempt(client);
  await submitSignIn(client);
  await waitFor(
    client,
    `location.pathname === '/hall.html' && document.querySelector('.product-profile')?.dataset.authState === 'member'`,
    'Healthy Guest promotion did not return to Member hall state',
  );
  const afterRecovery = await readAuthority(client);
  const expectedRecoverySession = sessionFor(5);
  assert(afterRecovery.memberAccessToken === expectedRecoverySession.accessToken, 'Healthy recovery stored unexpected Member token');
  assert(afterRecovery.activeBearer === expectedRecoverySession.accessToken, 'Healthy recovery did not keep Member bearer active');
  assert(afterRecovery.pendingGuest === null, 'Healthy recovery did not clear promoted Guest');
  assert(
    afterRecovery.trace.some((entry) => entry.text === '계정 연결이 완료되었습니다. 이어 보던 흐름을 그대로 계속합니다.' && entry.className.includes('is-success')),
    'Healthy promotion recovery did not surface promotion success',
  );

  const signIns = requests.filter((request) => request.path === '/api/auth/sign-in');
  const promotions = requests.filter((request) => request.path === '/api/auth/promote-guest');
  assert(signIns.length === 5, `Expected five successful Member sign-ins, received ${signIns.length}`);
  assert(promotions.length === 5, `Expected five logical promotion outcomes, received ${promotions.length}`);
  assert(promotions[0].outcome === 'network', 'First promotion outcome was not transport failure');
  assert(promotions[1].outcome === 'upstream', 'Second promotion outcome was not upstream failure');
  assert(promotions[2].outcome === 'member-rejected', 'Third promotion outcome was not Member rejection');
  assert(promotions[3].outcome === 'guest-rejected', 'Fourth promotion outcome was not Guest rejection');
  assert(promotions[4].outcome === 'success', 'Fifth promotion outcome was not healthy recovery');

  const artifactDir = resolve(process.cwd(), 'artifacts');
  await mkdir(artifactDir, { recursive: true });
  await writeFile(join(artifactDir, 'web-auth-promotion-failure-browser-smoke.json'), `${JSON.stringify({
    promotionNetworkAttempts,
    networkFailureKeptMember: afterNetworkFailure.profileState === 'member',
    networkFailurePreservedGuest: afterNetworkFailure.pendingGuest === guestBearer,
    upstreamFailureKeptMember: afterUpstreamFailure.profileState === 'member',
    upstreamFailurePreservedGuest: afterUpstreamFailure.pendingGuest === guestBearer,
    memberRejectionClearedMember: afterMemberRejected.memberAccessToken === null,
    memberRejectionRestoredGuest: afterMemberRejected.activeBearer === guestBearer,
    guestRejectionKeptMember: afterGuestRejected.memberAccessToken === expectedGuestRejectedSession.accessToken,
    guestRejectionClearedGuest: afterGuestRejected.pendingGuest === null,
    recoveredMemberId: afterRecovery.memberId,
    recoveredActiveBearer: afterRecovery.activeBearer,
    pendingGuestAfterRecovery: afterRecovery.pendingGuest,
    promotionOutcomes: promotions.map((request) => request.outcome),
  }, null, 2)}\n`);

  functionalPass = true;
  console.log('MyeongHa_WEB_AUTH_PROMOTION_FAILURE_BROWSER_PASS');
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
  try {
    await rm(profile, { recursive: true, force: true });
  } catch (error) {
    const cleanupRace = functionalPass
      && error && typeof error === 'object'
      && error.code === 'ENOTEMPTY'
      && typeof error.path === 'string'
      && error.path.startsWith(profile);
    if (!cleanupRace) throw error;
    console.warn('MyeongHa promotion auth browser assertions passed; ignoring expected Chrome profile ENOTEMPTY cleanup race.');
  }
}
