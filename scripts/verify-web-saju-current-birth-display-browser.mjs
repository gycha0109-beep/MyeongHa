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
const resolved = (stem, branch) => ({ status: 'resolved', value: { stem, branch } });
const resolvedPillars = {
  year: resolved(fact('을', '乙', '목', '음'), fact('해', '亥', '수', '음')),
  month: resolved(fact('기', '己', '토', '음'), fact('축', '丑', '토', '음')),
  day: resolved(fact('을', '乙', '목', '음'), fact('사', '巳', '화', '음')),
  hour: resolved(fact('신', '辛', '금', '음'), fact('사', '巳', '화', '음')),
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
            pillars: resolvedPillars,
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
  // English and Simplified Chinese must localize server-derived facts without changing the Birth Profile.
  const changeLocale = async (locale) => {
    await evaluate(`(() => {
      const picker = document.querySelector('.ui-locale-select');
      picker.value = ${JSON.stringify(locale)};
      picker.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await sleep(180);
    return readFields();
  };
  const english = await changeLocale('en-US');
  assert(english.date.includes('January') && english.date.includes('1996') &&
    english.time.includes('AM') && english.sex === 'Male' &&
    english.calendar.includes('Solar') && english.summary.includes('Solar') &&
    !/[가-힣]/u.test([english.date,english.time,english.sex,english.calendar,english.summary].join(' ')),
    'English birth details not localized: ' + JSON.stringify(english));
  const simplified = await changeLocale('zh-CN');
  assert(simplified.date.includes('1996年1月9日') && simplified.time === '09:30' &&
    simplified.sex === '男性' && simplified.calendar.includes('公历') &&
    simplified.summary.includes('公历') &&
    !/[가-힣]/u.test([simplified.date,simplified.time,simplified.sex,simplified.calendar,simplified.summary].join(' ')),
    'Simplified Chinese birth details not localized: ' + JSON.stringify(simplified));
  const restored = await changeLocale('ko-KR');
  assert(restored.sex === '남성' && restored.calendar.includes('양력') && restored.time.includes('9시'),
    'Returning to Korean did not restore original birth facts: ' + JSON.stringify(restored));
  const initialTabs = await evaluate("({count:document.querySelectorAll('.saju-design-chart-tabs [role=tab]').length, active:document.querySelector('[role=tab][aria-selected=true]')?.id, statusPanel:!!document.querySelector('.saju-design-structure-panel'), badge:document.getElementById('saju-completeness-title')?.textContent})");
  assert(initialTabs.count === 2 && initialTabs.active === 'saju-pillars-tab' &&
    !initialTabs.statusPanel && initialTabs.badge,
    'Did not preserve the separate two-tab chart: ' + JSON.stringify(initialTabs));
  await evaluate("document.getElementById('saju-elements-tab').click()");
  await sleep(90);
  const radar = await evaluate("({visible:!document.getElementById('saju-elements-panel').hidden, svg:!!document.querySelector('#saju-element-radar svg'), counts:[...document.querySelectorAll('#saju-element-bars button')].map(b=>Number(b.lastElementChild?.textContent)), axes:document.querySelectorAll('.saju-radar-axis-choice[role=button]').length, statusTab:!!document.getElementById('saju-structure-tab')})");
  assert(radar.visible && radar.svg && radar.axes === 5 &&
    JSON.stringify(radar.counts) === JSON.stringify([2,2,2,1,1]) && !radar.statusTab,
    'Radar data or tabs did not load: ' + JSON.stringify(radar));
  await evaluate("document.querySelector('#saju-element-radar [data-saju-element-select]')?.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true}))");
  await sleep(70);
  const selected = await evaluate("({aria:document.querySelector('.saju-radar-axis-choice')?.getAttribute('aria-pressed'),buttonEnabled:!document.getElementById('saju-view-selected-pillars').disabled,note:document.getElementById('saju-element-feedback')?.textContent})");
  assert(selected.aria === 'true' && selected.buttonEnabled && selected.note,
    'Radar keyboard selection did not work: ' + JSON.stringify(selected));
  await evaluate("document.getElementById('saju-view-selected-pillars').click()");
  await sleep(60);
  const wood = await evaluate("({visible:!document.getElementById('saju-pillars-panel').hidden, matching:[...document.querySelectorAll('.saju-pillar-hanja.is-element-match')].map(e=>e.dataset.sajuPartKind+':'+e.dataset.sajuPartElement), pillars:[...document.querySelectorAll('.saju-pillar.is-element-linked')].map(e=>e.dataset.sajuPillarKey)})");
  assert(wood.visible && JSON.stringify(wood.matching) === JSON.stringify(['stem:목','stem:목']) &&
    JSON.stringify(wood.pillars) === JSON.stringify(['year','day']),
    'Wood selection highlighted wrong characters: ' + JSON.stringify(wood));
  await evaluate("document.getElementById('saju-elements-tab').click()");
  await evaluate("document.querySelectorAll('#saju-element-bars button')[1].click()");
  await sleep(55);
  await evaluate("document.getElementById('saju-view-selected-pillars').click()");
  await sleep(55);
  const fire = await evaluate("({matching:[...document.querySelectorAll('.saju-pillar-hanja.is-element-match')].map(e=>e.dataset.sajuPartKind+':'+e.dataset.sajuPartElement),pillars:[...document.querySelectorAll('.saju-pillar.is-element-linked')].map(e=>e.dataset.sajuPillarKey)})");
  assert(JSON.stringify(fire.matching) === JSON.stringify(['branch:화','branch:화']) &&
    JSON.stringify(fire.pillars) === JSON.stringify(['day','hour']),
    'Fire selection highlighted wrong characters: ' + JSON.stringify(fire));
  await evaluate("document.getElementById('saju-elements-tab').click()");
  await evaluate("document.querySelectorAll('#saju-element-bars button')[1].click()");
  await sleep(55);
  const cleared = await evaluate("({active:document.querySelectorAll('.saju-pillar-hanja.is-element-match').length,disabled:document.getElementById('saju-view-selected-pillars').disabled})");
  assert(cleared.active === 0 && cleared.disabled,
    'Deselecting an element did not clear emphasis: ' + JSON.stringify(cleared));
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
