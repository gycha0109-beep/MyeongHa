import { resolveCharacterDisplayNameV1 } from './character-display-locale.js';
import { getUiLocale, translateStaticUi } from './ui-i18n.js';
import { readingScopeLabelV1, readingSceneProgressV1, readingRouteStateCopyV1 } from './reading-detail-ui-locale.js';
import { resolveReadingDetailRoute } from './reading-detail-route.js';
import { resolveSajuButtonEngineRequest } from './reading-saju-engine-request.js';
import { previewSetupHrefV1 } from './reading-preview-continuation.js';
import { isBrowserSajuPreviewDeliveryV1 } from './saju-preview-response-admission.js';
import {
  getActiveBearer, invalidateGuestSession, invalidateMemberSession,
  readMemberSession, readGuestBearer, PRODUCT_AUTH_STORAGE_V1,
} from './product-auth.js';
import {
  captureReadingResponseOwnerV1,
  isReadingResponseOwnerCurrentV1,
} from './reading-response-owner-guard.js';
import { parsePersistedReadingHandoffV1 } from './reading-history-handoff.js';
import { parseOfficialReadingRecordPayloadV1 } from './official-reading-record-contract.js';
import { resolveReaderPresentationCandidateV1 } from './reader-rollout-policy.js';

const readerCatalog = {
  baekheon: {
    name: '백헌',
    hanja: '白憲',
    title: '베테랑 조정자',
    intro: '당신의 사주를 바탕으로 지금의 흐름부터 하나씩 살펴보겠습니다.',
  },
  seyeon: {
    name: '세연',
    hanja: '',
    title: '명하의 안내인',
    intro: '복잡하게 시작하지 않을게요. 지금 가장 크게 읽히는 흐름부터 같이 봐요.',
  },
  yeoul: {
    name: '여울',
    hanja: '',
    title: '운영관리팀 사원',
    intro: '돌려 말하지 않을게요. 지금 필요한 흐름부터 바로 짚겠습니다.',
  },
  seorin: {
    name: '서린',
    hanja: '',
    title: '기억 서고지기',
    intro: '지금의 흐름이 예전의 어떤 기록과 이어지는지 천천히 살펴볼게요.',
  },
  rahyeon: {
    name: '라현',
    hanja: '',
    title: '전시 기획자',
    intro: '표면적인 답보다, 당신이 실제로 흔들리는 지점부터 읽어보죠.',
  },
  mira: {
    name: '미라',
    hanja: '',
    title: '연결자',
    intro: '과하게 의미 붙이지 말고, 지금 쓸 수 있는 정보부터 보죠.',
  },
  taegyeom: {
    name: '태겸',
    hanja: '',
    title: '프로 격구 선수',
    intro: '근거 없는 낙관은 빼겠습니다. 확인되는 구조부터 보죠.',
  },
  yunho: {
    name: '윤호',
    hanja: '',
    title: '연결자',
    intro: '급하게 결론부터 내리지 않고, 구조와 시기를 차례대로 읽어보겠습니다.',
  },
  doyun: {
    name: '도윤',
    hanja: '',
    title: '연결자',
    intro: '일단 재미없는 설명부터 길게 하진 않을게요. 지금 걸리는 부분부터 보죠.',
  },
};

const aliases = new Map([
  ['백헌', 'baekheon'], ['세연', 'seyeon'], ['여울', 'yeoul'], ['서린', 'seorin'],
  ['라현', 'rahyeon'], ['미라', 'mira'], ['태겸', 'taegyeom'], ['윤호', 'yunho'], ['도윤', 'doyun'],
]);

const params = new URLSearchParams(window.location.search);
const persistedReadingHandoff = parsePersistedReadingHandoffV1(params);
const requestedReader = params.get('character') || params.get('reader') || 'seyeon';
const normalizedReader = aliases.get(requestedReader) || requestedReader.toLowerCase();
// Frontend integration authority: URL-selected Reader identity is presentation-only.
// When Reader Interpretation is activated, the server-returned readerCharacterId wins.
const presentationReaderHint = resolveReaderPresentationCandidateV1(normalizedReader);
const readerKey = presentationReaderHint;
const reader = readerCatalog[presentationReaderHint];
const route = resolveReadingDetailRoute(params);
const engineRequest = route.valid ? resolveSajuButtonEngineRequest(route) : null;
const currentYear = new Date().getFullYear();
const SAJU_PREVIEW_READING_ENDPOINT = '/api/me/saju/preview-reading';
const OFFICIAL_READING_RECORD_ENDPOINT = '/api/readings';
const PREVIEW_READING_TEXTS = new Set(['전체 사주', '직업운', '재물운', '연애운', '사업운']);
const PREVIEW_NOTICE_SECTION_TITLE = '프리뷰 안내';
const STRUCTURE_PREFIX = '근거 구조:';
const previewEligible = persistedReadingHandoff.state === 'none' && engineRequest?.state === 'ready' && PREVIEW_READING_TEXTS.has(engineRequest.readingText);

const root = document.body;
const routeState = document.querySelector('[data-reading-route-state]');
const stage = document.querySelector('[data-reading-stage]');
const productTitle = document.querySelector('[data-reading-product-title]');
const stateTitle = document.querySelector('[data-reading-state-title]');
const stateCopy = document.querySelector('[data-reading-state-copy]');
const backLink = document.querySelector('[data-reading-back-link]');
const routeAction = document.querySelector('[data-reading-route-action]');

root.dataset.reader = presentationReaderHint;
root.dataset.readerSelection = params.has('reader') || params.has('character') ? 'explicit' : 'default';
root.dataset.readerAuthority = 'presentation_hint_only';
root.dataset.readerSelectionState = normalizedReader === presentationReaderHint ? 'preview_presentation' : 'withheld';
root.dataset.readerPresentation = 'reading-scene-v1';
root.dataset.readingRouteState = persistedReadingHandoff.state === 'ready'
  ? 'persisted_record_loading'
  : persistedReadingHandoff.state === 'invalid'
    ? 'persisted_handoff_invalid'
    : route.valid
      ? (previewEligible ? 'preview_loading' : 'blocked_by_authority')
      : 'invalid';
if (engineRequest) {
  root.dataset.readingEngineRequestState = engineRequest.state;
  if ('domain' in engineRequest) root.dataset.readingEngineDomain = engineRequest.domain;
} else {
  delete root.dataset.readingEngineRequestState;
  delete root.dataset.readingEngineDomain;
}

if (route.valid) {
  root.dataset.readingTopicKey = route.topic;
  root.dataset.readingScopeKey = route.scope;
} else {
  delete root.dataset.readingTopicKey;
  delete root.dataset.readingScopeKey;
}

const portrait = document.querySelector('[data-reader-portrait]');
function renderReaderLocalePresentation() {
  const locale = getUiLocale();
  const label = resolveCharacterDisplayNameV1(readerKey, locale) ?? reader.name;
  document.querySelectorAll('[data-reader-name]').forEach((element) => { element.textContent = label; });
  document.querySelectorAll('[data-reader-title]').forEach((element) => { element.textContent = translateStaticUi(reader.title, locale); element.hidden = !reader.title; });
  document.querySelectorAll('[data-reader-intro]').forEach((element) => { element.textContent = translateStaticUi(reader.intro, locale); });
  document.querySelectorAll('[data-reader-hanja]').forEach((element) => {
    element.textContent = locale === 'ko-KR' ? reader.hanja : '';
    element.hidden = locale !== 'ko-KR' || !reader.hanja;
  });
  if (portrait) portrait.setAttribute('aria-label', `${label} ${translateStaticUi('사주',locale)}`);
}
renderReaderLocalePresentation();
document.addEventListener('myeongha:localechange', renderReaderLocalePresentation);

let activeReadingOwner = null;

function currentReadingOwnerEvidence() {
  return { memberSession: readMemberSession(), guestCredential: readGuestBearer() };
}

function captureActiveReadingOwner(credential) {
  const evidence = currentReadingOwnerEvidence();
  return captureReadingResponseOwnerV1(
    credential, evidence.memberSession, evidence.guestCredential,
  );
}

function isCurrentReadingOwner(owner) {
  const evidence = currentReadingOwnerEvidence();
  return isReadingResponseOwnerCurrentV1(
    owner, evidence.memberSession, evidence.guestCredential,
  );
}

function renderReadingAccountChanged() {
  activeReadingOwner = null;
  if (persistedReadingHandoff.state === 'ready') {
    renderPersistedReadingFailure(
      '계정 또는 세션이 변경되었습니다.',
      '이전 계정의 공식 풀이를 표시하지 않습니다. 현재 계정의 기록에서 다시 열어 주세요.',
      'persisted_record_session_changed',
    );
  } else if (previewEligible) {
    renderPreviewFailure(
      '계정 또는 세션이 변경되었습니다.',
      '이전 세션의 사주 프리뷰를 표시하지 않습니다. 사주 페이지에서 다시 시작해 주세요.',
      'preview_session_changed',
    );
  }
}

function ensureResponseOwnerCurrent(owner) {
  try {
    if (isCurrentReadingOwner(owner)) return true;
  } catch {
    // If browser session evidence is unreadable, do not show the old result.
  }
  renderReadingAccountChanged();
  return false;
}

function onReadingAuthChanged() {
  if (activeReadingOwner === null) return;
  try {
    if (isCurrentReadingOwner(activeReadingOwner)) return;
  } catch {
    // Unreadable browser session evidence is treated as a changed session.
  }
  renderReadingAccountChanged();
}

window.addEventListener(PRODUCT_AUTH_STORAGE_V1.changedEvent, onReadingAuthChanged);
window.addEventListener('storage', (event) => {
  if (event.key === null || event.key === PRODUCT_AUTH_STORAGE_V1.memberSession) {
    onReadingAuthChanged();
  }
});

function scopeDisplay(scope) {
  return readingScopeLabelV1(scope, currentYear, getUiLocale());
}

function renderInvalidRoute() {
  if (productTitle) productTitle.textContent = '사주 읽기';
  if (stateTitle) stateTitle.textContent = '요청한 읽기를 찾을 수 없습니다.';
  if (stateCopy) {
    stateCopy.textContent = '지원하지 않는 사주 읽기 주소입니다. 전체 사주나 올해의 흐름으로 자동 대체하지 않았습니다.';
  }
  document.title = '읽기를 찾을 수 없음 · 명하';
}

function clearPersistedReadingPresentation() {
  const report = document.querySelector('[data-official-report]');
  if (report) report.hidden = true;
  document.querySelector('[data-official-report-toc]')?.replaceChildren();
  document.querySelector('[data-official-report-sections]')?.replaceChildren();
  document.querySelector('[data-official-report-pillars]')?.replaceChildren();
  document.querySelector('[data-official-report-elements]')?.replaceChildren();
  document.querySelector('[data-official-report-gods]')?.replaceChildren();
  const facts = document.querySelector('[data-official-report-facts]');
  if (facts) facts.hidden = true;
  const first = document.querySelector('[data-official-report-first]');
  if (first) first.hidden = true;
  const firstText = document.querySelector('[data-official-report-first-text]');
  if (firstText) firstText.textContent = '';
  const reader = document.querySelector('[data-official-report-reader]');
  if (reader) reader.textContent = '—';
  const notice = document.querySelector('[data-official-report-notice]');
  if (notice) notice.hidden = true;
  // The report and step scene share the same persisted source. When the
  // account changes, remove both visible and hidden source-bearing nodes.
  for (const selector of [
    '[data-official-report-notice-text]', '[data-official-report-date]',
    '[data-official-report-version]', '[data-reading-step-title]',
    '[data-reading-step-body]', '[data-reading-structure-body]',
    '[data-reader-step-line]', '[data-reading-authority-note]',
    '[data-chart-pillar-year]', '[data-chart-pillar-month]',
    '[data-chart-pillar-day]', '[data-chart-pillar-hour]',
  ]) {
    const element = document.querySelector(selector);
    if (element) {
      element.textContent = '';
      if (selector === '[data-reading-authority-note]') element.removeAttribute('title');
    }
  }
  document.querySelector('[data-chart-five-elements]')?.replaceChildren();
  document.querySelector('[data-chart-ten-gods]')?.replaceChildren();
  delete root.dataset.reader;
  delete root.dataset.readerSelection;
  delete root.dataset.readerAuthority;
  delete root.dataset.readerPresentation;
  document.querySelector('.reader-scene')?.setAttribute('hidden', '');
  document.querySelector('.reading-character-block')?.setAttribute('hidden', '');
}

function configurePersistedReadingNavigation() {
  if (backLink) {
    backLink.setAttribute('href', 'records.html?tab=saju');
    backLink.textContent = '← 사주 기록으로 돌아가기';
  }
  if (routeAction) {
    routeAction.setAttribute('href', 'records.html?tab=saju');
    routeAction.textContent = '사주 기록으로 돌아가기 →';
  }
}

function renderPersistedReadingHandoffInvalid() {
  clearPersistedReadingPresentation();
  configurePersistedReadingNavigation();
  root.dataset.readingRouteState = 'persisted_handoff_invalid';
  if (stage) stage.hidden = true;
  if (routeState) routeState.hidden = false;
  if (productTitle) productTitle.textContent = '저장된 사주 풀이';
  if (stateTitle) stateTitle.textContent = '저장된 풀이 연결 정보를 확인할 수 없습니다.';
  if (stateCopy) {
    stateCopy.textContent = '기록 페이지에서 다시 열어 주세요. 불완전한 식별자로 다른 풀이를 대신 표시하지 않습니다.';
  }
  document.title = '저장된 풀이 연결 오류 · 명하';
}

function renderPersistedReadingLoading() {
  clearPersistedReadingPresentation();
  configurePersistedReadingNavigation();
  root.dataset.readingRouteState = 'persisted_record_loading';
  if (stage) stage.hidden = true;
  if (routeState) routeState.hidden = false;
  if (productTitle) productTitle.textContent = '저장된 사주 풀이';
  if (stateTitle) stateTitle.textContent = '저장된 공식 풀이를 불러오고 있습니다.';
  if (stateCopy) stateCopy.textContent = '기록에 저장된 Official Reading 결과를 확인하고 있습니다.';
  root.dataset.persistedReadingHandoff = 'records';
  root.dataset.persistedReadingDomain = persistedReadingHandoff.sajuDomain;
  document.title = '저장된 사주 풀이 · 명하';
}

function renderPersistedReadingFailure(title, copy, state = 'persisted_record_unavailable') {
  clearPersistedReadingPresentation();
  configurePersistedReadingNavigation();
  root.dataset.readingRouteState = state;
  if (stage) stage.hidden = true;
  if (routeState) routeState.hidden = false;
  if (productTitle) productTitle.textContent = '저장된 사주 풀이';
  if (stateTitle) stateTitle.textContent = title;
  if (stateCopy) stateCopy.textContent = copy;
}

function renderAuthorityBlockedRoute() {
  const copy = readingRouteStateCopyV1(route, engineRequest, 'blocked', currentYear, getUiLocale());
  if (productTitle) productTitle.textContent = copy.productTitle;
  if (stateTitle) stateTitle.textContent = copy.stateTitle;
  if (stateCopy) stateCopy.textContent = copy.stateCopy;
  document.querySelectorAll('[data-reading-scope]').forEach((element) => { element.textContent = copy.scope; });
  document.title = copy.documentTitle;
}

function renderPreviewLoading() {
  const copy = readingRouteStateCopyV1(route, engineRequest, 'preview_loading', currentYear, getUiLocale());
  if (productTitle) productTitle.textContent = copy.productTitle;
  if (stateTitle) stateTitle.textContent = copy.stateTitle;
  if (stateCopy) stateCopy.textContent = copy.stateCopy;
  document.querySelectorAll('[data-reading-scope]').forEach((element) => { element.textContent = copy.scope; });
  document.title = copy.documentTitle;
}

document.addEventListener('myeongha:localechange', () => {
  if (root.dataset.readingRouteState === 'blocked_by_authority') renderAuthorityBlockedRoute();
  if (root.dataset.readingRouteState === 'preview_loading') renderPreviewLoading();
});

function renderPreviewFailure(title, copy, state = 'preview_unavailable') {
  root.dataset.readingRouteState = state;
  if (stage) stage.hidden = true;
  if (routeState) routeState.hidden = false;
  if (productTitle) productTitle.textContent = route.label;
  if (stateTitle) stateTitle.textContent = title;
  if (stateCopy) stateCopy.textContent = copy;
  if (state === 'preview_requires_profile' && routeAction) {
    routeAction.setAttribute('href', previewSetupHrefV1(params));
    routeAction.textContent = '출생정보 입력 후 이 사주 읽기 보기 →';
  }
}

function invalidateActiveBearer(activeBearer) {
  if (activeBearer?.kind === 'member') {
    invalidateMemberSession(activeBearer.token);
  } else if (activeBearer?.kind === 'guest') {
    invalidateGuestSession(activeBearer.token);
  }
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function publicErrorCode(payload) {
  return payload && typeof payload === 'object' && payload.error && typeof payload.error === 'object'
    ? payload.error.code
    : null;
}

function blockTexts(block) {
  if (!block || typeof block !== 'object') return [];
  if (block.type === 'paragraph' || block.type === 'source_hint') {
    return typeof block.text === 'string' && block.text.trim() ? [block.text.trim()] : [];
  }
  if (block.type === 'key_points' && Array.isArray(block.items)) {
    return block.items.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim());
  }
  if (block.type === 'comparison' && Array.isArray(block.perspectives)) {
    return block.perspectives.flatMap((item) =>
      item && typeof item === 'object' && typeof item.text === 'string'
        ? [`${typeof item.label === 'string' ? `${item.label}: ` : ''}${item.text}`]
        : []);
  }
  if (block.type === 'ambiguity') {
    const texts = typeof block.summary === 'string' ? [block.summary] : [];
    if (Array.isArray(block.scenarios)) {
      texts.push(...block.scenarios.flatMap((item) =>
        item && typeof item === 'object' && typeof item.text === 'string'
          ? [`${typeof item.label === 'string' ? `${item.label}: ` : ''}${item.text}`]
          : []));
    }
    return texts;
  }
  if (block.type === 'timeline' && Array.isArray(block.entries)) {
    return block.entries.flatMap((item) =>
      item && typeof item === 'object' && typeof item.text === 'string'
        ? [`${typeof item.label === 'string' ? `${item.label}: ` : ''}${item.text}`]
        : []);
  }
  if (block.type === 'fact_table' && Array.isArray(block.rows)) {
    return block.rows.flatMap((item) =>
      item && typeof item === 'object' && typeof item.value === 'string'
        ? [`${typeof item.label === 'string' ? `${item.label}: ` : ''}${item.value}`]
        : []);
  }
  return [];
}

function previewStepsFromPayload(payload, { requireBrowserAdmission = false } = {}) {
  // Official archive reread already has its own persisted-record admission boundary.
  // This narrow browser guard applies only to the live Preview HTTP path.
  if (requireBrowserAdmission && !isBrowserSajuPreviewDeliveryV1(payload)) return null;
  if (!payload || typeof payload !== 'object' || payload.ok !== true) return null;
  const data = payload.data;
  if (!data || typeof data !== 'object' || data.lifecycle !== 'preview') return null;
  const response = data.reading;
  if (!response || typeof response !== 'object') return null;
  if (!['delivered', 'delivered_with_fallback'].includes(response.state)) return null;
  const reading = response.reading;
  if (!reading || typeof reading !== 'object' || !Array.isArray(reading.sections)) return null;

  const notices = [];
  const steps = reading.sections.flatMap((section) => {
    if (!section || typeof section !== 'object' || section.state === 'unavailable') return [];
    const title = typeof section.title === 'string' && section.title.trim()
      ? section.title.trim()
      : '사주 읽기';
    const texts = Array.isArray(section.blocks)
      ? section.blocks.flatMap(blockTexts).filter(Boolean)
      : [];
    if (texts.length === 0) return [];

    if (title === PREVIEW_NOTICE_SECTION_TITLE) {
      notices.push(...texts);
      return [];
    }

    const structure = texts.filter((text) => text.startsWith(STRUCTURE_PREFIX));
    const interpretation = texts.filter((text) => !text.startsWith(STRUCTURE_PREFIX));
    if (interpretation.length === 0) return [];

    return [{
      title,
      primary: interpretation[0],
      supporting: interpretation.slice(1),
      structure,
    }];
  });

  if (Array.isArray(reading.disclosures)) {
    for (const item of reading.disclosures) {
      if (!item || typeof item !== 'object' || typeof item.text !== 'string' || !item.text.trim()) continue;
      if (item.type === 'scope_limitation') {
        notices.push(item.text.trim());
      } else if (steps.length > 0) {
        steps[0].supporting.push(item.text.trim());
      }
    }
  }

  if (steps.length === 0) return null;
  return {
    steps,
    notice: notices.find((text) => typeof text === 'string' && text.trim()) ?? '',
    calculationSummary:
      reading.calculationSummary && typeof reading.calculationSummary === 'object'
        ? reading.calculationSummary
        : null,
  };
}

function renderProgressDots(stepCount, activeIndex) {
  const track = document.querySelector('.reading-progress-track');
  if (!track) return;
  track.replaceChildren();
  for (let index = 0; index < stepCount; index += 1) {
    const dot = document.createElement('span');
    dot.className = `reading-progress-dot${index === activeIndex ? ' is-active' : ''}`;
    dot.dataset.readingProgressDot = '';
    track.append(dot);
  }
}

function previewCommentForStep() {
  return '좋고 나쁨으로 단정하기보다 실제 생활에서 이 흐름이 반복되는지 확인해 보세요.';
}

function displayFactValue(fact) {
  if (!fact || typeof fact !== 'object') return '확인 중';
  if (fact.status !== 'resolved') return fact.status === 'ambiguous' ? '경계값' : '확인 불가';
  return typeof fact.value === 'string' && fact.value.trim() ? fact.value.trim() : '확인됨';
}

function renderFactList(container, facts) {
  if (!container) return;
  container.replaceChildren();
  if (!Array.isArray(facts) || facts.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'reading-chart-empty';
    empty.textContent = '표시할 계산 근거가 없습니다.';
    container.append(empty);
    return;
  }
  for (const fact of facts) {
    if (!fact || typeof fact !== 'object') continue;
    const item = document.createElement('span');
    item.className = 'reading-chart-fact';
    const label = document.createElement('small');
    label.textContent = typeof fact.label === 'string' ? fact.label : '근거';
    const value = document.createElement('strong');
    value.textContent = displayFactValue(fact);
    item.append(label, value);
    container.append(item);
  }
}

function renderCalculationSummary(summary) {
  if (!summary || typeof summary !== 'object') return;
  const pillars = summary.pillars && typeof summary.pillars === 'object' ? summary.pillars : {};
  for (const [key, selector] of Object.entries({
    year: '[data-chart-pillar-year]',
    month: '[data-chart-pillar-month]',
    day: '[data-chart-pillar-day]',
    hour: '[data-chart-pillar-hour]',
  })) {
    const node = document.querySelector(selector);
    if (node) node.textContent = displayFactValue(pillars[key]);
  }
  renderFactList(document.querySelector('[data-chart-five-elements]'), summary.fiveElements);
  renderFactList(document.querySelector('[data-chart-ten-gods]'), summary.tenGods);
}

// Display only calculation facts already included in the authorized stored response.
// Never recompute an earlier Birth revision from the current Birth Profile.
function renderStoredReportEvidence(summary) {
  const section = document.querySelector('[data-official-report-facts]');
  if (!section || !summary || typeof summary !== 'object') return;
  const pillars = summary.pillars && typeof summary.pillars === 'object' ? summary.pillars : {};
  const validPillars = ['year', 'month', 'day', 'hour'].filter((key) => {
    const fact = pillars[key];
    return fact && typeof fact === 'object' && typeof fact.status === 'string';
  });
  const hasElements = Array.isArray(summary.fiveElements) && summary.fiveElements.length > 0;
  const hasGods = Array.isArray(summary.tenGods) && summary.tenGods.length > 0;
  if (validPillars.length === 0 && !hasElements && !hasGods) return;

  const output = document.querySelector('[data-official-report-pillars]');
  if (output) {
    output.replaceChildren();
    for (const [key, label] of [['year', '연주'], ['month', '월주'], ['day', '일주'], ['hour', '시주']]) {
      if (!validPillars.includes(key)) continue;
      const wrapper = document.createElement('div');
      const title = document.createElement('small');
      title.textContent = translateStaticUi(label, getUiLocale());
      const value = document.createElement('strong');
      value.dataset.officialReading = '';
      value.textContent = displayFactValue(pillars[key]);
      wrapper.append(title, value);
      output.append(wrapper);
    }
  }
  renderFactList(document.querySelector('[data-official-report-elements]'), hasElements ? summary.fiveElements : []);
  renderFactList(document.querySelector('[data-official-report-gods]'), hasGods ? summary.tenGods : []);
  section.hidden = false;
}

// Render only the exact owner-authorized, delivered snapshot already projected by
// previewStepsFromPayload. This is a document layout, not a new Saju inference.
function renderAuthorizedStoredReport(preview, record) {
  const report = document.querySelector('[data-official-report]');
  const toc = document.querySelector('[data-official-report-toc]');
  const sections = document.querySelector('[data-official-report-sections]');
  if (!report || !toc || !sections) return;
  toc.replaceChildren();
  sections.replaceChildren();

  for (const [index, step] of preview.steps.entries()) {
    const anchor = document.createElement('a');
    anchor.href = `#official-report-section-${index + 1}`;
    anchor.dataset.officialReading = '';
    anchor.textContent = `${String(index + 1).padStart(2, '0')} · ${step.title}`;
    toc.append(anchor);

    const section = document.createElement('section');
    section.className = 'official-report-section';
    section.id = `official-report-section-${index + 1}`;
    // Hash targets must also accept keyboard and screen-reader focus.
    section.tabIndex = -1;
    const kicker = document.createElement('span');
    kicker.className = 'official-report-section-number';
    kicker.textContent = String(index + 1).padStart(2, '0');
    const heading = document.createElement('h2');
    heading.id = `official-report-heading-${index + 1}`;
    heading.dataset.officialReading = '';
    heading.textContent = step.title;
    section.setAttribute('aria-labelledby', heading.id);
    anchor.addEventListener('click', (event) => {
      if (!activeReadingOwner || !ensureResponseOwnerCurrent(activeReadingOwner)) {
        event.preventDefault();
        return;
      }
      section.focus({ preventScroll: true });
    });
    const primary = document.createElement('p');
    primary.className = 'official-report-primary';
    primary.dataset.officialReading = '';
    primary.textContent = step.primary;
    section.append(kicker, heading, primary);

    for (const text of step.supporting) {
      const extra = document.createElement('p');
      extra.className = 'official-report-supporting';
      extra.dataset.officialReading = '';
      extra.textContent = text;
      section.append(extra);
    }
    if (step.structure.length > 0) {
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = '이 해석의 구조 보기';
      details.append(summary);
      for (const text of step.structure) {
        const ground = document.createElement('p');
        ground.dataset.officialReading = '';
        ground.textContent = text;
        details.append(ground);
      }
      section.append(details);
    }
    sections.append(section);
  }

  const date = document.querySelector('[data-official-report-date]');
  if (date) date.textContent = new Intl.DateTimeFormat(getUiLocale(), {
    year: 'numeric', month: 'long', day: 'numeric',
  }).format(new Date(record.completedAt));
  const version = document.querySelector('[data-official-report-version]');
  if (version) version.textContent = record.readingContractVersion;
  const reader = document.querySelector('[data-official-report-reader]');
  if (reader) {
    const ids = record.readerCharacterIds;
    reader.textContent = ids.length > 0
      ? ids.map((id) => resolveCharacterDisplayNameV1(id, getUiLocale()) ?? id).join(', ')
      : '—';
  }
  const first = document.querySelector('[data-official-report-first]');
  const firstText = document.querySelector('[data-official-report-first-text]');
  if (first && firstText && preview.steps[0]) {
    firstText.textContent = preview.steps[0].primary;
    first.hidden = false;
  }
  renderStoredReportEvidence(preview.calculationSummary);
  const notice = document.querySelector('[data-official-report-notice]');
  const noticeText = document.querySelector('[data-official-report-notice-text]');
  if (notice) notice.hidden = !preview.notice;
  if (noticeText) {
    noticeText.dataset.officialReading = '';
    noticeText.textContent = preview.notice;
  }
  report.hidden = false;
  // Authorized content arrives after the browser's initial fragment navigation.
  const requestedSection = /^#official-report-section-([1-9]\d*)$/u.exec(window.location.hash);
  if (requestedSection) {
    const section = sections.querySelector(`#official-report-section-${Number(requestedSection[1])}`);
    if (section) {
      section.focus({ preventScroll: true });
      section.scrollIntoView({ block: 'start' });
    }
  }
}

function activatePreviewReading(preview) {
  const { steps } = preview;
  const isStoredRecord = preview.source === 'record';
  const report = document.querySelector('[data-official-report]');
  const reportStepMode = document.querySelector('[data-official-report-step-mode]');
  const reportReturn = document.querySelector('[data-official-report-return]');
  const reportHeading = document.querySelector('[data-official-report-heading]');
  let activeIndex = 0;
  const progressLabel = document.querySelector('[data-reading-progress-label]');
  const stepTitle = document.querySelector('[data-reading-step-title]');
  const stepBody = document.querySelector('[data-reading-step-body]');
  const structureTitle = document.querySelector('[data-reading-structure-title]');
  const structureBody = document.querySelector('[data-reading-structure-body]');
  const readerLine = document.querySelector('[data-reader-step-line]');
  const readerComment = document.querySelector('[data-reader-comment]');
  const authorityNote = document.querySelector('[data-reading-authority-note]');
  const previousButton = document.querySelector('[data-reading-prev]');
  const nextButton = document.querySelector('[data-reading-next]');
  const nextLabel = nextButton?.querySelector('span:first-child');
  const readingSheet = document.querySelector('.reading-sheet');
  const completion = document.querySelector('[data-reading-completion]');
  const completionTitle = document.querySelector('[data-reading-completion-title]');
  const completionCopy = document.querySelector('[data-reading-completion-copy]');
  const chatLink = document.querySelector('[data-reading-chat-link]');
  const recordsLink = document.querySelector('[data-reading-records-link]');
  const recordsLinkLabel = document.querySelector('[data-reading-completion-secondary-label]');
  const replayButton = document.querySelector('[data-reading-replay]');
  let completed = false;

  function mayRenderCurrentStoredRecord() {
    return !isStoredRecord
      || (activeReadingOwner !== null && ensureResponseOwnerCurrent(activeReadingOwner));
  }

  function completeReadingExperience() {
    if (!mayRenderCurrentStoredRecord()) return;
    completed = true;
    root.dataset.readingExperience = 'complete';
    if (readingSheet) readingSheet.dataset.readingCompleted = 'true';
    if (completion) completion.hidden = false;
    // Saju Preview has no server-authoritative Reader identity. Do not promote
    // the presentation Reader hint into Chat character authority or a stored
    // Reading-to-Chat continuation claim. General Chat remains independently selectable.
    if (chatLink) chatLink.setAttribute('href', 'chat-hub.html');
    if (recordsLink) {
      // A live Preview does not create a persisted Official Reading.
      recordsLink.setAttribute('href', isStoredRecord ? 'records.html?tab=saju' : 'reading.html');
    }
    if (recordsLinkLabel) {
      recordsLinkLabel.textContent = readingSceneProgressV1(activeIndex, steps.length, {
        hasStructure: false, hasSupporting: false,
      }, isStoredRecord, getUiLocale()).recordsLinkLabel;
    }
  }

  function replayReadingExperience() {
    if (!mayRenderCurrentStoredRecord()) return;
    completed = false;
    activeIndex = 0;
    root.dataset.readingExperience = 'reading';
    if (readingSheet) delete readingSheet.dataset.readingCompleted;
    if (completion) completion.hidden = true;
    renderStep();
  }

  function renderStep() {
    if (!mayRenderCurrentStoredRecord()) return;
    const step = steps[activeIndex];
    if (!step) return;
    const structureParts = [...step.structure, ...step.supporting];

    const ui = readingSceneProgressV1(activeIndex, steps.length, {
      hasStructure: step.structure.length > 0,
      hasSupporting: step.supporting.length > 0,
    }, isStoredRecord, getUiLocale());
    if (progressLabel) progressLabel.textContent = ui.progress;
    if (stepTitle) stepTitle.textContent = step.title;
    if (stepBody) stepBody.textContent = step.primary;
    if (structureTitle) structureTitle.textContent = ui.structureTitle;
    if (structureBody) {
      structureBody.textContent = structureParts.length > 0
        ? structureParts.join('\n\n')
        : '원국에서 확인된 해석 축을 바탕으로 읽는 항목입니다.';
    }
    if (readerLine) readerLine.textContent = `${step.title} 항목을 확인합니다.`;
    if (readerComment) readerComment.textContent = previewCommentForStep();
    if (authorityNote) {
      authorityNote.textContent = ui.authorityNote;
      if (preview.notice) authorityNote.title = preview.notice;
    }
    if (previousButton) previousButton.disabled = activeIndex === 0;
    if (nextButton) nextButton.disabled = false;
    if (nextLabel) nextLabel.textContent = ui.nextLabel;
    renderProgressDots(steps.length, activeIndex);
  }

  previousButton?.addEventListener('click', () => {
    if (activeIndex === 0) return;
    activeIndex -= 1;
    renderStep();
  });
  nextButton?.addEventListener('click', () => {
    if (completed) return;
    if (activeIndex >= steps.length - 1) {
      completeReadingExperience();
      return;
    }
    activeIndex += 1;
    renderStep();
  });
  replayButton?.addEventListener('click', replayReadingExperience);
  document.addEventListener('myeongha:localechange', () => {
    if (!mayRenderCurrentStoredRecord()) return;
    renderStep();
    if (completed) completeReadingExperience();
    if (isStoredRecord && preview.record) {
      renderStoredReportEvidence(preview.calculationSummary);
      const date = document.querySelector('[data-official-report-date]');
      if (date) date.textContent = new Intl.DateTimeFormat(getUiLocale(), {
        year: 'numeric', month: 'long', day: 'numeric',
      }).format(new Date(preview.record.completedAt));
      const reader = document.querySelector('[data-official-report-reader]');
      if (reader) {
        reader.textContent = preview.record.readerCharacterIds
          .map((id) => resolveCharacterDisplayNameV1(id, getUiLocale()) ?? id).join(', ') || '—';
      }
    }
  });

  root.dataset.readingRouteState = isStoredRecord ? 'persisted_record' : 'preview';
  root.dataset.previewReaderVoice = 'disabled';
  root.dataset.readingExperience = isStoredRecord ? 'reading' : 'entering';
  if (isStoredRecord) root.dataset.readingRecordMode = 'official_archive';
  else delete root.dataset.readingRecordMode;
  if (routeState) routeState.hidden = true;
  if (stage) stage.hidden = false;
  if (completionCopy && !isStoredRecord) {
    completionCopy.textContent =
      '이 프리뷰는 공식 풀이 기록에 저장되지 않습니다. 다른 사주 읽기는 사주 페이지에서 선택할 수 있습니다.';
  }
  if (isStoredRecord) {
    clearPersistedReadingPresentation();
    if (stage) stage.setAttribute('aria-label', '저장된 공식 사주 풀이');
    configurePersistedReadingNavigation();
    if (completionTitle) {
      completionTitle.textContent = '저장된 공식 사주 풀이를 끝까지 확인했습니다.';
    }
    if (completionCopy) {
      completionCopy.textContent =
        '이 결과는 기록에 저장된 Official Reading입니다. 대화를 시작하려면 대화 상대를 새로 선택해 주세요.';
    }
    if (productTitle) productTitle.textContent = '저장된 사주 풀이';
    document.title = '저장된 공식 사주 보고서 · 명하';
    if (reportReturn) reportReturn.hidden = false;
    renderAuthorizedStoredReport(preview, preview.record);
    if (stage && report && !report.hidden) stage.hidden = true;

    reportStepMode?.addEventListener('click', () => {
      if (!activeReadingOwner || !ensureResponseOwnerCurrent(activeReadingOwner)) return;
      if (report) report.hidden = true;
      if (stage) stage.hidden = false;
      root.dataset.readingRecordMode = 'step_by_step';
      stepTitle?.focus();
    });
    reportReturn?.addEventListener('click', () => {
      if (!activeReadingOwner || !ensureResponseOwnerCurrent(activeReadingOwner)) return;
      if (stage) stage.hidden = true;
      if (report) report.hidden = false;
      root.dataset.readingRecordMode = 'official_archive';
      reportHeading?.focus();
    });
  }
  renderCalculationSummary(preview.calculationSummary);
  renderStep();

  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  window.setTimeout(() => {
    if (!completed && root.dataset.readingExperience === 'entering') {
      root.dataset.readingExperience = 'reading';
    }
  }, reducedMotion ? 0 : 1550);
}

async function loadPersistedReading() {
  let activeBearer;
  try {
    activeBearer = await getActiveBearer();
  } catch {
    renderPersistedReadingFailure(
      '저장된 풀이를 불러오지 못했습니다.',
      '현재 세션을 확인하지 못했습니다. 기록 페이지에서 다시 시도해 주세요.',
    );
    return;
  }

  if (!activeBearer) {
    renderPersistedReadingFailure(
      '저장된 풀이를 보려면 현재 세션이 필요합니다.',
      '로그인하거나 게스트 세션을 다시 연결한 뒤 기록 페이지에서 열어 주세요.',
      'persisted_record_auth_required',
    );
    return;
  }

  const owner = captureActiveReadingOwner(activeBearer);
  if (owner === null) {
    renderReadingAccountChanged();
    return;
  }
  activeReadingOwner = owner;

  try {
    const endpoint = new URL(OFFICIAL_READING_RECORD_ENDPOINT, window.location.origin);
    endpoint.searchParams.set('readingId', persistedReadingHandoff.readingId);
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Accept-Language': getUiLocale(),
        Authorization: `Bearer ${activeBearer.token}`,
      },
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const payload = await readJson(response);
    if (!ensureResponseOwnerCurrent(owner)) return;

    if (response.status === 401) {
      invalidateActiveBearer(activeBearer);
      renderPersistedReadingFailure(
        '세션을 다시 확인해 주세요.',
        '현재 세션이 만료되었습니다. 기록 페이지에서 다시 열어 주세요.',
        'persisted_record_auth_required',
      );
      return;
    }
    if (response.status === 404 || publicErrorCode(payload) === 'NOT_FOUND') {
      renderPersistedReadingFailure(
        '저장된 풀이를 찾을 수 없습니다.',
        '현재 계정의 기록에서 이 Official Reading을 확인할 수 없습니다.',
        'persisted_record_not_found',
      );
      return;
    }
    if (!response.ok || !payload || payload.ok !== true) {
      renderPersistedReadingFailure(
        '저장된 풀이를 잠시 불러올 수 없습니다.',
        'Records 저장 결과 조회가 일시적으로 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.',
      );
      return;
    }

    const record = parseOfficialReadingRecordPayloadV1(payload.data);
    if (
      record.readingId !== persistedReadingHandoff.readingId
      || record.readingSessionId !== persistedReadingHandoff.readingSessionId
      || record.sajuDomain !== persistedReadingHandoff.sajuDomain
    ) {
      renderPersistedReadingFailure(
        '저장된 풀이 연결 정보가 일치하지 않습니다.',
        '다른 기록이나 현재 프리뷰로 대신 표시하지 않습니다. 기록 페이지에서 다시 열어 주세요.',
        'persisted_record_identity_mismatch',
      );
      return;
    }

    const readingView = previewStepsFromPayload({
      ok: true,
      data: { lifecycle: 'preview', reading: record.reading },
    });
    if (!readingView) {
      renderPersistedReadingFailure(
        '저장된 풀이를 표시할 수 없습니다.',
        '저장된 Official Reading이 현재 표시 가능한 완료 상태가 아닙니다.',
      );
      return;
    }

    activatePreviewReading({ ...readingView, source: 'record', record });
  } catch {
    renderPersistedReadingFailure(
      '저장된 풀이를 잠시 불러올 수 없습니다.',
      '네트워크 연결 또는 Records 조회 상태를 확인한 뒤 다시 시도해 주세요.',
    );
  }
}

async function loadPreviewReading() {
  let activeBearer;
  try {
    activeBearer = await getActiveBearer();
  } catch {
    renderPreviewFailure(
      '현재 사주 프리뷰를 불러오지 못했습니다.',
      '세션을 확인하지 못했습니다. 사주 페이지에서 다시 시도해 주세요.',
    );
    return;
  }

  if (!activeBearer) {
    renderPreviewFailure(
      `${route.label} 프리뷰를 보려면 내 사주가 필요합니다.`,
      '사주 페이지에서 출생정보를 등록한 뒤 이 읽기를 다시 열어 주세요.',
      'preview_requires_profile',
    );
    return;
  }

  const owner = captureActiveReadingOwner(activeBearer);
  if (owner === null) {
    renderReadingAccountChanged();
    return;
  }
  activeReadingOwner = owner;

  try {
    const response = await fetch(SAJU_PREVIEW_READING_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Language': getUiLocale(),
        Authorization: `Bearer ${activeBearer.token}`,
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify({ readingText: engineRequest.readingText }),
    });
    const payload = await readJson(response);
    if (!ensureResponseOwnerCurrent(owner)) return;

    if (response.status === 401) {
      invalidateActiveBearer(activeBearer);
      renderPreviewFailure(
        '세션을 다시 확인해 주세요.',
        '현재 세션이 만료되었습니다. 사주 페이지에서 다시 시작해 주세요.',
        'preview_auth_required',
      );
      return;
    }
    if (response.status === 404 || publicErrorCode(payload) === 'NOT_FOUND') {
      renderPreviewFailure(
        `${route.label} 프리뷰를 보려면 내 사주가 필요합니다.`,
        '현재 Birth Profile을 찾지 못했습니다. 사주 페이지에서 출생정보를 확인해 주세요.',
        'preview_requires_profile',
      );
      return;
    }
    if (response.status === 409 || publicErrorCode(payload) === 'SAJU_PREVIEW_READING_UNAVAILABLE') {
      renderAuthorityBlockedRoute();
      return;
    }
    if (!response.ok) {
      renderPreviewFailure(
        '사주 프리뷰를 잠시 불러올 수 없습니다.',
        '검증된 Preview Reading 연결이 일시적으로 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.',
      );
      return;
    }

    const preview = previewStepsFromPayload(payload, { requireBrowserAdmission: true });
    if (!preview) {
      renderPreviewFailure(
        '현재 이 사주 프리뷰를 표시할 수 없습니다.',
        '검증된 Reading 응답이 표시 가능한 상태가 아닙니다. 다른 풀이로 대신 보여드리지 않습니다.',
      );
      return;
    }
    activatePreviewReading(preview);
  } catch {
    renderPreviewFailure(
      '사주 프리뷰를 잠시 불러올 수 없습니다.',
      '네트워크 연결 또는 Preview Reading 서비스 상태를 확인한 뒤 다시 시도해 주세요.',
    );
  }
}

const chartDialog = document.querySelector('[data-chart-dialog]');
document.querySelector('[data-chart-open]')?.addEventListener('click', () => {
  if (chartDialog && typeof chartDialog.showModal === 'function') chartDialog.showModal();
});
document.querySelector('[data-chart-close]')?.addEventListener('click', () => {
  if (chartDialog && typeof chartDialog.close === 'function') chartDialog.close();
});

if (stage) stage.hidden = true;
if (routeState) routeState.hidden = false;

if (persistedReadingHandoff.state === 'invalid') {
  renderPersistedReadingHandoffInvalid();
} else if (persistedReadingHandoff.state === 'ready') {
  renderPersistedReadingLoading();
  void loadPersistedReading();
} else if (!route.valid) {
  renderInvalidRoute();
} else if (previewEligible) {
  renderPreviewLoading();
  void loadPreviewReading();
} else {
  renderAuthorityBlockedRoute();
}
