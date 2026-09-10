import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const memberKey = 'myeongha.memberSession.v1';
const activeBearerKey = 'myeongha.guestBearer.v1';
const pendingGuestKey = 'myeongha.pendingGuestBearer.v1';
const stagedGuest = 'guest-before-malformed-member-browser';
const staleMemberJwt = 'stale.member.signature';
const replacement = Object.freeze({
  accessToken: 'fresh.member.signature',
  refreshToken: 'fresh-refresh-token',
  expiresAt: '2099-01-01T00:00:00.000Z',
  tokenType: 'bearer',
  user: Object.freeze({
    id: '22222222-2222-4222-8222-222222222222',
    email: 'fresh@example.com',
  }),
});
const replacementRaw = JSON.stringify(replacement);
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
]);

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const isExpectedNavigationRace = (error) =>
  error instanceof Error
  && /Inspected target navigated or closed|Execution context was destroyed/u.test(error.message);
let functionalPass = false;

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const pathname = decodeURIComponent(url.pathname === '/' ? '/hall.html' : url.pathname);
      if (pathname.startsWith('/api/')) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ ok: false, error: { code: 'UNEXPECTED_API_REQUEST' } }));
        return;
      }
      const relative = normalize(pathname).replace(/^[/\\]+/, '');
      const file = resolve(root, relative);
      assert(file.startsWith(`${root}/`), 'request escaped static root');
      assert((await stat(file)).isFile(), 'not a file');
      res.setHeader('Content-Type', mime.get(extname(file).toLowerCase()) ?? 'application/octet-stream');
      createReadStream(file).pipe(res);
    } catch (error) {
      res.statusCode = 404;
      res.end(error instanceof Error ? error.message : 'Not found');
    }
  });
  await new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', done);
  });
  const address = server.address();
  assert(address && typeof address === 'object', 'browser smoke server address unavailable');
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

async function stopChrome(process) {
  if (process.exitCode !== null) return;
  const exited = new Promise((done) => {
    process.once('exit', done);
    if (process.exitCode !== null) done();
  });
  process.kill('SIGTERM');
  await Promise.race([exited, sleep(3_000)]);
  if (process.exitCode === null) {
    process.kill('SIGKILL');
    await exited;
  }
}

async function removeChromeProfile(profile) {
  try {
    await rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
  } catch (error) {
    const narrowCleanupRace = functionalPass
      && error?.code === 'ENOTEMPTY'
      && String(error?.path ?? '').startsWith(profile);
    if (!narrowCleanupRace) throw error;
    console.log('MyeongHa malformed stored Member browser assertions passed; ignoring ephemeral Chrome profile cleanup ENOTEMPTY race.');
  }
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
  return { send, evaluate, close: () => ws.close() };
}

async function navigate(client, origin, pathname, selector, timeout = 10_000) {
  const result = await client.send('Page.navigate', { url: `${origin}${pathname}` });
  assert(!result.errorText, `Navigation failed for ${pathname}: ${result.errorText}`);
  const cleanPath = pathname.split(/[?#]/u)[0];
  const selectorLiteral = JSON.stringify(selector);
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const state = await client.evaluate(`(() => ({
        pathname: location.pathname,
        readyState: document.readyState,
        found: Boolean(document.querySelector(${selectorLiteral})),
      }))()`);
      if (state?.pathname === cleanPath && state.readyState === 'complete' && state.found) return;
    } catch (error) {
      if (!isExpectedNavigationRace(error)) throw error;
    }
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${cleanPath} ${selector}`);
}

async function waitFor(client, expression, message, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      if (await client.evaluate(expression)) return;
    } catch (error) {
      if (!isExpectedNavigationRace(error)) throw error;
    }
    await sleep(50);
  }
  throw new Error(message);
}

async function readAuthority(client) {
  return client.evaluate(`(() => ({
    state: document.querySelector('.product-profile')?.dataset.authState ?? null,
    href: document.querySelector('.product-profile')?.getAttribute('href') ?? null,
    label: document.querySelector('.product-profile')?.innerText ?? null,
    member: localStorage.getItem(${JSON.stringify(memberKey)}),
    active: sessionStorage.getItem(${JSON.stringify(activeBearerKey)}),
    pending: sessionStorage.getItem(${JSON.stringify(pendingGuestKey)}),
    readyState: document.readyState,
  }))()`);
}

async function seedAndReload(client, origin, memberRaw, activeBearer) {
  await client.evaluate(`(() => {
    localStorage.setItem(${JSON.stringify(memberKey)}, ${JSON.stringify(memberRaw)});
    sessionStorage.setItem(${JSON.stringify(activeBearerKey)}, ${JSON.stringify(activeBearer)});
    sessionStorage.setItem(${JSON.stringify(pendingGuestKey)}, ${JSON.stringify(stagedGuest)});
  })()`);
  await navigate(client, origin, '/hall.html', '.product-profile');
  await waitFor(
    client,
    `document.querySelector('.product-profile')?.dataset.authState === 'guest'
      && localStorage.getItem(${JSON.stringify(memberKey)}) === null
      && sessionStorage.getItem(${JSON.stringify(activeBearerKey)}) === ${JSON.stringify(stagedGuest)}
      && sessionStorage.getItem(${JSON.stringify(pendingGuestKey)}) === null`,
    'Malformed persisted Member authority did not reconcile to Guest',
  );
  return readAuthority(client);
}

async function runReplacementRace(client, staleRaw, staleActive, nonce) {
  return client.evaluate(`(async () => {
    const memberKey = ${JSON.stringify(memberKey)};
    const activeKey = ${JSON.stringify(activeBearerKey)};
    const pendingKey = ${JSON.stringify(pendingGuestKey)};
    const replacementRaw = ${JSON.stringify(replacementRaw)};
    localStorage.setItem(memberKey, ${JSON.stringify(staleRaw)});
    sessionStorage.setItem(activeKey, ${JSON.stringify(staleActive)});
    sessionStorage.setItem(pendingKey, ${JSON.stringify(stagedGuest)});

    const nativeGetItem = Storage.prototype.getItem;
    const nativeSetItem = Storage.prototype.setItem;
    let replacementInjected = false;
    Storage.prototype.getItem = function(key) {
      if (this === localStorage && key === memberKey && !replacementInjected) {
        replacementInjected = true;
        const stale = nativeGetItem.call(this, key);
        nativeSetItem.call(this, key, replacementRaw);
        return stale;
      }
      return nativeGetItem.call(this, key);
    };

    let resolved;
    try {
      const auth = await import('/product-auth.js?malformedReplacement=${nonce}-' + Date.now());
      resolved = auth.readMemberSession();
    } finally {
      Storage.prototype.getItem = nativeGetItem;
    }

    const authority = await import('/product-auth.js?malformedReplacementFinal=${nonce}-' + Date.now());
    const active = await authority.getActiveBearer();
    return {
      replacementInjected,
      resolvedAccess: resolved?.accessToken ?? null,
      resolvedRefresh: resolved?.refreshToken ?? null,
      resolvedEmail: resolved?.user?.email ?? null,
      stored: localStorage.getItem(memberKey),
      active,
      compatibilityActive: sessionStorage.getItem(activeKey),
      pending: sessionStorage.getItem(pendingKey),
      readyState: document.readyState,
    };
  })()`);
}

for (const file of ['hall.html', 'product-auth.js', 'product-auth-ui.js']) {
  await stat(join(root, file));
}
const productAuthSource = await readFile(join(root, 'product-auth.js'), 'utf8');
assert(productAuthSource.includes('reconcileMalformedStoredMember(raw)'), 'Malformed stored Member cleanup lacks exact-raw reconciliation');
assert(productAuthSource.includes('discardMemberSession(null, null, raw)'), 'Malformed stored Member cleanup does not pass the observed raw ownership token');
assert(productAuthSource.includes('removeLocal(MEMBER_SESSION_KEY, memberRaw)'), 'Member removal does not re-check the exact raw before deletion');

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-auth-malformed-stored-member-browser-'));
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

  const corruptJson = await seedAndReload(client, origin, '{not-json', staleMemberJwt);
  assert(corruptJson.readyState === 'complete', `Corrupt JSON browser state not complete: ${corruptJson.readyState}`);
  assert(corruptJson.state === 'guest', 'Corrupt JSON scenario did not render Guest authority');
  assert(corruptJson.href?.startsWith('auth.html?next='), 'Corrupt JSON scenario did not render login destination');
  assert(corruptJson.label?.includes('로그인'), 'Corrupt JSON scenario did not render login label');
  assert(corruptJson.member === null, 'Corrupt JSON scenario kept malformed Member record');
  assert(corruptJson.active === stagedGuest, 'Corrupt JSON scenario did not restore pending Guest');
  assert(corruptJson.pending === null, 'Corrupt JSON scenario kept pending Guest staged');

  const opaqueMember = JSON.stringify({
    accessToken: 'opaque-member-token',
    refreshToken: 'refresh-token',
    expiresAt: '2099-01-01T00:00:00.000Z',
    tokenType: 'bearer',
    user: { id: '11111111-1111-4111-8111-111111111111', email: 'member@example.com' },
  });
  const invalidClassification = await seedAndReload(client, origin, opaqueMember, 'opaque-member-token');
  assert(invalidClassification.state === 'guest', 'Opaque Member scenario did not render Guest authority');
  assert(invalidClassification.member === null, 'Opaque Member scenario kept malformed Member record');
  assert(invalidClassification.active === stagedGuest, 'Opaque Member scenario did not restore pending Guest');
  assert(invalidClassification.pending === null, 'Opaque Member scenario kept pending Guest staged');

  const corruptReplacement = await runReplacementRace(client, '{not-json', staleMemberJwt, 'parse');
  const invalidReplacement = await runReplacementRace(client, opaqueMember, 'opaque-member-token', 'normalize');
  for (const [label, result] of [['parse', corruptReplacement], ['normalize', invalidReplacement]]) {
    assert(result.readyState === 'complete', `${label} replacement race browser state not complete: ${result.readyState}`);
    assert(result.replacementInjected === true, `${label} replacement race did not inject newer Member`);
    assert(result.resolvedAccess === replacement.accessToken, `${label} stale cleanup did not resolve newer Member access token: ${result.resolvedAccess}`);
    assert(result.resolvedRefresh === replacement.refreshToken, `${label} stale cleanup did not resolve newer Member refresh token`);
    assert(result.resolvedEmail === replacement.user.email, `${label} stale cleanup did not resolve newer Member identity`);
    assert(result.stored === replacementRaw, `${label} stale cleanup deleted or altered newer Member authority`);
    assert(result.active?.kind === 'member' && result.active?.token === replacement.accessToken, `${label} active bearer downgraded from newer Member`);
    assert(result.compatibilityActive === replacement.accessToken, `${label} compatibility bearer did not converge to newer Member`);
    assert(result.pending === stagedGuest, `${label} stale cleanup mutated pending Guest lineage`);
  }

  await mkdir(join(process.cwd(), 'artifacts'), { recursive: true });
  await writeFile(join(process.cwd(), 'artifacts', 'web-auth-malformed-stored-member-browser-smoke.json'), `${JSON.stringify({
    status: 'PASS',
    corruptJson,
    invalidClassification,
    corruptReplacement,
    invalidReplacement,
  }, null, 2)}\n`, 'utf8');

  functionalPass = true;
  console.log('MyeongHa_WEB_AUTH_MALFORMED_MEMBER_REPLACEMENT_BROWSER_PASS');
  console.log('MyeongHa_WEB_AUTH_MALFORMED_STORED_MEMBER_BROWSER_PASS');
} catch (error) {
  console.error(error);
  if (chromeError.trim()) console.error(chromeError.trim());
  throw error;
} finally {
  client?.close();
  await stopChrome(chrome);
  await new Promise((done) => server.close(done));
  await removeChromeProfile(profile);
}