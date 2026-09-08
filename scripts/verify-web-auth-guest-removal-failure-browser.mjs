import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const guestBearer = 'guest-browser-removal-failure';
const memberKey = 'myeongha.memberSession.v1';
const activeBearerKey = 'myeongha.guestBearer.v1';
const pendingGuestKey = 'myeongha.pendingGuestBearer.v1';
const confirmationKey = 'myeongha.pendingGuestConfirmation.v1';
const confirmationMarkerKey = 'myeongha.pendingGuestConfirmation.journal.v1';
const confirmationEntryPrefix = 'myeongha.pendingGuestConfirmation.entry.v1.';
const identity = Object.freeze({
  id: '55555555-5555-4555-8555-555555555555',
  email: 'guest-removal-member@example.com',
  password: 'browser-password-guest-removal',
});
const requests = [];
let signInCount = 0;
let promotionCount = 0;
let functionalPass = false;

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
const isNavigationContextError = (error) =>
  error instanceof Error && error.message === 'Runtime.evaluate: Inspected target navigated or closed';

function sessionFor(attempt) {
  return {
    accessToken: `guestremoval${attempt}.member.signature`,
    refreshToken: `guest-removal-refresh-${attempt}`,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    tokenType: 'bearer',
    user: { id: identity.id, email: identity.email },
  };
}

function successEnvelope(data) {
  return {
    ok: true,
    data,
    meta: {
      apiContractVersion: 'browser-auth-guest-removal-failure-v1',
      requestId: `guest-removal-success-${Date.now()}-${Math.random()}`,
      serverTime: new Date().toISOString(),
    },
  };
}

function errorEnvelope(code) {
  return {
    ok: false,
    error: { code, messageKey: `auth.${code.toLowerCase()}`, retryable: false },
    meta: {
      apiContractVersion: 'browser-auth-guest-removal-failure-v1',
      requestId: `guest-removal-error-${Date.now()}-${Math.random()}`,
      serverTime: new Date().toISOString(),
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
        assert(body.email === identity.email, `Unexpected sign-in email: ${body.email}`);
        assert(body.password === identity.password, 'Unexpected sign-in password');
        signInCount += 1;
        const session = sessionFor(signInCount);
        requests.push({ path: pathname, attempt: signInCount, authorization });
        sendJson(res, 200, successEnvelope({ status: 'authenticated', session }));
        return;
      }

      if (pathname === '/api/auth/promote-guest' && req.method === 'POST') {
        promotionCount += 1;
        const expected = sessionFor(signInCount);
        const promotedGuest = req.headers['x-myeongha-guest-bearer'] ?? null;
        assert(authorization === `Bearer ${expected.accessToken}`, `Unexpected Member bearer on promotion ${promotionCount}`);
        assert(promotedGuest === guestBearer, `Unexpected Guest bearer on promotion ${promotionCount}`);
        const outcome = signInCount === 1 ? 'guest-rejected' : 'success';
        requests.push({ path: pathname, attempt: signInCount, outcome, authorization, promotedGuest });
        if (outcome === 'guest-rejected') {
          sendJson(res, 401, errorEnvelope('GUEST_AUTH_REQUIRED'));
        } else {
          sendJson(res, 200, successEnvelope({ status: 'promoted' }));
        }
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
    try {
      const state = await client.evaluate(`(() => ({
        pathname: location.pathname,
        readyState: document.readyState,
        found: Boolean(document.querySelector(${selectorLiteral})),
      }))()`);
      if (state?.pathname === cleanPath && state.readyState === 'complete' && state.found) return;
    } catch (error) {
      if (!isNavigationContextError(error)) throw error;
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
      if (!isNavigationContextError(error)) throw error;
    }
    await sleep(50);
  }
  const diagnostics = await readAuthority(client);
  throw new Error(`${message}; diagnostics=${JSON.stringify(diagnostics)}; requests=${JSON.stringify(requests)}`);
}

async function prepareAuth(client) {
  await navigate(client, origin, '/auth.html?next=hall.html', '#auth-form');
}

async function installPendingRemovalFailure(client) {
  await client.evaluate(`(() => {
    if (document.readyState !== 'complete') throw new Error('Auth document is not complete before storage fault injection');
    globalThis.__myeonghaNativeRemoveItem = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function(key) {
      if (this === sessionStorage && key === ${JSON.stringify(pendingGuestKey)}) {
        throw new DOMException('Pending Guest removal blocked', 'InvalidStateError');
      }
      return globalThis.__myeonghaNativeRemoveItem.call(this, key);
    };
  })()`);
}

async function restorePendingRemoval(client) {
  await client.evaluate(`(() => {
    if (globalThis.__myeonghaNativeRemoveItem) {
      Storage.prototype.removeItem = globalThis.__myeonghaNativeRemoveItem;
      delete globalThis.__myeonghaNativeRemoveItem;
    }
  })()`);
}

async function submitSignIn(client) {
  await client.evaluate(`(() => {
    if (document.readyState !== 'complete') throw new Error('Auth document is not complete before submit');
    document.querySelector('#auth-email').value = ${JSON.stringify(identity.email)};
    document.querySelector('#auth-password').value = ${JSON.stringify(identity.password)};
    document.querySelector('#auth-form').requestSubmit();
  })()`);
}

async function readAuthority(client) {
  return client.evaluate(`(() => {
    let member = null;
    try { member = JSON.parse(localStorage.getItem(${JSON.stringify(memberKey)}) ?? 'null'); } catch {}
    const handoffRaw = localStorage.getItem(${JSON.stringify(confirmationKey)});
    const journalEntries = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(${JSON.stringify(confirmationEntryPrefix)})) journalEntries.push(key);
    }
    return {
      pathname: location.pathname,
      readyState: document.readyState,
      status: document.querySelector('#auth-status')?.textContent?.trim() ?? null,
      statusClass: document.querySelector('#auth-status')?.className ?? null,
      memberAccessToken: member?.accessToken ?? null,
      memberEmail: member?.user?.email ?? null,
      activeBearer: sessionStorage.getItem(${JSON.stringify(activeBearerKey)}),
      pendingGuest: sessionStorage.getItem(${JSON.stringify(pendingGuestKey)}),
      handoffRaw,
      journalMarker: localStorage.getItem(${JSON.stringify(confirmationMarkerKey)}),
      journalEntries,
    };
  })()`);
}

for (const file of ['auth.html', 'auth-page.js', 'product-auth.js', 'product-auth-ui.js', 'hall.html']) {
  await stat(join(root, file));
}
const productAuthSource = await readFile(join(root, 'product-auth.js'), 'utf8');
assert(productAuthSource.includes('WEB_AUTH_GUEST_CLEAR_FAILED'), 'product-auth.js does not expose Guest clear failure authority');
assert(productAuthSource.includes('function removeSessionEntries(entries)'), 'product-auth.js does not rollback partial Guest session removal');

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-auth-guest-removal-failure-browser-'));
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
  await client.evaluate(`(() => {
    localStorage.removeItem(${JSON.stringify(memberKey)});
    sessionStorage.setItem(${JSON.stringify(activeBearerKey)}, ${JSON.stringify(guestBearer)});
    sessionStorage.removeItem(${JSON.stringify(pendingGuestKey)});
    localStorage.removeItem(${JSON.stringify(confirmationMarkerKey)});
    const legacy = {
      version: 2,
      entries: [{
        guestBearer: ${JSON.stringify(guestBearer)},
        email: ${JSON.stringify(identity.email)},
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }],
    };
    localStorage.setItem(${JSON.stringify(confirmationKey)}, JSON.stringify(legacy));
  })()`);

  await prepareAuth(client);
  await installPendingRemovalFailure(client);
  await submitSignIn(client);
  await waitFor(
    client,
    `location.pathname === '/auth.html'
      && document.querySelector('#auth-status')?.className.includes('is-error') === true
      && sessionStorage.getItem(${JSON.stringify(pendingGuestKey)}) === ${JSON.stringify(guestBearer)}`,
    'Guest 401 removal failure did not stay on auth page with exact Guest preserved',
  );
  await sleep(700);
  const afterRejectedRemovalFailure = await readAuthority(client);
  await restorePendingRemoval(client);
  assert(afterRejectedRemovalFailure.pathname === '/auth.html', 'Guest 401 removal failure redirected away from auth page');
  assert(afterRejectedRemovalFailure.memberAccessToken === sessionFor(1).accessToken, 'Guest 401 removal failure discarded valid Member authority');
  assert(afterRejectedRemovalFailure.activeBearer === sessionFor(1).accessToken, 'Guest 401 removal failure changed Member compatibility bearer');
  assert(afterRejectedRemovalFailure.pendingGuest === guestBearer, 'Guest 401 removal failure lost rejected Guest evidence');
  assert(afterRejectedRemovalFailure.handoffRaw?.includes(guestBearer), 'Guest 401 removal failure cleared confirmation handoff before durable Guest removal');
  assert(afterRejectedRemovalFailure.status === '인증을 완료하지 못했습니다. 입력을 확인하고 다시 시도해 주세요.', `Unexpected Guest 401 clear-failure status: ${afterRejectedRemovalFailure.status}`);

  await prepareAuth(client);
  await installPendingRemovalFailure(client);
  await submitSignIn(client);
  await waitFor(
    client,
    `location.pathname === '/auth.html'
      && document.querySelector('#auth-status')?.className.includes('is-error') === true
      && sessionStorage.getItem(${JSON.stringify(pendingGuestKey)}) === ${JSON.stringify(guestBearer)}`,
    'Successful promotion cleanup failure did not stay on auth page with Guest evidence preserved',
  );
  await sleep(700);
  const afterPromotedRemovalFailure = await readAuthority(client);
  await restorePendingRemoval(client);
  assert(afterPromotedRemovalFailure.pathname === '/auth.html', 'Promotion cleanup failure redirected away from auth page');
  assert(afterPromotedRemovalFailure.memberAccessToken === sessionFor(2).accessToken, 'Promotion cleanup failure discarded valid Member authority');
  assert(afterPromotedRemovalFailure.activeBearer === sessionFor(2).accessToken, 'Promotion cleanup failure changed Member compatibility bearer');
  assert(afterPromotedRemovalFailure.pendingGuest === guestBearer, 'Promotion cleanup failure lost promoted Guest evidence');
  assert(afterPromotedRemovalFailure.handoffRaw?.includes(guestBearer), 'Promotion cleanup failure cleared handoff before durable Guest removal');

  await prepareAuth(client);
  await submitSignIn(client);
  await waitFor(
    client,
    `location.pathname === '/hall.html' && document.querySelector('.product-profile')?.dataset.authState === 'member'`,
    'Guest cleanup recovery did not navigate to Member Hall',
  );
  const afterRecovery = await readAuthority(client);
  assert(afterRecovery.memberAccessToken === sessionFor(3).accessToken, 'Guest cleanup recovery stored unexpected Member authority');
  assert(afterRecovery.activeBearer === sessionFor(3).accessToken, 'Guest cleanup recovery did not keep Member active');
  assert(afterRecovery.pendingGuest === null, 'Guest cleanup recovery left pending Guest state');
  assert(afterRecovery.handoffRaw === null, 'Guest cleanup recovery left legacy confirmation handoff state');
  assert(afterRecovery.journalEntries.length === 0, `Guest cleanup recovery left journal entries: ${afterRecovery.journalEntries}`);

  const promotions = requests.filter((request) => request.path === '/api/auth/promote-guest');
  assert(signInCount === 3, `Expected three sign-ins, got ${signInCount}`);
  assert(promotionCount === 3, `Expected three promotion attempts, got ${promotionCount}`);
  assert(promotions[0]?.outcome === 'guest-rejected', 'First promotion was not Guest rejection');
  assert(promotions[1]?.outcome === 'success', 'Second promotion was not successful promotion with cleanup fault');
  assert(promotions[2]?.outcome === 'success', 'Third promotion was not healthy cleanup recovery');

  await mkdir(join(process.cwd(), 'artifacts'), { recursive: true });
  await writeFile(join(process.cwd(), 'artifacts', 'web-auth-guest-removal-failure-browser-smoke.json'), `${JSON.stringify({
    status: 'MyeongHa_WEB_AUTH_GUEST_REMOVAL_FAILURE_BROWSER_PASS',
    afterRejectedRemovalFailure,
    afterPromotedRemovalFailure,
    afterRecovery,
    signInCount,
    promotionCount,
    requests,
  }, null, 2)}\n`, 'utf8');

  functionalPass = true;
  console.log('MyeongHa_WEB_AUTH_GUEST_REMOVAL_FAILURE_BROWSER_PASS');
} catch (error) {
  console.error(error);
  if (chromeError.trim()) console.error(chromeError.trim());
  process.exitCode = 1;
} finally {
  client?.close();
  if (chrome.exitCode === null) {
    chrome.kill('SIGTERM');
    await Promise.race([
      new Promise((done) => chrome.once('exit', done)),
      sleep(2_000),
    ]);
  }
  await new Promise((done) => server.close(done));
  try {
    await rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
  } catch (error) {
    const cleanupRace = functionalPass
      && error && typeof error === 'object'
      && error.code === 'ENOTEMPTY'
      && typeof error.path === 'string'
      && error.path.startsWith(profile);
    if (!cleanupRace) throw error;
    console.warn('MyeongHa Guest removal browser assertions passed; ignoring expected Chrome profile ENOTEMPTY cleanup race.');
  }
}
