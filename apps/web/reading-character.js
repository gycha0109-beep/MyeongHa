import { resolveReadingDetailRoute } from './reading-detail-route.js';
import { resolveSajuButtonEngineRequest } from './reading-saju-engine-request.js';
import { getActiveBearer, invalidateGuestSession, invalidateMemberSession } from './product-auth.js';
import { parsePersistedReadingHandoffV1 } from './reading-history-handoff.js';

const readerCatalog = {
  baekheon: {
    name: '백헌',
    hanja: '白憲',
    title: '충추원의 장',
    intro: '당신의 사주를 바탕으로 지금의 흐름부터 하나씩 살펴보겠습니다.',
  },
  seyeon: {
    name: '세연',
    hanja: '',
    title: '무녀',
    intro: '복잡하게 시작하지 않을게요. 지금 가장 크게 읽히는 흐름부터 같이 봐요.',
  },
  yeoul: {
    name: '여울',
    hanja: '',
    title: '설계관 기록관',
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
    title: '대리자',
    intro: '표면적인 답보다, 당신이 실제로 흔들리는 지점부터 읽어보죠.',
  },
  mira: {
    name: '미라',
    hanja: '',
    title: '대리자',
    intro: '과하게 의미 붙이지 말고, 지금 쓸 수 있는 정보부터 보죠.',
  },
  taegyeom: {
    name: '태겸',
    hanja: '',
    title: '대리자',
    intro: '근거 없는 낙관은 빼겠습니다. 확인되는 구조부터 보죠.',
  },
  yunho: {
    name: '윤호',
    hanja: '',
    title: '대리자',
    intro: '급하게 결론부터 내리지 않고, 구조와 시기를 차례대로 읽어보겠습니다.',
  },
  doyun: {
    name: '도윤',
    hanja: '',
    title: '대리자',
    intro: '일단 재미없는 설명부터 길게 하진 않을게요. 지금 걸리는 부분부터 보죠.',
  },
};

const aliases = new Map([
  ['백헌', 'baekheon'], ['세연', 'seyeon'], ['여울', 'yeoul'], ['서린', 'seorin'],
  ['라현', 'rahyeon'], ['미라', 'mira'], ['태겸', 'taegyeom'], ['윤호', 'yunho'], ['도윤', 'doyun'],
]);

const params = new URLSearchParams(window.location.search);
const persistedReadingHandoff = parsePersistedReadingHandoffV1(params);
const requestedReader = params.get('character') || params.get('reader') || 'baekheon';
const normalizedReader = aliases.get(requestedReader) || requestedReader.toLowerCase();
// Frontend integration authority: URL-selected Reader identity is presentation-only.
// When Reader Interpretation is activated, the server-returned readerCharacterId wins.
const presentationReaderHint = readerCatalog[normalizedReader] ? normalizedReader : 'baekheon';
const readerKey = presentationReaderHint;
const reader = readerCatalog[presentationReaderHint];
const route = resolveReadingDetailRoute(params);
const engineRequest = route.valid ? resolveSajuButtonEngineRequest(route) : null;
const currentYear = new Date().getFullYear();
const SAJU_PREVIEW_READING_ENDPOINT = '/api/me/saju/preview-reading';
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

root.dataset.reader = presentationReaderHint;
root.dataset.readerSelection = params.has('reader') || params.has('character') ? 'explicit' : 'default';
root.dataset.readerAuthority = 'presentation_hint_only';
root.dataset.readerPresentation = 'reading-scene-v1';
root.dataset.readingRouteState = persistedReadingHandoff.state === 'ready'
  ? 'persisted_handoff_unavailable'
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

document.querySelectorAll('[data-reader-name]').forEach((element) => { element.textContent = reader.name; });
document.querySelectorAll('[data-reader-title]').forEach((element) => {
  element.textContent = reader.title;
  element.hidden = !reader.title;
});
document.querySelectorAll('[data-reader-intro]').forEach((element) => { element.textContent = reader.intro; });
document.querySelectorAll('[data-reader-hanja]').forEach((element) => {
  element.textContent = reader.hanja;
  element.hidden = !reader.hanja;
});

const portrait = document.querySelector('[data-reader-portrait]');
if (portrait) portrait.setAttribute('aria-label', `${reader.name} 사주 읽기 장면`);

function scopeDisplay(scope) {
  if (scope === 'year') return `${currentYear}년 · 올해`;
  if (scope === 'month') return '이번 달';
  return '원국';
}

function renderInvalidRoute() {
  if (productTitle) productTitle.textContent = '사주 읽기';
  if (stateTitle) stateTitle.textContent = '요청한 읽기를 찾을 수 없습니다.';
  if (stateCopy) {
    stateCopy.textContent = '지원하지 않는 사주 읽기 주소입니다. 전체 사주나 올해의 흐름으로 자동 대체하지 않았습니다.';
  }
  document.title = '읽기를 찾을 수 없음 · 명하';
}

function renderPersistedReadingHandoffInvalid() {
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

function renderPersistedReadingHandoffUnavailable() {
  root.dataset.readingRouteState = 'persisted_handoff_unavailable';
  if (stage) stage.hidden = true;
  if (routeState) routeState.hidden = false;
  if (productTitle) productTitle.textContent = '저장된 사주 풀이';
  if (stateTitle) stateTitle.textContent = '저장된 풀이 다시 열기는 아직 연결 준비 중입니다.';
  if (stateCopy) {
    stateCopy.textContent = '저장된 Reading 식별자는 확인했습니다. Records용 공식 저장 결과 재열기 계약이 연결되기 전에는 현재 프리뷰나 Reader 장면으로 대신 보여드리지 않습니다.';
  }
  root.dataset.persistedReadingHandoff = 'records';
  root.dataset.persistedReadingDomain = persistedReadingHandoff.sajuDomain;
  document.title = '저장된 사주 풀이 · 명하';
}

function renderAuthorityBlockedRoute() {
  const scope = scopeDisplay(route.scope);
  if (productTitle) productTitle.textContent = route.topic === 'general' ? scope : `${route.label} · ${scope}`;
  if (stateTitle) stateTitle.textContent = `${route.label} 읽기는 아직 준비 중입니다.`;
  if (stateCopy) {
    if (engineRequest?.state === 'requires_input') {
      const inputCopy = {
        family_scope: '가족 읽기는 부모운 또는 자녀운을 먼저 선택해야 합니다.',
        target_person: '궁합은 상대의 명식 참조가 먼저 필요합니다.',
        question: '고민 읽기는 실제 질문을 먼저 입력해야 합니다.',
      };
      stateCopy.textContent = `${inputCopy[engineRequest.input] ?? '추가 입력이 필요합니다.'} 현재 Preview 실행 범위에 포함되지 않은 요청은 전송하지 않습니다.`;
    } else if (engineRequest?.state === 'ready') {
      stateCopy.textContent = `이 버튼은 Saju Engine의 ${engineRequest.adapterVersion} 요청 문법까지 정확히 매핑되어 있습니다. 다만 현재 가승인된 Preview 범위에는 포함되지 않아 실제 해석 요청은 전송하지 않습니다. 다른 주제의 풀이로 대신 보여드리지 않습니다.`;
    } else {
      stateCopy.textContent = '현재 제공 가능한 검증된 사주 읽기 범위가 열리지 않아 이 결과를 실행하지 않습니다. 다른 주제의 풀이로 대신 보여드리지 않습니다.';
    }
  }
  document.querySelectorAll('[data-reading-scope]').forEach((element) => { element.textContent = scope; });
  document.title = `${route.label} · 사주 해석 · 명하`;
}

function renderPreviewLoading() {
  const scope = scopeDisplay(route.scope);
  if (productTitle) productTitle.textContent = route.topic === 'general' ? scope : `${route.label} · ${scope}`;
  if (stateTitle) stateTitle.textContent = `${route.label} 프리뷰를 준비하고 있습니다.`;
  if (stateCopy) stateCopy.textContent = '현재 Birth Profile과 검증된 Saju Preview Reading을 연결하고 있습니다.';
  document.querySelectorAll('[data-reading-scope]').forEach((element) => { element.textContent = scope; });
  document.title = `${route.label} · 사주 프리뷰 · 명하`;
}

function renderPreviewFailure(title, copy, state = 'preview_unavailable') {
  root.dataset.readingRouteState = state;
  if (stage) stage.hidden = true;
  if (routeState) routeState.hidden = false;
  if (productTitle) productTitle.textContent = route.label;
  if (stateTitle) stateTitle.textContent = title;
  if (stateCopy) stateCopy.textContent = copy;
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

function previewStepsFromPayload(payload) {
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

function activatePreviewReading(preview) {
  const { steps } = preview;
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
  const chatLink = document.querySelector('[data-reading-chat-link]');
  const recordsLink = document.querySelector('[data-reading-records-link]');
  const replayButton = document.querySelector('[data-reading-replay]');
  let completed = false;

  function handoffUrl(path) {
    const next = new URL(path, window.location.href);
    next.searchParams.set('from', 'reading');
    next.searchParams.set('topic', route.topic);
    next.searchParams.set('scope', route.scope);
    return `${next.pathname.replace(/^\//, '')}${next.search}`;
  }

  function completeReadingExperience() {
    completed = true;
    root.dataset.readingExperience = 'complete';
    if (readingSheet) readingSheet.dataset.readingCompleted = 'true';
    if (completion) completion.hidden = false;
    // Saju Preview has no server-authoritative Reader identity. Do not promote
    // the presentation Reader hint into Chat character authority or a stored
    // Reading-to-Chat continuation claim. General Chat remains independently selectable.
    if (chatLink) chatLink.setAttribute('href', 'chat-hub.html');
    if (recordsLink) recordsLink.setAttribute('href', handoffUrl('records.html?tab=saju'));
  }

  function replayReadingExperience() {
    completed = false;
    activeIndex = 0;
    root.dataset.readingExperience = 'reading';
    if (readingSheet) delete readingSheet.dataset.readingCompleted;
    if (completion) completion.hidden = true;
    renderStep();
  }

  function renderStep() {
    const step = steps[activeIndex];
    if (!step) return;
    const structureParts = [...step.structure, ...step.supporting];

    if (progressLabel) progressLabel.textContent = `읽기 ${activeIndex + 1} / ${steps.length}`;
    if (stepTitle) stepTitle.textContent = step.title;
    if (stepBody) stepBody.textContent = step.primary;
    if (structureTitle) {
      structureTitle.textContent = step.structure.length > 0
        ? '이 해석의 사주 근거'
        : step.supporting.length > 0
          ? '함께 볼 포인트'
          : '이 해석을 읽는 기준';
    }
    if (structureBody) {
      structureBody.textContent = structureParts.length > 0
        ? structureParts.join('\n\n')
        : '원국에서 확인된 해석 축을 바탕으로 읽는 항목입니다.';
    }
    if (readerLine) readerLine.textContent = `${step.title} 항목을 확인합니다.`;
    if (readerComment) readerComment.textContent = previewCommentForStep();
    if (authorityNote) {
      authorityNote.textContent = 'Preview · 연구 검증 중인 원국 해석이며 확정적 미래 예측은 포함하지 않습니다.';
      if (preview.notice) authorityNote.title = preview.notice;
    }
    if (previousButton) previousButton.disabled = activeIndex === 0;
    if (nextButton) nextButton.disabled = false;
    if (nextLabel) nextLabel.textContent = activeIndex >= steps.length - 1 ? '읽기 마치기' : '다음 읽기';
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

  root.dataset.readingRouteState = 'preview';
  root.dataset.previewReaderVoice = 'disabled';
  root.dataset.readingExperience = 'entering';
  if (routeState) routeState.hidden = true;
  if (stage) stage.hidden = false;
  renderCalculationSummary(preview.calculationSummary);
  renderStep();

  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  window.setTimeout(() => {
    if (!completed && root.dataset.readingExperience === 'entering') {
      root.dataset.readingExperience = 'reading';
    }
  }, reducedMotion ? 0 : 1550);
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

  try {
    const response = await fetch(SAJU_PREVIEW_READING_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${activeBearer.token}`,
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify({ readingText: engineRequest.readingText }),
    });
    const payload = await readJson(response);

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

    const preview = previewStepsFromPayload(payload);
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
  renderPersistedReadingHandoffUnavailable();
} else if (!route.valid) {
  renderInvalidRoute();
} else if (previewEligible) {
  renderPreviewLoading();
  void loadPreviewReading();
} else {
  renderAuthorityBlockedRoute();
}
