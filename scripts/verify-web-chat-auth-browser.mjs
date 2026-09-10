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
const memberA = Object.freeze({
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  email: 'chat-owner-a@example.com',
  tokenPrefix: 'chat-owner-a',
  refreshPrefix: 'chat-owner-a-refresh',
});
const memberB = Object.freeze({
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  email: 'chat-owner-b@example.com',
  tokenPrefix: 'chat-owner-b',
  refreshPrefix: 'chat-owner-b-refresh',
});
const members = [memberA, memberB];
const signInCounts = new Map();
const signInRequests = [];
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
let envelopeNo = 0;
let chatLoads = 0;

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

function jsonError(status) {
  const code = status === 401 ? 'AUTH_REQUIRED' : status === 403 ? 'FORBIDDEN' : 'INTERNAL_ERROR';
  return JSON.stringify({ ok: false, error: { code, message: code } });
}

function envelope(data) {
  envelopeNo += 1;
  return {
    ok: true,
    data,
    meta: {
      apiContractVersion: 'chat-member-replacement-v1',
      requestId: `chat-member-replacement-${envelopeNo}`,
      serverTime: '2026-09-11T12:00:00.000Z',
    },
  };
}

async function readJsonBody(request) {
  let raw = '';
  for await (const chunk of request) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function nextSession(member) {
  const generation = (signInCounts.get(member.id) ?? 0) + 1;
  signInCounts.set(member.id, generation);
  return {
    accessToken: `${member.tokenPrefix}-${generation}.payload.signature`,
    refreshToken: `${member.refreshPrefix}-${generation}`,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    tokenType: 'bearer',
    user: { id: member.id, email: member.email },
  };
}

function memberForAuthorization(value) {
  return members.find((member) => typeof value === 'string' && value.startsWith(`Bearer ${member.tokenPrefix}-`)) ?? null;
}

function ownerThreadState() {
  return {
    threadId: 'owner-thread',
    characterId: '11111111-1111-4111-8111-111111111111',
    lastSequenceNo: 2,
    messages: [
      {
        sequenceNo: 1,
        senderType: 'user',
        characterId: null,
        bodyText: 'Member A private owner message',
        redacted: false,
        createdAt: '2026-09-11T01:00:00.000Z',
      },
      {
        sequenceNo: 2,
        senderType: 'character',
        characterId: '11111111-1111-4111-8111-111111111111',
        bodyText: 'Member A private character reply',
        redacted: false,
        createdAt: '2026-09-11T01:01:00.000Z',
      },
    ],
  };
}

async function serve() {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');

    if (url.pathname === '/api/auth/sign-in' && request.method === 'POST') {
      const input = await readJsonBody(request);
      const member = members.find((candidate) => candidate.email === input.email) ?? null;
      signInRequests.push({ email: input.email ?? null, member: member?.email ?? null });
      if (!member) {
        response.writeHead(401, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        response.end(jsonError(401));
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify(envelope({ status: 'authenticated', session: nextSession(member) })));
      return;
    }

    if (url.pathname.startsWith('/api/chat/')) {
      const threadId = decodeURIComponent(url.pathname.slice('/api/chat/'.length));
      const authorization = request.headers.authorization ?? null;
      if (threadId === 'owner-thread') {
        const member = memberForAuthorization(authorization);
        const status = member?.id === memberA.id ? 200 : 403;
        requests.push({
          threadId,
          method: request.method,
          authorization,
          afterSequenceNo: url.searchParams.get('afterSequenceNo'),
          status,
          member: member?.email ?? null,
        });
        response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        response.end(status === 200 ? JSON.stringify(envelope(ownerThreadState())) : jsonError(status));
        return;
      }

      const status = responses.get(threadId) ?? 404;
      requests.push({
        threadId,
        method: request.method,
        authorization,
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
      if (relative === 'chat.html') chatLoads += 1;
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

async function waitFor(client, expression, message) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await client.evaluate(expression)) return;
    await sleep(50);
  }
  throw new Error(`${message}; requests=${JSON.stringify(requests)}`);
}

async function waitForRuntimeFailure(client) {
  await waitFor(
    client,
    `document.querySelector('[data-compose-status]')?.textContent?.includes('현재 대화 기록 연결을 사용할 수 없습니다.') === true`,
    'Chat runtime did not expose its API failure state',
  );
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
    } else if (${JSON.stringify(guestToken)} !== null) {
      sessionStorage.setItem(${JSON.stringify(activeBearerKey)}, ${JSON.stringify(guestToken)});
    }
  })()`);
}

async function clearAuthority(client) {
  await navigate(client, `${origin}/hall.html`);
  await client.evaluate(`(() => {
    localStorage.removeItem(${JSON.stringify(memberKey)});
    sessionStorage.removeItem(${JSON.stringify(activeBearerKey)});
    sessionStorage.removeItem(${JSON.stringify(pendingGuestKey)});
  })()`);
}

async function authority(client) {
  return client.evaluate(`(() => ({
    member: localStorage.getItem(${JSON.stringify(memberKey)}),
    active: sessionStorage.getItem(${JSON.stringify(activeBearerKey)}),
    pending: sessionStorage.getItem(${JSON.stringify(pendingGuestKey)}),
  }))()`);
}

async function signIn(client, member) {
  return client.evaluate(`import('./product-auth.js').then(({ signInWithPassword }) => signInWithPassword(${JSON.stringify(member.email)}, 'test-only'))`);
}

async function runScenario(client, { threadId, kind, guestToken = null }) {
  await resetAuthority(client, kind, guestToken);
  await navigate(client, `${origin}/chat.html?character=seyeon&threadId=${encodeURIComponent(threadId)}`);
  await waitForRuntimeFailure(client);
  return authority(client);
}

for (const file of ['chat.html', 'chat-runtime-client.js', 'product-auth.js', 'product-auth-surface.js', 'api-envelope.js']) {
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
let replacementClient;

try {
  const port = await devtoolsPort(profile, chrome);
  client = await connectCdp(port);

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
  for (const [scenarioThreadId, authorization] of expectedAuth) {
    const request = requests.find((candidate) => candidate.threadId === scenarioThreadId);
    assert(request, `Missing Chat request for ${scenarioThreadId}`);
    assert(request.method === 'GET', `Chat ${scenarioThreadId} did not use GET`);
    assert(request.authorization === authorization, `Chat ${scenarioThreadId} used the wrong Authorization bearer`);
    assert(request.afterSequenceNo === '0', `Chat ${scenarioThreadId} lost its sequence cursor`);
  }

  await clearAuthority(client);
  const firstASession = await signIn(client, memberA);
  assert(firstASession?.user?.id === memberA.id, 'Member A sign-in did not return Member A');
  await navigate(client, `${origin}/chat.html?character=seyeon&threadId=owner-thread`);
  await waitFor(
    client,
    `document.body.textContent.includes('Member A private owner message') && document.body.textContent.includes('Member A private character reply')`,
    'Member A owner-scoped Chat stream did not render',
  );
  const initialChatLoads = chatLoads;
  assert(initialChatLoads >= 1, 'initial Chat page load was not observed');

  replacementClient = await connectCdp(port);
  await navigate(replacementClient, `${origin}/hall.html`);
  const secondASession = await signIn(replacementClient, memberA);
  assert(secondASession?.user?.id === memberA.id, 'same-Member sign-in did not remain Member A');
  assert(secondASession?.accessToken !== firstASession.accessToken, 'same-Member sign-in did not rotate the token');
  await waitFor(
    client,
    `JSON.parse(localStorage.getItem(${JSON.stringify(memberKey)}) ?? 'null')?.accessToken === ${JSON.stringify(secondASession.accessToken)}`,
    'same-Member rotated session did not converge into the Chat tab',
  );
  await sleep(500);
  const sameMemberPreserved = chatLoads === initialChatLoads && await client.evaluate(`document.body.textContent.includes('Member A private owner message')`);
  assert(sameMemberPreserved, `same-Member token rotation disturbed Chat owner state; before=${initialChatLoads} after=${chatLoads}`);

  const loadsBeforeReplacement = chatLoads;
  const bSession = await signIn(replacementClient, memberB);
  assert(bSession?.user?.id === memberB.id, 'Member B sign-in did not return Member B');
  await waitFor(
    client,
    `JSON.parse(localStorage.getItem(${JSON.stringify(memberKey)}) ?? 'null')?.user?.id === ${JSON.stringify(memberB.id)}`,
    'Member B did not become canonical in the Chat tab',
  );
  await waitFor(
    client,
    `document.querySelector('[data-compose-status]')?.textContent?.includes('현재 대화 기록 연결을 사용할 수 없습니다.') === true`,
    'Chat did not re-evaluate the A thread under Member B authority',
  );
  assert(chatLoads === loadsBeforeReplacement + 1, `Member replacement Chat reload count mismatch: before=${loadsBeforeReplacement} after=${chatLoads}`);
  const staleOwnerCleared = await client.evaluate(`!document.body.textContent.includes('Member A private owner message') && !document.body.textContent.includes('Member A private character reply')`);
  assert(staleOwnerCleared, 'Member A owner-scoped Chat messages remained visible after Member B became canonical');

  const ownerThreadRequests = requests.filter((entry) => entry.threadId === 'owner-thread');
  assert(ownerThreadRequests.length === 2, `unexpected owner-thread read count: ${ownerThreadRequests.length}`);
  assert(ownerThreadRequests[0].member === memberA.email && ownerThreadRequests[0].status === 200, 'initial owner-thread read did not use Member A authority');
  assert(ownerThreadRequests[1].member === memberB.email && ownerThreadRequests[1].status === 403, 'replacement owner-thread read was not rejected under Member B authority');
  assert(ownerThreadRequests[1].authorization === `Bearer ${bSession.accessToken}`, 'replacement owner-thread read did not use Member B canonical token');

  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/web-chat-auth-browser-smoke.json', `${JSON.stringify({
    status: 'PASS',
    member401: { rejectedMemberDiscarded: true },
    guest401: { rejectedGuestDiscarded: true },
    member403: { memberPreserved: true },
    guest403: { guestPreserved: true },
    member500: { memberPreserved: true },
    memberReplacement: {
      sameMemberPreserved,
      tokenRotated: secondASession.accessToken !== firstASession.accessToken,
      subjectReload: chatLoads === loadsBeforeReplacement + 1,
      staleOwnerCleared,
      memberBRejected: ownerThreadRequests[1].status === 403,
      chatLoads,
      signInRequests,
      ownerThreadRequests,
    },
    requests,
  }, null, 2)}\n`, 'utf8');
  console.log('MyeongHa_WEB_CHAT_AUTH_REJECTION_BROWSER_PASS');
  console.log('MyeongHa_WEB_CHAT_MEMBER_SUBJECT_REPLACEMENT_BROWSER_PASS same_member_preserved=true token_rotated=true subject_reload=true stale_owner_cleared=true member_b_rejected=true');
} catch (error) {
  console.error(error);
  if (chromeError.trim()) console.error(chromeError.trim());
  process.exitCode = 1;
} finally {
  replacementClient?.close();
  client?.close();
  chrome.kill('SIGTERM');
  await Promise.race([
    new Promise((resolvePromise) => chrome.once('exit', resolvePromise)),
    sleep(2_000),
  ]);
  await new Promise((resolvePromise) => server.close(resolvePromise));
  await rm(profile, { recursive: true, force: true });
}
