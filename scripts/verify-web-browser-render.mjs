import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'], ['.webp', 'image/webp'], ['.avif', 'image/avif'],
  ['.ico', 'image/x-icon'], ['.woff', 'font/woff'], ['.woff2', 'font/woff2'],
]);

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const pathname = decodeURIComponent(url.pathname === '/' ? '/hall.html' : url.pathname);
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

async function cdp(port) {
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

async function waitForPage(client, pathname, selector, timeout = 10_000) {
  const selectorLiteral = JSON.stringify(selector);
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const state = await client.evaluate(`(() => ({
      pathname: location.pathname,
      readyState: document.readyState,
      found: Boolean(document.querySelector(${selectorLiteral})),
    }))()`);
    if (state?.pathname === pathname && state.readyState === 'complete' && state.found) return;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${pathname} ${selector}`);
}

async function waitForVisible(client, selector, timeout = 5_000) {
  const selectorLiteral = JSON.stringify(selector);
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const visible = await client.evaluate(`(() => {
      const el = document.querySelector(${selectorLiteral});
      if (!el || el.hidden) return false;
      const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0;
    })()`);
    if (visible) return;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for visible ${selector}`);
}

async function artifact(client, suffix = '') {
  const dir = resolve(process.cwd(), 'artifacts');
  await mkdir(dir, { recursive: true });
  const shot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  if (shot.data) await writeFile(join(dir, `web-reading-browser-smoke${suffix}.png`), Buffer.from(shot.data, 'base64'));
  const diagnostics = await client.evaluate(`(() => ({
    href: location.href, title: document.title, readyState: document.readyState,
    bodyClass: document.body?.className ?? null, bodyText: document.body?.innerText ?? '',
    htmlPrefix: document.documentElement?.outerHTML?.slice(0, 2500) ?? '',
  }))()`);
  await writeFile(join(dir, `web-reading-browser-smoke${suffix}.json`), `${JSON.stringify(diagnostics, null, 2)}\n`);
}

async function verifyDarkPage(client, origin, pathname, selector, { toggle = true, artifactSuffix = null } = {}) {
  const nav = await client.send('Page.navigate', { url: `${origin}${pathname}` });
  assert(!nav.errorText, `Dark theme navigation failed for ${pathname}: ${nav.errorText}`);
  const cleanPath = pathname.split('?')[0];
  await waitForPage(client, cleanPath, selector);
  await sleep(120);
  const selectorLiteral = JSON.stringify(selector);
  const darkState = await client.evaluate(`(() => {
    const rootStyle = getComputedStyle(document.documentElement);
    const target = document.querySelector(${selectorLiteral});
    const targetRect = target?.getBoundingClientRect();
    const themeButton = document.querySelector('.product-theme-toggle');
    const buttonRect = themeButton?.getBoundingClientRect();
    return {
      pathname: location.pathname,
      theme: document.documentElement.dataset.theme ?? null,
      colorScheme: document.documentElement.style.colorScheme,
      storedTheme: localStorage.getItem('myeongha.productTheme.v1'),
      paperBase: rootStyle.getPropertyValue('--mh-paper-base').trim(),
      inkStrong: rootStyle.getPropertyValue('--mh-ink-strong').trim(),
      styles: [...document.styleSheets].map((sheet) => sheet.href ? new URL(sheet.href).pathname : 'inline'),
      targetVisible: Boolean(target && targetRect && targetRect.width > 0 && targetRect.height > 0 && getComputedStyle(target).display !== 'none'),
      targetBackground: target ? getComputedStyle(target).backgroundColor : null,
      toggleVisible: Boolean(themeButton && buttonRect && buttonRect.width > 0 && buttonRect.height > 0 && getComputedStyle(themeButton).display !== 'none'),
      overflow: document.documentElement.scrollWidth - innerWidth,
      viewportWidth: innerWidth,
    };
  })()`);
  assert(darkState.pathname === cleanPath, `Unexpected dark theme pathname: ${darkState.pathname}`);
  assert(darkState.theme === 'dark', `Dark theme did not persist on ${cleanPath}: ${darkState.theme}`);
  assert(darkState.colorScheme === 'dark', `Dark color-scheme missing on ${cleanPath}: ${darkState.colorScheme}`);
  assert(darkState.storedTheme === 'dark', `Dark theme preference missing on ${cleanPath}`);
  assert(darkState.styles.includes('/product-theme.css'), `Dark theme stylesheet missing on ${cleanPath}`);
  assert(darkState.paperBase === '#0b1419', `Dark paper token not active on ${cleanPath}: ${darkState.paperBase}`);
  assert(darkState.inkStrong === '#f0e7d9', `Dark ink token not active on ${cleanPath}: ${darkState.inkStrong}`);
  assert(darkState.targetVisible, `Dark theme target is not visible on ${cleanPath}: ${selector}`);
  if (toggle) assert(darkState.toggleVisible, `Theme toggle is not visible on ${cleanPath}`);
  assert(darkState.overflow <= 2, `Horizontal overflow on ${cleanPath}: ${darkState.overflow}px`);
  if (artifactSuffix) await artifact(client, artifactSuffix);
  return darkState;
}

for (const file of ['hall.html', 'reading.html', 'reading-detail.html', 'chat-hub.html', 'chat.html', 'records.html', 'my.html', 'product-theme.js', 'product-theme.css']) {
  await stat(join(root, file));
}
const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-browser-smoke-'));
const chrome = spawn(chromeBin, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
let chromeError = '';
chrome.stderr.setEncoding('utf8');
chrome.stderr.on('data', (chunk) => { chromeError += chunk; });
let client;

try {
  client = await cdp(await devtoolsPort(profile, chrome));
  const nav = await client.send('Page.navigate', { url: `${origin}/hall.html` });
  assert(!nav.errorText, `Hall navigation failed: ${nav.errorText}`);
  await waitForPage(client, '/hall.html', 'a.product-nav-link[href="reading.html"]');

  const hallState = await client.evaluate(`(() => {
    const inspect = (selector, minW, minH) => {
      const el = document.querySelector(selector); if (!el) return { selector, exists: false };
      const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      return { selector, exists: true, width: Math.round(r.width), height: Math.round(r.height), display: s.display,
        visibility: s.visibility, opacity: Number(s.opacity), visible: r.width >= minW && r.height >= minH && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0 };
    };
    return {
      pathname: location.pathname,
      bodyText: document.body.innerText,
      styles: [...document.styleSheets].map((sheet) => sheet.href ? new URL(sheet.href).pathname : 'inline'),
      detailLinks: [...document.querySelectorAll('a[href^="reading-detail.html"]')].map((link) => link.getAttribute('href')),
      elements: [inspect('.product-header', 100, 40), inspect('.home-today', 500, 250),
        inspect('.home-thread', 260, 240), inspect('.home-topic-grid', 500, 70), inspect('.home-person', 500, 90)],
    };
  })()`);

  assert(hallState.pathname === '/hall.html', `Expected /hall.html, got ${hallState.pathname}`);
  for (const css of ['/product.css', '/home-v2.css', '/home-v3.css', '/home-showcase-v4.css']) assert(hallState.styles.includes(css), `Home stylesheet not loaded: ${css}`);
  for (const el of hallState.elements) {
    assert(el.exists, `Missing browser-rendered Home element ${el.selector}`);
    assert(el.visible, `Invisible Home element ${el.selector}: ${el.width}x${el.height}, ${el.display}/${el.visibility}/${el.opacity}`);
  }
  assert(hallState.bodyText.includes('오늘은 무엇을 읽어볼까요?'), 'Home title missing');
  assert(hallState.bodyText.includes('오늘의 흐름을') && hallState.bodyText.includes('오늘 읽어보기'), 'Home primary Reading entry missing');
  assert(hallState.bodyText.includes('지금은 저장된 사실을 이야기로 추측해 이어 붙이지 않습니다.'), 'Home Life Thread non-inference boundary missing');
  assert(hallState.bodyText.includes('오늘 이야기할 사람') && hallState.bodyText.includes('이야기하기'), 'Home character entry missing');
  assert(hallState.detailLinks.length >= 5, 'Home Reading entries are not routed to reading-detail.html');
  await artifact(client, '-home');

  const hallVisible = await client.evaluate(`(() => {
    const el = document.querySelector('a.product-nav-link[href="reading.html"]');
    const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
  })()`);
  assert(hallVisible, 'Hall Saju navigation link is not visible');
  assert(await client.evaluate(`(() => { document.querySelector('a.product-nav-link[href="reading.html"]').click(); return true; })()`), 'Hall Saju click failed');
  await waitForPage(client, '/reading.html', '#saju-empty');
  await waitForVisible(client, '#saju-empty');

  const sajuState = await client.evaluate(`(() => {
    const inspect = (selector, minW, minH) => {
      const el = document.querySelector(selector); if (!el) return { selector, exists: false };
      const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      return { selector, exists: true, width: Math.round(r.width), height: Math.round(r.height), display: s.display,
        visibility: s.visibility, opacity: Number(s.opacity), hidden: Boolean(el.hidden), visible: !el.hidden && r.width >= minW && r.height >= minH && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0 };
    };
    const isRendered = (selector) => {
      const el = document.querySelector(selector); if (!el) return false;
      const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0;
    };
    return {
      pathname: location.pathname,
      bodyText: document.body.innerText,
      styles: [...document.styleSheets].map((sheet) => sheet.href ? new URL(sheet.href).pathname : 'inline'),
      hubHidden: document.querySelector('#saju-hub')?.hidden,
      hubRendered: isRendered('#saju-hub'),
      elements: [inspect('.product-header', 100, 40), inspect('#saju-empty', 500, 400),
        inspect('.saju-empty-card', 360, 300), inspect('#saju-birth-form', 300, 180), inspect('#saju-create-button', 240, 40)],
    };
  })()`);

  assert(sajuState.pathname === '/reading.html', `Expected /reading.html Saju hub, got ${sajuState.pathname}`);
  for (const css of ['/product.css', '/saju-hub.css']) assert(sajuState.styles.includes(css), `Saju hub stylesheet not loaded: ${css}`);
  for (const el of sajuState.elements) {
    assert(el.exists, `Missing browser-rendered Saju hub element ${el.selector}`);
    assert(el.visible, `Invisible Saju hub element ${el.selector}: ${el.width}x${el.height}, ${el.display}/${el.visibility}/${el.opacity}`);
  }
  assert(sajuState.hubHidden === true, 'Populated Saju state must remain hidden without a current Birth Profile');
  assert(sajuState.hubRendered === false, 'Hidden populated Saju state must not occupy visual layout');
  assert(sajuState.bodyText.includes('아직 등록된 사주가 없습니다.'), 'Saju empty-state title missing');
  assert(sajuState.bodyText.includes('내 사주 만들기'), 'Saju onboarding CTA missing');
  assert(sajuState.bodyText.includes('게스트로 먼저 볼 수 있으며'), 'Guest-first Saju guidance missing');
  await artifact(client, '-saju');

  await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(150);
  const mobileState = await client.evaluate(`(() => {
    const visible = (selector) => {
      const el = document.querySelector(selector); if (!el || el.hidden) return false;
      const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
    };
    const rendered = (selector) => {
      const el = document.querySelector(selector); if (!el) return false;
      const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
    };
    return { width: innerWidth, empty: visible('#saju-empty'), form: visible('#saju-birth-form'), bottomNav: visible('.mobile-bottom-nav'), hubRendered: rendered('#saju-hub') };
  })()`);
  assert(mobileState.width === 390, `Unexpected mobile viewport width: ${mobileState.width}`);
  assert(mobileState.empty && mobileState.form && mobileState.bottomNav, 'Mobile Saju onboarding is not fully visible');
  assert(mobileState.hubRendered === false, 'Hidden populated Saju state occupies mobile layout');
  await artifact(client, '-saju-mobile');

  await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  const detailNav = await client.send('Page.navigate', { url: `${origin}/reading-detail.html?scope=year` });
  assert(!detailNav.errorText, `Reading detail navigation failed: ${detailNav.errorText}`);
  await waitForPage(client, '/reading-detail.html', '.reading-stage');

  const state = await client.evaluate(`(() => {
    const inspect = (selector, minW, minH) => {
      const el = document.querySelector(selector); if (!el) return { selector, exists: false };
      const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      return { selector, exists: true, width: Math.round(r.width), height: Math.round(r.height), display: s.display,
        visibility: s.visibility, opacity: Number(s.opacity), visible: r.width >= minW && r.height >= minH && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0 };
    };
    return {
      pathname: location.pathname, bodyText: document.body.innerText,
      scope: document.querySelector('[data-reading-scope]')?.textContent?.trim() ?? '',
      progress: document.querySelector('[data-reading-progress-label]')?.textContent?.trim() ?? '',
      title: document.querySelector('[data-reading-step-title]')?.textContent?.trim() ?? '',
      hubHref: document.querySelector('.reading-back-to-hub')?.getAttribute('href') ?? '',
      styles: [...document.styleSheets].map((sheet) => sheet.href ? new URL(sheet.href).pathname : 'inline'),
      elements: [inspect('.product-header', 100, 40), inspect('.reading-stage', 500, 500),
        inspect('.reader-scene', 200, 400), inspect('.reader-identity', 100, 40),
        inspect('.reading-sheet', 300, 400), inspect('.reading-sheet-actions', 200, 40)],
    };
  })()`);

  assert(state.pathname === '/reading-detail.html', `Expected /reading-detail.html, got ${state.pathname}`);
  for (const css of ['/product.css', '/reading-v3.css', '/reading-scenes.css']) assert(state.styles.includes(css), `Reading detail stylesheet not loaded: ${css}`);
  for (const el of state.elements) {
    assert(el.exists, `Missing browser-rendered Reading detail element ${el.selector}`);
    assert(el.visible, `Invisible Reading detail element ${el.selector}: ${el.width}x${el.height}, ${el.display}/${el.visibility}/${el.opacity}`);
  }
  assert(/^\d{4}년 · 올해$/.test(state.scope), `Unexpected scope: ${state.scope}`);
  assert(state.progress === '읽기 1 / 4', `Unexpected progress: ${state.progress}`);
  assert(state.title === '지금 읽히는 흐름', `Unexpected title: ${state.title}`);
  assert(state.hubHref === 'reading.html', `Reading detail does not return to Saju hub: ${state.hubHref}`);
  assert(state.bodyText.includes('내 명식 보기') && state.bodyText.includes('다음 읽기'), 'Reading actions missing');
  assert(state.bodyText.trim() !== state.scope, 'Reading collapsed to only the scope text');

  const advanced = await client.evaluate(`(() => { document.querySelector('[data-reading-next]').click(); return document.querySelector('[data-reading-progress-label]').textContent.trim(); })()`);
  assert(advanced === '읽기 2 / 4', `Reading runtime did not advance: ${advanced}`);
  await artifact(client, '-reading-detail');

  await client.evaluate(`(() => { localStorage.setItem('myeongha.productTheme.v1', 'dark'); return true; })()`);
  const darkHome = await verifyDarkPage(client, origin, '/hall.html', '.home-primary-grid', { artifactSuffix: '-dark-home' });

  const themeToggleState = await client.evaluate(`(() => {
    const button = document.querySelector('.product-theme-toggle');
    button.click();
    const afterLight = {
      theme: document.documentElement.dataset.theme,
      stored: localStorage.getItem('myeongha.productTheme.v1'),
      pressed: button.getAttribute('aria-pressed'),
    };
    button.click();
    return {
      afterLight,
      afterDark: {
        theme: document.documentElement.dataset.theme,
        stored: localStorage.getItem('myeongha.productTheme.v1'),
        pressed: button.getAttribute('aria-pressed'),
      },
    };
  })()`);
  assert(themeToggleState.afterLight.theme === 'light' && themeToggleState.afterLight.stored === 'light' && themeToggleState.afterLight.pressed === 'false', 'Theme toggle did not switch to light mode');
  assert(themeToggleState.afterDark.theme === 'dark' && themeToggleState.afterDark.stored === 'dark' && themeToggleState.afterDark.pressed === 'true', 'Theme toggle did not switch back to dark mode');

  const darkSaju = await verifyDarkPage(client, origin, '/reading.html', '#saju-empty', { artifactSuffix: '-dark-saju' });
  const darkSajuHidden = await client.evaluate(`(() => {
    const el = document.querySelector('#saju-hub');
    const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return { hidden: el.hidden, rendered: r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' };
  })()`);
  assert(darkSajuHidden.hidden === true && darkSajuHidden.rendered === false, 'Dark theme broke native hidden Saju layout protection');

  const darkReading = await verifyDarkPage(client, origin, '/reading-detail.html?scope=year', '.reading-sheet', { artifactSuffix: '-dark-reading-detail' });
  const darkChatHub = await verifyDarkPage(client, origin, '/chat-hub.html', '.conversation-primary', { artifactSuffix: '-dark-chat-hub' });
  const darkChatRoom = await verifyDarkPage(client, origin, '/chat.html', '.conversation-chat-panel', { artifactSuffix: '-dark-chat-room' });
  const darkRecords = await verifyDarkPage(client, origin, '/records.html', '.records-main');
  const darkMy = await verifyDarkPage(client, origin, '/my.html', '.my-main');

  await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const darkMobileHome = await verifyDarkPage(client, origin, '/hall.html', '.home-primary-grid', { artifactSuffix: '-dark-home-mobile' });
  const darkMobileSaju = await verifyDarkPage(client, origin, '/reading.html', '#saju-empty', { artifactSuffix: '-dark-saju-mobile' });
  const darkMobileChat = await verifyDarkPage(client, origin, '/chat.html', '.conversation-chat-panel', { toggle: false, artifactSuffix: '-dark-chat-room-mobile' });
  const darkMobileChatState = await client.evaluate(`(() => ({
    theme: document.documentElement.dataset.theme,
    width: innerWidth,
    overflow: document.documentElement.scrollWidth - innerWidth,
    roomHeaderVisible: (() => { const el = document.querySelector('.conversation-room-header'); const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none'; })(),
    chatPanelVisible: (() => { const el = document.querySelector('.conversation-chat-panel'); const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none'; })(),
  }))()`);
  assert(darkMobileChatState.theme === 'dark' && darkMobileChatState.width === 390, 'Dark mobile Conversation theme did not persist');
  assert(darkMobileChatState.overflow <= 2, `Dark mobile Conversation horizontal overflow: ${darkMobileChatState.overflow}px`);
  assert(darkMobileChatState.roomHeaderVisible && darkMobileChatState.chatPanelVisible, 'Dark mobile Conversation room lost required layout');

  console.log(JSON.stringify({
    status: 'MyeongHa_WEB_BROWSER_RENDER_PASS',
    home: hallState.elements,
    saju: sajuState.elements,
    mobile: mobileState,
    pathname: state.pathname,
    scope: state.scope,
    rendered: state.elements,
    dark: {
      home: darkHome,
      saju: darkSaju,
      reading: darkReading,
      chatHub: darkChatHub,
      chatRoom: darkChatRoom,
      records: darkRecords,
      my: darkMy,
      mobileHome: darkMobileHome,
      mobileSaju: darkMobileSaju,
      mobileChat: darkMobileChat,
    },
  }));
} catch (error) {
  if (client) { try { await artifact(client, '-failure'); } catch {} }
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
