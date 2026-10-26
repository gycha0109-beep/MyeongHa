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
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
]);

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function apiEnvelope(data) {
  return JSON.stringify({
    ok: true,
    data,
    meta: {
      apiContractVersion: 'browser-smoke-v1',
      requestId: 'web-my-browser-smoke',
      serverTime: '2026-09-04T03:30:00.000Z',
    },
  });
}

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/api/me') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        const authorization = req.headers.authorization ?? '';
        if (authorization === 'Bearer header.payload.signature') {
          res.statusCode = 200;
          res.end(apiEnvelope({
            subjectKind: 'member',
            subjectStatus: 'active',
            profile: {
              displayName: '테스트 사용자',
              locale: 'ko-KR',
              timezone: 'Asia/Seoul',
              onboardingState: 'complete',
              updatedAt: '2026-09-04T03:00:00.000Z',
            },
          }));
          return;
        }
        if (authorization === 'Bearer smoke-guest-bearer') {
          res.statusCode = 200;
          res.end(apiEnvelope({
            subjectKind: 'guest',
            subjectStatus: 'active',
            profile: {
              displayName: null,
              locale: 'ko-KR',
              timezone: 'Asia/Seoul',
              onboardingState: 'started',
              updatedAt: '2026-09-04T03:00:00.000Z',
            },
          }));
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
  assert(address && typeof address === 'object', 'static server address unavailable');
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

async function navigate(client, origin, pathname = '/my.html') {
  const result = await client.send('Page.navigate', { url: `${origin}${pathname}` });
  assert(!result.errorText, `Navigation failed for ${pathname}: ${result.errorText}`);
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const ready = await client.evaluate(`document.readyState === 'complete' && location.pathname === '/my.html'`);
    if (ready) return;
    await sleep(50);
  }
  throw new Error('Timed out waiting for My page');
}

async function waitFor(client, expression, message, timeout = 5_000) {
  const deadline = Date.now() + timeout;
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
    await writeFile(join(dir, `web-my-browser-smoke-${suffix}.png`), Buffer.from(shot.data, 'base64'));
  }
  const diagnostics = await client.evaluate(`(() => ({
    href: location.href,
    title: document.title,
    theme: document.documentElement.dataset.theme ?? null,
    viewportWidth: innerWidth,
    overflow: document.documentElement.scrollWidth - innerWidth,
    bodyText: document.body.innerText,
    subjectKind: document.querySelector('#my-subject-kind')?.textContent?.trim() ?? null,
    accountEmail: document.querySelector('#my-account-email')?.textContent?.trim() ?? null,
  }))()`);
  await writeFile(join(dir, `web-my-browser-smoke-${suffix}.json`), `${JSON.stringify(diagnostics, null, 2)}\n`);
}

for (const file of ['my.html', 'my.css', 'my-runtime-client.js', 'product-auth.js', 'product-theme.js']) {
  await stat(join(root, file));
}

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-my-browser-smoke-'));
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
  await navigate(client, origin);
  await waitFor(client, 'document.querySelector(".my-account-card .my-account-meta")?.textContent.includes("현재 세션이 필요합니다.")', 'My unauthenticated state did not render');
  const guestEntry = await client.evaluate("(() => ({ title:document.title, status:document.querySelector('.my-account-card .my-account-meta')?.textContent, accountText:document.querySelector('.my-account-section')?.textContent, login:document.querySelector('.my-auth-action')?.textContent.trim(), cards:[...document.querySelectorAll('.my-choice-card')].map(e=>e.textContent), memory:!!document.querySelector('.my-memory-section'), overflow:document.documentElement.scrollWidth-innerWidth,body:document.body.innerText }))()");
  assert(guestEntry.title === '마이 · 명하', 'My document title differs from product shell');
  assert(guestEntry.status?.includes('현재 세션이 필요합니다.') && guestEntry.login === '로그인하기', 'Unauthenticated account must fail closed and allow sign-in');
  assert(guestEntry.cards.length === 5 && guestEntry.memory, 'Approved My management cards are missing');
  assert(!guestEntry.body.includes('오늘의 나') && !guestEntry.body.includes('내 흐름'), 'Removed personal home sections resurfaced');
  assert(!guestEntry.accountText.includes('member@example.com'), 'Member email shown without authorization');
  assert(guestEntry.overflow <= 2, 'Desktop guest horizontal overflow');

  await client.evaluate('(() => { localStorage.setItem("myeongha.productTheme.v1","dark"); localStorage.setItem("myeongha.memberSession.v1", JSON.stringify({ accessToken:"header.payload.signature",refreshToken:"refresh-token",expiresAt:new Date(Date.now()+3600000).toISOString(),tokenType:"bearer",user:{id:"11111111-1111-4111-8111-111111111111",email:"member@example.com"} })); })()');
  await navigate(client, origin);
  await waitFor(client, 'document.querySelector(".my-account-card .my-account-meta")?.textContent.includes("member@example.com") && document.querySelector(".my-auth-action")?.textContent.includes("로그아웃")', 'Member account did not render');
  await client.evaluate("document.querySelector('.my-account-card').click()");
  await waitFor(client, 'document.querySelector(".my-account-section .my-account-facts")?.textContent.includes("회원")', 'Member account detail panel did not open');
  const member = await client.evaluate("(() => {const facts={};for(const row of document.querySelectorAll('.my-account-section .my-account-facts > div'))facts[row.querySelector('dt')?.textContent.trim()]=row.querySelector('dd')?.textContent.trim(); const box=document.querySelector('.my-account-card')?.getBoundingClientRect();return {theme:document.documentElement.dataset.theme,facts,email:document.querySelector('.my-account-card .my-account-meta')?.textContent,action:document.querySelector('.my-auth-action')?.textContent.trim(),cardWidth:box?.width,overflow:document.documentElement.scrollWidth-innerWidth}})()");
  assert(member.theme === 'dark', 'Member dark theme did not persist');
  assert(member.facts['계정 유형'] === '회원' && member.facts['계정 상태'] === '사용 중', 'Member authority state incorrect');
  assert(member.email.includes('member@example.com') && member.facts['로그인 이메일'] === 'member@example.com', 'Member email failed account authority check');
  assert(member.action === '로그아웃' && member.cardWidth > 300 && member.overflow <= 2, 'Member account card/action misrendered');
  await capture(client,'desktop-dark-member');

  await client.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await navigate(client,origin);
  await waitFor(client,'document.querySelector(".my-account-card .my-account-meta")?.textContent.includes("member@example.com")','Mobile member account missing');
  const mobile=await client.evaluate("(() => {const a=document.querySelector('.my-account-card')?.getBoundingClientRect(),c=document.querySelector('.my-choice-card')?.getBoundingClientRect(),n=document.querySelector('.mobile-bottom-nav')?.getBoundingClientRect();return {overflow:document.documentElement.scrollWidth-innerWidth,account:[a?.left,a?.right],choice:[c?.left,c?.right],bottom:!!n&&n.width>0&&n.height>0&&getComputedStyle(document.querySelector('.mobile-bottom-nav')).display!=='none'};})()");
  assert(mobile.overflow<=2 && mobile.account[0]>=0 && mobile.account[1]<=390 && mobile.choice[0]>=0 && mobile.choice[1]<=390 && mobile.bottom,'My mobile layout overflow or navigation hidden');
  await capture(client,'mobile-dark-member');

  await client.evaluate('(() => {localStorage.removeItem("myeongha.memberSession.v1");sessionStorage.removeItem("myeongha.pendingGuestBearer.v1");sessionStorage.setItem("myeongha.guestBearer.v1","smoke-guest-bearer");})()');
  await navigate(client, origin);
  await waitFor(client,'document.querySelector(".my-account-badge")?.textContent.includes("게스트") && document.querySelector(".my-auth-action")?.textContent.includes("계정 연결")','Verified guest state did not render');
  await client.evaluate("document.querySelector('.my-account-card').click()");
  await waitFor(client,'document.querySelector(".my-account-section .my-account-facts")?.textContent.includes("게스트")','Guest account detail did not open');
  const guest=await client.evaluate("(() => ({account:document.querySelector('.my-account-section')?.innerText,auth:document.querySelector('.my-auth-action')?.textContent.trim()}))()");
  assert(guest.account.includes('게스트') && !guest.account.includes('member@example.com'), 'Guest/member isolation is broken');
  assert(guest.auth==='계정 연결','Guest account-connect action missing');
  console.log('MyeongHa_WEB_MY_BROWSER_PASS');
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
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
