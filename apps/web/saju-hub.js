const GUEST_TOKEN_KEY = 'myeongha.guestBearer.v1';
const BIRTH_PROFILE_ID_KEY = 'myeongha.guestBirthProfileId.v1';
const SESSION_BOOTSTRAP_ENDPOINT = '/api/session/bootstrap';
const BIRTH_PROFILE_ENDPOINT = '/api/birth-profiles';
const SAJU_CALCULATION_ENDPOINT = '/api/me/saju/calculation';
const STORED_BIRTH_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
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
    return;
  }
}

function removeSessionValue(key) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    return;
  }
}

function clearGuestBirthSession() {
  removeSessionValue(GUEST_TOKEN_KEY);
  removeSessionValue(BIRTH_PROFILE_ID_KEY);
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

function requestError(operation, status, code, message) {
  const error = new Error(message);
  error.operation = operation;
  error.status = status;
  error.code = code;
  return error;
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
  if (!response.ok) {
    throw requestError('guest-bootstrap', response.status, readPublicErrorCode(payload), `Guest bootstrap failed with status ${response.status}.`);
  }
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
    throw requestError('birth-create', response.status, readPublicErrorCode(payload), `Birth Profile create failed with status ${response.status}.`);
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
  const payload = await readJson(response);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw requestError('birth-read', response.status, readPublicErrorCode(payload), `Birth Profile read failed with status ${response.status}.`);
  }
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
    throw requestError('saju-calculation', response.status, readPublicErrorCode(payload), `Saju calculation failed with status ${response.status}.`);
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

function digitsOnly(value, length) {
  return String(value ?? '').replace(/\D/gu, '').slice(0, length);
}

function setupBirthDateSegment(input, length, nextInput = null, previousInput = null) {
  input.addEventListener('input', () => {
    const normalized = digitsOnly(input.value, length);
    if (input.value !== normalized) input.value = normalized;
    if (nextInput && normalized.length === length) nextInput.focus();
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Backspace' && input.value.length === 0 && previousInput) {
      event.preventDefault();
      previousInput.focus();
      previousInput.setSelectionRange(previousInput.value.length, previousInput.value.length);
    }
  });
}

function setupBirthDateInputs() {
  const year = byId('saju-birth-year');
  const month = byId('saju-birth-month');
  const day = byId('saju-birth-day');
  setupBirthDateSegment(year, 4, month);
  setupBirthDateSegment(month, 2, day, year);
  setupBirthDateSegment(day, 2, null, month);
}

function buildBirthDate(calendarType) {
  const yearText = digitsOnly(byId('saju-birth-year').value, 4);
  const monthText = digitsOnly(byId('saju-birth-month').value, 2);
  const dayText = digitsOnly(byId('saju-birth-day').value, 2);

  if (yearText.length !== 4) throw new Error('출생 연도는 네 자리로 입력해 주세요.');
  if (monthText.length === 0 || dayText.length === 0) throw new Error('생년월일을 모두 입력해 주세요.');

  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isInteger(year) || year < 1) throw new Error('출생 연도를 확인해 주세요.');
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('출생 월은 1월부터 12월 사이로 입력해 주세요.');
  if (!Number.isInteger(day) || day < 1 || day > (calendarType === 'lunar' ? 30 : 31)) {
    throw new Error('출생 일을 확인해 주세요.');
  }

  if (calendarType === 'solar') {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      throw new Error('존재하는 양력 생년월일을 입력해 주세요.');
    }
  }

  return `${yearText}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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
  const calendarType = selectedCalendarType();
  const birthDate = buildBirthDate(calendarType);
  const timeKnown = !byId('saju-time-unknown').checked;
  const birthTime = timeKnown ? byId('saju-birth-time').value : null;
  const sexValue = byId('saju-birth-sex').value;

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

function storedProfileHasSupportedBirthDate(profile) {
  const birthDate = profile?.currentRevision?.input?.birthDate;
  return typeof birthDate === 'string' && STORED_BIRTH_DATE_PATTERN.test(birthDate);
}

function showCalculationUnavailable() {
  setState('error', '출생정보는 등록되어 있지만 현재 사주 계산 서비스를 사용할 수 없습니다. 입력을 다시 등록하지 말고 잠시 후 새로고침해 주세요.');
}

async function loadExistingSaju() {
  const token = readSessionValue(GUEST_TOKEN_KEY);
  if (!token) {
    setState('empty');
    return;
  }

  const birthProfileId = readSessionValue(BIRTH_PROFILE_ID_KEY);
  setState('loading', '현재 세션의 명식을 확인하는 중입니다…');

  try {
    let profile = birthProfileId ? await readBirthProfile(token, birthProfileId) : null;
    if (birthProfileId && profile === null) removeSessionValue(BIRTH_PROFILE_ID_KEY);

    if (profile && !storedProfileHasSupportedBirthDate(profile)) {
      clearGuestBirthSession();
      setState('empty', '이전 세션의 생년월일 형식이 올바르지 않아 입력 상태를 초기화했습니다. 네 자리 연도로 다시 입력해 주세요.');
      return;
    }

    const calculation = await calculateSaju(token);
    if (!profile) {
      const storedId = readSessionValue(BIRTH_PROFILE_ID_KEY);
      profile = storedId ? await readBirthProfile(token, storedId) : null;
    }
    renderCalculation(calculation, profile);
  } catch (error) {
    if (error?.status === 401) {
      clearGuestBirthSession();
      setState('empty');
      return;
    }
    if (error?.operation === 'saju-calculation' && (error?.status === 404 || error?.code === 'NOT_FOUND')) {
      if (birthProfileId) {
        setState('error', '등록된 출생정보가 있지만 현재 자기 명식 계산 대상과 연결되지 않았습니다. 잠시 후 다시 확인해 주세요.');
      } else {
        setState('empty');
      }
      return;
    }
    if (error?.operation === 'saju-calculation') {
      showCalculationUnavailable();
      return;
    }
    setState('error', '현재 등록된 출생정보를 확인하지 못했습니다. 잠시 후 새로고침해 주세요.');
  }
}

async function submitBirthProfile(event) {
  event.preventDefault();
  setFormError('');
  const button = byId('saju-create-button');
  const label = button.querySelector('span:first-child');
  button.disabled = true;
  label.textContent = '명식을 계산하는 중…';
  let profileCreated = false;

  try {
    const request = buildBirthRequest();
    const existingToken = readSessionValue(GUEST_TOKEN_KEY);
    const token = await bootstrapGuest(existingToken);
    const receipt = await createBirthProfile(token, request);
    profileCreated = true;
    const calculation = await calculateSaju(token);
    const profile = await readBirthProfile(token, receipt.birthProfileId);
    renderCalculation(calculation, profile);
  } catch (error) {
    if (profileCreated && error?.operation === 'saju-calculation') {
      showCalculationUnavailable();
      return;
    }

    if (error?.operation === 'birth-create' && error?.code === 'INVALID_REQUEST') {
      setFormError('입력값을 처리하지 못했습니다. 생년월일·출생시간을 확인하고, 이미 등록한 적이 있다면 새로고침해 주세요.');
      return;
    }
    if (error?.code === 'NOT_FOUND') {
      setFormError('현재 세션에서는 자기 명식록을 만들 수 없습니다.');
      return;
    }
    if (error instanceof Error && /입력|연도|월|일|시간|생년월일/u.test(error.message)) {
      setFormError(error.message);
      return;
    }
    setFormError('사주 입력을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  } finally {
    button.disabled = false;
    label.textContent = '내 사주 만들기';
  }
}

setupBirthDateInputs();
byId('saju-time-unknown').addEventListener('change', syncBirthControls);
for (const input of document.querySelectorAll('input[name="saju-calendar"]')) {
  input.addEventListener('change', syncBirthControls);
}
byId('saju-birth-form').addEventListener('submit', submitBirthProfile);

syncBirthControls();
void loadExistingSaju();
