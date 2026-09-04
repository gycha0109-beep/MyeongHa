import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
]);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function envelope(data) {
  return JSON.stringify({
    ok: true,
    data,
    meta: {
      apiContractVersion: 'v0.9',
      requestId: 'my-birth-browser-smoke',
      serverTime: '2026-09-04T04:30:00.000Z',
    },
  });
}

function memberProfile() {
  return {
    subjectKind: 'member',
    subjectStatus: 'active',
    profile: {
      displayName: '회원 사용자',
      locale: 'ko-KR',
      timezone: 'Asia/Seoul',
      onboardingState: 'complete',
      updatedAt: '2026-09-04T04:00:00.000Z',
    },
  };
}

function guestProfile() {
  return {
    subjectKind: 'guest',
    subjectStatus: 'active',
    profile: {
      displayName: null,
      locale: 'ko-KR',
      timezone: 'Asia/Seoul',
      onboardingState: 'started',
      updatedAt: '2026-09-04T04:00:00.000Z',
    },
  };
}

function currentBirthProfile() {
  return {
    birthProfile: {
      birthProfileId: '22222222-2222-4222-8222-222222222222',
      profileKind: 'self',
      label: null,
      archivedAt: null,
      currentRevision: {
        revisionId: '33333333-3333-4333-8333-333333333333',
        revisionNo: 3,
        input: {
          calendarType: 'lunar',
          birthDate: '1996-01-09',
          birthTime: '09:30:00',
          timeKnown: true,
          isLeapMonth: true,
          sex: 'male',
        },
      },
      revisions: [
        { revisionId: '33333333-3333-4333-8333-333333333333', revisionNo: 3, isCurrent: true },
      ],
    },
  };
}

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const authorization = req.headers.authorization ?? '';
      if (url.pathname === '/api/me' || url.pathname === '/api/me/birth-profile') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        if (authorization === 'Bearer header.payload.signature') {
          res.statusCode = 200;
          res.end(envelope(url.pathname === '/api/me' ? memberProfile() : currentBirthProfile()));
          return;
        }
        if (authorization === 'Bearer smoke-guest-bearer') {
          res.statusCode = 200;
          res.end(envelope(url.pathname === '/api/me' ? guestProfile() : { birthProfile: null }));
          return;
        }
        res.statusCode = 401;
        res.end(JSON.stringify({ ok: false }));
        return;
      }

      const pathname = decodeURIComponent(url.pathname === '/' ? '/my.html' : url.pathname);
      const relative = normalize(pathname).replace(/^[/\\]+/, '');
      const file = resolve(root, relative);
      assert(file.startsWith(`${root}/`), 'request escaped static root');
      assert((await stat(file)).isFile(), 'not a file');
      res.setHeader('Content-Type', mime.get(extname(file).toLowerCase()) ?? 'application/octet-stream');
      createReadStream(file).pipe(res);
    } catch {
      res.statusCode = 404;
      res.end('Not found');
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
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  return { send, evaluate, close: () => ws.close() };
}

async function navigate(client, origin) {
  const result = await client.send('Page.navigate', { url: `${origin}/my.html` });
  assert(!result.errorText, `Navigation failed: ${result.errorText}`);
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await client.evaluate(`document.readyState === 'complete' && location.pathname === '/my.html'`)) return;
    await sleep(50);
  }
  throw new Error('Timed out waiting for My page');
}

async function waitFor(client, expression, message) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return;
    await sleep(50);
  }
  throw new Error(message);
}

async function capture(client, suffix) {
  const dir = resolve(process.cwd(), 'artifacts');
  await mkdir(dir, { recursive: true });
  const shot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  if (shot.data) {
    await writeFile(join(dir, `web-my-birth-browser-smoke-${suffix}.png`), Buffer.from(shot.data, 'base64'));
  }
}

for (const file of ['my.html', 'my.css', 'my-page.js', 'my-runtime-client.js', 'product-auth.js']) {
  await stat(join(root, file));
}

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-my-birth-browser-smoke-'));
const chrome = spawn(chromeBin, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
let chromeError = '';
chrome.stderr.setEncoding('utf8');
chrome.stderr.on('data', (chunk) => { chromeError += chunk; });
let client;

try {
  client = await connectCdp(await devtoolsPort(profile, chrome));
  await navigate(client, origin);
  await client.evaluate(`(() => {
    localStorage.setItem('myeongha.productTheme.v1', 'dark');
    localStorage.setItem('myeongha.memberSession.v1', JSON.stringify({
      accessToken: 'header.payload.signature',
      refreshToken: 'refresh-token',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      tokenType: 'bearer',
      user: { id: '11111111-1111-4111-8111-111111111111', email: 'member@example.com' },
    }));
  })()`);
  await navigate(client, origin);
  await waitFor(client, `document.querySelector('#my-birth-content')?.hidden === false`, 'member Birth Profile did not render');
  const member = await client.evaluate(`(() => ({
    kind: document.querySelector('#my-subject-kind')?.textContent?.trim(),
    email: document.querySelector('#my-account-email')?.textContent?.trim(),
    date: document.querySelector('#my-birth-date')?.textContent?.trim(),
    time: document.querySelector('#my-birth-time')?.textContent?.trim(),
    calendar: document.querySelector('#my-birth-calendar')?.textContent?.trim(),
    sex: document.querySelector('#my-birth-sex')?.textContent?.trim(),
    revision: document.querySelector('#my-birth-revision')?.textContent?.trim(),
    theme: document.documentElement.dataset.theme,
    body: document.body.innerText,
    overflow: document.documentElement.scrollWidth - innerWidth,
  }))()`);
  assert(member.kind === '회원' && member.email === 'member@example.com', 'member identity did not survive My load');
  assert(member.date === '1996.01.09' && member.time === '09:30', 'Birth Profile date/time rendering is incorrect');
  assert(member.calendar === '음력 · 윤달' && member.sex === '남성', 'Birth Profile calendar/sex rendering is incorrect');
  assert(member.revision === '현재 입력 · revision 3', 'Birth Profile revision marker missing');
  assert(member.theme === 'dark', 'dark theme did not persist');
  assert(!member.body.includes('출생지') && !member.body.includes('위치 정보'), 'unsupported location field leaked into My');
  assert(member.overflow <= 2, `desktop horizontal overflow: ${member.overflow}px`);

  await navigate(client, origin);
  await waitFor(client, `document.querySelector('#my-account-email')?.textContent.trim() === 'member@example.com' && document.querySelector('#my-birth-date')?.textContent.trim() === '1996.01.09'`, 'member session/birth input did not survive reload');
  await capture(client, 'desktop-member');

  await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await navigate(client, origin);
  await waitFor(client, `document.querySelector('#my-birth-content')?.hidden === false`, 'mobile Birth Profile did not render');
  const mobile = await client.evaluate(`(() => {
    const card = document.querySelector('#my-birth-content')?.getBoundingClientRect();
    return { overflow: document.documentElement.scrollWidth - innerWidth, left: card?.left ?? -1, right: card?.right ?? 9999 };
  })()`);
  assert(mobile.overflow <= 2, `mobile horizontal overflow: ${mobile.overflow}px`);
  assert(mobile.left >= 0 && mobile.right <= 390, 'Birth Profile card escapes mobile viewport');
  await capture(client, 'mobile-member');

  await client.evaluate(`(() => {
    localStorage.removeItem('myeongha.memberSession.v1');
    sessionStorage.removeItem('myeongha.pendingGuestBearer.v1');
    sessionStorage.setItem('myeongha.guestBearer.v1', 'smoke-guest-bearer');
  })()`);
  await navigate(client, origin);
  await waitFor(client, `document.querySelector('#my-subject-kind')?.textContent.trim() === '게스트' && document.querySelector('#my-birth-status')?.innerText.includes('저장된 본인 출생 정보가 없습니다.')`, 'guest empty Birth Profile state did not render');
  const guest = await client.evaluate(`(() => ({
    action: document.querySelector('#my-birth-status a')?.getAttribute('href'),
    contentHidden: document.querySelector('#my-birth-content')?.hidden,
  }))()`);
  assert(guest.action === 'birth.html' && guest.contentHidden === true, 'guest birth-input CTA is incorrect');

  console.log('MyeongHa_WEB_MY_BIRTH_BROWSER_PASS');
} catch (error) {
  console.error(error);
  if (chromeError.trim()) console.error(chromeError.trim().slice(-4000));
  process.exitCode = 1;
} finally {
  client?.close();
  if (chrome.exitCode === null) {
    const exited = new Promise((done) => chrome.once('exit', done));
    chrome.kill('SIGTERM');
    await Promise.race([exited, sleep(2_000)]);
  }
  await new Promise((done) => server.close(done));
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
