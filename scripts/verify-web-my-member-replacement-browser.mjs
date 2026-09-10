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
  email: 'my-a@example.com',
  displayName: '멤버 에이',
  tokenPrefix: 'my-a',
  refreshPrefix: 'my-a-refresh',
  birthDate: '1991-01-02',
  birthTime: '08:30:00',
  sex: 'female',
  revisionNo: 3,
});
const memberB = Object.freeze({
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  email: 'my-b@example.com',
  displayName: '멤버 비',
  tokenPrefix: 'my-b',
  refreshPrefix: 'my-b-refresh',
  birthDate: '2002-03-04',
  birthTime: '19:45:00',
  sex: 'male',
  revisionNo: 7,
});
const members = [memberA, memberB];
const signInCounts = new Map();
const requests = [];
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
let requestNo = 0;
let myLoads = 0;

function envelope(data) {
  requestNo += 1;
  return {
    ok: true,
    data,
    meta: {
      apiContractVersion: 'my-member-replacement-v1',
      requestId: `my-member-replacement-${requestNo}`,
      serverTime: '2026-09-11T09:00:00.000Z',
    },
  };
}

function nextSession(member) {
  const generation = (signInCounts.get(member.id) ?? 0) + 1;
  signInCounts.set(member.id, generation);
  return {
    accessToken: `${member.tokenPrefix}-${generation}.payload.signature`,
    refreshToken: `${member.refreshPrefix}-${generation}`,
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    tokenType: 'bearer',
    user: { id: member.id, email: member.email },
  };
}

function memberForAuthorization(value) {
  return members.find((member) => typeof value === 'string' && value.startsWith(`Bearer ${member.tokenPrefix}-`)) ?? null;
}

function profile(member) {
  return {
    subjectKind: 'member',
    subjectStatus: 'active',
    profile: {
      displayName: member.displayName,
      locale: 'ko-KR',
      timezone: 'Asia/Seoul',
      onboardingState: 'complete',
      updatedAt: '2026-09-11T08:00:00.000Z',
    },
  };
}

function birthProfile(member) {
  return {
    birthProfile: {
      profileKind: 'self',
      archivedAt: null,
      currentRevision: {
        revisionId: `${member.id}-revision`,
        revisionNo: member.revisionNo,
        input: {
          calendarType: 'solar',
          birthDate: member.birthDate,
          timeKnown: true,
          birthTime: member.birthTime,
          isLeapMonth: false,
          sex: member.sex,
        },
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
        return json(res, 200, envelope({ status: 'authenticated', session: nextSession(member) }));
      }
      if (path === '/api/me' && req.method === 'GET') {
        const member = memberForAuthorization(authorization);
        requests.push({ path, member: member?.email ?? null, authorization });
        if (!member) return json(res, 401, { ok: false, error: { code: 'AUTH_REQUIRED' } });
        return json(res, 200, envelope(profile(member)));
      }
      if (path === '/api/me/birth-profile' && req.method === 'GET') {
        const member = memberForAuthorization(authorization);
        requests.push({ path, member: member?.email ?? null, authorization });
        if (!member) return json(res, 401, { ok: false, error: { code: 'AUTH_REQUIRED' } });
        return json(res, 200, envelope(birthProfile(member)));
      }
      if (path.startsWith('/api/')) {
        requests.push({ path, member: null, authorization });
        return json(res, 404, { ok: false, error: { code: 'NOT_FOUND' } });
      }

      const staticPath = path === '/' ? '/hall.html' : path;
      if (staticPath === '/my.html') myLoads += 1;
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
    await sleep(50);
  }
  throw new Error(`${message}; requests=${JSON.stringify(requests)}`);
}

async function navigate(client, origin, path, selector) {
  const result = await client.send('Page.navigate', { url: `${origin}${path}` });
  assert(!result.errorText, `Navigation failed for ${path}: ${result.errorText}`);
  await waitFor(
    client,
    `location.pathname === ${JSON.stringify(path)} && document.readyState === 'complete' && Boolean(document.querySelector(${JSON.stringify(selector)}))`,
    `navigation failed: ${path}`,
  );
}

async function signIn(client, member) {
  return client.evaluate(`import('./product-auth.js').then(({ signInWithPassword }) => signInWithPassword(${JSON.stringify(member.email)}, 'test-only'))`);
}

for (const file of [
  'hall.html',
  'my.html',
  'my-page.js',
  'my-runtime-client.js',
  'product-auth.js',
  'product-auth-surface.js',
]) await stat(join(root, file));

const { server, origin } = await serve();
const profileDir = await mkdtemp(join(tmpdir(), 'myeongha-my-member-replacement-'));
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
let tabA;
let tabB;
let functionalPass = false;

try {
  const port = await chromePort(profileDir, chrome);
  tabA = await connect(port);
  await navigate(tabA, origin, '/hall.html', '.product-profile');
  const firstASession = await signIn(tabA, memberA);
  assert(firstASession?.user?.id === memberA.id, 'Member A sign-in did not return Member A');
  await navigate(tabA, origin, '/my.html', '#my-content');
  await waitFor(
    tabA,
    `document.querySelector('#my-content')?.hidden === false && document.querySelector('#my-display-name')?.textContent?.trim() === ${JSON.stringify(memberA.displayName)} && document.querySelector('#my-account-email')?.textContent?.trim() === ${JSON.stringify(memberA.email)} && document.querySelector('#my-birth-date')?.textContent?.trim() === '1991.01.02'`,
    'Member A My profile/birth did not render',
  );

  const initialLoads = myLoads;
  const initialState = await tabA.evaluate(`(() => ({
    token: JSON.parse(localStorage.getItem('myeongha.memberSession.v1') ?? 'null')?.accessToken ?? null,
    displayName: document.querySelector('#my-display-name')?.textContent?.trim() ?? null,
    email: document.querySelector('#my-account-email')?.textContent?.trim() ?? null,
    birthDate: document.querySelector('#my-birth-date')?.textContent?.trim() ?? null,
  }))()`);
  assert(initialLoads >= 1, 'initial My page load was not observed');

  tabB = await connect(port);
  await navigate(tabB, origin, '/hall.html', '.product-profile');
  const secondASession = await signIn(tabB, memberA);
  assert(secondASession?.user?.id === memberA.id, 'same-Member sign-in did not remain Member A');
  assert(secondASession?.accessToken !== initialState.token, 'same-Member sign-in did not rotate the Member token');
  await waitFor(
    tabB,
    `JSON.parse(localStorage.getItem('myeongha.memberSession.v1') ?? 'null')?.accessToken === ${JSON.stringify(secondASession.accessToken)}`,
    'same-Member rotated session did not become canonical',
  );
  await sleep(500);
  assert(myLoads === initialLoads, `same-Member token rotation reloaded My; before=${initialLoads} after=${myLoads}`);
  const afterSameMember = await tabA.evaluate(`(() => ({
    pathname: location.pathname,
    displayName: document.querySelector('#my-display-name')?.textContent?.trim() ?? null,
    email: document.querySelector('#my-account-email')?.textContent?.trim() ?? null,
    birthDate: document.querySelector('#my-birth-date')?.textContent?.trim() ?? null,
    subjectId: JSON.parse(localStorage.getItem('myeongha.memberSession.v1') ?? 'null')?.user?.id ?? null,
    token: JSON.parse(localStorage.getItem('myeongha.memberSession.v1') ?? 'null')?.accessToken ?? null,
  }))()`);
  assert(afterSameMember.pathname === '/my.html', 'same-Member rotation navigated away from My');
  assert(afterSameMember.displayName === memberA.displayName, 'same-Member rotation disturbed My display name');
  assert(afterSameMember.email === memberA.email, 'same-Member rotation disturbed My account email');
  assert(afterSameMember.birthDate === '1991.01.02', 'same-Member rotation disturbed My birth data');
  assert(afterSameMember.subjectId === memberA.id, 'same-Member rotation changed canonical subject');
  assert(afterSameMember.token === secondASession.accessToken, 'same-Member rotated token was not visible cross-tab');

  const loadsBeforeReplacement = myLoads;
  const requestsBeforeReplacement = requests.length;
  const bSession = await signIn(tabB, memberB);
  assert(bSession?.user?.id === memberB.id, 'Member B sign-in did not return Member B');
  await waitFor(
    tabB,
    `JSON.parse(localStorage.getItem('myeongha.memberSession.v1') ?? 'null')?.user?.id === ${JSON.stringify(memberB.id)}`,
    'Member B did not become canonical',
  );
  await waitFor(
    tabA,
    `location.pathname === '/my.html' && document.querySelector('#my-content')?.hidden === false && document.querySelector('#my-display-name')?.textContent?.trim() === ${JSON.stringify(memberB.displayName)} && document.querySelector('#my-account-email')?.textContent?.trim() === ${JSON.stringify(memberB.email)} && document.querySelector('#my-birth-date')?.textContent?.trim() === '2002.03.04' && JSON.parse(localStorage.getItem('myeongha.memberSession.v1') ?? 'null')?.user?.id === ${JSON.stringify(memberB.id)}`,
    'My did not reload and render under Member B',
  );
  assert(myLoads === loadsBeforeReplacement + 1, `Member replacement did not cause exactly one My reload; before=${loadsBeforeReplacement} after=${myLoads}`);

  const replacementRequests = requests.slice(requestsBeforeReplacement);
  const bProfileReads = replacementRequests.filter((request) => request.path === '/api/me' && request.member === memberB.email).length;
  const bBirthReads = replacementRequests.filter((request) => request.path === '/api/me/birth-profile' && request.member === memberB.email).length;
  assert(bProfileReads >= 1, `Member B profile was not refetched; requests=${JSON.stringify(replacementRequests)}`);
  assert(bBirthReads >= 1, `Member B birth profile was not refetched; requests=${JSON.stringify(replacementRequests)}`);

  const finalState = await tabA.evaluate(`(() => ({
    member: JSON.parse(localStorage.getItem('myeongha.memberSession.v1') ?? 'null'),
    displayName: document.querySelector('#my-display-name')?.textContent?.trim() ?? null,
    email: document.querySelector('#my-account-email')?.textContent?.trim() ?? null,
    birthDate: document.querySelector('#my-birth-date')?.textContent?.trim() ?? null,
    bodyText: document.body.innerText,
  }))()`);
  assert(finalState.member?.user?.id === memberB.id, 'canonical Member did not remain Member B');
  assert(finalState.displayName === memberB.displayName, 'Member A display name remained after replacement');
  assert(finalState.email === memberB.email, 'Member A email remained after replacement');
  assert(finalState.birthDate === '2002.03.04', 'Member A birth data remained after replacement');
  assert(!finalState.bodyText.includes(memberA.displayName), 'Member A display name is still visible after replacement');
  assert(!finalState.bodyText.includes(memberA.email), 'Member A email is still visible after replacement');
  assert(!finalState.bodyText.includes('1991.01.02'), 'Member A birth date is still visible after replacement');

  await mkdir(resolve(process.cwd(), 'artifacts'), { recursive: true });
  await writeFile(
    resolve(process.cwd(), 'artifacts/web-my-browser-smoke-member-replacement.json'),
    `${JSON.stringify({
      initialLoads,
      sameMemberLoads: loadsBeforeReplacement,
      finalLoads: myLoads,
      sameMemberTokenRotated: secondASession.accessToken !== initialState.token,
      sameMemberPreserved: afterSameMember.displayName === memberA.displayName && afterSameMember.birthDate === '1991.01.02',
      subjectReload: myLoads === loadsBeforeReplacement + 1,
      finalSubjectId: finalState.member?.user?.id ?? null,
      finalDisplayName: finalState.displayName,
      finalBirthDate: finalState.birthDate,
      memberBProfileReads: bProfileReads,
      memberBBirthReads: bBirthReads,
    }, null, 2)}\n`,
  );
  functionalPass = true;
  console.log('MyeongHa_WEB_MY_MEMBER_SUBJECT_REPLACEMENT_BROWSER_PASS same_member_preserved=true token_rotated=true subject_reload=true member_b_profile=true member_b_birth=true');
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
    await rm(profileDir, { recursive: true, force: true });
  } catch (error) {
    const cleanupRace = functionalPass
      && error
      && typeof error === 'object'
      && error.code === 'ENOTEMPTY'
      && typeof error.path === 'string'
      && error.path.startsWith(profileDir);
    if (!cleanupRace) throw error;
    console.warn('My Member replacement browser assertions passed; ignoring ephemeral Chrome profile cleanup ENOTEMPTY race.');
  }
}
