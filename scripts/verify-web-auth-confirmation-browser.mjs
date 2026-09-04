import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
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
  return { send, evaluate, close: () => ws.close() };
}

async function navigate(client, origin, pathname, selector, timeout = 10_000) {
  const result = await client.send('Page.navigate', { url: `${origin}${pathname}` });
  assert(!result.errorText, `Navigation failed for ${pathname}: ${result.errorText}`);
  const selectorLiteral = JSON.stringify(selector);
  const cleanPath = pathname.split(/[?#]/)[0];
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

for (const file of ['auth.html', 'auth-page.js', 'product-auth.js', 'product-auth-ui.js', 'hall.html']) {
  await stat(join(root, file));
}

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-auth-confirmation-browser-'));
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

  await navigate(client, origin, '/hall.html', '.product-profile');
  await client.evaluate(`(() => {
    localStorage.removeItem('myeongha.memberSession.v1');
    sessionStorage.setItem('myeongha.guestBearer.v1', 'guest-confirmation-smoke');
  })()`);

  await navigate(
    client,
    origin,
    '/auth.html?confirmed=1&next=reading.html#access_token=header.payload.signature&refresh_token=fragment-refresh&token_type=bearer',
    '#auth-form',
  );
  await waitFor(client, `location.hash === '' && !new URLSearchParams(location.search).has('confirmed')`, 'Confirmation URL secrets were not scrubbed');
  const confirmation = await client.evaluate(`(() => ({
    hash: location.hash,
    search: location.search,
    status: document.querySelector('#auth-status')?.textContent?.trim(),
    statusClass: document.querySelector('#auth-status')?.className,
    member: localStorage.getItem('myeongha.memberSession.v1'),
    guest: sessionStorage.getItem('myeongha.guestBearer.v1'),
    signInSelected: document.querySelector('#auth-tab-signin')?.getAttribute('aria-selected'),
  }))()`);
  assert(confirmation.hash === '', 'Confirmation hash remained in the address bar');
  assert(confirmation.search === '?next=reading.html', `Confirmation query cleanup is incorrect: ${confirmation.search}`);
  assert(confirmation.status?.includes('이메일 확인이 처리되었습니다'), `Confirmation success status missing: ${confirmation.status}`);
  assert(confirmation.statusClass?.includes('is-success'), 'Confirmation status is not marked successful');
  assert(confirmation.member === null, 'Implicit URL session was incorrectly trusted as a member session');
  assert(confirmation.guest === 'guest-confirmation-smoke', 'Guest bearer was lost across email confirmation return');
  assert(confirmation.signInSelected === 'true', 'Confirmation return did not restore sign-in mode');

  await navigate(
    client,
    origin,
    '/auth.html?confirmed=1&next=my.html#error=access_denied&error_code=otp_expired&error_description=expired',
    '#auth-form',
  );
  await waitFor(client, `location.hash === '' && !new URLSearchParams(location.search).has('confirmed')`, 'Confirmation error URL was not scrubbed');
  const confirmationError = await client.evaluate(`(() => ({
    search: location.search,
    status: document.querySelector('#auth-status')?.textContent?.trim(),
    statusClass: document.querySelector('#auth-status')?.className,
  }))()`);
  assert(confirmationError.search === '?next=my.html', `Confirmation error query cleanup is incorrect: ${confirmationError.search}`);
  assert(confirmationError.status?.includes('이메일 확인 링크를 처리하지 못했습니다'), 'Confirmation error status missing');
  assert(confirmationError.statusClass?.includes('is-error'), 'Confirmation error is not marked as an error');

  await navigate(client, origin, '/hall.html', '.product-profile');
  await client.evaluate(`localStorage.setItem('myeongha.memberSession.v1', JSON.stringify({
    accessToken: 'header.payload.signature',
    refreshToken: 'refresh-token',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    tokenType: 'bearer',
    user: { id: '11111111-1111-4111-8111-111111111111', email: 'member@example.com' },
  }))`);
  await navigate(client, origin, '/hall.html', '.product-profile');
  await waitFor(client, `document.querySelector('.product-profile')?.dataset.authState === 'member'`, 'Member header state missing');
  const memberHeader = await client.evaluate(`(() => {
    const profile = document.querySelector('.product-profile');
    const spans = [...profile.querySelectorAll(':scope > span')];
    return { label: spans[1]?.textContent?.trim(), chevron: spans.at(-1)?.textContent?.trim() };
  })()`);
  assert(memberHeader.label === '마이', `Member header label is incorrect: ${memberHeader.label}`);
  assert(memberHeader.chevron === '⌄', `Member header chevron was overwritten: ${memberHeader.chevron}`);

  await client.evaluate(`localStorage.removeItem('myeongha.memberSession.v1')`);
  await navigate(client, origin, '/hall.html', '.product-profile');
  await waitFor(client, `document.querySelector('.product-profile')?.dataset.authState === 'guest'`, 'Guest header state missing');
  const guestHeader = await client.evaluate(`(() => {
    const profile = document.querySelector('.product-profile');
    const spans = [...profile.querySelectorAll(':scope > span')];
    return { label: spans[1]?.textContent?.trim(), chevron: spans.at(-1)?.textContent?.trim() };
  })()`);
  assert(guestHeader.label === '로그인', `Guest header label is incorrect: ${guestHeader.label}`);
  assert(guestHeader.chevron === '⌄', `Guest header chevron was overwritten: ${guestHeader.chevron}`);

  console.log('MyeongHa_WEB_AUTH_CONFIRMATION_BROWSER_PASS');
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
