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

const {server, origin} = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-ui-i18n-'));
const chrome = spawn(chromeBin, ['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'], {stdio:['ignore','ignore','pipe']});
let client;
const inspect = (js) => client.evaluate(js);
try {
  client = await cdp(await devtoolsPort(profile,chrome));
  await navigate(client,origin,'/reading.html','#saju-birth-sex');
  await inspect("(() => {let s=document.querySelector('.ui-locale-select');s.value='ja-JP';s.dispatchEvent(new Event('change',{bubbles:true}));return true;})()");
  await sleep(350);
  const ja = await inspect("(() => ({lang:document.documentElement.lang, options:[...document.querySelectorAll('#saju-birth-sex option')].map(x=>x.textContent.trim()), timeType:document.querySelector('#saju-birth-time')?.type, heading:document.querySelector('.gm-page-title')?.textContent.trim(), staticTopics:[...document.querySelectorAll('.gm-saju-reading-card')].map(x=>x.textContent.trim()),overflow:document.documentElement.scrollWidth-innerWidth}))()");
  assert(ja.lang==='ja-JP' && ja.heading==='四柱推命','Japanese Saju heading/locale did not apply: '+JSON.stringify(ja));
  assert(JSON.stringify(ja.options)===JSON.stringify(['選択しない','男性','女性','未指定']),'Japanese sex options remain Korean: '+JSON.stringify(ja));
  assert(ja.timeType==='text','Birth time must use locale-neutral 24-hour input, not OS-locale time picker');
  assert(ja.overflow<=2,'Japanese Saju layout overflow');
  assert(ja.staticTopics.every(t=>!/[가-힣]/u.test(t)),'Japanese Saju topic cards contain Korean: '+JSON.stringify(ja.staticTopics));
  await navigate(client,origin,'/face-reading.html','.face-reader-heading');
  await sleep(450);
  const face=await inspect("(() => ({ names:[...document.querySelectorAll('[data-face-reader-name]')].map(x=>x.textContent.trim()), title:document.querySelector('.face-reader-heading')?.textContent.trim(), capture:document.querySelector('#face-capture-title')?.textContent.trim(), visibleText:document.body.innerText.replace(/한국어/g,''), overflow:document.documentElement.scrollWidth-innerWidth }))()");
  assert(face.names.length>0 && face.names.every(s=>s==='セヨン'),'Japanese Reader name remains Korean: '+JSON.stringify(face));
  assert(!/[가-힣]/u.test(face.title+face.capture),'Japanese face UI mixes Korean: '+JSON.stringify(face));
  assert(face.overflow<=2,'Japanese face layout overflow');
  assert(!/[가-힣]/u.test(face.visibleText),'Japanese face page contains untranslated Hangul: '+face.visibleText.match(/.{0,30}[가-힣].{0,40}/gu)?.slice(0,12).join(' | '));
  await navigate(client,origin,'/chat-hub.html','.conversation-people');
  await sleep(450);
  const hub=await inspect("(() => ({cards:[...document.querySelectorAll('.chat-person-card')].slice(0,3).map(x=>x.textContent.trim()),overflow:document.documentElement.scrollWidth-innerWidth}))()");
  assert(hub.cards.length>0,'Character card list missing');
  assert(hub.cards.every(x=>!/[가-힣]/u.test(x)),'Japanese character directory mixes Korean: '+JSON.stringify(hub));
  assert(hub.overflow<=2,'Japanese directory layout overflow');
  await navigate(client,origin,'/auth.html','.ui-locale-select');
  await sleep(450);
  const auth=await inspect("(() => ({lang:document.documentElement.lang, text:document.body.innerText.replace(/한국어/g,''),overflow:document.documentElement.scrollWidth-innerWidth}))()");
  assert(auth.lang==='ja-JP' && !/[가-힣]/u.test(auth.text),'Japanese auth UI contains untranslated Hangul: '+auth.text.match(/.{0,30}[가-힣].{0,40}/gu)?.slice(0,12).join(' | '));
  assert(auth.overflow<=2,'Japanese auth layout overflow');
  await inspect("(() => {let s=document.querySelector('.ui-locale-select');s.value='zh-TW';s.dispatchEvent(new Event('change',{bubbles:true}));return true;})()");
  await navigate(client,origin,'/reading.html','#saju-birth-sex');
  await sleep(350);
  const zh=await inspect("(() => ({lang:document.documentElement.lang, heading:document.querySelector('.gm-page-title')?.textContent.trim(),options:[...document.querySelectorAll('#saju-birth-sex option')].map(x=>x.textContent.trim())}))()");
  assert(zh.lang==='zh-TW' && zh.heading==='八字命理','Traditional Chinese header not translated');
  assert(JSON.stringify(zh.options)===JSON.stringify(['不選擇','男性','女性','未指定']),'Traditional Chinese options remain Korean: '+JSON.stringify(zh));
  console.log(JSON.stringify({status:'WEB_STATIC_I18N_BROWSER_PASS',ja,face,hub,zh}));
} catch(err) {
  if(client){try{await artifact(client,'-i18n-failure')}catch{}}
  throw err;
} finally {
  client?.close();
  if(chrome.exitCode===null){const exited=new Promise(done=>chrome.once('exit',done));chrome.kill('SIGTERM');await Promise.race([exited,sleep(2000)])}
  await new Promise(done=>server.close(done));
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
