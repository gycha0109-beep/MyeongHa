import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const artifactDir = resolve(process.cwd(), 'artifacts');
const artifactPath = join(artifactDir, 'web-auth-authenticated-signup-stale-member-browser-smoke.json');
const memberKey = 'myeongha.memberSession.v1';
const guestKey = 'myeongha.guestBearer.v1';
const pendingGuestKey = 'myeongha.pendingGuestBearer.v1';
const guestBearer = 'guest-signup-stale-member-race';
const password = 'browser-password-12345';
const signInIdentity = Object.freeze({
  id: '91919191-9191-4919-8919-919191919191',
  email: 'newer-member@example.com',
});
const signUpIdentity = Object.freeze({
  id: '92929292-9292-4929-8929-929292929292',
  email: 'stale-signup@example.com',
});
const newerLogin = Object.freeze({
  accessToken: 'newer.member.signature',
  refreshToken: 'refresh-newer-member',
  expiresAt: '2099-01-03T00:00:00.000Z',
  tokenType: 'bearer',
  user: signInIdentity,
});
const staleSignup = Object.freeze({
  accessToken: 'stale.signup.signature',
  refreshToken: 'refresh-stale-signup',
  expiresAt: '2099-01-04T00:00:00.000Z',
  tokenType: 'bearer',
  user: signUpIdentity,
});
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
]);

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const requests = [];
let signUpRequests = 0;
let signInRequests = 0;
let pendingSignUpResponse = null;

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function releaseAuthenticatedSignUp() {
  assert(pendingSignUpResponse, 'stale signup response was not pending');
  const response = pendingSignUpResponse;
  pendingSignUpResponse = null;
  sendJson(response, 200, {
    ok: true,
    data: { status: 'authenticated', session: staleSignup },
    meta: { requestId: 'stale-signup-response' },
  });
}

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const pathname = decodeURIComponent(url.pathname);

      if (pathname === '/api/auth/sign-up' && req.method === 'POST') {
        const body = await readJsonBody(req);
        assert(body.email === signUpIdentity.email, `unexpected signup email ${body.email}`);
        assert(body.password === password, 'unexpected signup password');
        signUpRequests += 1;
        requests.push({ path: pathname, email: body.email });
        assert(!pendingSignUpResponse, 'more than one signup response is pending');
        pendingSignUpResponse = res;
        return;
      }

      if (pathname === '/api/auth/sign-in' && req.method === 'POST') {
        const body = await readJsonBody(req);
        assert(body.email === signInIdentity.email, `unexpected sign-in email ${body.email}`);
        assert(body.password === password, 'unexpected sign-in password');
        signInRequests += 1;
        requests.push({ path: pathname, email: body.email });
        sendJson(res, 200, {
          ok: true,
          data: { status: 'authenticated', session: newerLogin },
          meta: { requestId: 'newer-sign-in-response' },
        });
        return;
      }

      if (pathname === '/api/session/bootstrap' && req.method === 'POST') {
        throw new Error('stale authenticated signup scenario unexpectedly bootstrapped a Guest');
      }

      if (pathname === '/race.html') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end('<!doctype html><html><body>authenticated signup stale Member race</body></html>');
        return;
      }

      const relative = normalize(pathname).replace(/^[/\\]+/, '');
      const file = resolve(root, relative);
      assert(file.startsWith(`${root}/`), 'request escaped static root');
      assert((await stat(file)).isFile(), 'not a file');
      res.setHeader('Content-Type', mime.get(extname(file).toLowerCase()) ?? 'application/octet-stream');
      createReadStream(file).pipe(res);
    } catch (error) {
      res.statusCode = 500;
      res.end(error instanceof Error ? error.message : 'Server error');
    }
  });

  await new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', done);
  });
  const address = server.address();
  assert(address && typeof address === 'object', 'browser server address unavailable');
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

async function waitUntil(predicate, message, timeout = 8_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(20);
  }
  throw new Error(message);
}

async function devtoolsPort(profile, process) {
  for (let index = 0; index < 100; index += 1) {
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
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(profile, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
      return;
    } catch (error) {
      if (!['ENOTEMPTY', 'EBUSY', 'EPERM'].includes(error?.code)) throw error;
      await sleep(100 * (attempt + 1));
    }
  }
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
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

async function navigate(client, origin) {
  const result = await client.send('Page.navigate', { url: `${origin}/race.html` });
  assert(!result.errorText, `navigation failed: ${result.errorText}`);
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const ready = await client.evaluate(`location.pathname === '/race.html' && document.readyState === 'complete'`);
    if (ready) return;
    await sleep(50);
  }
  throw new Error('race page did not load');
}

async function waitFor(client, expression, message, timeout = 8_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return;
    await sleep(50);
  }
  throw new Error(message);
}

function memberStateExpression() {
  return `(() => {
    const member = JSON.parse(localStorage.getItem(${JSON.stringify(memberKey)}) ?? 'null');
    return {
      accessToken: member?.accessToken ?? null,
      refreshToken: member?.refreshToken ?? null,
      activeGuest: sessionStorage.getItem(${JSON.stringify(guestKey)}),
      pendingGuest: sessionStorage.getItem(${JSON.stringify(pendingGuestKey)}),
    };
  })()`;
}

await stat(join(root, 'product-auth.js'));
const source = await readFile(join(root, 'product-auth.js'), 'utf8');
assert(source.includes('WEB_AUTH_MEMBER_MUTATION_SUPERSEDED'), 'product-auth.js lacks stale authenticated signup rejection');
assert(source.includes('sameOptionalMemberSessionGeneration(latest, memberAtStart)'), 'product-auth.js lacks signup Member generation guard');

const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-auth-authenticated-signup-stale-member-browser-'));
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
let signupTab;
let signInTab;

try {
  const port = await devtoolsPort(profile, chrome);
  signupTab = await connectCdp(port);
  signInTab = await connectCdp(port);
  await Promise.all([navigate(signupTab, origin), navigate(signInTab, origin)]);

  const supportsLocks = await signupTab.evaluate(`Boolean(navigator.locks && typeof navigator.locks.request === 'function')`);
  assert(supportsLocks, 'Chrome Web Locks API unavailable');

  await signupTab.evaluate(`(() => {
    localStorage.removeItem(${JSON.stringify(memberKey)});
    sessionStorage.setItem(${JSON.stringify(guestKey)}, ${JSON.stringify(guestBearer)});
    sessionStorage.removeItem(${JSON.stringify(pendingGuestKey)});
    window.__staleSignup = { done: false, value: null, error: null };
    void import('/product-auth.js').then((auth) => auth.signUpWithPassword(
      ${JSON.stringify(signUpIdentity.email)},
      ${JSON.stringify(password)},
      'hall.html',
    )).then(
      (value) => { window.__staleSignup = { done: true, value, error: null }; },
      (error) => { window.__staleSignup = { done: true, value: null, error: { code: error?.code ?? null, message: error?.message ?? null } }; },
    );
  })()`);

  await waitUntil(() => signUpRequests === 1 && pendingSignUpResponse !== null, 'Guest-lineage signup request did not reach the server');
  const beforeSignIn = await signupTab.evaluate(memberStateExpression());
  assert(beforeSignIn.accessToken === null, 'Member authority existed before newer sign-in');
  assert(beforeSignIn.activeGuest === guestBearer, 'signup tab lost its Guest lineage before the race');

  await signInTab.evaluate(`(() => {
    window.__newerSignIn = { done: false, value: null, error: null };
    void import('/product-auth.js').then((auth) => auth.signInWithPassword(
      ${JSON.stringify(signInIdentity.email)},
      ${JSON.stringify(password)},
    )).then(
      (value) => { window.__newerSignIn = { done: true, value, error: null }; },
      (error) => { window.__newerSignIn = { done: true, value: null, error: { code: error?.code ?? null, message: error?.message ?? null } }; },
    );
  })()`);
  await waitFor(signInTab, `window.__newerSignIn?.done === true`, 'newer Member sign-in did not finish');
  const signInResult = await signInTab.evaluate(`window.__newerSignIn`);
  assert(signInResult.error === null && signInResult.value?.accessToken === newerLogin.accessToken, 'newer Member sign-in failed');
  assert(signInRequests === 1, `expected one newer sign-in request, received ${signInRequests}`);

  const sharedAfterSignIn = await signupTab.evaluate(memberStateExpression());
  assert(sharedAfterSignIn.accessToken === newerLogin.accessToken, 'newer Member localStorage authority was not visible in signup tab');
  assert(sharedAfterSignIn.activeGuest === guestBearer, 'signup tab Guest lineage changed before stale signup response');

  releaseAuthenticatedSignUp();
  await waitFor(signupTab, `window.__staleSignup?.done === true`, 'stale authenticated signup did not settle');
  const signupResult = await signupTab.evaluate(`window.__staleSignup`);
  const finalSignupTab = await signupTab.evaluate(memberStateExpression());
  const finalSignInTab = await signInTab.evaluate(memberStateExpression());

  assert(signupResult.value === null, 'stale authenticated signup unexpectedly returned a session');
  assert(signupResult.error?.code === 'WEB_AUTH_MEMBER_MUTATION_SUPERSEDED', `unexpected stale signup result ${JSON.stringify(signupResult)}`);
  assert(finalSignupTab.accessToken === newerLogin.accessToken && finalSignupTab.refreshToken === newerLogin.refreshToken, 'stale authenticated signup overwrote the newer shared Member authority');
  assert(finalSignInTab.accessToken === newerLogin.accessToken && finalSignInTab.refreshToken === newerLogin.refreshToken, 'newer Member authority diverged across tabs');
  assert(finalSignupTab.activeGuest === guestBearer && finalSignupTab.pendingGuest === null, 'stale signup mutated the originating Guest lineage');

  const report = {
    status: 'MyeongHa_WEB_AUTH_AUTHENTICATED_SIGNUP_STALE_MEMBER_BROWSER_PASS',
    staleSignupRejected: true,
    newerMemberPreserved: true,
    sharedMemberConverged: true,
    originatingGuestPreserved: true,
    signUpRequests,
    signInRequests,
    requests,
    signupResult,
    finalSignupTab,
    finalSignInTab,
  };
  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log('MyeongHa_WEB_AUTH_AUTHENTICATED_SIGNUP_STALE_MEMBER_BROWSER_PASS newer_member_preserved=true stale_signup_rejected=true guest_preserved=true');
} catch (error) {
  await mkdir(artifactDir, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify({
    status: 'MyeongHa_WEB_AUTH_AUTHENTICATED_SIGNUP_STALE_MEMBER_BROWSER_FAIL',
    error: error instanceof Error ? error.message : String(error),
    signUpRequests,
    signInRequests,
    requests,
    chromeError,
  }, null, 2)}\n`, 'utf8');
  throw error;
} finally {
  signupTab?.close();
  signInTab?.close();
  await stopChrome(chrome);
  await new Promise((done) => server.close(done));
  await removeChromeProfile(profile);
}
