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
const guestA = 'guest-confirmation-relogin-a';
const identity = Object.freeze({
  id: '66666666-6666-4666-8666-666666666666',
  email: 'confirmation-relogin@example.com',
  password: 'browser-password-67890',
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
let promotionCount = 0;
let scenario = 'merge-required';

function sessionFor(attempt) {
  return {
    accessToken: `confirmation-relogin-${attempt}.member.signature`,
    refreshToken: `confirmation-relogin-refresh-${attempt}`,
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
      apiContractVersion: 'browser-auth-confirmation-relogin-v1',
      requestId: `web-auth-confirmation-relogin-${apiRequestCount}`,
      serverTime: '2026-09-07T00:00:00.000Z',
    },
  };
}

function errorEnvelope(code, messageKey) {
  apiRequestCount += 1;
  return {
    ok: false,
    error: { code, messageKey, retryable: false },
    meta: {
      apiContractVersion: 'browser-auth-confirmation-relogin-v1',
      requestId: `web-auth-confirmation-relogin-${apiRequestCount}`,
      serverTime: '2026-09-07T00:00:00.000Z',
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

function assertMemberBearer(authorization, attempt, context) {
  const expected = `Bearer ${sessionFor(attempt).accessToken}`;
  assert(authorization === expected, `${context}: expected ${expected}, got ${authorization}`);
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
        requests.push({ scenario, path: pathname, authorization, signInCount });
        sendJson(res, 200, envelope({ status: 'authenticated', session: sessionFor(signInCount) }));
        return;
      }

      if (pathname === '/api/auth/promote-guest' && req.method === 'POST') {
        promotionCount += 1;
        const promotedGuest = req.headers['x-myeongha-guest-bearer'] ?? null;
        assertMemberBearer(authorization, signInCount, `${scenario} promotion`);
        assert(promotedGuest === guestA, `${scenario}: promotion used ${promotedGuest} instead of ${guestA}`);
        requests.push({ scenario, path: pathname, authorization, promotedGuest, promotionCount });
        if (promotionCount === 1) {
          sendJson(res, 409, errorEnvelope('GUEST_MERGE_REQUIRED', 'auth.guest_merge_required'));
          return;
        }
        sendJson(res, 200, envelope({ status: 'promoted' }));
        return;
      }

      if (pathname === '/api/me' && req.method === 'GET') {
        assertMemberBearer(authorization, 1, 'My profile');
        requests.push({ scenario, path: pathname, authorization });
        sendJson(res, 200, envelope({
          subjectKind: 'member',
          subjectStatus: 'active',
          profile: {
            displayName: '재로그인 검증',
            locale: 'ko-KR',
            timezone: 'Asia/Seoul',
            onboardingState: 'completed',
            updatedAt: '2026-09-07T00:00:00.000Z',
          },
        }));
        return;
      }

      if (pathname === '/api/me/birth-profile' && req.method === 'GET') {
        assertMemberBearer(authorization, 1, 'My birth profile');
        requests.push({ scenario, path: pathname, authorization });
        sendJson(res, 200, envelope({ birthProfile: null }));
        return;
      }

      if (pathname === '/api/auth/sign-out' && req.method === 'POST') {
        await readJsonBody(req);
        assertMemberBearer(authorization, 1, 'Member sign-out');
        requests.push({ scenario, path: pathname, authorization });
        sendJson(res, 200, envelope({ status: 'signed_out' }));
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
    status: document.querySelector('#auth-status')?.textContent?.trim() ?? document.querySelector('#my-status')?.textContent?.trim() ?? null,
    member: localStorage.getItem(${JSON.stringify(memberKey)}),
    handoff: localStorage.getItem(${JSON.stringify(handoffKey)}),
    active: sessionStorage.getItem(${JSON.stringify(activeBearerKey)}),
    pending: sessionStorage.getItem(${JSON.stringify(pendingGuestKey)}),
  }))()`);
  throw new Error(`${message}; diagnostics=${JSON.stringify(diagnostics)}; requests=${JSON.stringify(requests)}`);
}

async function seedHandoff(client, origin) {
  await navigate(client, origin, '/auth.html?next=hall.html', '#auth-form');
  await client.evaluate(`(() => {
    localStorage.removeItem(${JSON.stringify(memberKey)});
    localStorage.setItem(${JSON.stringify(handoffKey)}, JSON.stringify({
      guestBearer: ${JSON.stringify(guestA)},
      email: ${JSON.stringify(identity.email)},
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    }));
    sessionStorage.removeItem(${JSON.stringify(activeBearerKey)});
    sessionStorage.removeItem(${JSON.stringify(pendingGuestKey)});
  })()`);
}

async function submitSignIn(client) {
  const scheduled = await client.evaluate(`(() => {
    if (document.readyState !== 'complete') return false;
    const email = document.querySelector('#auth-email');
    const password = document.querySelector('#auth-password');
    const form = document.querySelector('#auth-form');
    if (!email || !password || !form) return false;
    email.value = ${JSON.stringify(identity.email)};
    password.value = ${JSON.stringify(identity.password)};
    setTimeout(() => form.requestSubmit(), 0);
    return true;
  })()`);
  assert(scheduled === true, 'Sign-in submit was not scheduled from a fully loaded auth page');
}

async function clickMySignOut(client) {
  const scheduled = await client.evaluate(`(() => {
    if (document.readyState !== 'complete') return false;
    const button = [...document.querySelectorAll('.my-auth-actions button')]
      .find((candidate) => candidate.textContent?.trim() === '로그아웃');
    if (!button) return false;
    setTimeout(() => button.click(), 0);
    return true;
  })()`);
  assert(scheduled === true, 'My page Member sign-out was not scheduled');
}

async function readAuthority(client) {
  return client.evaluate(`(() => {
    const storedHandoff = JSON.parse(localStorage.getItem(${JSON.stringify(handoffKey)}) ?? 'null');
    const handoffs = storedHandoff?.version === 2 && Array.isArray(storedHandoff.entries)
      ? storedHandoff.entries
      : storedHandoff ? [storedHandoff] : [];
    const handoff = handoffs.find((entry) => (
      entry?.guestBearer === ${JSON.stringify(guestA)}
      && String(entry?.email ?? '').trim().toLowerCase() === ${JSON.stringify(identity.email)}
    )) ?? null;
    return {
      pathname: location.pathname,
      member: JSON.parse(localStorage.getItem(${JSON.stringify(memberKey)}) ?? 'null'),
      handoff,
      handoffCount: handoffs.length,
      active: sessionStorage.getItem(${JSON.stringify(activeBearerKey)}),
      pending: sessionStorage.getItem(${JSON.stringify(pendingGuestKey)}),
    };
  })()`);
}

for (const file of [
  'auth.html',
  'auth-page.js',
  'product-auth.js',
  'product-auth-ui.js',
  'hall.html',
  'my.html',
  'my-page.js',
  'my-runtime-client.js',
  'api-envelope.js',
]) {
  await stat(join(root, file));
}

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-auth-confirmation-relogin-browser-'));
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

  await seedHandoff(client, origin);
  await submitSignIn(client);
  await waitFor(client, `location.pathname === '/hall.html'`, 'Merge-required login did not reach Hall');
  const afterMergeRequired = await readAuthority(client);
  assert(afterMergeRequired.member?.user?.id === identity.id, 'Merge-required login lost Member identity');
  assert(afterMergeRequired.handoff?.guestBearer === guestA, 'Merge-required login deleted confirmation Guest A');
  assert(afterMergeRequired.active === sessionFor(1).accessToken, 'Merge-required login did not keep first Member bearer active');
  assert(afterMergeRequired.pending === null, 'Merge-required login unexpectedly staged confirmation Guest A as current-tab Guest');

  scenario = 'sign-out';
  await navigate(client, origin, '/my.html', '#my-status');
  await waitFor(
    client,
    `[...document.querySelectorAll('.my-auth-actions button')].some((button) => button.textContent?.trim() === '로그아웃')`,
    'My page did not render the Member sign-out control',
  );
  await clickMySignOut(client);
  await waitFor(
    client,
    `location.pathname === '/auth.html' && document.readyState === 'complete' && Boolean(document.querySelector('#auth-form'))`,
    'Member sign-out did not return to the auth page',
  );
  const afterSignOut = await readAuthority(client);
  assert(afterSignOut.member === null, 'Member sign-out left the Member session in localStorage');
  assert(afterSignOut.active === null, 'Member sign-out left the Member bearer active');
  assert(afterSignOut.pending === null, 'Member sign-out created an unrelated staged Guest bearer');
  assert(afterSignOut.handoff?.guestBearer === guestA, 'Member sign-out deleted the preserved confirmation Guest A');

  scenario = 'relogin-success';
  await submitSignIn(client);
  await waitFor(client, `location.pathname === '/hall.html'`, 'Same-Member re-login did not reach Hall');
  const afterRelogin = await readAuthority(client);
  assert(afterRelogin.member?.user?.id === identity.id, 'Same-Member re-login changed Member identity');
  assert(afterRelogin.member?.user?.email === identity.email, 'Same-Member re-login changed Member email');
  assert(afterRelogin.active === sessionFor(2).accessToken, 'Same-Member re-login did not rotate to the second Member bearer');
  assert(afterRelogin.active !== sessionFor(1).accessToken, 'Same-Member re-login reused the first Member bearer');
  assert(afterRelogin.handoff === null, 'Successfully promoted confirmation Guest A was not cleared after re-login');
  assert(afterRelogin.pending === null, 'Successfully promoted confirmation Guest A remained staged after re-login');

  const signIns = requests.filter((request) => request.path === '/api/auth/sign-in');
  const promotions = requests.filter((request) => request.path === '/api/auth/promote-guest');
  const signOuts = requests.filter((request) => request.path === '/api/auth/sign-out');
  assert(signIns.length === 2, `Expected two sign-in attempts, got ${signIns.length}`);
  assert(promotions.length === 2, `Expected two promotion attempts, got ${promotions.length}`);
  assert(promotions[0].scenario === 'merge-required' && promotions[0].promotedGuest === guestA, 'First login did not retain exact Guest A merge candidate');
  assert(promotions[1].scenario === 'relogin-success' && promotions[1].promotedGuest === guestA, 'Same-Member re-login did not reuse exact Guest A merge candidate');
  assert(signOuts.length === 1, `Expected one Member sign-out, got ${signOuts.length}`);
  assert(signOuts[0].authorization === `Bearer ${sessionFor(1).accessToken}`, 'Member sign-out did not use the first active Member bearer');

  await mkdir(join(process.cwd(), 'artifacts'), { recursive: true });
  await writeFile(join(process.cwd(), 'artifacts', 'web-auth-confirmation-relogin-browser-smoke.json'), `${JSON.stringify({
    status: 'PASS',
    mergeRequired: { handoffPreserved: true, promotedGuest: guestA },
    signOut: { handoffPreserved: true, memberSessionCleared: true },
    relogin: { sameMember: true, bearerRotated: true, promotedGuest: guestA, consumedHandoffCleared: true },
    requests,
  }, null, 2)}\n`, 'utf8');

  console.log('MyeongHa_WEB_AUTH_CONFIRMATION_RELOGIN_BROWSER_PASS');
} catch (error) {
  console.error(error);
  if (chromeError.trim()) console.error(chromeError.trim());
  process.exitCode = 1;
} finally {
  client?.close();
  chrome.kill('SIGTERM');
  server.close();
  await rm(profile, { recursive: true, force: true });
}
