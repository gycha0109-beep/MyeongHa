const GUEST_TOKEN_KEY = 'myeongha.guestBearer.v1';
const BIRTH_PROFILE_ID_KEY = 'myeongha.guestBirthProfileId.v1';
const SESSION_BOOTSTRAP_ENDPOINT = '/api/session/bootstrap';
const BIRTH_PROFILE_ENDPOINT = '/api/birth-profiles';
const SAJU_CALCULATION_ENDPOINT = '/api/me/saju/calculation';
const ELEMENTS = ['목', '화', '토', '금', '수'];
const PILLARS = [
  ['year', '년주'],
  ['month', '월주'],
  ['day', '일주'],
  ['hour', '시주'],
];

function byId(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing Saju hub element: ${id}`);
  return element;
}

function readSessionValue(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSessionValue(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // The guest experience still works for the current navigation even when storage is unavailable.
  }
}

function removeSessionValue(key) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // No-op when browser storage is unavailable.
  }
}

function bearerHeaders(token, includeJson = false) {
  const headers = new Headers({ Accept: 'application/json' });
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (includeJson) headers.set('Content-Type', 'application/json');
  return headers;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function unwrapSuccess(payload) {
  if (!payload || typeof payload !== 'object' || payload.ok !== true || !('data' in payload)) {
    throw new Error('API success envelope is malformed.');
  }
  return payload.data;
}

function readPublicErrorCode(payload) {
  return payload && typeof payload === 'object' && payload.error && typeof payload.error === 'object'
    ? payload.error.code
    : null;
}

async function bootstrapGuest(existingToken = null) {
  const response = await fetch(SESSION_BOOTSTRAP_ENDPOINT, {
    method: 'POST',
    headers: bearerHeaders(existingToken, true),
    credentials: 'same-origin',
    cache: 'no-store',
    body: '{}',
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(`Guest bootstrap failed with status ${response.status}.`);
  const data = unwrapSuccess(payload);

  if (data?.kind === 'member') return existingToken;
  if (data?.kind !== 'guest' || !data.guestSession || typeof data.guestSession !== 'object') {
    throw new Error('Guest bootstrap response is malformed.');
  }

  const freshToken = data.guestSession.bearerToken;
  if (typeof freshToken === 'string' && freshToken.length > 0) {
    writeSessionValue(GUEST_TOKEN_KEY, freshToken);
    return freshToken;
  }
  if (existingToken) return existingToken;
  throw new Error('Guest bootstrap did not return a usable credential.');
}

async function createBirthProfile(token, request) {
  const response = await fetch(BIRTH_PROFILE_ENDPOINT, {
    method: 'POST',
    headers: bearerHeaders(token, true),
    credentials: 'same-origin',
    cache: 'no-store',
    body: JSON.stringify(request),
  });
  const payload = await readJson(response);
  if (!response.ok) {
    const error = new Error(`Birth Profile create failed with status ${response.status}.`);
    error.code = readPublicErrorCode(payload);
    throw error;
  }
  const data = unwrapSuccess(payload);
  if (!data || typeof data.birthProfileId !== 'string' || data.birthProfileId.length === 0) {
    throw new Error('Birth Profile create receipt is malformed.');
  }
  writeSessionValue(BIRTH_PROFILE_ID_KEY, data.birthProfileId);
  return data;
}

async function readBirthProfile(token, birthProfileId) {
  if (!birthProfileId) return null;
  const response = await fetch(`${BIRTH_PROFILE_ENDPOINT}/${encodeURIComponent(birthProfileId)}`, {
    method: 'GET',
    headers: bearerHeaders(token),
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) return null;
  const payload = await readJson(response);
  try {
    return unwrapSuccess(payload);
  } catch {
    return null;
  }
}

async function calculateSaju(token) {
  const response = await fetch(SAJU_CALCULATION_ENDPOINT, {
    method: 'POST',
    headers: bearerHeaders(token),
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const payload = await readJson(response);
  if (!response.ok) {
    const error = new Error(`Saju calculation failed with status ${response.status}.`);
    error.status = response.status;
    error.code = readPublicErrorCode(payload);
    throw error;
  }
  const data = unwrapSuccess(payload);
  if (!data || !data.calculation || typeof data.calculation !== 'object') {
    throw new Error('Saju calculation response is malformed.');
  }
  return data.calculation;
}

function selectedCalendarType() {
  const selected = document.querySelector('input[name="saju-calendar"]:checked');
  return selected?.value === 'lunar' ? 'lunar' : 'solar';
}

function syncBirthControls() {
  const unknown = byId('saju-time-unknown');
  const time = byId('saju-birth-time');
  time.disabled = unknown.checked;
  time.required = !unknown.checked;
  if (unknown.checked) time.value = '';

  const lunar = selectedCalendarType() === 'lunar';
  const leap = byId('saju-leap-month');
  leap.disabled = !lunar;
  if (!lunar) leap.checked = false;
  byId('saju-leap-wrap').hidden = !lunar;
}

function buildBirthRequest() {
  const birthDate = byId('saju-birth-date').value;
  const timeKnown = !byId('saju-time-unknown').checked;
  const birthTime = timeKnown ? byId('saju-birth-time').value : null;
  const calendarType = selectedCalendarType();
  const sexValue = byId('saju-birth-sex').value;

  if (!birthDate) throw new Error('생년월일을 입력해 주세요.');
  if (timeKnown && !birthTime) throw new Error('출생시간을 입력하거나 시간 모름을 선택해 주세요.');

  return Object.freeze({
    label: null,
    input: Object.freeze({
      calendarType,
      birthDate,
      birthTime,
      timeKnown,
      isLeapMonth: calendarType === 'lunar' ? byId('saju-leap-month').checked : false,
      sex: ['male', 'female', 'unspecified'].includes(sexValue) ? sexValue : null,
    }),
  });
}

function setState(state, message = '') {
  const status = byId('saju-status');
  const empty = byId('saju-empty');
  const hub = byId('saju-hub');
  status.hidden = state !== 'loading' && !message;
  status.textContent = message || '내 사주를 확인하는 중입니다…';
  empty.hidden = state !== 'empty';
  hub.hidden = state !== 'ready';
}

function setFormError(message) {
  const error = byId('saju-form-error');
  error.hidden = !message;
  error.textContent = message;
}

function resolvedPillar(state) {
  return state && typeof state === 'object' && state.status === 'resolved' && state.value && typeof state.value === 'object'
    ? state.value
    : null;
}

function pillarDisplay(state) {
  const resolved = resolvedPillar(state);
  if (resolved) {
    const stem = resolved.stem;
    const branch = resolved.branch;
    return {
      characters: `${stem?.hanja || stem?.value || ''}${branch?.hanja || branch?.value || ''}` || '—',
      text: `${stem?.value || ''}${branch?.value || ''}` || '확정',
      meta: [stem?.element, branch?.element].filter(Boolean).join(' · ') || '계산 완료',
    };
  }
  if (state?.status === 'ambiguous') return { characters: '◇', text: '복수 후보', meta: '경계 시각 확인 필요' };
  return { characters: '—', text: '확인 불가', meta: state?.reasonCode || '계산 정보 없음' };
}

function renderPillars(snapshot) {
  const grid = byId('saju-pillar-grid');
  grid.replaceChildren();

  for (const [key, label] of PILLARS) {
    const state = snapshot?.pillars?.[key];
    const display = pillarDisplay(state);
    const card = document.createElement('div');
    card.className = `saju-pillar${key === 'day' ? ' is-day' : ''}`;

    const cardLabel = document.createElement('span');
    cardLabel.className = 'saju-pillar-label';
    cardLabel.textContent = label;

    const value = document.createElement('div');
    value.className = 'saju-pillar-value';
    const strong = document.createElement('strong');
    strong.textContent = display.characters;
    const text = document.createElement('span');
    text.textContent = display.text;
    value.append(strong, text);

    const meta = document.createElement('span');
    meta.className = 'saju-pillar-meta';
    meta.textContent = display.meta;
    card.append(cardLabel, value, meta);
    grid.append(card);
  }
}

function countElements(snapshot) {
  const counts = Object.fromEntries(ELEMENTS.map((element) => [element, 0]));
  for (const [key] of PILLARS) {
    const pillar = resolvedPillar(snapshot?.pillars?.[key]);
    if (!pillar) continue;
    for (const part of [pillar.stem, pillar.branch]) {
      if (part && ELEMENTS.includes(part.element)) counts[part.element] += 1;
    }
  }
  return counts;
}

function renderElements(snapshot) {
  const root = byId('saju-element-bars');
  root.replaceChildren();
  const counts = countElements(snapshot);
  const max = Math.max(1, ...Object.values(counts));

  for (const element of ELEMENTS) {
    const item = document.createElement('span');
    item.className = 'saju-element';
    const label = document.createElement('b');
    label.textContent = element;
    const bar = document.createElement('i');
    bar.style.setProperty('--element-fill', `${Math.round((counts[element] / max) * 100)}%`);
    const value = document.createElement('small');
    value.textContent = String(counts[element]);
    item.append(label, bar, value);
    root.append(item);
  }
}

function formatBirthSummary(profile) {
  const input = profile?.currentRevision?.input;
  if (!input || typeof input !== 'object') return '현재 자기 Birth Profile과 연결된 계산 결과입니다.';
  const date = typeof input.birthDate === 'string' ? input.birthDate.replaceAll('-', '.') : null;
  const time = input.timeKnown && typeof input.birthTime === 'string' ? input.birthTime.slice(0, 5) : '시간 모름';
  const calendar = input.calendarType === 'lunar' ? '음력' : input.calendarType === 'solar' ? '양력' : null;
  return [date, time, calendar].filter(Boolean).join(' · ') || '현재 자기 Birth Profile과 연결된 계산 결과입니다.';
}

function renderCalculation(calculation, profile) {
  const snapshot = calculation?.snapshot;
  if (!snapshot || typeof snapshot !== 'object') throw new Error('Saju snapshot is unavailable.');
  renderPillars(snapshot);
  renderElements(snapshot);

  const day = resolvedPillar(snapshot.pillars?.day);
  const dayStem = day?.stem;
  byId('saju-day-master').textContent = dayStem ? `${dayStem.hanja || ''}${dayStem.value || ''}` || '—' : '—';
  byId('saju-day-master-meta').textContent = dayStem
    ? `${dayStem.element || '오행 미확인'} · ${dayStem.yinYang || '음양 미확인'}`
    : '일주가 확정될 때 표시됩니다.';

  const completeness = snapshot.completeness;
  const resolvedCount = PILLARS.filter(([key]) => resolvedPillar(snapshot.pillars?.[key])).length;
  byId('saju-completeness-title').textContent = completeness?.fullyResolved ? '네 기둥 계산 완료' : `${resolvedCount}/4 기둥 확정`;
  byId('saju-completeness-copy').textContent = completeness?.birthTimeKnown === false
    ? '출생시간을 모르는 입력으로 계산되어 시주 등 일부 사실이 제한될 수 있습니다.'
    : '현재 Birth Profile revision에 결속된 계산 결과입니다.';

  byId('saju-birth-summary').textContent = formatBirthSummary(profile);
  byId('saju-flow-year').textContent = `${new Date().getFullYear()}년 · 올해의 흐름`;
  setState('ready');
}

async function loadExistingSaju() {
  const token = readSessionValue(GUEST_TOKEN_KEY);
  if (!token) {
    setState('empty');
    return;
  }

  setState('loading', '현재 세션의 명식을 계산하는 중입니다…');
  try {
    const calculation = await calculateSaju(token);
    const profile = await readBirthProfile(token, readSessionValue(BIRTH_PROFILE_ID_KEY));
    renderCalculation(calculation, profile);
  } catch (error) {
    if (error?.status === 401) {
      removeSessionValue(GUEST_TOKEN_KEY);
      removeSessionValue(BIRTH_PROFILE_ID_KEY);
      setState('empty');
      return;
    }
    if (error?.status === 404 || error?.code === 'NOT_FOUND') {
      setState('empty');
      return;
    }
    setState('empty', '현재 사주 계산을 불러오지 못했습니다. 새로 입력하기 전에 잠시 후 다시 확인해 주세요.');
  }
}

async function submitBirthProfile(event) {
  event.preventDefault();
  setFormError('');
  const button = byId('saju-create-button');
  button.disabled = true;
  button.querySelector('span:first-child').textContent = '명식을 계산하는 중…';

  try {
    const request = buildBirthRequest();
    const existingToken = readSessionValue(GUEST_TOKEN_KEY);
    const token = await bootstrapGuest(existingToken);
    await createBirthProfile(token, request);
    const calculation = await calculateSaju(token);
    const profile = await readBirthProfile(token, readSessionValue(BIRTH_PROFILE_ID_KEY));
    renderCalculation(calculation, profile);
  } catch (error) {
    const message = error?.code === 'INVALID_REQUEST'
      ? '입력한 태어난 정보를 확인해 주세요.'
      : error?.code === 'NOT_FOUND'
        ? '현재 세션에서는 자기 명식록을 만들 수 없습니다.'
        : error instanceof Error && /입력|시간/u.test(error.message)
          ? error.message
          : '사주를 만들지 못했습니다. 서버에서 계산이 완료되기 전에는 결과를 표시하지 않습니다.';
    setFormError(message);
  } finally {
    button.disabled = false;
    button.querySelector('span:first-child').textContent = '내 사주 만들기';
  }
}

byId('saju-time-unknown').addEventListener('change', syncBirthControls);
for (const input of document.querySelectorAll('input[name="saju-calendar"]')) {
  input.addEventListener('change', syncBirthControls);
}
byId('saju-birth-form').addEventListener('submit', submitBirthProfile);

syncBirthControls();
void loadExistingSaju();
