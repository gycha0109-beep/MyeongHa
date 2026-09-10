import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const memberA = Object.freeze({
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  email: 'saju-a@example.com',
  token: 'saju-a.payload.signature',
  refresh: 'saju-a-refresh',
  dayMaster: '甲갑',
});
const memberB = Object.freeze({
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  email: 'saju-b@example.com',
  token: 'saju-b.payload.signature',
  refresh: 'saju-b-refresh',
  dayMaster: '乙을',
});
const members = [memberA, memberB];
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
]);
const requests = [];
const assert = (value, message) => { if (!value) throw new Error(message); };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
let requestNo = 0;
let readingLoads = 0;

function envelope(data) {
  requestNo += 1;
  return {
    ok: true,
    data,
    meta: {
      apiContractVersion: 'saju-member-replacement-v1',
      requestId: `saju-member-replacement-${requestNo}`,
      serverTime: '2026-09-11T00:00:00.000Z',
    },
  };
}

function session(member) {
  return {
    accessToken: member.token,
    refreshToken: member.refresh,
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    tokenType: 'bearer',
    user: { id: member.id, email: member.email },
  };
}

function memberForAuth(value) {
  return members.find((member) => value === `Bearer ${member.token}`) ?? null;
}

function calculation(member) {
  const stem = member === memberA
    ? { value: '갑', hanja: '甲', element: '목', yinYang: '양' }
    : { value: '을', hanja: '乙', element: '목', yinYang: '음' };
  return {
    calculation: {
      snapshot: {
        pillars: {
          day: {
            status: 'resolved',
            value: {
              stem,
              branch: { value: '자', hanja: '子', element: '수', yinYang: '양' },
            },
          },
        },
        completeness: { fullyResolved: false, birthTimeKnown: false },
      },
    },
  };
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function body(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url ?? '/', 'http://127.0.0.1').pathname);
      const authorization = req.headers.authorization ?? null;
      if (path === '/api/auth/sign-in' && req.method === 'POST') {
        const input = await body(req);
        const member = members.find((candidate) => candidate.email === input.email) ?? null;
        requests.push({ path, member: member?.email ?? null, authorization });
        if (!member) return json(res, 401, { ok: false, error: { code: 'INVALID_CREDENTIALS' } });
        return json(res, 200, envelope({ status: 'authenticated', session: session(member) }));
      }
      if (path === '/api/me/saju/calculation' && req.method === 'POST') {
        const member = memberForAuth(authorization);
        requests.push({ path, member: member?.email ?? null, authorization });
        if (!member) return json(res, 401, { ok: false, error: { code: 'AUTH_REQUIRED' } });
        return json(res, 200, envelope(calculation(member)));
      }
      if (path.startsWith('/api/')) {
        requests.push({ path, member: null, authorization });
        return json(res, 404, { ok: false, error: { code: 'NOT_FOUND' } });
      }
      const staticPath = path === '/' ? '/hall.html' : path;
      if (staticPath === '/reading.html') readingLoads += 1;
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

async function chromePort(profile, process) {
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
    await sleep(50);
  }
  throw new Error(`${message}; requests=${JSON.stringify(requests)}`);
}

async function navigate(client, origin, path, selector) {
  await client.send('Page.navigate', { url: `${origin}${path}` });
  await waitFor(
    client,
    `location.pathname === ${JSON.stringify(path)} && document.readyState === 'complete' && Boolean(document.querySelector(${JSON.stringify(selector)}))`,
    `navigation failed: ${path}`,
  );
}

async function signIn(client, member) {
  await client.evaluate(`import('./product-auth.js').then(({ signInWithPassword }) => signInWithPassword(${JSON.stringify(member.email)}, 'test-only'))`);
}

for (const file of [
  'hall.html',
  'reading.html',
  'saju-hub.js',
  'product-auth.js',
  'product-auth-ui.js',
  'product-auth-surface.js',
]) await stat(join(root, file));

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-saju-member-replacement-'));
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
let functionalPass = false;

try {
  const port = await chromePort(profile, chrome);
  tabA = await connect(port);
  await navigate(tabA, origin, '/hall.html', '.product-profile');
  await signIn(tabA, memberA);
  await navigate(tabA, origin, '/reading.html', '#saju-hub');
  await waitFor(
    tabA,
    `document.querySelector('#saju-hub')?.hidden === false && document.querySelector('#saju-day-master')?.textContent?.trim() === ${JSON.stringify(memberA.dayMaster)}`,
    'Member A Saju did not render',
  );

  const initialLoads = readingLoads;
  const initialACalculations = requests.filter((request) => request.path === '/api/me/saju/calculation' && request.member === memberA.email).length;
  assert(initialLoads >= 1, 'initial reading page load was not observed');
  assert(initialACalculations >= 1, 'initial Member A calculation was not observed');

  tabB = await connect(port);
  await navigate(tabB, origin, '/hall.html', '.product-profile');
  await signIn(tabB, memberA);
  await waitFor(
    tabB,
    `JSON.parse(localStorage.getItem('myeongha.memberSession.v1') ?? 'null')?.user?.id === ${JSON.stringify(memberA.id)}`,
    'same-Member sign-in did not settle',
  );
  await sleep(500);
  assert(readingLoads === initialLoads, `same-Member token/session rotation reloaded Saju; before=${initialLoads} after=${readingLoads}`);
  const afterSameMember = await tabA.evaluate(`(() => ({
    pathname: location.pathname,
    dayMaster: document.querySelector('#saju-day-master')?.textContent?.trim() ?? null,
    subjectId: JSON.parse(localStorage.getItem('myeongha.memberSession.v1') ?? 'null')?.user?.id ?? null,
  }))()`);
  assert(afterSameMember.pathname === '/reading.html', 'same-Member update navigated away from Saju');
  assert(afterSameMember.dayMaster === memberA.dayMaster, 'same-Member update disturbed rendered Saju');
  assert(afterSameMember.subjectId === memberA.id, 'same-Member update changed canonical subject unexpectedly');

  const loadsBeforeReplacement = readingLoads;
  const requestsBeforeReplacement = requests.length;
  await signIn(tabB, memberB);
  await waitFor(
    tabB,
    `JSON.parse(localStorage.getItem('myeongha.memberSession.v1') ?? 'null')?.user?.id === ${JSON.stringify(memberB.id)}`,
    'Member B did not become canonical',
  );
  await waitFor(
    tabA,
    `location.pathname === '/reading.html' && document.querySelector('#saju-hub')?.hidden === false && document.querySelector('#saju-day-master')?.textContent?.trim() === ${JSON.stringify(memberB.dayMaster)} && JSON.parse(localStorage.getItem('myeongha.memberSession.v1') ?? 'null')?.user?.id === ${JSON.stringify(memberB.id)}`,
    'Saju did not reload and render under Member B',
  );
  assert(readingLoads === loadsBeforeReplacement + 1, `Member replacement did not cause exactly one Saju reload; before=${loadsBeforeReplacement} after=${readingLoads}`);

  const replacementRequests = requests.slice(requestsBeforeReplacement);
  const bCalculations = replacementRequests.filter((request) => request.path === '/api/me/saju/calculation' && request.member === memberB.email);
  assert(bCalculations.length >= 1, `Member B Saju calculation was not requested; requests=${JSON.stringify(replacementRequests)}`);
  const finalState = await tabA.evaluate(`(() => ({
    member: JSON.parse(localStorage.getItem('myeongha.memberSession.v1') ?? 'null'),
    dayMaster: document.querySelector('#saju-day-master')?.textContent?.trim() ?? null,
    hubHidden: document.querySelector('#saju-hub')?.hidden ?? null,
  }))()`);
  assert(finalState.member?.user?.id === memberB.id, 'canonical Member did not remain Member B');
  assert(finalState.member?.accessToken === memberB.token, 'canonical Member B token was not preserved');
  assert(finalState.dayMaster === memberB.dayMaster, 'Member A Saju remained visible after Member B replacement');
  assert(finalState.hubHidden === false, 'Member B Saju surface did not finish rendering');

  await mkdir(resolve(process.cwd(), 'artifacts'), { recursive: true });
  await writeFile(
    resolve(process.cwd(), 'artifacts/web-saju-auth-browser-smoke-member-replacement.json'),
    `${JSON.stringify({
      initialLoads,
      sameMemberLoads: readingLoads - 1,
      finalLoads: readingLoads,
      sameMemberPreserved: afterSameMember.dayMaster === memberA.dayMaster,
      subjectReload: readingLoads === loadsBeforeReplacement + 1,
      finalSubjectId: finalState.member?.user?.id ?? null,
      finalDayMaster: finalState.dayMaster,
      replacementCalculations: bCalculations.length,
    }, null, 2)}\n`,
  );
  functionalPass = true;
  console.log('MyeongHa_WEB_SAJU_MEMBER_SUBJECT_REPLACEMENT_BROWSER_PASS same_member_preserved=true subject_reload=true member_b_rendered=true');
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
  try {
    await rm(profile, { recursive: true, force: true });
  } catch (error) {
    const cleanupRace = functionalPass
      && error
      && typeof error === 'object'
      && error.code === 'ENOTEMPTY'
      && typeof error.path === 'string'
      && error.path.startsWith(profile);
    if (!cleanupRace) throw error;
    console.warn('MyeongHa Saju Member replacement assertions passed; ignoring ephemeral Chrome profile cleanup ENOTEMPTY race.');
  }
}
