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
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.avif', 'image/avif'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
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
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
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
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
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
  if (shot.data) {
    await writeFile(join(dir, `web-reading-browser-smoke${suffix}.png`), Buffer.from(shot.data, 'base64'));
  }
  const diagnostics = await client.evaluate(`(() => ({
    href: location.href,
    title: document.title,
    readyState: document.readyState,
    bodyClass: document.body?.className ?? null,
    bodyText: document.body?.innerText ?? '',
    htmlPrefix: document.documentElement?.outerHTML?.slice(0, 2500) ?? '',
  }))()`);
  await writeFile(
    join(dir, `web-reading-browser-smoke${suffix}.json`),
    `${JSON.stringify(diagnostics, null, 2)}\n`,
  );
}

async function navigate(client, origin, pathname, selector) {
  const result = await client.send('Page.navigate', { url: `${origin}${pathname}` });
  assert(!result.errorText, `Navigation failed for ${pathname}: ${result.errorText}`);
  await waitForPage(client, pathname.split('?')[0], selector);
  await sleep(120);
}

async function verifyDarkPage(client, origin, pathname, selector, { toggle = true, artifactSuffix = null } = {}) {
  await navigate(client, origin, pathname, selector);
  const cleanPath = pathname.split('?')[0];
  const selectorLiteral = JSON.stringify(selector);
  const state = await client.evaluate(`(() => {
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
      toggleVisible: Boolean(themeButton && buttonRect && buttonRect.width > 0 && buttonRect.height > 0 && getComputedStyle(themeButton).display !== 'none'),
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  })()`);

  assert(state.pathname === cleanPath, `Unexpected dark theme pathname: ${state.pathname}`);
  assert(state.theme === 'dark', `Dark theme did not persist on ${cleanPath}: ${state.theme}`);
  assert(state.colorScheme === 'dark', `Dark color-scheme missing on ${cleanPath}: ${state.colorScheme}`);
  assert(state.storedTheme === 'dark', `Dark theme preference missing on ${cleanPath}`);
  assert(state.styles.includes('/product-theme.css'), `Dark theme stylesheet missing on ${cleanPath}`);
  assert(state.paperBase === '#0b1419', `Dark paper token not active on ${cleanPath}: ${state.paperBase}`);
  assert(state.inkStrong === '#f0e7d9', `Dark ink token not active on ${cleanPath}: ${state.inkStrong}`);
  assert(state.targetVisible, `Dark theme target is not visible on ${cleanPath}: ${selector}`);
  if (toggle) assert(state.toggleVisible, `Theme toggle is not visible on ${cleanPath}`);
  assert(state.overflow <= 2, `Horizontal overflow on ${cleanPath}: ${state.overflow}px`);
  if (artifactSuffix) await artifact(client, artifactSuffix);
  return state;
}

for (const file of [
  'hall.html', 'reading.html', 'reading-detail.html', 'reading-detail-route.js', 'chat-hub.html', 'chat.html',
  'records.html', 'my.html', 'product-theme.js', 'product-theme.css',
  'golden-master.css', 'golden-master-lock.css',
]) {
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

  await navigate(client, origin, '/hall.html', '.gm-home-hero');
  const hallState = await client.evaluate(`(() => {
    const inspect = (selector, minW, minH) => {
      const el = document.querySelector(selector);
      if (!el) return { selector, exists: false };
      const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      return { selector, exists: true, width: Math.round(r.width), height: Math.round(r.height),
        visible: r.width >= minW && r.height >= minH && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0 };
    };
    const shell = document.querySelector('.gm-shell')?.getBoundingClientRect();
    const products = [...document.querySelectorAll('.gm-home-products .gm-product-card')];
    const productRects = products.map((item) => item.getBoundingClientRect());
    return {
      pathname: location.pathname,
      bodyText: document.body.innerText,
      styles: [...document.styleSheets].map((sheet) => sheet.href ? new URL(sheet.href).pathname : 'inline'),
      heroHref: document.querySelector('.gm-home-hero .gm-primary-button')?.getAttribute('href') ?? '',
      shellWidth: shell ? Math.round(shell.width) : 0,
      productCount: products.length,
      productTopBands: productRects.map((rect) => Math.round(rect.top)),
      oldSidebars: document.querySelectorAll('.home-sidebar, .gm-sidebar').length,
      overflow: document.documentElement.scrollWidth - innerWidth,
      elements: [
        inspect('.product-header', 100, 40), inspect('.gm-home-hero', 900, 250),
        inspect('.gm-month-card', 900, 140), inspect('.gm-home-products', 900, 70),
        inspect('.gm-recent-card', 900, 60),
      ],
    };
  })()`);

  assert(hallState.pathname === '/hall.html', `Expected /hall.html, got ${hallState.pathname}`);
  for (const css of ['/product.css', '/golden-master.css', '/product-theme.css', '/golden-master-lock.css']) {
    assert(hallState.styles.includes(css), `Home Golden Master stylesheet not loaded: ${css}`);
  }
  for (const el of hallState.elements) {
    assert(el.exists && el.visible, `Home Golden Master element unavailable: ${el.selector}`);
  }
  assert(hallState.shellWidth >= 1180 && hallState.shellWidth <= 1240, `Unexpected Home Golden Master shell width: ${hallState.shellWidth}`);
  assert(hallState.productCount === 4, `Home Golden Master must expose exactly four product cards, got ${hallState.productCount}`);
  assert(new Set(hallState.productTopBands).size === 1, `Home product cards are not a single desktop row: ${JSON.stringify(hallState.productTopBands)}`);
  assert(hallState.oldSidebars === 0, `Home Golden Master reintroduced sidebar layout: ${hallState.oldSidebars}`);
  assert(hallState.overflow <= 2, `Home Golden Master horizontal overflow: ${hallState.overflow}px`);
  assert(hallState.bodyText.includes('좋은 저녁이에요'), 'Home Golden Master greeting missing');
  assert(hallState.bodyText.includes('오늘 이야기할 사람') && hallState.bodyText.includes('캐릭터 선택'), 'Home Character chooser missing');
  assert(hallState.heroHref === 'chat-hub.html', `Home global conversation entry must route through the hub: ${hallState.heroHref}`);
  assert(!hallState.bodyText.includes('세연') && !hallState.bodyText.includes('연화'), 'Home must not infer a named Character mapping');
  assert(hallState.bodyText.includes('이번 달 사주 읽기') && hallState.bodyText.includes('검증된 Reading이 제공 가능한지 상세 화면에서 확인할 수 있습니다.'), 'Home monthly Reading readiness entry missing');
  assert(!hallState.bodyText.includes('이달의 운세 전체보기') && !hallState.bodyText.includes('오늘의 흐름은 사주 화면에서 직접 펼쳐볼 수 있습니다.'), 'Home must not claim blocked monthly Reading availability');
  assert(hallState.bodyText.includes('사주 읽기 주제') && hallState.bodyText.includes('전체 사주') && hallState.bodyText.includes('직업 · 커리어') && hallState.bodyText.includes('재물') && hallState.bodyText.includes('연애 · 관계'), 'Home four-card Saju row missing');
  assert(hallState.bodyText.includes('최근 이야기') && hallState.bodyText.includes('지금은 저장된 사실을 이야기로 추측해 이어 붙이지 않습니다.'), 'Home recent-story fail-closed state missing');
  await artifact(client, '-home');

  await navigate(client, origin, '/reading.html', '#saju-empty');
  await waitForVisible(client, '#saju-empty');
  const sajuState = await client.evaluate(`(() => {
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
    return {
      pathname: location.pathname,
      bodyText: document.body.innerText,
      styles: [...document.styleSheets].map((sheet) => sheet.href ? new URL(sheet.href).pathname : 'inline'),
      empty: visible('#saju-empty'), form: visible('#saju-birth-form'), button: visible('#saju-create-button'),
      hubHidden: document.querySelector('#saju-hub')?.hidden, hubRendered: rendered('#saju-hub'),
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  })()`);
  assert(sajuState.pathname === '/reading.html', `Expected /reading.html, got ${sajuState.pathname}`);
  for (const css of ['/product.css', '/saju-hub.css', '/golden-master.css', '/golden-master-lock.css']) {
    assert(sajuState.styles.includes(css), `Saju stylesheet not loaded: ${css}`);
  }
  assert(sajuState.empty && sajuState.form && sajuState.button, 'Saju onboarding is not fully visible');
  assert(sajuState.hubHidden === true && sajuState.hubRendered === false, 'Saju populated state must fail closed without a Birth Profile');
  assert(sajuState.bodyText.includes('아직 등록된 사주가 없습니다.') && sajuState.bodyText.includes('내 사주 만들기'), 'Saju onboarding copy missing');
  assert(sajuState.overflow <= 2, `Saju horizontal overflow: ${sajuState.overflow}px`);
  await artifact(client, '-saju');

  await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(150);
  const mobileSaju = await client.evaluate(`(() => {
    const visible = (selector) => {
      const el = document.querySelector(selector); if (!el || el.hidden) return false;
      const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
    };
    return { width: innerWidth, empty: visible('#saju-empty'), form: visible('#saju-birth-form'), bottomNav: visible('.mobile-bottom-nav'), overflow: document.documentElement.scrollWidth - innerWidth };
  })()`);
  assert(mobileSaju.width === 390 && mobileSaju.empty && mobileSaju.form && mobileSaju.bottomNav, 'Mobile Saju onboarding is not fully visible');
  assert(mobileSaju.overflow <= 2, `Mobile Saju horizontal overflow: ${mobileSaju.overflow}px`);
  await artifact(client, '-saju-mobile');

  await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await navigate(client, origin, '/reading-detail.html?scope=year', '.reading-route-state');
  await waitForVisible(client, '.reading-route-state');
  const readingState = await client.evaluate(`(() => {
    const visible = (selector) => {
      const el = document.querySelector(selector); if (!el || el.hidden) return false;
      const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0;
    };
    const stage = document.querySelector('[data-reading-stage]');
    const stageStyle = stage ? getComputedStyle(stage) : null;
    return {
      pathname: location.pathname,
      bodyText: document.body.innerText,
      topic: document.body.dataset.readingTopicKey ?? '',
      scope: document.body.dataset.readingScopeKey ?? '',
      routeState: document.body.dataset.readingRouteState ?? '',
      productTitle: document.querySelector('[data-reading-product-title]')?.textContent?.trim() ?? '',
      stateTitle: document.querySelector('[data-reading-state-title]')?.textContent?.trim() ?? '',
      stateCopy: document.querySelector('[data-reading-state-copy]')?.textContent?.trim() ?? '',
      hubHref: document.querySelector('.reading-back-to-hub')?.getAttribute('href') ?? '',
      routeVisible: visible('.reading-route-state'),
      stageHidden: stage?.hidden === true,
      stageRendered: Boolean(stage && stage.getBoundingClientRect().width > 0 && stageStyle?.display !== 'none'),
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  })()`);
  assert(readingState.routeVisible, 'Reading authority-blocked route state is not visible');
  assert(readingState.topic === 'general' && readingState.scope === 'year', `Unexpected yearly Reading route: ${readingState.topic}/${readingState.scope}`);
  assert(readingState.routeState === 'blocked_by_authority', `Unexpected Reading authority state: ${readingState.routeState}`);
  assert(readingState.stageHidden && !readingState.stageRendered, 'Blocked Reading placeholder stage must remain hidden');
  assert(readingState.stateTitle.includes('올해 읽기는 아직 준비 중입니다.'), `Unexpected yearly blocked title: ${readingState.stateTitle}`);
  assert(readingState.stateCopy.includes('다른 주제의 풀이로 대신 보여드리지 않습니다.'), 'Blocked Reading must disclose no cross-topic substitution');
  assert(readingState.hubHref === 'reading.html', `Reading detail does not return to Saju hub: ${readingState.hubHref}`);
  assert(!readingState.bodyText.includes('다음 읽기') && !readingState.bodyText.includes('내 명식 보기'), 'Blocked Reading leaked dormant result actions');
  assert(readingState.overflow <= 2, `Reading detail horizontal overflow: ${readingState.overflow}px`);
  await artifact(client, '-reading-detail');

  await navigate(client, origin, '/reading-detail.html?topic=career', '.reading-route-state');
  const careerReading = await client.evaluate(`(() => ({
    topic: document.body.dataset.readingTopicKey ?? '',
    scope: document.body.dataset.readingScopeKey ?? '',
    routeState: document.body.dataset.readingRouteState ?? '',
    title: document.querySelector('[data-reading-state-title]')?.textContent?.trim() ?? '',
    productTitle: document.querySelector('[data-reading-product-title]')?.textContent?.trim() ?? '',
  }))()`);
  assert(careerReading.topic === 'career' && careerReading.scope === 'original', `Career route collapsed: ${JSON.stringify(careerReading)}`);
  assert(careerReading.routeState === 'blocked_by_authority' && careerReading.title.includes('직업 · 커리어'), 'Career blocked surface lost route identity');

  await navigate(client, origin, '/reading-detail.html?topic=money', '.reading-route-state');
  const moneyReading = await client.evaluate(`(() => ({
    topic: document.body.dataset.readingTopicKey ?? '',
    scope: document.body.dataset.readingScopeKey ?? '',
    routeState: document.body.dataset.readingRouteState ?? '',
    title: document.querySelector('[data-reading-state-title]')?.textContent?.trim() ?? '',
  }))()`);
  assert(moneyReading.topic === 'money' && moneyReading.scope === 'original', `Money route collapsed: ${JSON.stringify(moneyReading)}`);
  assert(moneyReading.routeState === 'blocked_by_authority' && moneyReading.title.includes('재물'), 'Money blocked surface lost route identity');

  await navigate(client, origin, '/reading-detail.html?topic=unknown-reading', '.reading-route-state');
  const invalidReading = await client.evaluate(`(() => ({
    topic: document.body.dataset.readingTopicKey ?? '',
    scope: document.body.dataset.readingScopeKey ?? '',
    routeState: document.body.dataset.readingRouteState ?? '',
    title: document.querySelector('[data-reading-state-title]')?.textContent?.trim() ?? '',
    copy: document.querySelector('[data-reading-state-copy]')?.textContent?.trim() ?? '',
  }))()`);
  assert(invalidReading.routeState === 'invalid', `Unknown Reading did not fail closed: ${JSON.stringify(invalidReading)}`);
  assert(!invalidReading.topic && !invalidReading.scope, 'Invalid Reading retained semantic route identity');
  assert(invalidReading.copy.includes('자동 대체하지 않았습니다.'), 'Invalid Reading did not disclose fallback refusal');

  await client.evaluate(`(() => { localStorage.setItem('myeongha.productTheme.v1', 'dark'); return true; })()`);
  const darkHome = await verifyDarkPage(client, origin, '/hall.html', '.gm-home-hero', { artifactSuffix: '-dark-home' });

  const toggleState = await client.evaluate(`(() => {
    const button = document.querySelector('.product-theme-toggle');
    button.click();
    const light = { theme: document.documentElement.dataset.theme, stored: localStorage.getItem('myeongha.productTheme.v1'), pressed: button.getAttribute('aria-pressed') };
    button.click();
    const dark = { theme: document.documentElement.dataset.theme, stored: localStorage.getItem('myeongha.productTheme.v1'), pressed: button.getAttribute('aria-pressed') };
    return { light, dark };
  })()`);
  assert(toggleState.light.theme === 'light' && toggleState.light.stored === 'light' && toggleState.light.pressed === 'false', 'Theme toggle did not switch to light');
  assert(toggleState.dark.theme === 'dark' && toggleState.dark.stored === 'dark' && toggleState.dark.pressed === 'true', 'Theme toggle did not switch back to dark');

  const darkSaju = await verifyDarkPage(client, origin, '/reading.html', '#saju-empty', { artifactSuffix: '-dark-saju' });
  const darkReading = await verifyDarkPage(client, origin, '/reading-detail.html?scope=year', '.reading-route-state', { artifactSuffix: '-dark-reading-detail' });
  const darkChatHub = await verifyDarkPage(client, origin, '/chat-hub.html', '.conversation-primary', { artifactSuffix: '-dark-chat-hub' });
  const darkChatRoom = await verifyDarkPage(client, origin, '/chat.html', '.conversation-chat-panel', { artifactSuffix: '-dark-chat-room' });
  const darkRecords = await verifyDarkPage(client, origin, '/records.html', '.records-main');
  const darkMy = await verifyDarkPage(client, origin, '/my.html', '.my-main');

  await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const darkMobileHome = await verifyDarkPage(client, origin, '/hall.html', '.gm-home-hero', { artifactSuffix: '-dark-home-mobile' });
  const darkMobileSaju = await verifyDarkPage(client, origin, '/reading.html', '#saju-empty', { artifactSuffix: '-dark-saju-mobile' });
  const darkMobileChat = await verifyDarkPage(client, origin, '/chat.html', '.conversation-chat-panel', { toggle: false, artifactSuffix: '-dark-chat-room-mobile' });
  const mobileChatState = await client.evaluate(`(() => ({
    theme: document.documentElement.dataset.theme,
    width: innerWidth,
    overflow: document.documentElement.scrollWidth - innerWidth,
    roomHeaderVisible: (() => { const el = document.querySelector('.conversation-room-header'); const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none'; })(),
    chatPanelVisible: (() => { const el = document.querySelector('.conversation-chat-panel'); const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none'; })(),
  }))()`);
  assert(mobileChatState.theme === 'dark' && mobileChatState.width === 390, 'Dark mobile Conversation theme did not persist');
  assert(mobileChatState.overflow <= 2, `Dark mobile Conversation horizontal overflow: ${mobileChatState.overflow}px`);
  assert(mobileChatState.roomHeaderVisible && mobileChatState.chatPanelVisible, 'Dark mobile Conversation room lost required layout');

  console.log(JSON.stringify({
    status: 'MyeongHa_WEB_BROWSER_RENDER_PASS',
    home: hallState,
    saju: sajuState,
    mobileSaju,
    reading: readingState,
    readingRoutes: { career: careerReading, money: moneyReading, invalid: invalidReading },
    dark: { home: darkHome, saju: darkSaju, reading: darkReading, chatHub: darkChatHub, chatRoom: darkChatRoom, records: darkRecords, my: darkMy, mobileHome: darkMobileHome, mobileSaju: darkMobileSaju, mobileChat: darkMobileChat },
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