import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const memberKey = 'myeongha.memberSession.v1';
const activeBearerKey = 'myeongha.guestBearer.v1';
const pendingGuestKey = 'myeongha.pendingGuestBearer.v1';
const memberToken = 'member.chat.signature';
const memberEmail = 'chat-member@example.com';
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
]);
const responses = new Map([
  ['member-401', 401],
  ['guest-401', 401],
  ['member-403', 403],
  ['guest-403', 403],
  ['member-500', 500],
]);
const requests = [];

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

function jsonError(status) {
  const code = status === 401 ? 'AUTH_REQUIRED' : status === 403 ? 'FORBIDDEN' : 'INTERNAL_ERROR';
  return JSON.stringify({ ok: false, error: { code, message: code } });
}

async function serve() {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname.startsWith('/api/chat/')) {
      const threadId = decodeURIComponent(url.pathname.slice('/api/chat/'.length));
      const status = responses.get(threadId) ?? 404;
      requests.push({
        threadId,
        method: request.method,
        authorization: request.headers.authorization ?? null,
        afterSequenceNo: url.searchParams.get('afterSequenceNo'),
        status,
      });
      response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(jsonError(status));
      return;
    }

    try {
      const relative = url.pathname === '/' ? 'hall.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
      const filePath = normalize(join(root, relative));
      if (!filePath.startsWith(root)) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      const body = await readFile(filePath);
      response.writeHead(200, {
        'content-type': mime.get(extname(filePath).toLowerCase()) ?? 'application/octet-stream',
        'cache-control': 'no-store',
      });
      response.end(body);
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  assert(address && typeof address !== 'string', 'Chat auth server did not expose a TCP port');
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

async function devtoolsPort(profile, chrome) {
  const file = join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      const raw = await readFile(file, 'utf8');
      const port = Number(raw.split(/\r?\n/u)[0]);
      if (Number.isInteger(port) && port > 0) return port;
    } catch {}
    if (chrome.exitCode !== null) throw new Error(`Chrome exited before DevTools was ready (${chrome.exitCode})`);
    await sleep(50);
  }
  throw new Error('Timed out waiting for Chrome DevTools port');
}

async function connectCdp(port) {
  const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
  assert(targetResponse.ok, `Unable to create Chrome target (${targetResponse.status})`);
  const target = await targetResponse.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolvePromise, reject) => {
    ws.addEventListener('open', resolvePromise, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const payload = JSON.parse(event.data);
    if (!payload.id) return;
    const waiter = pending.get(payload.id);
    if (!waiter) return;
    pending.delete(payload.id);
    if (payload.error) waiter.reject(new Error(`${waiter.method}: ${JSON.stringify(payload.error)}`));
    else waiter.resolve(payload.result ?? {});
  });
  const send = (method, params = {}) => {
    const requestId = ++id;
    return new Promise((resolvePromise, reject) => {
      pending.set(requestId, { resolve: resolvePromise, reject, method });
      ws.send(JSON.stringify({ id: requestId, method, params }));
    });
  };
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(`Runtime.evaluate failed: ${result.exceptionDetails.text ?? 'unknown'}`);
    return result.result?.value;
  };
  await Promise.all([send('Page.enable'), send('Runtime.enable')]);
  return { send, evaluate, close: () => ws.close() };
}

async function navigate(client, url) {
  const result = await client.send('Page.navigate', { url });
  assert(!result.errorText, `Navigation failed: ${result.errorText}`);
  const expectedPath = new URL(url).pathname;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const state = await client.evaluate(`({ pathname: location.pathname, readyState: document.readyState })`);
    if (state?.pathname === expectedPath && state.readyState === 'complete') return;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${expectedPath}`);
}

async function waitForRuntimeFailure(client) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const text = await client.evaluate(`document.querySelector('[data-compose-status]')?.textContent ?? ''`);
    if (text.includes('현재 대화 기록 연결을 사용할 수 없습니다.')) return;
    await sleep(50);
  }
  throw new Error('Chat runtime did not expose its API failure state');
}

async function resetAuthority(client, kind, guestToken = null) {
  await navigate(client, `${origin}/hall.html`);
  await client.evaluate(`(() => {
    localStorage.removeItem(${JSON.stringify(memberKey)});
    sessionStorage.removeItem(${JSON.stringify(activeBearerKey)});
    sessionStorage.removeItem(${JSON.stringify(pendingGuestKey)});
    if (${JSON.stringify(kind)} === 'member') {
      localStorage.setItem(${JSON.stringify(memberKey)}, JSON.stringify({
        accessToken: ${JSON.stringify(memberToken)},
        refreshToken: 'chat-refresh-token',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        tokenType: 'bearer',
        user: { id: 'chat-auth-user', email: ${JSON.stringify(memberEmail)} },
      }));
    } else {
      sessionStorage.setItem(${JSON.stringify(activeBearerKey)}, ${JSON.stringify(guestToken)});
    }
  })()`);
}

async function authority(client) {
  return client.evaluate(`(() => ({
    member: localStorage.getItem(${JSON.stringify(memberKey)}),
    active: sessionStorage.getItem(${JSON.stringify(activeBearerKey)}),
    pending: sessionStorage.getItem(${JSON.stringify(pendingGuestKey)}),
  }))()`);
}

async function runScenario(client, { threadId, kind, guestToken = null }) {
  await resetAuthority(client, kind, guestToken);
  await navigate(client, `${origin}/chat.html?character=seyeon&threadId=${encodeURIComponent(threadId)}`);
  await waitForRuntimeFailure(client);
  return authority(client);
}

for (const file of ['chat.html', 'chat-runtime-client.js', 'product-auth.js', 'api-envelope.js']) {
  await stat(join(root, file));
}
const chatHtml = await readFile(join(root, 'chat.html'), 'utf8');
assert(chatHtml.includes('<script type="module" src="chat-runtime-client.js"></script>'), 'Chat runtime is not loaded as an ES module');

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-chat-auth-browser-'));
const chrome = spawn(chromeBin, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
let chromeError = '';
chrome.stderr.setEncoding('utf8');
chrome.stderr.on('data', (chunk) => { chromeError += chunk; });
let client;

try {
  client = await connectCdp(await devtoolsPort(profile, chrome));

  const member401 = await runScenario(client, { threadId: 'member-401', kind: 'member' });
  assert(member401.member === null, 'Chat Member 401 retained the rejected Member session');
  assert(member401.active === null, 'Chat Member 401 retained the rejected active JWT');

  const guest401Token = 'guest-chat-401';
  const guest401 = await runScenario(client, { threadId: 'guest-401', kind: 'guest', guestToken: guest401Token });
  assert(guest401.member === null, 'Chat Guest 401 unexpectedly created a Member session');
  assert(guest401.active === null, 'Chat Guest 401 retained the rejected Guest bearer');

  const member403 = await runScenario(client, { threadId: 'member-403', kind: 'member' });
  assert(member403.member !== null, 'Chat Member 403 discarded the Member session');
  assert(member403.active === memberToken, 'Chat Member 403 discarded the active Member bearer');

  const guest403Token = 'guest-chat-403';
  const guest403 = await runScenario(client, { threadId: 'guest-403', kind: 'guest', guestToken: guest403Token });
  assert(guest403.active === guest403Token, 'Chat Guest 403 discarded the Guest bearer');

  const member500 = await runScenario(client, { threadId: 'member-500', kind: 'member' });
  assert(member500.member !== null, 'Chat 500 discarded the Member session');
  assert(member500.active === memberToken, 'Chat 500 discarded the active Member bearer');

  const expectedAuth = new Map([
    ['member-401', `Bearer ${memberToken}`],
    ['guest-401', `Bearer ${guest401Token}`],
    ['member-403', `Bearer ${memberToken}`],
    ['guest-403', `Bearer ${guest403Token}`],
    ['member-500', `Bearer ${memberToken}`],
  ]);
  for (const [threadId, authorization] of expectedAuth) {
    const request = requests.find((candidate) => candidate.threadId === threadId);
    assert(request, `Missing Chat request for ${threadId}`);
    assert(request.method === 'GET', `Chat ${threadId} did not use GET`);
    assert(request.authorization === authorization, `Chat ${threadId} used the wrong Authorization bearer`);
    assert(request.afterSequenceNo === '0', `Chat ${threadId} lost its sequence cursor`);
  }

  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/web-chat-auth-browser-smoke.json', `${JSON.stringify({
    status: 'PASS',
    member401: { rejectedMemberDiscarded: true },
    guest401: { rejectedGuestDiscarded: true },
    member403: { memberPreserved: true },
    guest403: { guestPreserved: true },
    member500: { memberPreserved: true },
    requests,
  }, null, 2)}\n`, 'utf8');
  console.log('MyeongHa_WEB_CHAT_AUTH_REJECTION_BROWSER_PASS');
} catch (error) {
  console.error(error);
  if (chromeError.trim()) console.error(chromeError.trim());
  process.exitCode = 1;
} finally {
  client?.close();
  chrome.kill('SIGTERM');
  await Promise.race([
    new Promise((resolvePromise) => chrome.once('exit', resolvePromise)),
    sleep(2_000),
  ]);
  await new Promise((resolvePromise) => server.close(resolvePromise));
  await rm(profile, { recursive: true, force: true });
}
