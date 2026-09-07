import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const handoffKey = 'myeongha.pendingGuestConfirmation.v1';
const journalMarkerKey = 'myeongha.pendingGuestConfirmation.journal.v1';
const entryPrefix = 'myeongha.pendingGuestConfirmation.entry.v1.';
const memberKey = 'myeongha.memberSession.v1';
const activeBearerKey = 'myeongha.guestBearer.v1';
const pendingGuestKey = 'myeongha.pendingGuestBearer.v1';
const password = 'browser-password-12345';
const email = 'confirmation-handoff@example.com';
const guestA = 'guest-confirmation-a';
const guestB = 'guest-confirmation-b';
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
let scenario = 'idle';
let requestNo = 0;

function memberToken() {
  return `${scenario}.member.signature`;
}

function envelope(data) {
  requestNo += 1;
  return {
    ok: true,
    data,
    meta: {
      apiContractVersion: 'auth-confirmation-handoff-journal-browser-v1',
      requestId: `auth-confirmation-handoff-${requestNo}`,
      serverTime: '2026-09-08T00:00:00.000Z',
    },
  };
}

function errorEnvelope(code) {
  requestNo += 1;
  return {
    ok: false,
    error: { code, messageKey: 'auth.guest_merge_required', retryable: false },
    meta: {
      apiContractVersion: 'auth-confirmation-handoff-journal-browser-v1',
      requestId: `auth-confirmation-handoff-${requestNo}`,
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

      if (pathname === '/api/auth/sign-up' && req.method === 'POST') {
        const body = await readJsonBody(req);
        assert(body.email === email && body.password === password, 'Unexpected sign-up payload');
        requests.push({ scenario, path: pathname, email: body.email });
        sendJson(res, 200, envelope({ status: 'verification_required', email }));
        return;
      }

      if (pathname === '/api/auth/sign-in' && req.method === 'POST') {
        const body = await readJsonBody(req);
        assert(body.email === email && body.password === password, 'Unexpected sign-in payload');
        requests.push({ scenario, path: pathname, email: body.email });
        sendJson(res, 200, envelope({
          status: 'authenticated',
          session: {
            accessToken: memberToken(),
            refreshToken: `refresh-${scenario}`,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            tokenType: 'bearer',
            user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email },
          },
        }));
        return;
      }

      if (pathname === '/api/auth/promote-guest' && req.method === 'POST') {
        const promotedGuest = req.headers['x-myeongha-guest-bearer'] ?? null;
        const expectedGuest = scenario === 'collision' ? guestB : guestA;
        assert(req.headers.authorization === `Bearer ${memberToken()}`, `${scenario}: unexpected Member bearer`);
        assert(promotedGuest === expectedGuest, `${scenario}: promoted ${promotedGuest} instead of ${expectedGuest}`);
        requests.push({ scenario, path: pathname, promotedGuest });
        if (scenario === 'merge-required') {
          sendJson(res, 409, errorEnvelope('GUEST_MERGE_REQUIRED'));
        } else {
          sendJson(res, 200, envelope({ status: 'promoted' }));
        }
        return;
      }

      if (pathname === '/api/session/bootstrap' && req.method === 'POST') {
        throw new Error(`${scenario}: unexpected Guest bootstrap`);
      }

      if (pathname.startsWith('/api/')) {
        sendJson(res, 404, { ok: false, error: { code: 'NOT_FOUND' } });
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

async function navigate(client, origin, pathname, selector) {
  const result = await client.send('Page.navigate', { url: `${origin}${pathname}` });
  assert(!result.errorText, `Navigation failed for ${pathname}: ${result.errorText}`);
  const cleanPath = pathname.split(/[?#]/u)[0];
  const selectorLiteral = JSON.stringify(selector);
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const ready = await client.evaluate(`(() => ({
      path: location.pathname,
      ready: document.readyState,
      found: Boolean(document.querySelector(${selectorLiteral})),
    }))()`);
    if (ready?.path === cleanPath && ready.ready === 'complete' && ready.found) return;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${cleanPath} ${selector}`);
}

async function waitFor(client, expression, message) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return;
    await sleep(50);
  }
  const diagnostics = await client.evaluate(`(() => ({
    pathname: location.pathname,
    status: document.querySelector('#auth-status')?.textContent?.trim() ?? null,
    aggregate: localStorage.getItem(${JSON.stringify(handoffKey)}),
    marker: localStorage.getItem(${JSON.stringify(journalMarkerKey)}),
    journal: Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      .filter((key) => key?.startsWith(${JSON.stringify(entryPrefix)}))
      .map((key) => localStorage.getItem(key)),
    member: localStorage.getItem(${JSON.stringify(memberKey)}),
    active: sessionStorage.getItem(${JSON.stringify(activeBearerKey)}),
    pending: sessionStorage.getItem(${JSON.stringify(pendingGuestKey)}),
  }))()`);
  throw new Error(`${message}; diagnostics=${JSON.stringify(diagnostics)}; requests=${JSON.stringify(requests)}`);
}

async function resetScenario(client, origin) {
  await navigate(client, origin, '/auth.html?next=hall.html', '#auth-form');
  await client.evaluate(`(() => {
    localStorage.removeItem(${JSON.stringify(handoffKey)});
    localStorage.removeItem(${JSON.stringify(journalMarkerKey)});
    localStorage.removeItem(${JSON.stringify(memberKey)});
    for (const key of Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))) {
      if (key?.startsWith(${JSON.stringify(entryPrefix)})) localStorage.removeItem(key);
    }
    sessionStorage.removeItem(${JSON.stringify(activeBearerKey)});
    sessionStorage.removeItem(${JSON.stringify(pendingGuestKey)});
  })()`);
}

async function stageGuestA(client, origin) {
  await resetScenario(client, origin);
  await client.evaluate(`sessionStorage.setItem(${JSON.stringify(activeBearerKey)}, ${JSON.stringify(guestA)})`);
  await client.evaluate(`(() => {
    document.querySelector('#auth-tab-signup').click();
    document.querySelector('#auth-email').value = ${JSON.stringify(email)};
    document.querySelector('#auth-password').value = ${JSON.stringify(password)};
    document.querySelector('#auth-password-confirm').value = ${JSON.stringify(password)};
    document.querySelector('#auth-form').requestSubmit();
  })()`);
  await waitFor(client, `document.querySelector('#auth-status')?.textContent?.includes('확인 메일을 보냈습니다') === true`, `${scenario}: Guest A signup did not stage confirmation handoff`);
  await waitFor(client, `localStorage.getItem(${JSON.stringify(journalMarkerKey)}) === '1'`, `${scenario}: journal marker missing`);
}

async function signIn(client, origin) {
  await navigate(client, origin, '/auth.html?next=hall.html', '#auth-form');
  await client.evaluate(`(() => {
    document.querySelector('#auth-tab-signin').click();
    document.querySelector('#auth-email').value = ${JSON.stringify(email)};
    document.querySelector('#auth-password').value = ${JSON.stringify(password)};
    document.querySelector('#auth-form').requestSubmit();
  })()`);
  await waitFor(client, `location.pathname === '/hall.html'`, `${scenario}: Member login did not finish`);
}

async function readAuthority(client) {
  return client.evaluate(`(() => ({
    member: JSON.parse(localStorage.getItem(${JSON.stringify(memberKey)}) ?? 'null'),
    active: sessionStorage.getItem(${JSON.stringify(activeBearerKey)}),
    pending: sessionStorage.getItem(${JSON.stringify(pendingGuestKey)}),
    journal: Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      .filter((key) => key?.startsWith(${JSON.stringify(entryPrefix)}))
      .map((key) => JSON.parse(localStorage.getItem(key))),
  }))()`);
}

for (const file of ['auth.html', 'auth-page.js', 'product-auth.js', 'hall.html']) await stat(join(root, file));
const authPageSource = await readFile(join(root, 'auth-page.js'), 'utf8');
assert(authPageSource.includes('CONFIRMATION_GUEST_HANDOFF_ENTRY_PREFIX'), 'auth-page.js does not use journal handoffs');

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

  scenario = 'collision';
  await stageGuestA(client, origin);
  await client.evaluate(`sessionStorage.setItem(${JSON.stringify(activeBearerKey)}, ${JSON.stringify(guestB)})`);
  await signIn(client, origin);
  const collision = await readAuthority(client);
  assert(collision.member?.accessToken === 'collision.member.signature', 'Collision lost Member session');
  assert(collision.active === 'collision.member.signature', 'Collision did not keep Member bearer active');
  assert(collision.pending === null, 'Collision did not consume current Guest B');
  assert(collision.journal.length === 1 && collision.journal[0].guestBearer === guestA, 'Collision deleted unrelated confirmation Guest A');

  scenario = 'exact';
  await stageGuestA(client, origin);
  await client.evaluate(`sessionStorage.removeItem(${JSON.stringify(activeBearerKey)}); sessionStorage.removeItem(${JSON.stringify(pendingGuestKey)});`);
  await signIn(client, origin);
  const exact = await readAuthority(client);
  assert(exact.member?.accessToken === 'exact.member.signature', 'Exact lost Member session');
  assert(exact.active === 'exact.member.signature', 'Exact did not keep Member bearer active');
  assert(exact.journal.length === 0, 'Exact promoted confirmation Guest A was not cleared');

  scenario = 'merge-required';
  await stageGuestA(client, origin);
  await client.evaluate(`sessionStorage.removeItem(${JSON.stringify(activeBearerKey)}); sessionStorage.removeItem(${JSON.stringify(pendingGuestKey)});`);
  await signIn(client, origin);
  const mergeRequired = await readAuthority(client);
  assert(mergeRequired.member?.accessToken === 'merge-required.member.signature', 'Merge-required lost Member session');
  assert(mergeRequired.active === 'merge-required.member.signature', 'Merge-required did not keep Member bearer active');
  assert(mergeRequired.journal.length === 1 && mergeRequired.journal[0].guestBearer === guestA, 'Merge-required deleted the Guest merge candidate');

  const promotions = requests.filter((request) => request.path === '/api/auth/promote-guest');
  assert(promotions.length === 3, `Expected three promotion attempts, got ${promotions.length}`);
  assert(promotions[0].scenario === 'collision' && promotions[0].promotedGuest === guestB, 'Collision did not prioritize current Guest B');
  assert(promotions[1].scenario === 'exact' && promotions[1].promotedGuest === guestA, 'Exact did not promote Guest A');
  assert(promotions[2].scenario === 'merge-required' && promotions[2].promotedGuest === guestA, 'Merge-required did not attempt exact Guest A');

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
  await Promise.race([new Promise((done) => chrome.once('exit', done)), sleep(1_000)]);
  await new Promise((done) => server.close(done));
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
