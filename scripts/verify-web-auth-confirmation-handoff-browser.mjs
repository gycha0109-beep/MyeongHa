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
const guestA = 'guest-confirmation-handoff-a';
const guestB = 'guest-current-tab-b';
const identity = Object.freeze({
  id: '55555555-5555-4555-8555-555555555555',
  email: 'confirmation-handoff@example.com',
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
let scenario = 'collision';
let apiRequestCount = 0;
let signInCount = 0;

function sessionFor(attempt) {
  return {
    accessToken: `confirmation${attempt}.member.signature`,
    refreshToken: `confirmation-refresh-${attempt}`,
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
      apiContractVersion: 'browser-auth-confirmation-handoff-v1',
      requestId: `web-auth-confirmation-handoff-${apiRequestCount}`,
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
      apiContractVersion: 'browser-auth-confirmation-handoff-v1',
      requestId: `web-auth-confirmation-handoff-${apiRequestCount}`,
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
        const expectedMember = sessionFor(signInCount);
        const promotedGuest = req.headers['x-myeongha-guest-bearer'] ?? null;
        const expectedGuest = scenario === 'collision' ? guestB : guestA;
        assert(authorization === `Bearer ${expectedMember.accessToken}`, `${scenario}: promotion used unexpected Member bearer`);
        assert(promotedGuest === expectedGuest, `${scenario}: promotion used ${promotedGuest} instead of ${expectedGuest}`);
        requests.push({ scenario, path: pathname, authorization, promotedGuest });
        if (scenario === 'merge-required') {
          sendJson(res, 409, errorEnvelope('GUEST_MERGE_REQUIRED', 'auth.guest_merge_required'));
          return;
        }
        sendJson(res, 200, envelope({ status: 'promoted' }));
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
    status: document.querySelector('#auth-status')?.textContent?.trim() ?? null,
    member: localStorage.getItem(${JSON.stringify(memberKey)}),
    handoff: localStorage.getItem(${JSON.stringify(handoffKey)}),
    active: sessionStorage.getItem(${JSON.stringify(activeBearerKey)}),
    pending: sessionStorage.getItem(${JSON.stringify(pendingGuestKey)}),
  }))()`);
  throw new Error(`${message}; diagnostics=${JSON.stringify(diagnostics)}; requests=${JSON.stringify(requests)}`);
}

async function prepareScenario(client, origin, nextScenario, pendingGuest = null) {
  scenario = nextScenario;
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
    ${pendingGuest ? `sessionStorage.setItem(${JSON.stringify(pendingGuestKey)}, ${JSON.stringify(pendingGuest)});` : ''}
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

for (const file of ['auth.html', 'auth-page.js', 'product-auth.js', 'product-auth-ui.js', 'hall.html']) {
  await stat(join(root, file));
}

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-auth-confirmation-handoff-browser-'));
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

  await prepareScenario(client, origin, 'collision', guestB);
  await submitSignIn(client);
  await waitFor(client, `location.pathname === '/hall.html'`, 'Collision scenario did not finish Member login');
  const collision = await readAuthority(client);
  assert(collision.member?.user?.id === identity.id, 'Collision scenario lost Member identity');
  assert(collision.pending === null, 'Collision scenario did not consume current-tab Guest B');
  assert(collision.handoff?.guestBearer === guestA, 'Collision scenario deleted unrelated confirmation Guest A');
  assert(collision.active === sessionFor(1).accessToken, 'Collision scenario did not keep Member bearer active');

  await prepareScenario(client, origin, 'exact');
  await submitSignIn(client);
  await waitFor(client, `location.pathname === '/hall.html'`, 'Exact handoff scenario did not finish Member login');
  const exact = await readAuthority(client);
  assert(exact.member?.user?.id === identity.id, 'Exact handoff scenario lost Member identity');
  assert(exact.handoff === null, 'Exact promoted confirmation Guest A was not cleared');
  assert(exact.active === sessionFor(2).accessToken, 'Exact handoff scenario did not keep Member bearer active');

  await prepareScenario(client, origin, 'merge-required');
  await submitSignIn(client);
  await waitFor(client, `location.pathname === '/hall.html'`, 'Merge-required scenario did not finish Member login');
  const mergeRequired = await readAuthority(client);
  assert(mergeRequired.member?.user?.id === identity.id, 'Merge-required scenario lost Member identity');
  assert(mergeRequired.handoff?.guestBearer === guestA, 'Merge-required scenario deleted the Guest merge candidate');
  assert(mergeRequired.active === sessionFor(3).accessToken, 'Merge-required scenario did not keep Member bearer active');

  const promotions = requests.filter((request) => request.path === '/api/auth/promote-guest');
  assert(promotions.length === 3, `Expected three promotion attempts, got ${promotions.length}`);
  assert(promotions[0].scenario === 'collision' && promotions[0].promotedGuest === guestB, 'Collision did not prioritize current-tab Guest B');
  assert(promotions[1].scenario === 'exact' && promotions[1].promotedGuest === guestA, 'Exact handoff Guest A was not promoted');
  assert(promotions[2].scenario === 'merge-required' && promotions[2].promotedGuest === guestA, 'Merge-required did not preserve exact Guest A identity');

  await mkdir(join(process.cwd(), 'artifacts'), { recursive: true });
  await writeFile(join(process.cwd(), 'artifacts', 'web-auth-confirmation-handoff-browser-smoke.json'), `${JSON.stringify({
    status: 'PASS',
    collision: { unrelatedHandoffPreserved: true, promotedGuest: guestB },
    exact: { consumedHandoffCleared: true, promotedGuest: guestA },
    mergeRequired: { handoffPreserved: true, promotedGuest: guestA },
    requests,
  }, null, 2)}\n`, 'utf8');

  console.log('MyeongHa_WEB_AUTH_CONFIRMATION_HANDOFF_BROWSER_PASS');
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
