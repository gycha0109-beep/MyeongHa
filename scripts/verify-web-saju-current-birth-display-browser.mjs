import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), 'public');
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const assert = (ok, message) => { if (!ok) throw Error(message); };
const token = 'synthetic-saju-authorized-guest';
const revision = 'current-synthetic-revision';
const profile = {
  birthProfileId: '11111111-1111-4111-8111-111111111111',
  profileKind: 'self', archivedAt: null,
  currentRevision: {
    revisionId: revision, revisionNo: 1,
    input: { birthDate: '1996-01-09', birthTime: '09:30:00', timeKnown: true,
      calendarType: 'solar', isLeapMonth: false, sex: 'male' },
  },
};
const fact = (value, hanja, element, yinYang) => ({ value, hanja, element, yinYang });
const resolvedPillar = {
  status: 'resolved',
  value: { stem: fact('을', '乙', '목', '음'), branch: fact('해', '亥', '수', '음') },
};
let mismatch = false;
const requests = [];
const envelope = (data) => JSON.stringify({
  ok: true, data, meta: { apiContractVersion: 'v0.9', requestId: 'synthetic-saju-browser' },
});
const mime = new Map([['.html', 'text/html'], ['.js', 'text/javascript'], ['.css', 'text/css'],
  ['.png', 'image/png'], ['.svg', 'image/svg+xml'], ['.webp', 'image/webp'], ['.json', 'application/json']]);

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/__test/mismatch') {
      mismatch = true;
      res.end('ok');
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      requests.push({ method: req.method, path: url.pathname, bearer: req.headers.authorization });
      res.setHeader('Content-Type', 'application/json');
      if (req.headers.authorization !== 'Bearer ' + token) {
        res.statusCode = 401;
        res.end(JSON.stringify({ ok: false, error: { code: 'AUTH_REQUIRED' } }));
      } else if (url.pathname === '/api/me/birth-profile' && req.method === 'GET') {
        res.end(envelope({ birthProfile: profile }));
      } else if (url.pathname === '/api/me/saju/calculation' && req.method === 'POST') {
        res.end(envelope({ calculation: {
          birthRevisionRef: mismatch ? 'older-different-revision' : revision,
          snapshot: {
            pillars: { year: resolvedPillar, month: resolvedPillar,
              day: resolvedPillar, hour: resolvedPillar },
            completeness: { birthTimeKnown: true, fullyResolved: true },
          },
        } }));
      } else {
        res.statusCode = 404;
        res.end(JSON.stringify({ ok: false, error: { code: 'NOT_FOUND' } }));
      }
      return;
    }
    const pathname = decodeURIComponent(url.pathname);
    const file = resolve(root, (pathname === '/' ? '/reading.html' : pathname).slice(1));
    assert(file.startsWith(root + sep) && (await stat(file)).isFile(), 'Invalid static file');
    res.setHeader('Content-Type', (mime.get(extname(file)) ?? 'application/octet-stream') + '; charset=utf-8');
    createReadStream(file).pipe(res);
  } catch (e) {
    res.statusCode = 404;
    res.end('Not found');
  }
});
await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
const origin = 'http://127.0.0.1:' + server.address().port;
const userDir = await mkdtemp(join(tmpdir(), 'myeongha-saju-current-self-'));
const chrome = spawn(process.env.CHROME_BIN ?? 'chromium',
  ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
    '--remote-debugging-port=0','--user-data-dir=' + userDir,'about:blank'],
  { stdio: ['ignore','ignore','pipe'] });
let socket = null;
try {
  let port = 0;
  for (let i = 0; i < 160; i++) {
    try { port = Number((await readFile(join(userDir, 'DevToolsActivePort'), 'utf8')).split(/\r?\n/u)[0]); } catch {}
    if (port) break;
    await sleep(70);
  }
  assert(port, 'Headless browser unavailable');
  const tabResponse = await fetch('http://127.0.0.1:' + port + '/json/new?about:blank', { method: 'PUT' });
  assert(tabResponse.ok, 'Unable to create browser tab');
  const tab = await tabResponse.json();
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((done, reject) => {
    socket.addEventListener('open', done, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  const pending = new Map();
  let nextId = 0;
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(Error(message.error.message)); else resolve(message.result ?? {});
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails).slice(0, 500));
    return result.result?.value;
  };
  const readFields = () => evaluate(`(() => {
    const text = (id) => document.getElementById(id)?.textContent?.trim() ?? '';
    return { ready: !!document.getElementById('saju-hub') && !document.getElementById('saju-hub').hidden,
      date: text('saju-birth-date-display'),
      time: text('saju-birth-time-display'),
      sex: text('saju-birth-sex-display'),
      calendar: text('saju-birth-calendar-display'),
      summary: text('saju-birth-summary'),
      status: text('saju-status'),
      sessionBirthId: sessionStorage.getItem('myeongha.guestBirthProfileId.v1') };
  })()`);
  await Promise.all([send('Runtime.enable'), send('Page.enable')]);
  await send('Page.navigate', { url: origin + '/index.html' });
  for (let i = 0; i < 100; i++) {
    if (await evaluate('document.readyState==="complete"')) break;
    await sleep(80);
  }
  await evaluate(`sessionStorage.setItem('myeongha.guestBearer.v1', ${JSON.stringify(token)});
    sessionStorage.removeItem('myeongha.guestBirthProfileId.v1');`);
  const navigateSaju = async () => {
    await send('Page.navigate', { url: origin + '/reading.html' });
    let data = null;
    for (let i = 0; i < 120; i++) {
      data = await readFields();
      if (data?.ready && data?.date !== '확인 중') return data;
      await sleep(100);
    }
    throw Error('Saju preview never loaded: ' + JSON.stringify(data));
  };
  const ok = await navigateSaju();
  assert(ok.sessionBirthId === null, 'Browser birth-id cache unexpectedly populated');
  assert(ok.date.includes('1996') && ok.date.includes('1월') && ok.date.includes('9일'),
    'Current saved birth date not displayed: ' + JSON.stringify(ok));
  assert(ok.time.includes('9시') && ok.time.includes('30분'),
    'PostgreSQL HH:mm:ss birth time not displayed: ' + JSON.stringify(ok));
  assert(ok.sex === '남성', 'Current saved gender not displayed: ' + JSON.stringify(ok));
  assert(ok.calendar.includes('양력'), 'Current saved calendar not displayed: ' + JSON.stringify(ok));
  assert(ok.summary.includes('1996.01.09'), 'Summary not bound to current saved birth date: ' + JSON.stringify(ok));
  await fetch(origin + '/__test/mismatch');
  const mismatched = await navigateSaju();
  assert(mismatched.ready, 'Calculation must stay visible under source mismatch');
  assert(!mismatched.date.includes('1996') && mismatched.date.includes('확인 불가'),
    'Birth facts crossed a revision boundary: ' + JSON.stringify(mismatched));
  assert(mismatched.status.includes('현재 출생 정보를 불러올 수 없습니다.'),
    'Missing source warning for revision mismatch: ' + JSON.stringify(mismatched));
  assert(requests.filter((r) => r.path === '/api/me/birth-profile').length === 2,
    'Did not independently fetch the authorized current profile for each load');
  assert(requests.every((r) => r.path !== '/api/birth-profiles/' + profile.birthProfileId),
    'Legacy tab-local profile-id endpoint was called');
  console.log(JSON.stringify({ status: 'PASS', noBrowserBirthId: true,
    currentProfileRendered: { date: ok.date, time: ok.time, sex: ok.sex, calendar: ok.calendar },
    mismatchedRevisionBlocked: true, authorizedRequests: requests.length }, null, 2));
} catch (error) {
  console.error('SAJU_CURRENT_BIRTH_BROWSER_FAIL', String(error));
  process.exitCode = 1;
} finally {
  socket?.close();
  chrome.kill();
  await new Promise((done) => server.close(done));
  await sleep(90);
  await rm(userDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => {});
}
