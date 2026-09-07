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
const emailA = 'concurrent-journal-a@example.com';
const emailB = 'concurrent-journal-b@example.com';
const guestA = 'guest-concurrent-journal-a';
const guestB = 'guest-concurrent-journal-b';
const memberA = 'concurrent-a.member.signature';
const memberB = 'concurrent-b.member.signature';
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
const signUpWaiters = [];
let requestNo = 0;

function memberTokenFor(email) {
  if (email === emailA) return memberA;
  if (email === emailB) return memberB;
  throw new Error(`Unexpected member email ${email}`);
}

function expectedGuestForMemberAuthorization(authorization) {
  if (authorization === `Bearer ${memberA}`) return { email: emailA, guestBearer: guestA };
  if (authorization === `Bearer ${memberB}`) return { email: emailB, guestBearer: guestB };
  return null;
}

function envelope(data) {
  requestNo += 1;
  return {
    ok: true,
    data,
    meta: {
      apiContractVersion: 'auth-concurrent-confirmation-journal-browser-v1',
      requestId: `concurrent-confirmation-journal-${requestNo}`,
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

function releaseConcurrentSignupsIfReady() {
  if (signUpWaiters.length !== 2) return;
  const waiters = signUpWaiters.splice(0, signUpWaiters.length);
  for (const waiter of waiters) {
    sendJson(waiter.res, 200, envelope({ status: 'verification_required', email: waiter.email }));
  }
}

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const pathname = decodeURIComponent(url.pathname);

      if (pathname === '/api/auth/sign-up' && req.method === 'POST') {
        const body = await readJsonBody(req);
        assert(body.password === password, 'Unexpected sign-up password');
        assert(body.email === emailA || body.email === emailB, `Unexpected sign-up email ${body.email}`);
        requests.push({ path: pathname, email: body.email });
        signUpWaiters.push({ res, email: body.email });
        releaseConcurrentSignupsIfReady();
        return;
      }

      if (pathname === '/api/auth/sign-in' && req.method === 'POST') {
        const body = await readJsonBody(req);
        assert(body.password === password, 'Unexpected sign-in password');
        assert(body.email === emailA || body.email === emailB, `Unexpected sign-in email ${body.email}`);
        requests.push({ path: pathname, email: body.email });
        sendJson(res, 200, envelope({
          status: 'authenticated',
          session: {
            accessToken: memberTokenFor(body.email),
            refreshToken: `refresh-${body.email}`,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            tokenType: 'bearer',
            user: { id: body.email === emailA ? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' : 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', email: body.email },
          },
        }));
        return;
      }

      if (pathname === '/api/auth/promote-guest' && req.method === 'POST') {
        const expected = expectedGuestForMemberAuthorization(req.headers.authorization ?? null);
        assert(expected, `Unexpected Member authorization ${req.headers.authorization ?? null}`);
        const promotedGuest = req.headers['x-myeongha-guest-bearer'] ?? null;
        assert(promotedGuest === expected.guestBearer, `${expected.email} promoted ${promotedGuest} instead of ${expected.guestBearer}`);
        requests.push({ path: pathname, email: expected.email, promotedGuest });
        sendJson(res, 200, envelope({ status: 'promoted' }));
        return;
      }

      if (pathname === '/api/session/bootstrap' && req.method === 'POST') {
        throw new Error('Concurrent journal scenario unexpectedly bootstrapped a Guest');
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

function journalCountExpression(expected) {
  return `(() => Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter((key) => key?.startsWith(${JSON.stringify(entryPrefix)})).length === ${expected})()`;
}

async function readJournalEntries(client) {
  return client.evaluate(`(() => Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
    .filter((key) => key?.startsWith(${JSON.stringify(entryPrefix)}))
    .map((key) => JSON.parse(localStorage.getItem(key))))()`);
}

function assertJournalEntries(entries, expected) {
  assert(entries.length === expected.length, `Expected ${expected.length} journal entries, got ${entries.length}`);
  for (const [email, guestBearer] of expected) {
    assert(entries.some((entry) => entry.email === email && entry.guestBearer === guestBearer && Date.parse(entry.expiresAt) > Date.now()), `Missing journal entry ${email}/${guestBearer}`);
  }
}

async function prepareGuestTab(client, origin, guestBearer, { clearShared = false } = {}) {
  await navigate(client, origin, '/auth.html?next=hall.html', '#auth-form');
  await client.evaluate(`(() => {
    ${clearShared ? `
    localStorage.removeItem(${JSON.stringify(handoffKey)});
    localStorage.removeItem(${JSON.stringify(journalMarkerKey)});
    for (const key of Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))) {
      if (key?.startsWith(${JSON.stringify(entryPrefix)})) localStorage.removeItem(key);
    }
    ` : ''}
    localStorage.removeItem(${JSON.stringify(memberKey)});
    sessionStorage.setItem(${JSON.stringify(activeBearerKey)}, ${JSON.stringify(guestBearer)});
    sessionStorage.removeItem(${JSON.stringify(pendingGuestKey)});
  })()`);
}

async function scheduleSignUp(client, email) {
  const scheduled = await client.evaluate(`(() => {
    document.querySelector('#auth-tab-signup').click();
    document.querySelector('#auth-email').value = ${JSON.stringify(email)};
    document.querySelector('#auth-password').value = ${JSON.stringify(password)};
    document.querySelector('#auth-password-confirm').value = ${JSON.stringify(password)};
    setTimeout(() => document.querySelector('#auth-form').requestSubmit(), 0);
    return true;
  })()`);
  assert(scheduled, `Failed to schedule signup ${email}`);
}

async function scheduleSignIn(client, email) {
  await navigate(client, origin, '/auth.html?next=hall.html', '#auth-form');
  await client.evaluate(`(() => {
    document.querySelector('#auth-tab-signin').click();
    document.querySelector('#auth-email').value = ${JSON.stringify(email)};
    document.querySelector('#auth-password').value = ${JSON.stringify(password)};
    setTimeout(() => document.querySelector('#auth-form').requestSubmit(), 0);
  })()`);
  await waitFor(client, `location.pathname === '/hall.html'`, `Member login did not finish for ${email}`);
}

for (const file of ['auth.html', 'auth-page.js', 'product-auth.js', 'hall.html']) await stat(join(root, file));
const authPageSource = await readFile(join(root, 'auth-page.js'), 'utf8');
assert(authPageSource.includes('CONFIRMATION_GUEST_HANDOFF_ENTRY_PREFIX'), 'auth-page.js does not use conflict-free journal entries');
assert(authPageSource.includes('CONFIRMATION_GUEST_HANDOFF_JOURNAL_MARKER_KEY'), 'auth-page.js does not mark journal authority');
assert(authPageSource.includes('writeConfirmationGuestHandoffJournalEntry(entry)'), 'verification-required signup does not journal its own handoff');

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-auth-concurrent-confirmation-journal-browser-'));
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
let tabA;
let tabB;

try {
  const port = await devtoolsPort(profile, chrome);
  tabA = await connectCdp(port);
  tabB = await connectCdp(port);

  await prepareGuestTab(tabA, origin, guestA, { clearShared: true });
  await prepareGuestTab(tabB, origin, guestB);

  await Promise.all([scheduleSignUp(tabA, emailA), scheduleSignUp(tabB, emailB)]);
  await Promise.all([
    waitFor(tabA, `document.querySelector('#auth-status')?.textContent?.includes('확인 메일을 보냈습니다') === true`, 'Tab A verification-required signup did not finish'),
    waitFor(tabB, `document.querySelector('#auth-status')?.textContent?.includes('확인 메일을 보냈습니다') === true`, 'Tab B verification-required signup did not finish'),
  ]);
  assert(requests.filter((request) => request.path === '/api/auth/sign-up').length === 2, 'Did not observe two concurrent sign-up requests');
  assert(signUpWaiters.length === 0, 'Concurrent sign-up barrier did not release both responses');

  await waitFor(tabA, journalCountExpression(2), 'Tab A did not converge to two independent journal entries');
  await waitFor(tabB, journalCountExpression(2), 'Tab B did not converge to two independent journal entries');
  assertJournalEntries(await readJournalEntries(tabA), [[emailA, guestA], [emailB, guestB]]);

  await tabA.evaluate(`sessionStorage.removeItem(${JSON.stringify(activeBearerKey)}); sessionStorage.removeItem(${JSON.stringify(pendingGuestKey)}); localStorage.removeItem(${JSON.stringify(memberKey)});`);
  await scheduleSignIn(tabA, emailA);
  await waitFor(tabA, journalCountExpression(1), 'Member A did not consume exactly one journal entry');
  assertJournalEntries(await readJournalEntries(tabA), [[emailB, guestB]]);

  await tabB.evaluate(`sessionStorage.removeItem(${JSON.stringify(activeBearerKey)}); sessionStorage.removeItem(${JSON.stringify(pendingGuestKey)}); localStorage.removeItem(${JSON.stringify(memberKey)});`);
  await scheduleSignIn(tabB, emailB);
  await waitFor(tabB, journalCountExpression(0), 'Member B did not consume the final journal entry');
  await waitFor(tabB, `localStorage.getItem(${JSON.stringify(handoffKey)}) === null`, 'Compatibility aggregate was not cleared after final exact promotion');

  const promotions = requests.filter((request) => request.path === '/api/auth/promote-guest');
  assert(promotions.length === 2, `Expected two exact promotions, got ${promotions.length}`);
  assert(promotions[0].email === emailA && promotions[0].promotedGuest === guestA, 'Member A did not consume Guest A');
  assert(promotions[1].email === emailB && promotions[1].promotedGuest === guestB, 'Member B did not consume Guest B');

  await mkdir(join(process.cwd(), 'artifacts'), { recursive: true });
  await writeFile(join(process.cwd(), 'artifacts', 'web-auth-concurrent-confirmation-handoff-browser-smoke.json'), `${JSON.stringify({
    status: 'PASS',
    conflictFreeJournalEntriesPreserved: true,
    memberAConsumedOnlyGuestA: true,
    memberBConsumedOnlyGuestB: true,
    compatibilityAggregateCleared: true,
    promotions,
    requests,
  }, null, 2)}\n`, 'utf8');
  console.log('MyeongHa_WEB_AUTH_CONCURRENT_CONFIRMATION_HANDOFF_BROWSER_PASS');
} catch (error) {
  console.error(error);
  if (chromeError.trim()) console.error(chromeError.trim());
  process.exitCode = 1;
} finally {
  tabA?.close();
  tabB?.close();
  chrome.kill('SIGTERM');
  await Promise.race([new Promise((done) => chrome.once('exit', done)), sleep(1_000)]);
  await new Promise((done) => server.close(done));
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
