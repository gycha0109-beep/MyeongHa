import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const rejectedToken = 'my-rejected-member.payload.signature';
const rejectedEmail = 'rejected-member@example.com';
const rejectedDisplayName = '격리 대상 회원';
const guestBearer = 'preserved-guest-bearer';
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
]);
const assert = (value, message) => { if (!value) throw new Error(message); };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const requests = [];

function envelope(data) {
  return {
    ok: true,
    data,
    meta: {
      apiContractVersion: 'my-same-tab-rejection-v1',
      requestId: 'my-same-tab-rejection',
      serverTime: '2026-09-11T10:00:00.000Z',
    },
  };
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url ?? '/', 'http://127.0.0.1').pathname);
      const authorization = req.headers.authorization ?? null;
      if (path === '/api/me' && req.method === 'GET') {
        requests.push({ path, authorization });
        if (authorization !== `Bearer ${rejectedToken}`) {
          return json(res, 401, { ok: false, error: { code: 'AUTH_REQUIRED' } });
        }
        return json(res, 200, envelope({
          subjectKind: 'member',
          subjectStatus: 'active',
          profile: {
            displayName: rejectedDisplayName,
            locale: 'ko-KR',
            timezone: 'Asia/Seoul',
            onboardingState: 'complete',
            updatedAt: '2026-09-11T09:59:00.000Z',
          },
        }));
      }
      if (path === '/api/me/birth-profile' && req.method === 'GET') {
        requests.push({ path, authorization });
        if (authorization === `Bearer ${rejectedToken}`) {
          await sleep(500);
          return json(res, 401, { ok: false, error: { code: 'AUTH_REQUIRED' } });
        }
        return json(res, 401, { ok: false, error: { code: 'AUTH_REQUIRED' } });
      }
      if (path.startsWith('/api/')) {
        requests.push({ path, authorization });
        return json(res, 404, { ok: false, error: { code: 'NOT_FOUND' } });
      }

      const staticPath = path === '/' ? '/my.html' : path;
      const file = resolve(root, normalize(staticPath).replace(/^[/\\]+/, ''));
      assert(file.startsWith(`${root}/`), 'request escaped static root');
      assert((await stat(file)).isFile(), 'not a file');
      res.setHeader('Content-Type', mime.get(extname(file).toLowerCase()) ?? 'application/octet-stream');
      createReadStream(file).pipe(res);
    } catch (error) {
      res.statusCode = 500;
      res.end(error instanceof Error ? error.message : 'server error');
    }
  });

  await new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', done);
  });
  const address = server.address();
  assert(address && typeof address === 'object', 'server address unavailable');
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

async function chromePort(profileDir, process) {
  for (let i = 0; i < 100; i += 1) {
    assert(process.exitCode === null, `Chrome exited early (${process.exitCode})`);
    try {
      const [port] = (await readFile(join(profileDir, 'DevToolsActivePort'), 'utf8')).trim().split(/\r?\n/);
      if (port) return Number(port);
    } catch {}
    await sleep(50);
  }
  throw new Error('Chrome DevTools port timeout');
}

async function connect(port) {
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
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result ?? {});
  });
  const send = (method, params = {}) => new Promise((resolveCall, rejectCall) => {
    const requestId = ++id;
    pending.set(requestId, { resolve: resolveCall, reject: rejectCall });
    ws.send(JSON.stringify({ id: requestId, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    assert(!result.exceptionDetails, result.exceptionDetails?.text ?? 'evaluation failed');
    return result.result?.value;
  };
  await Promise.all([send('Page.enable'), send('Runtime.enable')]);
  return { send, evaluate, close: () => ws.close() };
}

async function waitFor(client, expression, message, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return;
    await sleep(25);
  }
  throw new Error(`${message}; requests=${JSON.stringify(requests)}`);
}

async function navigate(client, origin) {
  const result = await client.send('Page.navigate', { url: `${origin}/my.html` });
  assert(!result.errorText, `Navigation failed: ${result.errorText}`);
  await waitFor(client, `location.pathname === '/my.html' && document.readyState === 'complete'`, 'My page navigation failed');
}

for (const file of ['my.html', 'my-page.js', 'my-runtime-client.js', 'product-auth.js', 'product-auth-surface.js']) {
  await stat(join(root, file));
}

const { server, origin } = await serve();
const profileDir = await mkdtemp(join(tmpdir(), 'myeongha-my-same-tab-rejection-'));
const chrome = spawn(chromeBin, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--remote-debugging-port=0',
  `--user-data-dir=${profileDir}`,
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
let chromeError = '';
chrome.stderr.setEncoding('utf8');
chrome.stderr.on('data', (chunk) => { chromeError += chunk; });
let client;
let functionalPass = false;

try {
  client = await connect(await chromePort(profileDir, chrome));
  await navigate(client, origin);
  await client.evaluate(`(() => {
    localStorage.setItem('myeongha.memberSession.v1', JSON.stringify({
      accessToken: ${JSON.stringify(rejectedToken)},
      refreshToken: 'my-rejected-member-refresh',
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      tokenType: 'bearer',
      user: {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        email: ${JSON.stringify(rejectedEmail)},
      },
    }));
    sessionStorage.setItem('myeongha.guestBearer.v1', ${JSON.stringify(guestBearer)});
  })()`);
  await navigate(client, origin);

  await waitFor(
    client,
    `document.querySelector('#my-content')?.hidden === false && document.querySelector('#my-display-name')?.textContent?.trim() === ${JSON.stringify(rejectedDisplayName)} && document.querySelector('#my-account-email')?.textContent?.trim() === ${JSON.stringify(rejectedEmail)}`,
    'rejected Member profile did not render before the delayed Birth rejection',
  );

  await waitFor(
    client,
    `localStorage.getItem('myeongha.memberSession.v1') === null && document.querySelector('#my-content')?.hidden === true`,
    'rejected Member did not invalidate and fail-close My in the same tab',
  );

  const finalState = await client.evaluate(`(() => ({
    member: localStorage.getItem('myeongha.memberSession.v1'),
    guest: sessionStorage.getItem('myeongha.guestBearer.v1'),
    contentHidden: document.querySelector('#my-content')?.hidden,
    birthHidden: document.querySelector('#my-birth-content')?.hidden,
    displayName: document.querySelector('#my-display-name')?.textContent ?? null,
    email: document.querySelector('#my-account-email')?.textContent ?? null,
    note: document.querySelector('#my-account-note')?.textContent ?? null,
    bodyText: document.body.textContent ?? '',
    status: document.querySelector('#my-status')?.textContent ?? '',
  }))()`);
  assert(finalState.member === null, 'rejected Member credential remained canonical');
  assert(finalState.guest === guestBearer, 'unrejected Guest credential was removed');
  assert(finalState.contentHidden === true && finalState.birthHidden === true, 'My owner state did not fail-close');
  assert(finalState.displayName === '' && finalState.email === '' && finalState.note === '', 'stale Member profile values remained in the DOM');
  assert(!finalState.bodyText.includes(rejectedDisplayName) && !finalState.bodyText.includes(rejectedEmail), 'rejected Member private profile remained in document text');
  assert(finalState.status.includes('더 이상 유효하지 않아'), 'My rejected-session fail-closed status was not rendered');

  functionalPass = true;
  console.log('MyeongHa_WEB_MY_SAME_TAB_REJECTED_MEMBER_BROWSER_PASS member_invalidated=true guest_preserved=true stale_profile_cleared=true fail_closed=true');
} catch (error) {
  if (chromeError.trim()) console.error(chromeError.trim());
  throw error;
} finally {
  client?.close();
  if (chrome.exitCode === null) {
    const exited = new Promise((done) => chrome.once('exit', done));
    chrome.kill('SIGTERM');
    await Promise.race([exited, sleep(2_000)]);
  }
  await new Promise((done) => server.close(done));
  try {
    await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (error) {
    if (!functionalPass || error?.code !== 'ENOTEMPTY') throw error;
    console.warn(`Chrome profile cleanup skipped after functional PASS: ${error.message}`);
  }
}
