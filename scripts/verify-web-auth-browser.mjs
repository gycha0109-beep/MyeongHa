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
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
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

async function navigate(client, origin, pathname, selector, timeout = 10_000) {
  const result = await client.send('Page.navigate', { url: `${origin}${pathname}` });
  assert(!result.errorText, `Navigation failed for ${pathname}: ${result.errorText}`);
  const selectorLiteral = JSON.stringify(selector);
  const cleanPath = pathname.split('?')[0];
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const state = await client.evaluate(`(() => ({
      pathname: location.pathname,
      readyState: document.readyState,
      found: Boolean(document.querySelector(${selectorLiteral})),
    }))()`);
    if (state?.pathname === cleanPath && state.readyState === 'complete' && state.found) return;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${cleanPath} ${selector}`);
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
  const shot = await client.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
  });
  if (shot.data) {
    await writeFile(
      join(dir, `web-auth-browser-smoke-${suffix}.png`),
      Buffer.from(shot.data, 'base64'),
    );
  }
  const diagnostics = await client.evaluate(`(() => ({
    href: location.href,
    title: document.title,
    theme: document.documentElement.dataset.theme ?? null,
    overflow: document.documentElement.scrollWidth - innerWidth,
    viewportWidth: innerWidth,
    bodyText: document.body.innerText,
    profileState: document.querySelector('.product-profile')?.dataset.authState ?? null,
    profileText: document.querySelector('.product-profile')?.innerText ?? null,
  }))()`);
  await writeFile(
    join(dir, `web-auth-browser-smoke-${suffix}.json`),
    `${JSON.stringify(diagnostics, null, 2)}\n`,
  );
}

for (const file of [
  'auth.html',
  'auth.css',
  'auth-page.js',
  'product-auth.js',
  'product-auth-ui.js',
  'product-theme.js',
]) {
  await stat(join(root, file));
}

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-auth-browser-smoke-'));
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

  await navigate(client, origin, '/auth.html?next=reading.html', '#auth-form');
  const loginState = await client.evaluate(`(() => {
    const card = document.querySelector('.auth-card');
    const form = document.querySelector('#auth-form');
    const email = document.querySelector('#auth-email');
    const password = document.querySelector('#auth-password');
    const signIn = document.querySelector('#auth-tab-signin');
    const signUp = document.querySelector('#auth-tab-signup');
    const cardRect = card?.getBoundingClientRect();
    return {
      title: document.title,
      cardVisible: Boolean(cardRect && cardRect.width >= 340 && cardRect.height >= 300),
      formVisible: Boolean(form && getComputedStyle(form).display !== 'none'),
      emailType: email?.getAttribute('type'),
      passwordType: password?.getAttribute('type'),
      signInSelected: signIn?.getAttribute('aria-selected'),
      signUpSelected: signUp?.getAttribute('aria-selected'),
      submitText: document.querySelector('#auth-submit')?.textContent?.trim(),
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  })()`);
  assert(loginState.title === '로그인 · 명하', `Unexpected auth title: ${loginState.title}`);
  assert(loginState.cardVisible, 'Auth card is not visibly rendered on desktop');
  assert(loginState.formVisible, 'Auth form is not visible');
  assert(loginState.emailType === 'email', 'Auth email input is not an email control');
  assert(loginState.passwordType === 'password', 'Auth password input is not protected');
  assert(loginState.signInSelected === 'true', 'Sign-in tab is not selected initially');
  assert(loginState.signUpSelected === 'false', 'Sign-up tab is unexpectedly selected initially');
  assert(loginState.submitText === '로그인', `Unexpected login submit label: ${loginState.submitText}`);
  assert(loginState.overflow <= 2, `Auth desktop horizontal overflow: ${loginState.overflow}px`);

  await client.evaluate(`document.querySelector('#auth-tab-signup')?.click()`);
  await waitFor(
    client,
    `document.querySelector('#auth-tab-signup')?.getAttribute('aria-selected') === 'true'`,
    'Sign-up tab did not become active',
  );
  const signupState = await client.evaluate(`(() => ({
    confirmHidden: document.querySelector('#auth-confirm-field')?.hidden,
    confirmRequired: document.querySelector('#auth-password-confirm')?.required,
    passwordAutocomplete: document.querySelector('#auth-password')?.getAttribute('autocomplete'),
    submitText: document.querySelector('#auth-submit')?.textContent?.trim(),
  }))()`);
  assert(signupState.confirmHidden === false, 'Sign-up password confirmation stayed hidden');
  assert(signupState.confirmRequired === true, 'Sign-up password confirmation is not required');
  assert(signupState.passwordAutocomplete === 'new-password', 'Sign-up password autocomplete is incorrect');
  assert(signupState.submitText === '회원가입', `Unexpected signup submit label: ${signupState.submitText}`);

  await client.evaluate(`localStorage.setItem('myeongha.productTheme.v1', 'dark')`);
  await navigate(client, origin, '/auth.html?next=reading.html', '#auth-form');
  await waitFor(
    client,
    `document.documentElement.dataset.theme === 'dark'`,
    'Auth dark theme did not apply',
  );
  const darkState = await client.evaluate(`(() => ({
    theme: document.documentElement.dataset.theme,
    colorScheme: document.documentElement.style.colorScheme,
    cardBackground: getComputedStyle(document.querySelector('.auth-card')).backgroundColor,
    toggleVisible: (() => {
      const el = document.querySelector('.product-theme-toggle');
      const r = el?.getBoundingClientRect();
      return Boolean(r && r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none');
    })(),
  }))()`);
  assert(darkState.theme === 'dark', 'Auth dark theme marker missing');
  assert(darkState.colorScheme === 'dark', 'Auth dark color-scheme missing');
  assert(darkState.toggleVisible, 'Auth theme toggle is not visible');
  await capture(client, 'desktop-dark');

  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await navigate(client, origin, '/auth.html', '#auth-form');
  const mobileState = await client.evaluate(`(() => {
    const card = document.querySelector('.auth-card')?.getBoundingClientRect();
    const email = document.querySelector('#auth-email')?.getBoundingClientRect();
    return {
      viewportWidth: innerWidth,
      overflow: document.documentElement.scrollWidth - innerWidth,
      cardLeft: card?.left ?? -1,
      cardRight: card?.right ?? 9999,
      emailLeft: email?.left ?? -1,
      emailRight: email?.right ?? 9999,
      bottomNavVisible: (() => {
        const el = document.querySelector('.mobile-bottom-nav');
        const r = el?.getBoundingClientRect();
        return Boolean(r && r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none');
      })(),
    };
  })()`);
  assert(mobileState.viewportWidth === 390, `Unexpected auth mobile viewport: ${mobileState.viewportWidth}`);
  assert(mobileState.overflow <= 2, `Auth mobile horizontal overflow: ${mobileState.overflow}px`);
  assert(mobileState.cardLeft >= 0 && mobileState.cardRight <= 390, 'Auth card escapes mobile viewport');
  assert(mobileState.emailLeft >= 0 && mobileState.emailRight <= 390, 'Auth input escapes mobile viewport');
  assert(mobileState.bottomNavVisible, 'Auth mobile bottom navigation is not visible');
  await capture(client, 'mobile-dark');

  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await navigate(client, origin, '/hall.html', '.product-profile');
  await client.evaluate(`(() => {
    localStorage.removeItem('myeongha.productTheme.v1');
    localStorage.setItem('myeongha.memberSession.v1', JSON.stringify({
      accessToken: 'header.payload.signature',
      refreshToken: 'refresh-token',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      tokenType: 'bearer',
      user: { id: '11111111-1111-4111-8111-111111111111', email: 'member@example.com' },
    }));
  })()`);
  await navigate(client, origin, '/hall.html', '.product-profile');
  await waitFor(
    client,
    `document.querySelector('.product-profile')?.dataset.authState === 'member'`,
    'Product header did not resolve stored member state',
  );
  const memberHeader = await client.evaluate(`(() => {
    const profile = document.querySelector('.product-profile');
    return {
      state: profile?.dataset.authState,
      href: profile?.getAttribute('href'),
      text: profile?.innerText,
      activeToken: sessionStorage.getItem('myeongha.guestBearer.v1'),
    };
  })()`);
  assert(memberHeader.state === 'member', 'Header member state missing');
  assert(memberHeader.href === 'my.html', `Member header href is incorrect: ${memberHeader.href}`);
  assert(memberHeader.text?.includes('마이'), 'Member header label is missing');
  assert(memberHeader.activeToken === 'header.payload.signature', 'Member bearer was not staged for existing product clients');

  await client.evaluate(`(() => {
    localStorage.removeItem('myeongha.memberSession.v1');
    sessionStorage.removeItem('myeongha.guestBearer.v1');
    sessionStorage.removeItem('myeongha.pendingGuestBearer.v1');
  })()`);
  await navigate(client, origin, '/hall.html', '.product-profile');
  await waitFor(
    client,
    `document.querySelector('.product-profile')?.dataset.authState === 'guest'`,
    'Product header did not resolve guest login state',
  );
  const guestHeader = await client.evaluate(`(() => {
    const profile = document.querySelector('.product-profile');
    return {
      state: profile?.dataset.authState,
      href: profile?.getAttribute('href'),
      text: profile?.innerText,
    };
  })()`);
  assert(guestHeader.state === 'guest', 'Header guest state missing');
  assert(guestHeader.href?.startsWith('auth.html?next='), `Guest header href is incorrect: ${guestHeader.href}`);
  assert(guestHeader.text?.includes('로그인'), 'Guest header login label is missing');

  console.log('MyeongHa_WEB_AUTH_BROWSER_PASS');
} catch (error) {
  console.error(error);
  if (chromeError.trim()) console.error(chromeError.trim());
  process.exitCode = 1;
} finally {
  client?.close();
  chrome.kill('SIGTERM');
  server.close();
  await rm(profile, { recursive: true, force: true });
}
