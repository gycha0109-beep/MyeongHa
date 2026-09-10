import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const handoffKey = 'myeongha.pendingGuestConfirmation.v1';
const markerKey = 'myeongha.pendingGuestConfirmation.journal.v1';
const entryPrefix = 'myeongha.pendingGuestConfirmation.entry.v1.';
const activeBearerKey = 'myeongha.guestBearer.v1';
const password = 'browser-password-12345';
const currentEmail = 'confirmation-write-readback@example.com';
const legacyEmail = 'legacy-write-readback@example.com';
const legacyGuest = 'guest-confirmation-write-readback-legacy';
const currentGuest = 'guest-confirmation-write-readback-current';
const marker = 'MyeongHa_WEB_AUTH_CONFIRMATION_HANDOFF_WRITE_READBACK_BROWSER_PASS';
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
]);

const requests = [];
let requestNo = 0;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function envelope(data) {
  requestNo += 1;
  return {
    ok: true,
    data,
    meta: {
      apiContractVersion: 'auth-confirmation-handoff-write-readback-browser-v1',
      requestId: `auth-confirmation-write-readback-${requestNo}`,
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

      if (pathname === '/api/auth/sign-up' && req.method === 'POST') {
        const body = await readJsonBody(req);
        assert(body.email === currentEmail && body.password === password, 'Unexpected sign-up payload');
        requests.push({ path: pathname, email: body.email });
        sendJson(res, 200, envelope({ status: 'verification_required', email: currentEmail }));
        return;
      }

      if (pathname === '/api/session/bootstrap' && req.method === 'POST') {
        throw new Error('Unexpected Guest bootstrap while current Guest authority exists');
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
  throw new Error(`${message}; requests=${JSON.stringify(requests)}`);
}

for (const file of ['auth.html', 'auth-page.js', 'product-auth.js']) await stat(join(root, file));
const authPageSource = await readFile(join(root, 'auth-page.js'), 'utf8');
assert(
  authPageSource.includes('function writeConfirmationGuestHandoffLocal(key, value)')
    && authPageSource.includes('return writeConfirmationGuestHandoffLocal(key, raw);')
    && authPageSource.includes("return writeConfirmationGuestHandoffLocal(CONFIRMATION_GUEST_HANDOFF_JOURNAL_MARKER_KEY, '1');"),
  'auth-page.js does not route authoritative journal writes through post-mutation readback',
);

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-auth-confirmation-handoff-write-readback-browser-'));
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
      const originalSetItem = Storage.prototype.setItem;
      globalThis.__myeonghaJournalEntryPostMutationThrows = 0;
      globalThis.__myeonghaJournalMarkerPostMutationThrows = 0;
      Storage.prototype.setItem = function(key, value) {
        if (this === localStorage && String(key).startsWith(${JSON.stringify(entryPrefix)})) {
          originalSetItem.call(this, key, value);
          globalThis.__myeonghaJournalEntryPostMutationThrows += 1;
          throw new Error('confirmation handoff entry write threw after mutation');
        }
        if (this === localStorage && key === ${JSON.stringify(markerKey)}) {
          originalSetItem.call(this, key, value);
          globalThis.__myeonghaJournalMarkerPostMutationThrows += 1;
          throw new Error('confirmation handoff marker write threw after mutation');
        }
        return originalSetItem.call(this, key, value);
      };
    })();`,
  });

  await navigate(client, origin, '/auth.html', '#auth-form');
  const legacyEntry = {
    guestBearer: legacyGuest,
    email: legacyEmail,
    expiresAt: '2099-01-01T00:00:00.000Z',
  };
  const legacyAggregate = JSON.stringify({ version: 2, entries: [legacyEntry] });
  await client.evaluate(`(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(${JSON.stringify(handoffKey)}, ${JSON.stringify(legacyAggregate)});
    sessionStorage.setItem(${JSON.stringify(activeBearerKey)}, ${JSON.stringify(currentGuest)});
    document.querySelector('#auth-tab-signup').click();
    document.querySelector('#auth-email').value = ${JSON.stringify(currentEmail)};
    document.querySelector('#auth-password').value = ${JSON.stringify(password)};
    document.querySelector('#auth-password-confirm').value = ${JSON.stringify(password)};
    document.querySelector('#auth-form').requestSubmit();
  })()`);

  await waitFor(
    client,
    `document.querySelector('#auth-status')?.textContent?.includes('확인 메일을 보냈습니다.') === true && document.querySelector('#auth-submit')?.disabled === false`,
    'Post-mutation journal write errors did not converge to successful handoff staging',
  );

  assert(requests.filter((request) => request.path === '/api/auth/sign-up').length === 1, 'Sign-up transport count mismatch');
  assert(requests.filter((request) => request.path === '/api/session/bootstrap').length === 0, 'Unexpected Guest bootstrap transport');

  const authority = await client.evaluate(`(() => {
    const keys = Object.keys(localStorage).filter((key) => key.startsWith(${JSON.stringify(entryPrefix)}));
    return {
      marker: localStorage.getItem(${JSON.stringify(markerKey)}),
      entries: keys.map((key) => JSON.parse(localStorage.getItem(key))),
      aggregate: JSON.parse(localStorage.getItem(${JSON.stringify(handoffKey)}) ?? 'null'),
      active: sessionStorage.getItem(${JSON.stringify(activeBearerKey)}),
      entryThrows: globalThis.__myeonghaJournalEntryPostMutationThrows,
      markerThrows: globalThis.__myeonghaJournalMarkerPostMutationThrows,
    };
  })()`);

  assert(authority.marker === '1', 'Journal authority marker was not preserved after post-mutation write error');
  assert(authority.entryThrows === 2, `Expected two post-mutation journal entry throws, got ${authority.entryThrows}`);
  assert(authority.markerThrows === 1, `Expected one post-mutation marker throw, got ${authority.markerThrows}`);
  assert(authority.entries.length === 2, `Journal entry count mismatch: ${JSON.stringify(authority.entries)}`);
  assert(authority.entries.some((entry) => entry.email === legacyEmail && entry.guestBearer === legacyGuest), 'Legacy handoff was lost');
  assert(authority.entries.some((entry) => entry.email === currentEmail && entry.guestBearer === currentGuest), 'Current signup handoff was lost');
  assert(authority.aggregate?.version === 2 && authority.aggregate.entries?.length === 2, 'Compatibility aggregate did not reflect journal authority');
  assert(authority.active === currentGuest, 'Current Guest authority changed during handoff staging');

  console.log(`${marker} entry_writes=${authority.entryThrows} marker_writes=${authority.markerThrows} staged=true`);
} catch (error) {
  if (chromeError) process.stderr.write(chromeError);
  throw error;
} finally {
  client?.close();
  if (chrome.exitCode === null) chrome.kill('SIGTERM');
  await Promise.race([
    new Promise((done) => {
      if (chrome.exitCode !== null) done();
      else chrome.once('exit', done);
    }),
    sleep(1_000),
  ]);
  await new Promise((done) => server.close(done));
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
