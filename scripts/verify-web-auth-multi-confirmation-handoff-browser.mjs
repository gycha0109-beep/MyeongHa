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
const emailA = 'multi-a@example.com';
const emailB = 'multi-b@example.com';
const emailC = 'unrelated@example.com';
const ambiguousEmail = 'ambiguous@example.com';
const guestA = 'guest-multi-confirmation-a';
const guestB = 'guest-multi-confirmation-b';
const guestAmbiguousX = 'guest-ambiguous-x';
const guestAmbiguousY = 'guest-ambiguous-y';
const guestPrune = 'guest-prune-valid';
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

function memberTokenFor(email) {
  const key = email.replace(/[^a-z0-9]/giu, '-').slice(0, 20);
  return `multi-${key}.member.signature`;
}

function envelope(data) {
  requestNo += 1;
  return {
    ok: true,
    data,
    meta: {
      apiContractVersion: 'auth-multi-confirmation-journal-browser-v1',
      requestId: `auth-multi-confirmation-${requestNo}`,
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

function expectedPromotionGuest() {
  if (scenario === 'promote-a') return guestA;
  if (scenario === 'promote-b') return guestB;
  if (scenario === 'prune') return guestPrune;
  return null;
}

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const pathname = decodeURIComponent(url.pathname);

      if (pathname === '/api/auth/sign-up' && req.method === 'POST') {
        const body = await readJsonBody(req);
        assert(body.password === password, 'Unexpected sign-up password');
        assert([emailA, emailB, ambiguousEmail].includes(body.email), `Unexpected sign-up email ${body.email}`);
        requests.push({ scenario, path: pathname, email: body.email });
        sendJson(res, 200, envelope({ status: 'verification_required', email: body.email }));
        return;
      }

      if (pathname === '/api/auth/sign-in' && req.method === 'POST') {
        const body = await readJsonBody(req);
        assert(body.password === password, 'Unexpected sign-in password');
        assert([emailA, emailB, emailC, ambiguousEmail].includes(body.email), `Unexpected sign-in email ${body.email}`);
        requests.push({ scenario, path: pathname, email: body.email });
        sendJson(res, 200, envelope({
          status: 'authenticated',
          session: {
            accessToken: memberTokenFor(body.email),
            refreshToken: `refresh-${body.email}`,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            tokenType: 'bearer',
            user: {
              id: body.email === emailA ? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
                : body.email === emailB ? 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
                  : body.email === emailC ? 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
                    : 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
              email: body.email,
            },
          },
        }));
        return;
      }

      if (pathname === '/api/auth/promote-guest' && req.method === 'POST') {
        const expectedGuest = expectedPromotionGuest();
        assert(expectedGuest, `${scenario}: promotion must not be attempted`);
        const promotedGuest = req.headers['x-myeongha-guest-bearer'] ?? null;
        assert(promotedGuest === expectedGuest, `${scenario}: promoted ${promotedGuest} instead of ${expectedGuest}`);
        requests.push({ scenario, path: pathname, promotedGuest });
        sendJson(res, 200, envelope({ status: 'promoted' }));
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
  }))()`);
  throw new Error(`${message}; diagnostics=${JSON.stringify(diagnostics)}; requests=${JSON.stringify(requests)}`);
}

async function resetShared(client, origin) {
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

async function clearSession(client) {
  await client.evaluate(`(() => {
    localStorage.removeItem(${JSON.stringify(memberKey)});
    sessionStorage.removeItem(${JSON.stringify(activeBearerKey)});
    sessionStorage.removeItem(${JSON.stringify(pendingGuestKey)});
  })()`);
}

async function stageHandoff(client, origin, email, guestBearer) {
  await clearSession(client);
  await navigate(client, origin, '/auth.html?next=hall.html', '#auth-form');
  await client.evaluate(`sessionStorage.setItem(${JSON.stringify(activeBearerKey)}, ${JSON.stringify(guestBearer)})`);
  await client.evaluate(`(() => {
    document.querySelector('#auth-tab-signup').click();
    document.querySelector('#auth-email').value = ${JSON.stringify(email)};
    document.querySelector('#auth-password').value = ${JSON.stringify(password)};
    document.querySelector('#auth-password-confirm').value = ${JSON.stringify(password)};
    document.querySelector('#auth-form').requestSubmit();
  })()`);
  await waitFor(client, `document.querySelector('#auth-status')?.textContent?.includes('확인 메일을 보냈습니다') === true`, `${scenario}: signup did not stage ${email}`);
}

async function signIn(client, origin, email) {
  await navigate(client, origin, '/auth.html?next=hall.html', '#auth-form');
  await client.evaluate(`(() => {
    document.querySelector('#auth-tab-signin').click();
    document.querySelector('#auth-email').value = ${JSON.stringify(email)};
    document.querySelector('#auth-password').value = ${JSON.stringify(password)};
    document.querySelector('#auth-form').requestSubmit();
  })()`);
  await waitFor(client, `location.pathname === '/hall.html'`, `${scenario}: Member login did not finish for ${email}`);
}

async function readJournal(client) {
  return client.evaluate(`(() => Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
    .filter((key) => key?.startsWith(${JSON.stringify(entryPrefix)}))
    .map((key) => JSON.parse(localStorage.getItem(key))))()`);
}

function assertEntries(entries, expected) {
  assert(entries.length === expected.length, `Expected ${expected.length} handoffs, got ${entries.length}`);
  for (const [email, guestBearer] of expected) {
    assert(entries.some((entry) => entry.email === email && entry.guestBearer === guestBearer && Date.parse(entry.expiresAt) > Date.now()), `Missing handoff ${email}/${guestBearer}`);
  }
}

for (const file of ['auth.html', 'auth-page.js', 'product-auth.js', 'hall.html']) await stat(join(root, file));
const authPageSource = await readFile(join(root, 'auth-page.js'), 'utf8');
assert(authPageSource.includes('CONFIRMATION_GUEST_HANDOFF_ENTRY_PREFIX'), 'auth-page.js does not use journal handoffs');
assert(authPageSource.includes('matches.length !== 1'), 'auth-page.js does not fail closed on ambiguous same-email handoffs');

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-auth-multi-confirmation-handoff-browser-'));
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

  await resetShared(client, origin);
  scenario = 'signup-a';
  await stageHandoff(client, origin, emailA, guestA);
  assertEntries(await readJournal(client), [[emailA, guestA]]);

  scenario = 'signup-b';
  await stageHandoff(client, origin, emailB, guestB);
  assertEntries(await readJournal(client), [[emailA, guestA], [emailB, guestB]]);

  await clearSession(client);
  scenario = 'promote-a';
  await signIn(client, origin, emailA);
  assertEntries(await readJournal(client), [[emailB, guestB]]);

  scenario = 'unrelated-c';
  const promotionCountBeforeUnrelated = requests.filter((request) => request.path === '/api/auth/promote-guest').length;
  await signIn(client, origin, emailC);
  assert(requests.filter((request) => request.path === '/api/auth/promote-guest').length === promotionCountBeforeUnrelated, 'Different-email Member login attempted an unrelated Guest promotion');
  assertEntries(await readJournal(client), [[emailB, guestB]]);

  scenario = 'promote-b';
  await signIn(client, origin, emailB);
  assertEntries(await readJournal(client), []);

  await resetShared(client, origin);
  scenario = 'ambiguous-x';
  await stageHandoff(client, origin, ambiguousEmail, guestAmbiguousX);
  scenario = 'ambiguous-y';
  await stageHandoff(client, origin, ambiguousEmail, guestAmbiguousY);
  assertEntries(await readJournal(client), [[ambiguousEmail, guestAmbiguousX], [ambiguousEmail, guestAmbiguousY]]);

  await clearSession(client);
  scenario = 'ambiguous';
  const promotionCountBeforeAmbiguous = requests.filter((request) => request.path === '/api/auth/promote-guest').length;
  await signIn(client, origin, ambiguousEmail);
  assert(requests.filter((request) => request.path === '/api/auth/promote-guest').length === promotionCountBeforeAmbiguous, 'Ambiguous same-email handoffs were arbitrarily promoted');
  assertEntries(await readJournal(client), [[ambiguousEmail, guestAmbiguousX], [ambiguousEmail, guestAmbiguousY]]);

  await resetShared(client, origin);
  scenario = 'prune-stage';
  await stageHandoff(client, origin, emailB, guestPrune);
  await client.evaluate(`(() => {
    localStorage.setItem(${JSON.stringify(`${entryPrefix}expired`)}, JSON.stringify({
      guestBearer: 'guest-expired',
      email: ${JSON.stringify(emailC)},
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    }));
    localStorage.setItem(${JSON.stringify(`${entryPrefix}malformed`)}, JSON.stringify({
      guestBearer: 'malformed.jwt.token',
      email: ${JSON.stringify(emailC)},
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    }));
  })()`);
  await clearSession(client);
  scenario = 'prune';
  await signIn(client, origin, emailB);
  assertEntries(await readJournal(client), []);

  const promotions = requests.filter((request) => request.path === '/api/auth/promote-guest');
  assert(promotions.length === 3, `Expected exactly three authoritative promotions, got ${promotions.length}`);
  assert(promotions[0].scenario === 'promote-a' && promotions[0].promotedGuest === guestA, 'Email A did not promote Guest A');
  assert(promotions[1].scenario === 'promote-b' && promotions[1].promotedGuest === guestB, 'Email B did not promote Guest B');
  assert(promotions[2].scenario === 'prune' && promotions[2].promotedGuest === guestPrune, 'Valid handoff was not selected after pruning invalid journal entries');

  await mkdir(join(process.cwd(), 'artifacts'), { recursive: true });
  await writeFile(join(process.cwd(), 'artifacts', 'web-auth-multi-confirmation-handoff-browser-smoke.json'), `${JSON.stringify({
    status: 'PASS',
    sequentialDifferentEmailHandoffsPreserved: true,
    exactConsumedHandoffOnlyCleared: true,
    unrelatedMemberLoginPreservedHandoffs: true,
    ambiguousSameEmailFailClosed: true,
    expiredMalformedEntriesPruned: true,
    promotions,
    requests,
  }, null, 2)}\n`, 'utf8');
  console.log('MyeongHa_WEB_AUTH_MULTI_CONFIRMATION_HANDOFF_BROWSER_PASS');
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
