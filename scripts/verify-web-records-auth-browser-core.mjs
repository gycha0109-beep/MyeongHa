import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const member = Object.freeze({
  id: '11111111-1111-4111-8111-111111111111',
  email: 'records-member@example.com',
  password: 'records-password-12345',
  accessToken: 'records.payload.signature',
});
const reading = Object.freeze({
  readingId: '44444444-4444-4444-8444-444444444444',
  readingSessionId: '55555555-5555-4555-8555-555555555555',
  sajuDomain: 'career',
  readingContractVersion: 'myeonghwa-product-reading-response-v2',
  productResponseState: 'delivered',
  readerCharacterIds: Object.freeze(['seyeon']),
  createdAt: '2026-09-23T00:00:00.000Z',
  completedAt: '2026-09-23T00:01:00.000Z',
});
const storedReading = Object.freeze({
  ...reading,
  reading: Object.freeze({
    responseVersion: reading.readingContractVersion,
    state: reading.productResponseState,
    reading: Object.freeze({
      readingId: reading.readingId,
      sections: Object.freeze([
        Object.freeze({
          sectionType: 'core',
          title: '직업 흐름',
          state: 'available',
          blocks: Object.freeze([
            Object.freeze({
              type: 'paragraph',
              text: '저장된 공식 풀이의 직업 흐름을 그대로 다시 확인합니다.',
            }),
            Object.freeze({
              type: 'source_hint',
              text: '근거 구조: 저장 당시 확정된 Official Reading 구조입니다.',
            }),
          ]),
        }),
      ]),
      disclosures: Object.freeze([]),
    }),
  }),
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

      if (['/api/me', '/api/life-record', '/api/readings', '/api/memories'].includes(pathname) && req.method === 'GET') {
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
          sendJson(res, 200, envelope({ facts: [], pagination: { pageSize: 50, hasMore: false, nextCursor: null } }));
          return;
        }
        if (pathname === '/api/readings') {
          const requestedReadingId = url.searchParams.get('readingId');
          if (requestedReadingId !== null) {
            if (
              url.searchParams.getAll('readingId').length !== 1
              || requestedReadingId !== reading.readingId
              || [...url.searchParams.keys()].some((key) => key !== 'readingId')
            ) {
              sendJson(res, 404, {
                ok: false,
                error: { code: 'NOT_FOUND', messageKey: 'readings.not_found', retryable: false },
                meta: {
                  apiContractVersion: 'records-browser-auth-v1',
                  requestId: 'records-browser-reading-not-found',
                  serverTime: '2026-09-23T00:02:00.000Z',
                },
              });
              return;
            }
            sendJson(res, 200, envelope(storedReading));
            return;
          }
          sendJson(res, 200, envelope({ readings: [reading], pagination: { pageSize: 50, hasMore: false, nextCursor: null } }));
          return;
        }
        sendJson(res, 200, envelope({ memories: [], pagination: { pageSize: 50, hasMore: false, nextCursor: null } }));
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
      assert(file.startsWith(`${root}${sep}`), 'request escaped static root');
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
  let lastEvaluationError = null;
  while (Date.now() < deadline) {
    try {
      if (await client.evaluate(expression)) return;
      lastEvaluationError = null;
    } catch (error) {
      lastEvaluationError = error;
    }
    await sleep(50);
  }
  let diagnostics = null;
  try {
    diagnostics = await client.evaluate(`(() => ({
      pathname: location.pathname,
      status: document.querySelector('#records-status')?.textContent?.trim() ?? null,
      displayName: document.querySelector('#records-display-name')?.textContent?.trim() ?? null,
      routeState: document.body.dataset.readingRouteState ?? null,
      recordMode: document.body.dataset.readingRecordMode ?? null,
      memberSession: localStorage.getItem('myeongha.memberSession.v1'),
    }))()`);
  } catch (error) {
    lastEvaluationError = error;
  }
  throw new Error(`${message}; diagnostics=${JSON.stringify(diagnostics)}; lastEvaluationError=${lastEvaluationError instanceof Error ? lastEvaluationError.message : null}; requests=${JSON.stringify(requests)}`);
}

for (const file of [
  'auth.html',
  'auth-page.js',
  'product-auth.js',
  'records.html',
  'records-page.js',
  'records-runtime-client.js',
  'reading-detail.html',
  'reading-character.js',
  'reading-history-handoff.js',
  'official-reading-record-contract.js',
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
  await waitFor(
    client,
    `document.readyState === 'complete' && location.pathname === '/auth.html' && Boolean(document.querySelector('#auth-form'))`,
    'Auth form did not fully initialize',
  );

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

  const recordsRequests = requests.filter((request) => ['/api/me', '/api/life-record', '/api/readings', '/api/memories'].includes(request.path));
  assert(recordsRequests.length === 4, `Expected four Records API requests, received ${recordsRequests.length}`);
  assert(recordsRequests[0].path === '/api/me', 'Records did not validate canonical /api/me before reading ledgers');
  for (const request of recordsRequests) {
    assert(request.authorization === `Bearer ${member.accessToken}`, `${request.path} did not use the active Member bearer`);
  }

  const cardState = await client.evaluate(`(() => {
    const card = document.querySelector('.records-reading-card--persisted');
    const link = card?.querySelector('a');
    return {
      cardCount: document.querySelectorAll('.records-reading-card--persisted').length,
      readerLabel: card?.querySelector('.records-reading-badge')?.textContent?.trim() ?? '',
      href: link?.getAttribute('href') ?? '',
      label: link?.textContent?.trim() ?? '',
    };
  })()`);
  assert(cardState.cardCount === 1, `Expected one persisted Reading card: ${JSON.stringify(cardState)}`);
  assert(cardState.readerLabel === '세연에게', `Records provenance label changed Reader display semantics: ${JSON.stringify(cardState)}`);
  assert(cardState.label === '저장된 풀이 열기 →', `Persisted Reading open action missing: ${JSON.stringify(cardState)}`);
  assert(cardState.href.includes('from=records'), `Persisted Reading handoff lost Records source: ${cardState.href}`);
  assert(cardState.href.includes(`readingId=${reading.readingId}`), `Persisted Reading handoff lost Reading identity: ${cardState.href}`);
  assert(!cardState.href.includes('reader=') && !cardState.href.includes('character=') && !cardState.href.includes('threadId='), `Records handoff promoted display provenance into authority: ${cardState.href}`);

  await client.evaluate(`document.querySelector('.records-reading-card--persisted a')?.click()`);
  await waitFor(
    client,
    `location.pathname === '/reading-detail.html' && document.body.dataset.readingRouteState === 'persisted_record' && document.body.dataset.readingRecordMode === 'official_archive'`,
    'Persisted Official Reading did not open in archive mode',
  );

  const archiveState = await client.evaluate(`(() => ({
    pathname: location.pathname,
    routeState: document.body.dataset.readingRouteState ?? '',
    recordMode: document.body.dataset.readingRecordMode ?? '',
    reader: document.body.dataset.reader ?? '',
    readerAuthority: document.body.dataset.readerAuthority ?? '',
    readerSceneHidden: document.querySelector('.reader-scene')?.hasAttribute('hidden') ?? false,
    characterBlockHidden: document.querySelector('.reading-character-block')?.hasAttribute('hidden') ?? false,
    stageHidden: document.querySelector('[data-reading-stage]')?.hidden ?? true,
    stepTitle: document.querySelector('[data-reading-step-title]')?.textContent?.trim() ?? '',
    stepBody: document.querySelector('[data-reading-step-body]')?.textContent?.trim() ?? '',
    backHref: document.querySelector('[data-reading-back-link]')?.getAttribute('href') ?? '',
    chatHref: document.querySelector('[data-reading-chat-link]')?.getAttribute('href') ?? '',
  }))()`);
  assert(archiveState.reader === '' && archiveState.readerAuthority === '', `Archive mode retained Reader authority: ${JSON.stringify(archiveState)}`);
  assert(archiveState.readerSceneHidden && archiveState.characterBlockHidden, `Archive mode exposed Reader presentation: ${JSON.stringify(archiveState)}`);
  assert(!archiveState.stageHidden, `Archive Reading stage stayed hidden: ${JSON.stringify(archiveState)}`);
  assert(archiveState.stepTitle === '직업 흐름', `Stored Reading title was not rendered: ${JSON.stringify(archiveState)}`);
  assert(archiveState.stepBody.includes('저장된 공식 풀이의 직업 흐름'), `Stored Reading body was not rendered: ${JSON.stringify(archiveState)}`);
  assert(archiveState.backHref === 'records.html?tab=saju', `Archive back action escaped Records: ${archiveState.backHref}`);
  assert(archiveState.chatHref === 'chat-hub.html', `Archive mode invented a direct Chat continuation: ${archiveState.chatHref}`);

  await client.evaluate(`document.querySelector('[data-reading-next]')?.click()`);
  await waitFor(
    client,
    `document.body.dataset.readingExperience === 'complete' && document.querySelector('[data-reading-completion]')?.hidden === false`,
    'Persisted Official Reading did not complete',
  );
  const completionState = await client.evaluate(`(() => ({
    title: document.querySelector('[data-reading-completion-title]')?.textContent?.trim() ?? '',
    recordsHref: document.querySelector('[data-reading-records-link]')?.getAttribute('href') ?? '',
    chatHref: document.querySelector('[data-reading-chat-link]')?.getAttribute('href') ?? '',
  }))()`);
  assert(completionState.title === '저장된 공식 사주 풀이를 끝까지 확인했습니다.', `Archive completion copy changed: ${JSON.stringify(completionState)}`);
  assert(completionState.recordsHref === 'records.html?tab=saju', `Archive completion did not return to Records: ${JSON.stringify(completionState)}`);
  assert(completionState.chatHref === 'chat-hub.html', `Archive completion invented Reader Chat authority: ${JSON.stringify(completionState)}`);

  await client.evaluate(`document.querySelector('[data-reading-records-link]')?.click()`);
  await waitFor(
    client,
    `location.pathname === '/records.html' && new URLSearchParams(location.search).get('tab') === 'saju' && document.querySelector('#records-content')?.hidden === false && document.querySelectorAll('.records-reading-card--persisted').length === 1`,
    'Archive completion did not return to the Saju Records list',
  );

  const detailRequests = requests.filter((request) => request.path === '/api/readings');
  assert(detailRequests.length >= 3, `Expected history, archive detail, and return history reads: ${JSON.stringify(detailRequests)}`);
  assert(detailRequests.every((request) => request.authorization === `Bearer ${member.accessToken}`), 'Persisted Reading round trip lost the active Member bearer');

  console.log('MyeongHa_WEB_RECORDS_AUTH_BROWSER_PASS persistedArchiveRoundTrip=true readerAuthorityPromoted=false');
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
