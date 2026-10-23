import { ensureActiveBearer, getActiveBearer, invalidateGuestSession, invalidateMemberSession } from './product-auth.js';
import { getUiLocale } from './ui-i18n.js';
import {
  sajuPillarLabelV1, sajuElementLabelV1, sajuYinYangLabelV1,
  projectSajuPillarDisplayV1, sajuCompletenessLabelV1,
  sajuCurrentYearLabelV1, localizeSajuCopyV1,
} from './saju-calculation-locale.js';

const BIRTH_PROFILE_ID_KEY = 'myeongha.guestBirthProfileId.v1';
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

function clearBirthSession() {
  removeSessionValue(BIRTH_PROFILE_ID_KEY);
}

function handleUnauthorized(activeBearer) {
  if (activeBearer?.kind === 'member') {
    invalidateMemberSession(activeBearer.token);
  } else if (activeBearer?.kind === 'guest') {
    invalidateGuestSession(activeBearer.token);
  }
  clearBirthSession();
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

  if (timeKnown && !/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/u.test(birthTime ?? '')) throw new Error('출생시간을 HH:mm 형식(00:00~23:59)으로 입력해 주세요.');

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

function pillarDisplay(state, locale = getUiLocale()) {
  return projectSajuPillarDisplayV1(state, locale);
}

function renderPillars(snapshot) {
  const grid = byId('saju-pillar-grid');
  grid.replaceChildren();

  for (const [key, label] of PILLARS) {
    const state = snapshot?.pillars?.[key];
    const display = pillarDisplay(state);
    const card = document.createElement('div');
    card.className = `saju-pillar${key === 'day' ? ' is-day' : ''}`;
    card.dataset.sajuPillarKey = key;
    // Keep source display facts on the already-authorized UI nodes to permit
    // locale switches without recalculating or making a new network request.

    const cardLabel = document.createElement('span');
    cardLabel.className = 'saju-pillar-label';
    cardLabel.textContent = sajuPillarLabelV1(key, getUiLocale()) ?? label;

    const value = document.createElement('div');
    value.className = 'saju-pillar-value';
    const strong = document.createElement('strong');
    strong.textContent = display.characters;
    strong.dataset.sajuSourceCharacters = display.characters;
    const text = document.createElement('span');
    text.textContent = display.text;
    text.dataset.sajuKo = pillarDisplay(state, 'ko-KR').text;
    text.dataset.sajuJa = pillarDisplay(state, 'ja-JP').text;
    text.dataset.sajuZh = pillarDisplay(state, 'zh-TW').text;
    value.append(strong, text);

    const meta = document.createElement('span');
    meta.className = 'saju-pillar-meta';
    meta.textContent = display.meta;
    meta.dataset.sajuKo = pillarDisplay(state, 'ko-KR').meta;
    meta.dataset.sajuJa = pillarDisplay(state, 'ja-JP').meta;
    meta.dataset.sajuZh = pillarDisplay(state, 'zh-TW').meta;
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
    label.textContent = sajuElementLabelV1(element, getUiLocale());
    label.dataset.sajuElementKey = element;
    const bar = document.createElement('i');
    bar.style.setProperty('--element-fill', `${Math.round((counts[element] / max) * 100)}%`);
    const value = document.createElement('small');
    value.textContent = String(counts[element]);
    item.append(label, bar, value);
    root.append(item);
  }
}

function formatBirthSummary(profile, locale = 'ko-KR') {
  const input = profile?.currentRevision?.input;
  if (!input || typeof input !== 'object') return localizeSajuCopyV1('현재 자기 Birth Profile과 연결된 계산 결과입니다.',locale);
  const date = typeof input.birthDate === 'string' ? input.birthDate.replaceAll('-', '.') : null;
  const time = input.timeKnown && typeof input.birthTime === 'string' ? input.birthTime.slice(0, 5) : localizeSajuCopyV1('시간 모름',locale);
  const calendar = input.calendarType === 'lunar' ? localizeSajuCopyV1('음력',locale) : input.calendarType === 'solar' ? localizeSajuCopyV1('양력',locale) : null;
  return [date, time, calendar].filter(Boolean).join(' · ') || localizeSajuCopyV1('현재 자기 Birth Profile과 연결된 계산 결과입니다.',locale);
}

function retranslateCalculatedSaju() {
  const hub = document.getElementById('saju-hub');
  if (!hub || hub.hidden) return;
  const locale = getUiLocale();
  const suffix = locale === 'ja-JP' ? 'Ja' : locale === 'zh-TW' ? 'Zh' : 'Ko';
  for (const card of hub.querySelectorAll('[data-saju-pillar-key]')) {
    const key = card.dataset.sajuPillarKey;
    const label = card.querySelector('.saju-pillar-label');
    if (label) label.textContent = sajuPillarLabelV1(key,locale) ?? label.textContent;
    const text = card.querySelector('.saju-pillar-value span');
    if (text) text.textContent = text.dataset['saju' + suffix] ?? text.textContent;
    const meta = card.querySelector('.saju-pillar-meta');
    if (meta) meta.textContent = meta.dataset['saju' + suffix] ?? meta.textContent;
  }
  for (const label of hub.querySelectorAll('[data-saju-element-key]')) {
    label.textContent = sajuElementLabelV1(label.dataset.sajuElementKey,locale);
  }
  const dayMaster = byId('saju-day-master');
  dayMaster.textContent = locale === 'ko-KR' ? dayMaster.dataset.sajuKo : dayMaster.dataset.sajuIntl;
  const meta = byId('saju-day-master-meta');
  meta.textContent = meta.dataset.sajuElement
    ? `${sajuElementLabelV1(meta.dataset.sajuElement,locale)} · ${sajuYinYangLabelV1(meta.dataset.sajuYinYang || '음양 미확인',locale)}`
    : localizeSajuCopyV1('일주가 확정될 때 표시됩니다.',locale);
  const completeness = byId('saju-completeness-title');
  completeness.textContent = sajuCompletenessLabelV1(Number(completeness.dataset.sajuResolvedCount),completeness.dataset.sajuComplete === 'true',locale);
  byId('saju-completeness-copy').textContent = localizeSajuCopyV1(
    byId('saju-completeness-copy').dataset.sajuTimeKnown === 'false'
      ? '출생시간을 모르는 입력으로 계산되어 시주 등 일부 사실이 제한될 수 있습니다.'
      : '현재 Birth Profile revision에 결속된 계산 결과입니다.',
    locale,
  );
  const birthSummary = byId('saju-birth-summary');
  birthSummary.textContent = birthSummary.dataset['saju' + suffix] ?? birthSummary.textContent;
  byId('saju-flow-year').textContent = sajuCurrentYearLabelV1(new Date().getFullYear(),locale);
}
document.addEventListener('myeongha:localechange', retranslateCalculatedSaju);

function renderCalculation(calculation, profile) {
  const snapshot = calculation?.snapshot;
  if (!snapshot || typeof snapshot !== 'object') throw new Error('Saju snapshot is unavailable.');
  renderPillars(snapshot);
  renderElements(snapshot);

  const day = resolvedPillar(snapshot.pillars?.day);
  const dayStem = day?.stem;
  const dayMaster = byId('saju-day-master');
  const dayMasterMeta = byId('saju-day-master-meta');
  dayMaster.dataset.sajuKo = dayStem ? `${dayStem.hanja || ''}${dayStem.value || ''}` || '—' : '—';
  dayMaster.dataset.sajuIntl = dayStem ? dayStem.hanja || '—' : '—';
  dayMasterMeta.dataset.sajuElement = dayStem?.element ?? '';
  dayMasterMeta.dataset.sajuYinYang = dayStem?.yinYang ?? '';

  const completeness = snapshot.completeness;
  const resolvedCount = PILLARS.filter(([key]) => resolvedPillar(snapshot.pillars?.[key])).length;
  byId('saju-completeness-title').dataset.sajuResolvedCount = String(resolvedCount);
  byId('saju-completeness-title').dataset.sajuComplete = completeness?.fullyResolved ? 'true' : 'false';
  byId('saju-completeness-copy').dataset.sajuTimeKnown = completeness?.birthTimeKnown === false ? 'false' : 'true';

  const birthSummary = byId('saju-birth-summary');
  birthSummary.textContent = formatBirthSummary(profile);
  birthSummary.dataset.sajuKo = birthSummary.textContent;
  // The date and time remain identical; only calendar/unknown-time labels change.
  birthSummary.dataset.sajuJa = formatBirthSummary(profile, 'ja-JP');
  birthSummary.dataset.sajuZh = formatBirthSummary(profile, 'zh-TW');
  setState('ready');
  retranslateCalculatedSaju();
}

function storedProfileHasSupportedBirthDate(profile) {
  const birthDate = profile?.currentRevision?.input?.birthDate;
  return typeof birthDate === 'string' && STORED_BIRTH_DATE_PATTERN.test(birthDate);
}

function showCalculationUnavailable() {
  setState('error', '출생정보는 등록되어 있지만 현재 사주 계산 서비스를 사용할 수 없습니다. 입력을 다시 등록하지 말고 잠시 후 새로고침해 주세요.');
}

async function loadExistingSaju() {
  let activeBearer;
  try {
    activeBearer = await getActiveBearer();
  } catch {
    setState('error', '현재 등록된 출생정보를 확인하지 못했습니다. 잠시 후 새로고침해 주세요.');
    return;
  }
  if (!activeBearer) {
    setState('empty');
    return;
  }

  const { token } = activeBearer;
  const birthProfileId = readSessionValue(BIRTH_PROFILE_ID_KEY);
  setState('loading', '현재 세션의 명식을 확인하는 중입니다…');

  try {
    let profile = birthProfileId ? await readBirthProfile(token, birthProfileId) : null;
    if (birthProfileId && profile === null) removeSessionValue(BIRTH_PROFILE_ID_KEY);

    if (profile && !storedProfileHasSupportedBirthDate(profile)) {
      clearBirthSession();
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
      handleUnauthorized(activeBearer);
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
  let activeBearer = null;

  try {
    const request = buildBirthRequest();
    activeBearer = await ensureActiveBearer();
    const token = activeBearer.token;
    const receipt = await createBirthProfile(token, request);
    profileCreated = true;
    const calculation = await calculateSaju(token);
    const profile = await readBirthProfile(token, receipt.birthProfileId);
    renderCalculation(calculation, profile);
  } catch (error) {
    if (error?.status === 401) {
      handleUnauthorized(activeBearer);
      setFormError('현재 세션을 확인할 수 없습니다. 다시 시도해 주세요.');
      return;
    }
    if (profileCreated && error?.operation === 'saju-calculation') {
      showCalculationUnavailable();
      return;
    }

    if (error?.operation === 'birth-create' && error?.code === 'AGE_RESTRICTED') {
      setFormError('만 14세 미만은 보호자 동의 확인 기능이 준비되기 전까지 명식록을 만들 수 없습니다.');
      return;
    }
    if (error?.operation === 'birth-create' && error?.code === 'AGE_VERIFICATION_REQUIRED') {
      setFormError('음력 생일로 이용 연령을 확정할 수 없어 현재 명식록 생성을 진행할 수 없습니다.');
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