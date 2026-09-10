import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const memberA = Object.freeze({ id: '11111111-1111-4111-8111-111111111111', email: 'records-a@example.com', token: 'records-a.payload.signature', refresh: 'records-a-refresh', name: '기록 회원 A', fact: 'member-a-private-fact' });
const memberB = Object.freeze({ id: '22222222-2222-4222-8222-222222222222', email: 'records-b@example.com', token: 'records-b.payload.signature', refresh: 'records-b-refresh', name: '기록 회원 B', fact: 'member-b-private-fact' });
const members = [memberA, memberB];
const recordsPaths = new Set(['/api/me', '/api/life-record', '/api/readings', '/api/memories']);
const mime = new Map([['.html', 'text/html; charset=utf-8'], ['.css', 'text/css; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.webp', 'image/webp']]);
const requests = [];
const assert = (value, message) => { if (!value) throw new Error(message); };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
let requestNo = 0;
let recordsLoads = 0;
let holdA = false;
let blockedA = 0;
let releaseA;
let gate = Promise.resolve();

function envelope(data) {
  requestNo += 1;
  return { ok: true, data, meta: { apiContractVersion: 'records-replacement-v1', requestId: `records-replacement-${requestNo}`, serverTime: '2026-09-10T00:00:00.000Z' } };
}

function session(member) {
  return { accessToken: member.token, refreshToken: member.refresh, expiresAt: new Date(Date.now() + 600_000).toISOString(), tokenType: 'bearer', user: { id: member.id, email: member.email } };
}

function memberForAuth(value) {
  return members.find((member) => value === `Bearer ${member.token}`) ?? null;
}

function recordsPayload(member, path) {
  if (path === '/api/me') return { subjectKind: 'member', subjectStatus: 'active', profile: { displayName: member.name, locale: 'ko-KR', timezone: 'Asia/Seoul', onboardingState: 'completed', updatedAt: '2026-09-10T00:00:00.000Z' } };
  if (path === '/api/life-record') return { facts: [{ factType: member.fact, schemaVersion: 'test.v1', valueJsonb: { owner: member.email }, confirmedAt: '2026-09-10T00:00:00.000Z', revokedAt: null }] };
  if (path === '/api/readings') return { readings: [] };
  return { memories: [] };
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function body(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url ?? '/', 'http://127.0.0.1').pathname);
      const authorization = req.headers.authorization ?? null;
      if (path === '/api/auth/sign-in' && req.method === 'POST') {
        const input = await body(req);
        const member = members.find((candidate) => candidate.email === input.email) ?? null;
        requests.push({ path, member: member?.email ?? null, authorization });
        if (!member) return json(res, 401, { ok: false, error: { code: 'INVALID_CREDENTIALS' } });
        return json(res, 200, envelope({ status: 'authenticated', session: session(member) }));
      }
      if (recordsPaths.has(path) && req.method === 'GET') {
        const member = memberForAuth(authorization);
        requests.push({ path, member: member?.email ?? null, authorization });
        if (!member) return json(res, 401, { ok: false, error: { code: 'AUTH_REQUIRED' } });
        if (holdA && member === memberA && path !== '/api/me') {
          blockedA += 1;
          await gate;
        }
        return json(res, 200, envelope(recordsPayload(member, path)));
      }
      if (path.startsWith('/api/')) return json(res, 404, { ok: false, error: { code: 'NOT_FOUND' } });
      const staticPath = path === '/' ? '/hall.html' : path;
      if (staticPath === '/records.html') recordsLoads += 1;
      const file = resolve(root, normalize(staticPath).replace(/^[/\\]+/, ''));
      assert(file.startsWith(`${root}/`), 'request escaped static root');
      assert((await stat(file)).isFile(), 'not a file');
      res.setHeader('Content-Type', mime.get(extname(file).toLowerCase()) ?? 'application/octet-stream');
      createReadStream(file).pipe(res);
    } catch (error) {
      res.statusCode = 500;
      res.end(error instanceof Error ? error.message : 'server error');
    }
  });
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  const address = server.address();
  assert(address && typeof address === 'object', 'server address unavailable');
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

async function chromePort(profile, process) {
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

async function connect(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/new?about%3Ablank`, { method: 'PUT' });
  const target = await response.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, reject) => { ws.addEventListener('open', done, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result ?? {});
  });
  const send = (method, params = {}) => new Promise((resolveCall, rejectCall) => { const requestId = ++id; pending.set(requestId, { resolve: resolveCall, reject: rejectCall }); ws.send(JSON.stringify({ id: requestId, method, params })); });
  const evaluate = async (expression) => { const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); assert(!result.exceptionDetails, result.exceptionDetails?.text ?? 'evaluation failed'); return result.result?.value; };
  await Promise.all([send('Page.enable'), send('Runtime.enable')]);
  return { send, evaluate, close: () => ws.close() };
}

async function navigate(client, origin, path, selector) {
  await client.send('Page.navigate', { url: `${origin}${path}` });
  await waitFor(client, `location.pathname === ${JSON.stringify(path)} && document.readyState === 'complete' && Boolean(document.querySelector(${JSON.stringify(selector)}))`, `navigation failed: ${path}`);
}

async function waitFor(client, expression, message, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return;
    await sleep(50);
  }
  throw new Error(`${message}; requests=${JSON.stringify(requests)}`);
}

async function signIn(client, member) {
  await client.evaluate(`import('./product-auth.js').then(({ signInWithPassword }) => signInWithPassword(${JSON.stringify(member.email)}, 'test-only'))`);
}

for (const file of ['hall.html', 'records.html', 'records-page.js', 'records-runtime-client.js', 'product-auth.js']) await stat(join(root, file));
const { server, origin } = await serve();
const profile = await mkdtemp(join(tmpdir(), 'myeongha-records-replacement-'));
const chrome = spawn(chromeBin, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let chromeError = '';
chrome.stderr.setEncoding('utf8');
chrome.stderr.on('data', (chunk) => { chromeError += chunk; });
let tabA;
let tabB;
let functionalPass = false;

try {
  const port = await chromePort(profile, chrome);
  tabA = await connect(port);
  await navigate(tabA, origin, '/hall.html', '.product-profile');
  await signIn(tabA, memberA);
  await navigate(tabA, origin, '/records.html', '#records-content');
  await waitFor(tabA, `document.querySelector('#records-content')?.hidden === false && document.querySelector('#records-display-name')?.textContent?.trim() === ${JSON.stringify(memberA.name)}`, 'Member A Records did not render');

  const loadsBeforeRace = recordsLoads;
  holdA = true;
  blockedA = 0;
  gate = new Promise((done) => { releaseA = done; });
  const requestStart = requests.length;
  await tabA.send('Page.reload', { ignoreCache: true });
  const gateDeadline = Date.now() + 10_000;
  while (blockedA < 3 && Date.now() < gateDeadline) await sleep(50);
  assert(blockedA >= 3, 'Member A Records requests did not reach the response gate');

  tabB = await connect(port);
  await navigate(tabB, origin, '/hall.html', '.product-profile');
  await signIn(tabB, memberB);
  await waitFor(tabB, `JSON.parse(localStorage.getItem('myeongha.memberSession.v1') ?? 'null')?.accessToken === ${JSON.stringify(memberB.token)}`, 'Member B did not become canonical');
  await waitFor(tabA, `location.pathname === '/records.html' && document.querySelector('#records-content')?.hidden === false && document.querySelector('#records-display-name')?.textContent?.trim() === ${JSON.stringify(memberB.name)} && document.querySelector('#life-records-list')?.textContent?.includes(${JSON.stringify(memberB.fact)}) === true`, 'Records did not refetch under Member B');
  assert(recordsLoads >= loadsBeforeRace + 2, `storage-driven Records reload did not occur; loads=${recordsLoads}`);

  holdA = false;
  releaseA?.();
  releaseA = null;
  await sleep(500);
  const finalState = await tabA.evaluate(`(() => ({ member: JSON.parse(localStorage.getItem('myeongha.memberSession.v1') ?? 'null'), name: document.querySelector('#records-display-name')?.textContent?.trim() ?? null, facts: document.querySelector('#life-records-list')?.textContent?.trim() ?? '' }))()`);
  assert(finalState.member?.accessToken === memberB.token, 'canonical Member regressed');
  assert(finalState.name === memberB.name, 'stale Member A profile rendered after replacement');
  assert(finalState.facts.includes(memberB.fact), 'Member B fact is missing');
  assert(!finalState.facts.includes(memberA.fact), 'Member A private fact rendered under Member B');

  const raceReads = requests.slice(requestStart).filter((request) => recordsPaths.has(request.path));
  const staleReads = raceReads.filter((request) => request.member === memberA.email).length;
  const replacementReads = raceReads.filter((request) => request.member === memberB.email).length;
  assert(staleReads >= 4 && replacementReads >= 4, `expected both authority generations; reads=${JSON.stringify(raceReads)}`);

  await mkdir(resolve(process.cwd(), 'artifacts'), { recursive: true });
  await writeFile(resolve(process.cwd(), 'artifacts/web-records-auth-browser-smoke-member-replacement.json'), `${JSON.stringify({ recordsLoads, blockedA, staleReads, replacementReads, finalMember: finalState.member?.accessToken ?? null, staleFactAbsent: !finalState.facts.includes(memberA.fact) }, null, 2)}\n`);
  functionalPass = true;
  console.log('MyeongHa_WEB_RECORDS_MEMBER_REPLACEMENT_BROWSER_PASS stale_member_hidden=true replacement_refetched=true final_member_b=true');
} catch (error) {
  console.error(error);
  if (chromeError.trim()) console.error(chromeError.trim());
  process.exitCode = 1;
} finally {
  holdA = false;
  releaseA?.();
  tabA?.close();
  tabB?.close();
  chrome.kill('SIGTERM');
  await Promise.race([new Promise((done) => chrome.once('exit', done)), sleep(1_000)]);
  await new Promise((done) => server.close(done));
  try { await rm(profile, { recursive: true, force: true }); } catch (error) {
    const cleanupRace = functionalPass && error && typeof error === 'object' && error.code === 'ENOTEMPTY' && typeof error.path === 'string' && error.path.startsWith(profile);
    if (!cleanupRace) throw error;
    console.warn('MyeongHa Records replacement assertions passed; ignoring ephemeral Chrome profile cleanup ENOTEMPTY race.');
  }
}
