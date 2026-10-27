import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
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
      assert(file.startsWith(`${root}${sep}`), 'request escaped static root');
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

for (const file of ['my.html', 'my.css', 'my-runtime-client.js', 'product-auth.js']) {
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
  await client.evaluate('(() => { localStorage.setItem("myeongha.productTheme.v1","dark"); localStorage.setItem("myeongha.memberSession.v1",JSON.stringify({accessToken:"header.payload.signature",refreshToken:"refresh-token",expiresAt:new Date(Date.now()+3600000).toISOString(),tokenType:"bearer",user:{id:"11111111-1111-4111-8111-111111111111",email:"member@example.com"}})); })()');
  await navigate(client, origin);
  await waitFor(client,'document.querySelector(".my-account-card .my-account-meta")?.textContent.includes("member@example.com")','Member identity not rendered');
  await client.evaluate("document.querySelector('.my-settings-section .my-choice-card:nth-child(1)').click()");
  await waitFor(client,'document.querySelector(".my-settings-section .my-account-facts")?.textContent.includes("1996.01.09")','Member Birth Profile did not render');
  const member=await client.evaluate("(() => {const details={};for(const row of document.querySelectorAll('.my-settings-section .my-account-facts > div'))details[row.querySelector('dt')?.textContent.trim()]=row.querySelector('dd')?.textContent.trim();return {email:document.querySelector('.my-account-card .my-account-meta')?.textContent,details,theme:document.documentElement.dataset.theme,body:document.body.innerText,overflow:document.documentElement.scrollWidth-innerWidth};})()");
  assert(member.email.includes('member@example.com'), 'Birth Profile email identity mismatch');
  assert(member.details['생년월일']==='1996.01.09'&&member.details['출생 시간']==='09:30','Birth Profile date and time incorrect');
  assert(member.details['달력 기준']==='음력 윤달'&&member.details['성별']==='남성','Birth calendar/sex incorrect');
  assert(member.theme==='dark','Dark theme not persisted');
  assert(!member.body.includes('출생지')&&!member.body.includes('위치 정보'),'Unapproved birth location fields exposed');
  assert(member.overflow<=2,'Birth desktop overflow');
  await capture(client,'desktop-member');

  await navigate(client,origin);
  await waitFor(client,'document.querySelector(".my-account-card .my-account-meta")?.textContent.includes("member@example.com")','Member session failed after reload');
  await client.evaluate("document.querySelector('.my-settings-section .my-choice-card:nth-child(1)').click()");
  await waitFor(client,'document.querySelector(".my-settings-section .my-account-facts")?.textContent.includes("1996.01.09")','Birth details failed after reload');

  await client.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await navigate(client,origin);
  await waitFor(client,'document.querySelector(".my-account-card .my-account-meta")?.textContent.includes("member@example.com")','Mobile member not rendered');
  await client.evaluate("document.querySelector('.my-settings-section .my-choice-card:nth-child(1)').click()");
  await waitFor(client,'document.querySelector(".my-settings-section .my-account-facts")?.textContent.includes("1996.01.09")','Mobile Birth Profile not rendered');
  const mobile=await client.evaluate("(() => {const rect=document.querySelector('.my-settings-section .my-detail-panel')?.getBoundingClientRect();return {overflow:document.documentElement.scrollWidth-innerWidth,left:rect?.left,right:rect?.right};})()");
  assert(mobile.overflow<=2&&mobile.left>=0&&mobile.right<=390,'Mobile Birth details escape viewport');
  await capture(client,'mobile-member');

  await client.evaluate('(() => {localStorage.removeItem("myeongha.memberSession.v1");sessionStorage.removeItem("myeongha.pendingGuestBearer.v1");sessionStorage.setItem("myeongha.guestBearer.v1","smoke-guest-bearer");})()');
  await navigate(client,origin);
  await waitFor(client,'document.querySelector(".my-account-badge")?.textContent.includes("게스트")','Guest birth subject not recognized');
  await client.evaluate("document.querySelector('.my-settings-section .my-choice-card:nth-child(1)').click()");
  await waitFor(client,'document.querySelector(".my-settings-section .my-detail-panel")?.textContent.includes("저장된 본인 출생 정보가 없습니다.")','Guest authoritative empty Birth Profile not rendered');
  const guest=await client.evaluate("(() => ({action:document.querySelector('.my-settings-section .my-detail-panel a')?.getAttribute('href'),facts:document.querySelector('.my-settings-section .my-account-facts')?.textContent}))()");
  assert(guest.action==='birth.html'&&!guest.facts,'Guest birth input CTA/authority boundary wrong');
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
