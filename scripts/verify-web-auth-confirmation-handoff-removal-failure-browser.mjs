import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const markerKey = 'myeongha.pendingGuestConfirmation.journal.v1';
const entryPrefix = 'myeongha.pendingGuestConfirmation.entry.v1.';
const entryKey = `${entryPrefix}removal-readback-rollback-authority`;
const memberKey = 'myeongha.memberSession.v1';
const activeBearerKey = 'myeongha.guestBearer.v1';
const pendingGuestKey = 'myeongha.pendingGuestBearer.v1';
const email = 'confirmation-removal-readback@example.com';
const password = 'browser-password-12345';
const guestBearer = 'guest-confirmation-removal-readback';
const memberAccess = 'confirmation-removal-readback.member.signature';
const marker = 'MyeongHa_WEB_AUTH_CONFIRMATION_HANDOFF_REMOVAL_FAILURE_BROWSER_PASS';
const rollbackMarker = 'MyeongHa_WEB_AUTH_CONFIRMATION_HANDOFF_REMOVAL_READBACK_ROLLBACK_BROWSER_PASS';
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
]);

const requests = [];
let requestNo = 0;
let promotionAttempt = 0;
let functionalPass = false;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function envelope(data) {
  requestNo += 1;
  return {
    ok: true,
    data,
    meta: {
      apiContractVersion: 'auth-confirmation-handoff-removal-readback-browser-v1',
      requestId: `auth-confirmation-removal-readback-${requestNo}`,
      serverTime: '2026-09-10T00:00:00.000Z',
    },
  };
}

function errorEnvelope(code) {
  requestNo += 1;
  return {
    ok: false,
    error: { code, messageKey: 'auth.guest_required', retryable: false },
    meta: {
      apiContractVersion: 'auth-confirmation-handoff-removal-readback-browser-v1',
      requestId: `auth-confirmation-removal-readback-${requestNo}`,
      serverTime: '2026-09-10T00:00:00.000Z',
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

      if (pathname === '/api/auth/sign-in' && req.method === 'POST') {
        const body = await readJsonBody(req);
        assert(body.email === email && body.password === password, 'Unexpected sign-in payload');
        requests.push({ path: pathname, email: body.email });
        sendJson(res, 200, envelope({
          status: 'authenticated',
          session: {
            accessToken: memberAccess,
            refreshToken: 'refresh-confirmation-removal-readback',
            expiresAt: '2099-01-01T00:00:00.000Z',
            tokenType: 'bearer',
            user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email },
          },
        }));
        return;
      }

      if (pathname === '/api/auth/promote-guest' && req.method === 'POST') {
        assert(req.headers.authorization === `Bearer ${memberAccess}`, 'Unexpected Member bearer');
        assert(req.headers['x-myeongha-guest-bearer'] === guestBearer, 'Unexpected confirmation Guest bearer');
        promotionAttempt += 1;
        requests.push({ path: pathname, guestBearer: req.headers['x-myeongha-guest-bearer'], promotionAttempt });
        if (promotionAttempt === 1) {
          sendJson(res, 200, envelope({ status: 'promoted' }));
        } else {
          sendJson(res, 401, errorEnvelope('GUEST_AUTH_REQUIRED'));
        }
        return;
      }

      if (pathname === '/api/session/bootstrap' && req.method === 'POST') {
        throw new Error('Unexpected Guest bootstrap while confirmation handoff authority exists');
      }

      if (pathname.startsWith('/api/')) {
        sendJson(res, 404, { ok: false, error: { code: 'NOT_FOUND' } });
        return;
      }

      const staticPath = pathname === '/' ? '/auth.html' : pathname;
      const relative = normalize(staticPath).replace(/^[/\\]+/, '');
      const file = resolve(root, relative);
      assert(file.startsWith(`${root}/`), 'Request escaped static root');
      assert((await stat(file)).isFile(), `Static file missing: ${relative}`);
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
  assert(address && typeof address === 'object', 'Browser server address unavailable');
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

async function devtoolsPort(profile, process) {
  for (let index = 0; index < 100; index += 1) {
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
    console.log('MyeongHa confirmation handoff removal readback assertions passed; ignoring ephemeral Chrome profile cleanup ENOTEMPTY race.');
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
  const cleanPath = pathname.split(/[?#]/u)[0];
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

async function waitFor(client, expression, message, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      if (await client.evaluate(expression)) return;
    } catch (error) {
      if (!isExpectedNavigationRace(error)) throw error;
    }
    await sleep(50);
  }
  throw new Error(`${message}; requests=${JSON.stringify(requests)}`);
}

function scheduleSignInExpression() {
  return `(() => {
    document.querySelector('#auth-tab-signin').click();
    document.querySelector('#auth-email').value = ${JSON.stringify(email)};
    document.querySelector('#auth-password').value = ${JSON.stringify(password)};
    setTimeout(() => document.querySelector('#auth-form').requestSubmit(), 0);
    return true;
  })()`;
}

for (const file of ['auth.html', 'auth-page.js', 'product-auth.js', 'hall.html']) await stat(join(root, file));
const authPageSource = await readFile(join(root, 'auth-page.js'), 'utf8');
assert(authPageSource.includes('WEB_AUTH_CONFIRMATION_HANDOFF_CLEAR_ROLLBACK_FAILED'), 'auth-page.js lacks confirmation handoff rollback failure authority');
assert(authPageSource.includes('reconcileConfirmationGuestHandoffRemoval'), 'auth-page.js lacks confirmation handoff removal reconciliation');

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-auth-confirmation-removal-readback-browser-'));
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
  await client.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      const originalRemoveItem = Storage.prototype.removeItem;
      const originalGetItem = Storage.prototype.getItem;
      globalThis.__myeonghaFailConfirmationRemovalReadback = false;
      globalThis.__myeonghaFailNextConfirmationRemovalReadback = false;
      Storage.prototype.removeItem = function(key) {
        const shouldFault = globalThis.__myeonghaFailConfirmationRemovalReadback && key === ${JSON.stringify(entryKey)};
        const result = originalRemoveItem.call(this, key);
        if (shouldFault) globalThis.__myeonghaFailNextConfirmationRemovalReadback = true;
        return result;
      };
      Storage.prototype.getItem = function(key) {
        if (globalThis.__myeonghaFailNextConfirmationRemovalReadback && key === ${JSON.stringify(entryKey)}) {
          globalThis.__myeonghaFailNextConfirmationRemovalReadback = false;
          throw new Error('confirmation handoff post-remove readback blocked once');
        }
        return originalGetItem.call(this, key);
      };
    })();`,
  });

  await navigate(client, origin, '/auth.html?next=hall.html', '#auth-form');
  const entry = { guestBearer, email, expiresAt: '2099-01-01T00:00:00.000Z' };
  await client.evaluate(`(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(${JSON.stringify(markerKey)}, '1');
    localStorage.setItem(${JSON.stringify(entryKey)}, ${JSON.stringify(JSON.stringify(entry))});
    globalThis.__myeonghaFailConfirmationRemovalReadback = true;
  })()`);

  assert(await client.evaluate(scheduleSignInExpression()) === true, 'Failed to schedule first sign-in');
  await waitFor(
    client,
    `location.pathname === '/auth.html'
      && document.querySelector('#auth-status')?.textContent?.includes('게스트 계정 연결 기록을 정리하지 못했습니다.') === true
      && document.querySelector('#auth-submit')?.disabled === false`,
    'Post-remove readback failure did not remain fail-closed on auth page',
  );

  assert(requests.filter((request) => request.path === '/api/auth/sign-in').length === 1, 'First sign-in transport count mismatch');
  assert(requests.filter((request) => request.path === '/api/auth/promote-guest').length === 1, 'First promotion transport count mismatch');

  const preserved = await client.evaluate(`(() => ({
    marker: localStorage.getItem(${JSON.stringify(markerKey)}),
    entry: localStorage.getItem(${JSON.stringify(entryKey)}),
    member: JSON.parse(localStorage.getItem(${JSON.stringify(memberKey)}) ?? 'null'),
    active: sessionStorage.getItem(${JSON.stringify(activeBearerKey)}),
    pending: sessionStorage.getItem(${JSON.stringify(pendingGuestKey)}),
    faultConsumed: globalThis.__myeonghaFailNextConfirmationRemovalReadback === false,
  }))()`);
  assert(preserved.marker === '1', 'Journal marker was lost during readback failure');
  assert(preserved.entry === JSON.stringify(entry), 'Authoritative journal entry was not restored after post-remove readback failure');
  assert(preserved.member?.accessToken === memberAccess, 'Member session was not preserved after successful sign-in');
  assert(preserved.active === memberAccess, 'Member compatibility bearer was not preserved');
  assert(preserved.pending === null, 'Unexpected pending Guest mutation after cleanup failure');
  assert(preserved.faultConsumed === true, 'Post-remove readback fault did not execute exactly once');

  await client.evaluate(`globalThis.__myeonghaFailConfirmationRemovalReadback = false`);
  assert(await client.evaluate(scheduleSignInExpression()) === true, 'Failed to schedule recovery sign-in');
  await waitFor(client, `location.pathname === '/hall.html'`, 'Recovered handoff cleanup did not redirect');

  assert(requests.filter((request) => request.path === '/api/auth/sign-in').length === 2, 'Recovery sign-in transport count mismatch');
  assert(requests.filter((request) => request.path === '/api/auth/promote-guest').length === 2, 'Recovery promotion transport count mismatch');
  assert(requests.filter((request) => request.path === '/api/auth/promote-guest')[1]?.promotionAttempt === 2, 'Recovery did not exercise authoritative Guest rejection');

  const recovered = await client.evaluate(`(() => ({
    entry: localStorage.getItem(${JSON.stringify(entryKey)}),
    member: JSON.parse(localStorage.getItem(${JSON.stringify(memberKey)}) ?? 'null'),
    active: sessionStorage.getItem(${JSON.stringify(activeBearerKey)}),
    pending: sessionStorage.getItem(${JSON.stringify(pendingGuestKey)}),
  }))()`);
  assert(recovered.entry === null, 'Restored stale confirmation handoff was not consumed after recovery');
  assert(recovered.member?.accessToken === memberAccess, 'Recovered Member session changed unexpectedly');
  assert(recovered.active === memberAccess, 'Recovered Member bearer is not active');
  assert(recovered.pending === null, 'Recovered flow left a pending Guest bearer');

  await mkdir('artifacts', { recursive: true });
  await writeFile(
    'artifacts/web-auth-multi-confirmation-handoff-browser-smoke-removal-failure.json',
    `${JSON.stringify({ marker, rollbackMarker, requests, preserved, recovered }, null, 2)}\n`,
  );
  functionalPass = true;
  console.log(rollbackMarker);
  console.log(marker);
} catch (error) {
  if (chromeError) process.stderr.write(chromeError);
  throw error;
} finally {
  client?.close();
  await new Promise((done) => server.close(done));
  await stopChrome(chrome);
  await removeChromeProfile(profile);
}
