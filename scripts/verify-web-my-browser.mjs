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

for (const file of ['my.html', 'my.css', 'my-page.js', 'my-runtime-client.js', 'product-auth.js', 'product-theme.js']) {
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
  await waitFor(
    client,
    `document.querySelector('#my-status')?.innerText.includes('현재 세션이 필요합니다.')`,
    'My guest/session-required state did not render',
  );

  const guestEntryState = await client.evaluate(`(() => ({
    title: document.title,
    contentHidden: document.querySelector('#my-content')?.hidden,
    statusVisible: (() => { const el = document.querySelector('#my-status'); const r = el?.getBoundingClientRect(); return Boolean(r && r.width > 0 && r.height > 0 && !el.hidden); })(),
    routeHrefs: [...document.querySelectorAll('.my-route-card')].map((el) => el.getAttribute('href')),
    routeVisible: [...document.querySelectorAll('.my-route-card')].every((el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 70 && s.display !== 'none' && s.visibility !== 'hidden'; }),
    birthRouteTitle: document.querySelector('#my-birth-route-title')?.textContent?.trim() ?? null,
    bodyText: document.body.innerText,
    overflow: document.documentElement.scrollWidth - innerWidth,
  }))()`);
  assert(guestEntryState.title === '마이 · 명하', `Unexpected My title: ${guestEntryState.title}`);
  assert(guestEntryState.contentHidden === true && guestEntryState.statusVisible, 'My session-required account state is not fail-closed');
  assert(guestEntryState.routeVisible && guestEntryState.routeHrefs.length === 4, 'My route foundation is not visibly rendered');
  for (const href of ['reading.html', '#my-birth-title', 'records.html', 'chat-hub.html']) {
    assert(guestEntryState.routeHrefs.includes(href), `My route is missing: ${href}`);
  }
  assert(!guestEntryState.routeHrefs.includes('birth.html'), 'My unknown Birth state exposed the create route');
  assert(guestEntryState.birthRouteTitle === '현재 출생 정보 확인', `Unexpected fail-closed Birth route title: ${guestEntryState.birthRouteTitle}`);
  assert(guestEntryState.bodyText.includes('내 정보와 이어지는 곳'), 'My route section title missing');
  assert(guestEntryState.bodyText.includes('설정과 계정 경계'), 'My settings boundary section missing');
  assert(guestEntryState.overflow <= 2, `My desktop guest horizontal overflow: ${guestEntryState.overflow}px`);

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
  await waitFor(
    client,
    `document.querySelector('#my-content')?.hidden === false && document.querySelector('#my-account-email')?.textContent.trim() === 'member@example.com'`,
    'My member account state did not render',
  );

  const memberState = await client.evaluate(`(() => {
    const card = document.querySelector('.my-identity-card')?.getBoundingClientRect();
    return {
      theme: document.documentElement.dataset.theme,
      subjectKind: document.querySelector('#my-subject-kind')?.textContent?.trim(),
      subjectStatus: document.querySelector('#my-subject-status')?.textContent?.trim(),
      displayName: document.querySelector('#my-display-name')?.textContent?.trim(),
      email: document.querySelector('#my-account-email')?.textContent?.trim(),
      action: document.querySelector('.my-auth-action')?.textContent?.trim(),
      birthRouteHref: document.querySelector('#my-birth-route')?.getAttribute('href'),
      cardVisible: Boolean(card && card.width > 300 && card.height > 220),
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  })()`);
  assert(memberState.theme === 'dark', 'My dark theme did not apply');
  assert(memberState.subjectKind === '회원' && memberState.subjectStatus === '사용 중', 'My member authority state is incorrect');
  assert(memberState.displayName === '테스트 사용자', `Unexpected My display name: ${memberState.displayName}`);
  assert(memberState.email === 'member@example.com', `Unexpected My member email: ${memberState.email}`);
  assert(memberState.action === '로그아웃', `Unexpected My member action: ${memberState.action}`);
  assert(memberState.birthRouteHref === '#my-birth-title', `My unavailable Birth read exposed create route: ${memberState.birthRouteHref}`);
  assert(memberState.cardVisible, 'My member identity card is not visibly rendered');
  assert(memberState.overflow <= 2, `My desktop member horizontal overflow: ${memberState.overflow}px`);
  await capture(client, 'desktop-dark-member');

  await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await navigate(client, origin);
  await waitFor(client, `document.querySelector('#my-content')?.hidden === false`, 'My mobile member content did not render');
  const mobileState = await client.evaluate(`(() => {
    const identity = document.querySelector('.my-identity-card')?.getBoundingClientRect();
    const firstRoute = document.querySelector('.my-route-card')?.getBoundingClientRect();
    const bottom = document.querySelector('.mobile-bottom-nav')?.getBoundingClientRect();
    return {
      width: innerWidth,
      overflow: document.documentElement.scrollWidth - innerWidth,
      identityLeft: identity?.left ?? -1,
      identityRight: identity?.right ?? 9999,
      routeLeft: firstRoute?.left ?? -1,
      routeRight: firstRoute?.right ?? 9999,
      bottomVisible: Boolean(bottom && bottom.width > 0 && bottom.height > 0 && getComputedStyle(document.querySelector('.mobile-bottom-nav')).display !== 'none'),
    };
  })()`);
  assert(mobileState.width === 390, `Unexpected My mobile viewport: ${mobileState.width}`);
  assert(mobileState.overflow <= 2, `My mobile horizontal overflow: ${mobileState.overflow}px`);
  assert(mobileState.identityLeft >= 0 && mobileState.identityRight <= 390, 'My identity card escapes mobile viewport');
  assert(mobileState.routeLeft >= 0 && mobileState.routeRight <= 390, 'My route card escapes mobile viewport');
  assert(mobileState.bottomVisible, 'My mobile bottom navigation is not visible');
  await capture(client, 'mobile-dark-member');

  await client.evaluate(`(() => {
    localStorage.removeItem('myeongha.memberSession.v1');
    sessionStorage.removeItem('myeongha.pendingGuestBearer.v1');
    sessionStorage.setItem('myeongha.guestBearer.v1', 'smoke-guest-bearer');
  })()`);
  await navigate(client, origin);
  await waitFor(
    client,
    `document.querySelector('#my-content')?.hidden === false && document.querySelector('#my-subject-kind')?.textContent.trim() === '게스트'`,
    'My verified guest account state did not render',
  );
  const verifiedGuest = await client.evaluate(`(() => ({
    subjectKind: document.querySelector('#my-subject-kind')?.textContent?.trim(),
    email: document.querySelector('#my-account-email')?.textContent?.trim(),
    action: document.querySelector('.my-auth-action')?.textContent?.trim(),
    note: document.querySelector('#my-account-note')?.textContent?.trim(),
    birthRouteHref: document.querySelector('#my-birth-route')?.getAttribute('href'),
  }))()`);
  assert(verifiedGuest.subjectKind === '게스트', 'My guest subject label missing');
  assert(verifiedGuest.email === '게스트 세션', 'My guest account identity missing');
  assert(verifiedGuest.action === '계정 연결', 'My guest account-connect action missing');
  assert(verifiedGuest.note?.includes('회원 기록으로 가정하지 않습니다.'), 'My guest/member authority boundary copy missing');
  assert(verifiedGuest.birthRouteHref === '#my-birth-title', `My verified guest unavailable Birth read exposed create route: ${verifiedGuest.birthRouteHref}`);

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
