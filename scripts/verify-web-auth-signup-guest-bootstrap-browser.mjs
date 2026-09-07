import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const guestBearerKey = 'myeongha.guestBearer.v1';
const handoffKey = 'myeongha.pendingGuestConfirmation.v1';
const guestToken = 'guest-signup-bootstrap-centralized';
const email = 'signup-bootstrap@example.com';
const password = 'browser-password-12345';
const requests = [];
let requestCount = 0;

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

function envelope(data) {
  requestCount += 1;
  return {
    ok: true,
    data,
    meta: {
      apiContractVersion: 'browser-auth-signup-guest-bootstrap-v1',
      requestId: `web-auth-signup-guest-bootstrap-${requestCount}`,
      serverTime: '2026-09-07T06:30:00.000Z',
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

      if (pathname === '/api/session/bootstrap' && req.method === 'POST') {
        const body = await readJsonBody(req);
        assert(body && typeof body === 'object' && !Array.isArray(body), 'Guest bootstrap body was not an object');
        requests.push({ path: pathname, method: req.method });
        sendJson(res, 200, envelope({
          kind: 'guest',
          guestSession: {
            bearerToken: guestToken,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          },
        }));
        return;
      }

      if (pathname === '/api/auth/sign-up' && req.method === 'POST') {
        const body = await readJsonBody(req);
        assert(body.email === email, `Unexpected sign-up email: ${body.email}`);
        assert(body.password === password, 'Unexpected sign-up password');
        assert(body.next === 'hall.html', `Unexpected sign-up next route: ${body.next}`);
        requests.push({ path: pathname, method: req.method });
        sendJson(res, 200, envelope({ status: 'verification_required', email }));
        return;
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
  throw new Error(`${message}; requests=${JSON.stringify(requests)}`);
}

for (const file of ['auth.html', 'auth-page.js', 'product-auth.js']) {
  await stat(join(root, file));
}

const [authPageSource, productAuthSource] = await Promise.all([
  readFile(join(root, 'auth-page.js'), 'utf8'),
  readFile(join(root, 'product-auth.js'), 'utf8'),
]);
assert(!authPageSource.includes('/api/session/bootstrap'), 'auth-page.js still owns Guest bootstrap transport');
assert(!authPageSource.includes('sessionStorage.setItem'), 'auth-page.js still writes auth session credentials directly');
assert(!authPageSource.includes('PRODUCT_AUTH_STORAGE_V1'), 'auth-page.js still depends on auth credential storage keys');
assert(productAuthSource.includes('export async function ensureGuestBearer()'), 'product-auth.js does not expose centralized Guest bootstrap authority');
assert(productAuthSource.includes("postJson('/api/session/bootstrap', {})"), 'product-auth.js does not own Guest bootstrap transport');

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-auth-signup-guest-bootstrap-browser-'));
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
  await navigate(client, origin, '/auth.html?next=hall.html', '#auth-form');

  await client.evaluate(`(() => {
    localStorage.removeItem(${JSON.stringify(handoffKey)});
    sessionStorage.removeItem(${JSON.stringify(guestBearerKey)});
    document.querySelector('#auth-tab-signup').click();
  })()`);
  await waitFor(
    client,
    `document.querySelector('#auth-tab-signup')?.getAttribute('aria-selected') === 'true'`,
    'Sign-up mode did not activate',
  );

  await client.evaluate(`(() => {
    document.querySelector('#auth-email').value = ${JSON.stringify(email)};
    document.querySelector('#auth-password').value = ${JSON.stringify(password)};
    document.querySelector('#auth-password-confirm').value = ${JSON.stringify(password)};
    document.querySelector('#auth-form').requestSubmit();
  })()`);

  await waitFor(
    client,
    `document.querySelector('#auth-status')?.textContent?.includes('확인 메일을 보냈습니다') === true`,
    'Verification-required sign-up did not finish',
  );

  const authority = await client.evaluate(`(() => {
    const handoff = JSON.parse(localStorage.getItem(${JSON.stringify(handoffKey)}) ?? 'null');
    return {
      guest: sessionStorage.getItem(${JSON.stringify(guestBearerKey)}),
      handoff,
      handoffEntry: Array.isArray(handoff?.entries)
        ? handoff.entries.find((entry) => entry.email === ${JSON.stringify(email)}) ?? null
        : handoff,
      member: localStorage.getItem('myeongha.memberSession.v1'),
      status: document.querySelector('#auth-status')?.textContent?.trim() ?? null,
    };
  })()`);

  assert(requests.length === 2, `Expected bootstrap then sign-up, got ${JSON.stringify(requests)}`);
  assert(requests[0]?.path === '/api/session/bootstrap', 'Sign-up did not bootstrap Guest before account creation');
  assert(requests[1]?.path === '/api/auth/sign-up', 'Sign-up request did not follow Guest bootstrap');
  assert(authority.guest === guestToken, 'Centralized Guest bootstrap bearer was not stored');
  assert(authority.handoff?.version === 2, 'Confirmation handoff did not use the v2 multi-entry store');
  assert(authority.handoffEntry?.guestBearer === guestToken, 'Confirmation handoff did not preserve the bootstrapped Guest lineage');
  assert(authority.handoffEntry?.email === email, 'Confirmation handoff was not bound to the sign-up email');
  assert(Date.parse(authority.handoffEntry?.expiresAt ?? '') > Date.now(), 'Confirmation handoff expiration is not in the future');
  assert(authority.member === null, 'Verification-required sign-up incorrectly created a Member session');

  await mkdir(join(process.cwd(), 'artifacts'), { recursive: true });
  await writeFile(join(process.cwd(), 'artifacts', 'web-auth-signup-guest-bootstrap-browser-smoke.json'), `${JSON.stringify({
    status: 'PASS',
    credentialAuthority: 'product-auth.js',
    guestBootstrapPreserved: true,
    confirmationHandoffPreserved: true,
    confirmationHandoffSchema: 2,
    requests,
  }, null, 2)}\n`, 'utf8');

  console.log('MyeongHa_WEB_AUTH_SIGNUP_GUEST_BOOTSTRAP_BROWSER_PASS');
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
