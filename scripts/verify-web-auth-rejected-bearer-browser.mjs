import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const memberKey = 'myeongha.memberSession.v1';
const activeBearerKey = 'myeongha.guestBearer.v1';
const pendingGuestKey = 'myeongha.pendingGuestBearer.v1';
const memberToken = 'rejected.payload.signature';
const guestToken = 'rejected-opaque-guest-browser';
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

function envelope(data) {
  requestNo += 1;
  return {
    ok: true,
    data,
    meta: {
      apiContractVersion: 'auth-rejected-bearer-browser-v1',
      requestId: `auth-rejected-bearer-${requestNo}`,
      serverTime: '2026-09-08T00:00:00.000Z',
    },
  };
}

function errorEnvelope(code = 'AUTH_REQUIRED') {
  requestNo += 1;
  return {
    ok: false,
    error: { code, messageKey: 'auth.required', retryable: false },
    meta: {
      apiContractVersion: 'auth-rejected-bearer-browser-v1',
      requestId: `auth-rejected-bearer-${requestNo}`,
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

function bearerKind(authorization) {
  if (authorization === `Bearer ${memberToken}`) return 'member';
  if (authorization === `Bearer ${guestToken}`) return 'guest';
  return null;
}

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const pathname = decodeURIComponent(url.pathname);
      const authorization = req.headers.authorization ?? null;
      const kind = bearerKind(authorization);

      if (pathname === '/api/me' && req.method === 'GET') {
        requests.push({ scenario, path: pathname, authorization });
        if (!kind || (scenario === 'my-guest-profile-401' && kind === 'guest')) {
          sendJson(res, 401, errorEnvelope());
          return;
        }
        sendJson(res, 200, envelope({
          subjectKind: kind,
          subjectStatus: 'active',
          profile: {
            displayName: kind === 'member' ? '거부 테스트 회원' : null,
            locale: 'ko-KR',
            timezone: 'Asia/Seoul',
            onboardingState: 'completed',
            updatedAt: '2026-09-08T00:00:00.000Z',
          },
        }));
        return;
      }

      if (pathname === '/api/me/birth-profile' && req.method === 'GET') {
        requests.push({ scenario, path: pathname, authorization });
        if (!kind) {
          sendJson(res, 401, errorEnvelope());
          return;
        }
        if (scenario === 'my-birth-401' && kind === 'member') {
          sendJson(res, 401, errorEnvelope());
          return;
        }
        if (scenario === 'my-birth-403' && kind === 'member') {
          sendJson(res, 403, errorEnvelope('FORBIDDEN'));
          return;
        }
        sendJson(res, 200, envelope({ birthProfile: null }));
        return;
      }

      if (pathname === '/api/life-record' && req.method === 'GET') {
        requests.push({ scenario, path: pathname, authorization });
        if (!kind) {
          sendJson(res, 401, errorEnvelope());
          return;
        }
        if (scenario === 'records-life-401' && kind === 'member') {
          sendJson(res, 401, errorEnvelope());
          return;
        }
        if (scenario === 'records-life-403' && kind === 'member') {
          sendJson(res, 403, errorEnvelope('FORBIDDEN'));
          return;
        }
        sendJson(res, 200, envelope({ facts: [] }));
        return;
      }

      if (pathname === '/api/readings' && req.method === 'GET') {
        requests.push({ scenario, path: pathname, authorization });
        if (!kind) {
          sendJson(res, 401, errorEnvelope());
          return;
        }
        sendJson(res, 200, envelope({ readings: [] }));
        return;
      }

      if (pathname === '/api/memories' && req.method === 'GET') {
        requests.push({ scenario, path: pathname, authorization });
        if (!kind || (scenario === 'records-guest-401' && kind === 'guest')) {
          sendJson(res, 401, errorEnvelope());
          return;
        }
        sendJson(res, 200, envelope({ memories: [] }));
        return;
      }

      if (pathname.startsWith('/api/')) {
        sendJson(res, 404, errorEnvelope('NOT_FOUND'));
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
    myStatus: document.querySelector('#my-status')?.textContent?.trim() ?? null,
    myBirthStatus: document.querySelector('#my-birth-status')?.textContent?.trim() ?? null,
    recordsStatus: document.querySelector('#records-status')?.textContent?.trim() ?? null,
    member: localStorage.getItem(${JSON.stringify(memberKey)}),
    active: sessionStorage.getItem(${JSON.stringify(activeBearerKey)}),
    pending: sessionStorage.getItem(${JSON.stringify(pendingGuestKey)}),
  }))()`);
  throw new Error(`${message}; diagnostics=${JSON.stringify(diagnostics)}; requests=${JSON.stringify(requests)}`);
}

async function seedMember(client) {
  await client.evaluate(`(() => {
    localStorage.setItem(${JSON.stringify(memberKey)}, JSON.stringify({
      accessToken: ${JSON.stringify(memberToken)},
      refreshToken: 'rejected-refresh-token',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      tokenType: 'bearer',
      user: { id: '11111111-1111-4111-8111-111111111111', email: 'reject-browser@example.com' },
    }));
    sessionStorage.setItem(${JSON.stringify(activeBearerKey)}, ${JSON.stringify(memberToken)});
    sessionStorage.removeItem(${JSON.stringify(pendingGuestKey)});
  })()`);
}

async function seedGuest(client) {
  await client.evaluate(`(() => {
    localStorage.removeItem(${JSON.stringify(memberKey)});
    sessionStorage.setItem(${JSON.stringify(activeBearerKey)}, ${JSON.stringify(guestToken)});
    sessionStorage.removeItem(${JSON.stringify(pendingGuestKey)});
  })()`);
}

for (const file of [
  'auth.html',
  'product-auth.js',
  'my.html',
  'my-page.js',
  'my-runtime-client.js',
  'records.html',
  'records-page.js',
  'records-runtime-client.js',
  'api-envelope.js',
]) {
  await stat(join(root, file));
}

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-auth-rejected-bearer-browser-'));
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
  await navigate(client, origin, '/auth.html', '#auth-form');

  scenario = 'my-birth-401';
  await seedMember(client);
  await navigate(client, origin, '/my.html?case=birth401', '#my-status');
  await waitFor(
    client,
    `document.querySelector('#my-birth-status')?.textContent?.includes('세션이 만료') === true && localStorage.getItem(${JSON.stringify(memberKey)}) === null`,
    'My Birth authoritative 401 did not invalidate the rejected Member',
  );

  scenario = 'my-birth-403';
  await seedMember(client);
  await navigate(client, origin, '/my.html?case=birth403', '#my-status');
  await waitFor(
    client,
    `document.querySelector('#my-birth-status')?.textContent?.includes('세션이 만료') === true && localStorage.getItem(${JSON.stringify(memberKey)}) !== null && sessionStorage.getItem(${JSON.stringify(activeBearerKey)}) === ${JSON.stringify(memberToken)}`,
    'My Birth 403 incorrectly invalidated the Member',
  );

  scenario = 'my-guest-profile-401';
  await seedGuest(client);
  await navigate(client, origin, '/my.html?case=guest401', '#my-status');
  await waitFor(
    client,
    `document.querySelector('#my-status')?.textContent?.includes('현재 세션이 필요') === true && sessionStorage.getItem(${JSON.stringify(activeBearerKey)}) === null`,
    'My profile authoritative 401 did not invalidate the rejected Guest',
  );

  scenario = 'records-life-401';
  await seedMember(client);
  await navigate(client, origin, '/records.html?case=life401', '#records-status');
  await waitFor(
    client,
    `document.querySelector('#records-status')?.textContent?.includes('현재 세션이 필요') === true && localStorage.getItem(${JSON.stringify(memberKey)}) === null`,
    'Records ledger authoritative 401 did not invalidate the rejected Member',
  );

  scenario = 'records-life-403';
  await seedMember(client);
  await navigate(client, origin, '/records.html?case=life403', '#records-status');
  await waitFor(
    client,
    `document.querySelector('#records-status')?.textContent?.includes('현재 세션이 필요') === true && localStorage.getItem(${JSON.stringify(memberKey)}) !== null && sessionStorage.getItem(${JSON.stringify(activeBearerKey)}) === ${JSON.stringify(memberToken)}`,
    'Records ledger 403 incorrectly invalidated the Member',
  );

  scenario = 'records-guest-401';
  await seedGuest(client);
  await navigate(client, origin, '/records.html?case=guest401', '#records-status');
  await waitFor(
    client,
    `document.querySelector('#records-status')?.textContent?.includes('현재 세션이 필요') === true && sessionStorage.getItem(${JSON.stringify(activeBearerKey)}) === null`,
    'Records ledger authoritative 401 did not invalidate the rejected Guest',
  );

  await mkdir(join(process.cwd(), 'artifacts'), { recursive: true });
  await writeFile(join(process.cwd(), 'artifacts', 'web-auth-rejected-bearer-browser-smoke.json'), `${JSON.stringify({
    status: 'PASS',
    myBirthMember401Invalidated: true,
    myBirthMember403Preserved: true,
    myProfileGuest401Invalidated: true,
    recordsLedgerMember401Invalidated: true,
    recordsLedgerMember403Preserved: true,
    recordsLedgerGuest401Invalidated: true,
    requests,
  }, null, 2)}\n`, 'utf8');

  console.log('MyeongHa_WEB_AUTH_REJECTED_BEARER_BROWSER_PASS');
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
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
