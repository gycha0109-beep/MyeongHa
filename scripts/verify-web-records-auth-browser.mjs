import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const member = Object.freeze({
  id: '11111111-1111-4111-8111-111111111111',
  email: 'records-member@example.com',
  password: 'records-password-12345',
  accessToken: 'records.header.payload.signature',
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
let requestNo = 0;

function envelope(data) {
  requestNo += 1;
  return {
    ok: true,
    data,
    meta: {
      apiContractVersion: 'records-browser-auth-v1',
      requestId: `records-browser-${requestNo}`,
      serverTime: '2026-09-06T00:00:00.000Z',
    },
  };
}

function authError() {
  requestNo += 1;
  return {
    ok: false,
    error: { code: 'AUTH_REQUIRED', messageKey: 'auth.required', retryable: false },
    meta: {
      apiContractVersion: 'records-browser-auth-v1',
      requestId: `records-browser-${requestNo}`,
      serverTime: '2026-09-06T00:00:00.000Z',
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
        requests.push({ path: pathname, authorization });
        if (body.email !== member.email || body.password !== member.password) {
          sendJson(res, 401, authError());
          return;
        }
        sendJson(res, 200, envelope({
          status: 'authenticated',
          session: {
            accessToken: member.accessToken,
            refreshToken: 'records-refresh-token',
            expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            tokenType: 'bearer',
            user: { id: member.id, email: member.email },
          },
        }));
        return;
      }

      if (['/api/me', '/api/life-record', '/api/memories'].includes(pathname) && req.method === 'GET') {
        requests.push({ path: pathname, authorization });
        if (authorization !== `Bearer ${member.accessToken}`) {
          sendJson(res, 401, authError());
          return;
        }
        if (pathname === '/api/me') {
          sendJson(res, 200, envelope({
            subjectKind: 'member',
            subjectStatus: 'active',
            profile: {
              displayName: '기록 회원',
              locale: 'ko-KR',
              timezone: 'Asia/Seoul',
              onboardingState: 'completed',
              updatedAt: '2026-09-06T00:00:00.000Z',
            },
          }));
          return;
        }
        if (pathname === '/api/life-record') {
          sendJson(res, 200, envelope({ facts: [] }));
          return;
        }
        sendJson(res, 200, envelope({ memories: [] }));
        return;
      }

      if (pathname.startsWith('/api/')) {
        sendJson(res, 404, {
          ok: false,
          error: { code: 'NOT_FOUND', messageKey: 'not_found', retryable: false },
          meta: {
            apiContractVersion: 'records-browser-auth-v1',
            requestId: 'records-browser-not-found',
            serverTime: '2026-09-06T00:00:00.000Z',
          },
        });
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
  assert(address && typeof address === 'object', 'records browser server address unavailable');
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

async function waitFor(client, expression, message, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return;
    await sleep(50);
  }
  const diagnostics = await client.evaluate(`(() => ({
    pathname: location.pathname,
    status: document.querySelector('#records-status')?.textContent?.trim() ?? null,
    displayName: document.querySelector('#records-display-name')?.textContent?.trim() ?? null,
    memberSession: localStorage.getItem('myeongha.memberSession.v1'),
  }))()`);
  throw new Error(`${message}; diagnostics=${JSON.stringify(diagnostics)}; requests=${JSON.stringify(requests)}`);
}

for (const file of [
  'auth.html',
  'auth-page.js',
  'product-auth.js',
  'records.html',
  'records-page.js',
  'records-runtime-client.js',
  'api-envelope.js',
]) {
  await stat(join(root, file));
}

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-records-auth-browser-'));
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
  const navigation = await client.send('Page.navigate', { url: `${origin}/auth.html?next=records.html` });
  assert(!navigation.errorText, `Auth navigation failed: ${navigation.errorText}`);
  await waitFor(client, `location.pathname === '/auth.html' && Boolean(document.querySelector('#auth-form'))`, 'Auth form did not render');

  await client.evaluate(`(() => {
    document.querySelector('#auth-email').value = ${JSON.stringify(member.email)};
    document.querySelector('#auth-password').value = ${JSON.stringify(member.password)};
    document.querySelector('#auth-form').requestSubmit();
  })()`);

  await waitFor(
    client,
    `location.pathname === '/records.html' && document.querySelector('#records-content')?.hidden === false && document.querySelector('#records-display-name')?.textContent?.trim() === '기록 회원'`,
    'Member login did not reach an authorized Records state',
  );

  const session = await client.evaluate(`JSON.parse(localStorage.getItem('myeongha.memberSession.v1') ?? 'null')`);
  assert(session?.user?.id === member.id, 'Records browser stored the wrong Member identity');
  assert(session?.accessToken === member.accessToken, 'Records browser stored the wrong Member access token');

  const recordsRequests = requests.filter((request) => ['/api/me', '/api/life-record', '/api/memories'].includes(request.path));
  assert(recordsRequests.length === 3, `Expected three Records API requests, received ${recordsRequests.length}`);
  assert(recordsRequests[0].path === '/api/me', 'Records did not validate canonical /api/me before reading ledgers');
  for (const request of recordsRequests) {
    assert(request.authorization === `Bearer ${member.accessToken}`, `${request.path} did not use the active Member bearer`);
  }

  console.log('MyeongHa_WEB_RECORDS_AUTH_BROWSER_PASS');
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
