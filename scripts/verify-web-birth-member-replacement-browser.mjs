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
  email: 'birth-a@example.com',
  tokenPrefix: 'birth-a',
  refreshPrefix: 'birth-a-refresh',
  revisionNo: 4,
});
const memberB = Object.freeze({
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  email: 'birth-b@example.com',
  tokenPrefix: 'birth-b',
  refreshPrefix: 'birth-b-refresh',
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
let birthLoads = 0;

function envelope(data) {
  requestNo += 1;
  return {
    ok: true,
    data,
    meta: {
      apiContractVersion: 'birth-member-replacement-v1',
      requestId: `birth-member-replacement-${requestNo}`,
      serverTime: '2026-09-11T12:00:00.000Z',
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

function currentBirthProfile(member) {
  if (member.id === memberB.id) return { birthProfile: null };
  return {
    birthProfile: {
      birthProfileId: '11111111-1111-4111-8111-111111111111',
      profileKind: 'self',
      label: null,
      archivedAt: null,
      currentRevision: {
        revisionId: '22222222-2222-4222-8222-222222222222',
        revisionNo: member.revisionNo,
        input: {
          calendarType: 'solar',
          birthDate: '1990-01-02',
          birthTime: '03:04:00',
          timeKnown: true,
          isLeapMonth: false,
          sex: null,
        },
      },
    },
  };
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url ?? '/', 'http://127.0.0.1').pathname);
      const authorization = req.headers.authorization ?? null;
      if (path === '/prime.html') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end('<!doctype html><title>prime</title>');
        return;
      }
      if (path === '/api/auth/sign-in' && req.method === 'POST') {
        const input = await readBody(req);
        const member = members.find((candidate) => candidate.email === input.email) ?? null;
        requests.push({ path, member: member?.email ?? null, authorization });
        if (!member) return json(res, 401, { ok: false, error: { code: 'INVALID_CREDENTIALS' } });
        return json(res, 200, envelope({ status: 'authenticated', session: nextSession(member) }));
      }
      if (path === '/api/me/birth-profile' && req.method === 'GET') {
        const member = memberForAuthorization(authorization);
        requests.push({ path, member: member?.email ?? null, authorization });
        if (!member) return json(res, 401, { ok: false, error: { code: 'AUTH_REQUIRED' } });
        return json(res, 200, envelope(currentBirthProfile(member)));
      }
      if (path === '/api/birth-profiles' && req.method === 'POST') {
        const member = memberForAuthorization(authorization);
        const input = await readBody(req);
        requests.push({ path, member: member?.email ?? null, authorization, input });
        if (!member || member.id !== memberB.id) {
          return json(res, 401, { ok: false, error: { code: 'AUTH_REQUIRED' } });
        }
        return json(res, 200, envelope({
          birthProfileId: '33333333-3333-4333-8333-333333333333',
          revisionId: '44444444-4444-4444-8444-444444444444',
          revisionNo: 1,
        }));
      }
      if (path.startsWith('/api/')) {
        requests.push({ path, member: null, authorization });
        return json(res, 404, { ok: false, error: { code: 'NOT_FOUND' } });
      }

      const staticPath = path === '/' ? '/birth.html' : path;
      if (staticPath === '/birth.html') birthLoads += 1;
      const file = resolve(root, normalize(staticPath).replace(/^[/\\]+/, ''));
      assert(file.startsWith(`${root}/`), 'request escaped static root');
      assert((await stat(file)).isFile(), `not a file: ${staticPath}`);
      res.setHeader('Cache-Control', 'no-store');
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
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
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

async function navigate(client, origin, path, selector = null) {
  const result = await client.send('Page.navigate', { url: `${origin}${path}` });
  assert(!result.errorText, `Navigation failed for ${path}: ${result.errorText}`);
  const selectorCheck = selector ? ` && Boolean(document.querySelector(${JSON.stringify(selector)}))` : '';
  await waitFor(
    client,
    `location.pathname === ${JSON.stringify(path)} && document.readyState === 'complete'${selectorCheck}`,
    `navigation failed: ${path}`,
  );
}

async function signIn(client, member) {
  return client.evaluate(`import('./product-auth.js').then(({ signInWithPassword }) => signInWithPassword(${JSON.stringify(member.email)}, 'test-only'))`);
}

for (const file of [
  'birth.html',
  'birth-page.js',
  'birth-runtime-client.js',
  'product-auth.js',
  'product-auth-surface.js',
  'api-envelope.js',
  'styles.css',
]) await stat(join(root, file));

const { server, origin } = await serve();
const profileDir = await mkdtemp(join(tmpdir(), 'myeongha-birth-member-replacement-'));
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
  await navigate(tabA, origin, '/prime.html');
  const firstASession = await signIn(tabA, memberA);
  assert(firstASession?.user?.id === memberA.id, 'Member A sign-in did not return Member A');
  await navigate(tabA, origin, '/birth.html', '#birth-existing');
  await waitFor(
    tabA,
    `document.querySelector('#birth-existing')?.hidden === false && document.querySelector('#birth-form')?.hidden === true && document.querySelector('#birth-existing-revision')?.textContent?.includes('revision ${memberA.revisionNo}')`,
    'Member A existing Birth state did not render',
  );
  const initialLoads = birthLoads;
  assert(initialLoads >= 1, 'initial Birth page load was not observed');

  tabB = await connect(port);
  await navigate(tabB, origin, '/prime.html');
  const secondASession = await signIn(tabB, memberA);
  assert(secondASession?.user?.id === memberA.id, 'same-Member sign-in did not remain Member A');
  assert(secondASession?.accessToken !== firstASession.accessToken, 'same-Member sign-in did not rotate the token');
  await waitFor(
    tabA,
    `JSON.parse(localStorage.getItem('myeongha.memberSession.v1') ?? 'null')?.accessToken === ${JSON.stringify(secondASession.accessToken)}`,
    'rotated same-Member session did not become visible in Birth tab',
  );
  await sleep(500);
  assert(birthLoads === initialLoads, `same-Member token rotation reloaded Birth; before=${initialLoads} after=${birthLoads}`);
  assert(await tabA.evaluate(`document.querySelector('#birth-existing')?.hidden === false && document.querySelector('#birth-form')?.hidden === true`), 'same-Member rotation disturbed existing Birth state');
  const sameMemberPreserved = birthLoads === initialLoads;

  const loadsBeforeReplacement = birthLoads;
  const bSession = await signIn(tabB, memberB);
  assert(bSession?.user?.id === memberB.id, 'Member B sign-in did not return Member B');
  await waitFor(
    tabB,
    `JSON.parse(localStorage.getItem('myeongha.memberSession.v1') ?? 'null')?.user?.id === ${JSON.stringify(memberB.id)}`,
    'Member B did not become canonical',
  );
  await waitFor(
    tabA,
    `location.pathname === '/birth.html' && document.querySelector('#birth-form')?.hidden === false && document.querySelector('#birth-existing')?.hidden === true && JSON.parse(localStorage.getItem('myeongha.memberSession.v1') ?? 'null')?.user?.id === ${JSON.stringify(memberB.id)}`,
    'Birth did not reload from Member A existing state to Member B create state',
  );
  assert(birthLoads === loadsBeforeReplacement + 1, `Member replacement reload count mismatch: before=${loadsBeforeReplacement} after=${birthLoads}`);
  const bCurrentReads = requests.filter((entry) => entry.path === '/api/me/birth-profile' && entry.member === memberB.email);
  assert(bCurrentReads.length >= 1, 'Member B current Birth profile was not re-read after replacement');

  await tabA.evaluate(`(() => {
    document.querySelector('#birth-date').value = '2002-03-04';
    document.querySelector('#birth-time').value = '05:06';
    document.querySelector('#birth-sex').value = 'unspecified';
    document.querySelector('#birth-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  })()`);
  await waitFor(
    tabA,
    `document.querySelector('#birth-status')?.innerText.includes('revision 1이 저장되었습니다.')`,
    'Member B Birth create did not succeed after subject replacement',
  );
  const creates = requests.filter((entry) => entry.path === '/api/birth-profiles');
  assert(creates.length === 1, `unexpected Birth create count: ${creates.length}`);
  assert(creates[0].member === memberB.email, 'Birth create did not use Member B authority');
  assert(creates[0].authorization === `Bearer ${bSession.accessToken}`, 'Birth create did not use Member B canonical token');

  const artifactDir = resolve(process.cwd(), 'artifacts');
  await mkdir(artifactDir, { recursive: true });
  const screenshot = await tabA.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  if (screenshot.data) {
    await writeFile(
      join(artifactDir, 'web-birth-session-browser-smoke-member-replacement.png'),
      Buffer.from(screenshot.data, 'base64'),
    );
  }
  await writeFile(
    join(artifactDir, 'web-birth-session-browser-smoke-member-replacement.json'),
    `${JSON.stringify({
      status: 'PASS',
      sameMemberPreserved,
      tokenRotated: secondASession.accessToken !== firstASession.accessToken,
      subjectReload: birthLoads === loadsBeforeReplacement + 1,
      memberBForm: true,
      memberBCreate: creates[0].member === memberB.email,
      birthLoads,
      requests,
    }, null, 2)}\n`,
  );

  functionalPass = true;
  console.log('MyeongHa_WEB_BIRTH_MEMBER_SUBJECT_REPLACEMENT_BROWSER_PASS same_member_preserved=true token_rotated=true subject_reload=true member_b_form=true member_b_create=true');
} catch (error) {
  console.error(error);
  if (chromeError.trim()) console.error(chromeError.trim().slice(-4000));
  process.exitCode = 1;
} finally {
  tabA?.close();
  tabB?.close();
  if (chrome.exitCode === null) {
    const exited = new Promise((done) => chrome.once('exit', done));
    chrome.kill('SIGTERM');
    await Promise.race([exited, sleep(2_000)]);
  }
  await new Promise((done) => server.close(done));
  try {
    await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (error) {
    if (!(functionalPass && error?.code === 'ENOTEMPTY')) throw error;
    console.log('MyeongHa Birth Member replacement assertions passed; ignoring ephemeral Chrome profile cleanup ENOTEMPTY race.');
  }
}
