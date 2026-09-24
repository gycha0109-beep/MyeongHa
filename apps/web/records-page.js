import { resolveCanonicalCharacterPresentationV1 } from './character-presentation-identity.js';
import { createRecordsRuntimeClient, RecordsRuntimeError } from './records-runtime-client.js';
import { buildPersistedReadingHandoffUrlV1 } from './reading-history-handoff.js';

const SAMPLE_SAJU_FACT_TYPE = 'sample_saju_reading_result';
const SAMPLE_SAJU_SCHEMA_VERSION = 'sample.v1';
const DEVELOPMENT_SAMPLE_HOSTS = Object.freeze(new Set(['localhost', '127.0.0.1', '::1', '[::1]']));

const SAJU_DOMAIN_PRESENTATION = Object.freeze({
  general: Object.freeze({ icon: '命', title: '전체 사주' }),
  family: Object.freeze({ icon: '家', title: '가족' }),
  relationship: Object.freeze({ icon: '緣', title: '관계' }),
  compatibility: Object.freeze({ icon: '合', title: '궁합' }),
  career: Object.freeze({ icon: '職', title: '직업 · 커리어' }),
  business: Object.freeze({ icon: '商', title: '사업' }),
  wealth: Object.freeze({ icon: '財', title: '재물' }),
  life_stage: Object.freeze({ icon: '生', title: '삶의 단계' }),
  question_specific: Object.freeze({ icon: '問', title: '지금 고민으로 보기' }),
});

function byId(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing records page element: ${id}`);
  return element;
}

function clear(element) {
  element.replaceChildren();
}

function textElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function formatTimestamp(value) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return '—';
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}

function formatStoredValue(value) {
  if (value === null) return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return '[표시할 수 없는 기록]';
  }
}

function requireArray(payload, key) {
  if (!Array.isArray(payload?.[key])) {
    throw new RecordsRuntimeError('WEB_RECORDS_MALFORMED_RESPONSE', `Records payload is missing ${key}.`);
  }
  return payload[key];
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSampleSajuReadingFact(fact) {
  return fact?.factType === SAMPLE_SAJU_FACT_TYPE
    && fact?.schemaVersion === SAMPLE_SAJU_SCHEMA_VERSION
    && isPlainObject(fact?.valueJsonb)
    && fact.valueJsonb.sample === true;
}

function allowsDevelopmentSajuSamples() {
  return DEVELOPMENT_SAMPLE_HOSTS.has(window.location.hostname.toLowerCase());
}

function asNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map(asNonEmptyString).filter(Boolean);
}

function setupTabs() {
  const tabs = Array.from(document.querySelectorAll('.records-tab[role="tab"]'));
  const panels = Array.from(document.querySelectorAll('.records-tab-panel[role="tabpanel"]'));

  function activate(tab) {
    const targetId = tab.getAttribute('aria-controls');
    for (const candidate of tabs) candidate.setAttribute('aria-selected', candidate === tab ? 'true' : 'false');
    for (const panel of panels) panel.hidden = panel.id !== targetId;
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activate(tab));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const delta = event.key === 'ArrowRight' ? 1 : -1;
      const next = tabs[(index + delta + tabs.length) % tabs.length];
      next.focus();
      activate(next);
    });
  });

  const params = new URLSearchParams(window.location.search);
  const requestedTab = params.get('tab');
  const fromReading = params.get('from') === 'reading';
  if (requestedTab === 'saju' || fromReading) {
    const sajuTab = tabs.find((tab) => tab.id === 'saju-records-tab');
    if (sajuTab) {
      activate(sajuTab);
      document.body.dataset.recordsEntry = fromReading ? 'reading-handoff' : 'saju-deeplink';
    }
  }
}

function renderProfile(payload) {
  const name = payload?.profile?.displayName;
  byId('records-display-name').textContent = typeof name === 'string' && name.trim().length > 0 ? name : '호칭 미설정';
  const kind = payload?.subjectKind === 'member' ? '회원 기록' : payload?.subjectKind === 'guest' ? '게스트 기록' : '현재 기록';
  byId('records-subject-kind').textContent = kind;
}

function renderBirthProfileUnavailable() {
  const target = byId('birth-records-list');
  clear(target);
  const card = textElement('article', 'panel side-card', '');
  card.append(textElement('h3', '', '아직 표시할 명식록이 없습니다.'));
  card.append(textElement('p', 'muted', '저장된 명식을 이 화면에서 확인할 수 있게 되면 이곳에 표시됩니다. 확인되지 않은 정보는 대신 보여드리지 않습니다.'));
  target.append(card);
}

function renderLifeFacts(payload) {
  const target = byId('life-records-list');
  clear(target);
  const facts = requireArray(payload, 'facts').filter((fact) => !isSampleSajuReadingFact(fact));
  if (facts.length === 0) {
    target.append(textElement('p', 'muted records-empty', '아직 남아 있는 현세록이 없습니다.'));
    return;
  }
  for (const fact of facts) {
    const row = document.createElement('div');
    row.className = 'ledger-row';
    row.append(textElement('div', '', formatTimestamp(fact.confirmedAt)));
    const detail = document.createElement('div');
    detail.append(textElement('strong', '', String(fact.factType ?? '기록 항목')));
    detail.append(document.createElement('br'));
    detail.append(textElement('span', 'fine', formatStoredValue(fact.valueJsonb)));
    row.append(detail);
    row.append(textElement('div', '', fact.revokedAt ? '철회됨' : '기록됨'));
    target.append(row);
  }
}

function readingPresentation(sajuDomain) {
  return SAJU_DOMAIN_PRESENTATION[sajuDomain] ?? Object.freeze({ icon: '命', title: '사주 풀이' });
}

function productResponseStateLabel(value) {
  if (value === 'delivered' || value === 'delivered_with_fallback') return '완료';
  if (value === 'clarification_required') return '추가 확인 필요';
  return '저장됨';
}

function isPersistedReadingOpenableState(value) {
  return value === 'delivered' || value === 'delivered_with_fallback';
}

function readerProvenanceLabel(readerCharacterIds) {
  if (!Array.isArray(readerCharacterIds) || readerCharacterIds.length === 0) return 'Reader 기록 없음';
  const names = readerCharacterIds.map((characterId) =>
    resolveCanonicalCharacterPresentationV1(characterId)?.name ?? '대리자');
  if (names.length === 1) return `${names[0]}에게`;
  return `${names.join(' · ')}에게`;
}

function appendReadingFooter(card, leftText, options = {}) {
  const footer = document.createElement('div');
  footer.className = 'records-reading-footer';
  footer.append(textElement('span', 'fine', leftText));
  if (options.href === null) {
    footer.append(textElement('span', 'fine', options.label ?? '현재 다시 열 수 없습니다.'));
    card.append(footer);
    return;
  }
  const link = document.createElement('a');
  link.href = options.href ?? 'reading.html';
  link.textContent = options.label ?? '사주 페이지에서 보기 →';
  footer.append(link);
  card.append(footer);
}

function renderPersistedReading(target, reading) {
  const presentation = readingPresentation(reading.sajuDomain);
  const card = document.createElement('article');
  card.className = 'records-reading-card records-reading-card--persisted';

  const top = document.createElement('div');
  top.className = 'records-reading-top';
  const identity = document.createElement('div');
  identity.className = 'records-reading-identity';
  identity.append(textElement('span', 'records-reading-icon', presentation.icon));
  const heading = document.createElement('div');
  const eyebrow = document.createElement('div');
  eyebrow.className = 'records-reading-eyebrow';
  eyebrow.append(textElement('span', 'records-reading-badge', readerProvenanceLabel(reading.readerCharacterIds)));
  eyebrow.append(textElement('span', 'records-reading-period', productResponseStateLabel(reading.productResponseState)));
  heading.append(eyebrow, textElement('h3', 'records-reading-title', presentation.title));
  identity.append(heading);
  top.append(identity);
  top.append(textElement('span', 'records-reading-date', formatTimestamp(reading.completedAt)));
  card.append(top);

  const openable = isPersistedReadingOpenableState(reading.productResponseState);
  card.append(textElement(
    'p',
    'records-reading-summary',
    openable
      ? `${formatTimestamp(reading.completedAt)}에 본 ${presentation.title} 기록입니다. 저장된 공식 풀이를 그대로 다시 열 수 있습니다.`
      : `${formatTimestamp(reading.completedAt)}의 ${presentation.title} 기록입니다. 완료된 Official Reading만 다시 열 수 있습니다.`,
  ));
  if (openable) {
    const handoffUrl = buildPersistedReadingHandoffUrlV1({
      readingId: reading.readingId,
      readingSessionId: reading.readingSessionId,
      sajuDomain: reading.sajuDomain,
    });
    appendReadingFooter(
      card,
      `Reading contract · ${String(reading.readingContractVersion ?? '—')}`,
      { href: handoffUrl, label: '저장된 풀이 열기 →' },
    );
  } else {
    appendReadingFooter(
      card,
      `Reading contract · ${String(reading.readingContractVersion ?? '—')}`,
      { href: null, label: '완료 후 다시 열 수 있습니다.' },
    );
  }
  target.append(card);
}

function renderSajuReadingEmpty(target) {
  const empty = document.createElement('article');
  empty.className = 'records-reading-empty';
  empty.append(textElement('h3', '', '아직 저장된 사주 풀이가 없습니다.'));
  empty.append(textElement('p', 'muted', '완료된 사주 풀이가 저장되면 이곳에서 풀이 이력을 확인할 수 있습니다.'));
  target.append(empty);
}

function renderSajuReadingSamples(target, lifeFactsPayload) {
  const sampleFacts = requireArray(lifeFactsPayload, 'facts').filter(isSampleSajuReadingFact);

  if (sampleFacts.length === 0) {
    renderSajuReadingEmpty(target);
    return;
  }

  for (const fact of sampleFacts) {
    const value = fact.valueJsonb;
    const title = asNonEmptyString(value.title) ?? '사주 풀이';
    const period = asNonEmptyString(value.period);
    const summary = asNonEmptyString(value.summary) ?? '샘플 풀이 요약이 없습니다.';
    const keywords = asStringArray(value.keywords);
    const highlights = asStringArray(value.highlights);

    const card = document.createElement('article');
    card.className = 'records-reading-card records-reading-card--sample';

    const top = document.createElement('div');
    top.className = 'records-reading-top';
    const identity = document.createElement('div');
    identity.className = 'records-reading-identity';
    identity.append(textElement('span', 'records-reading-icon', '職'));
    const heading = document.createElement('div');
    const eyebrow = document.createElement('div');
    eyebrow.className = 'records-reading-eyebrow';
    eyebrow.append(textElement('span', 'records-reading-badge', '개발 샘플'));
    if (period) eyebrow.append(textElement('span', 'records-reading-period', period));
    heading.append(eyebrow, textElement('h3', 'records-reading-title', title));
    identity.append(heading);
    top.append(identity);
    top.append(textElement('span', 'records-reading-date', formatTimestamp(fact.confirmedAt)));
    card.append(top);

    card.append(textElement('p', 'records-reading-summary', summary));

    if (keywords.length > 0) {
      const chips = document.createElement('div');
      chips.className = 'records-reading-keywords';
      for (const keyword of keywords) chips.append(textElement('span', 'records-reading-chip', keyword));
      card.append(chips);
    }

    if (highlights.length > 0) {
      const list = document.createElement('ul');
      list.className = 'records-reading-highlights';
      for (const highlight of highlights) list.append(textElement('li', '', highlight));
      card.append(list);
    }

    appendReadingFooter(card, '실제 Reading이 없을 때만 보이는 UI fixture');
    target.append(card);
  }
}

function renderSajuReadings(readingPayload, lifeFactsPayload) {
  const target = byId('saju-records-list');
  clear(target);
  const readings = requireArray(readingPayload, 'readings');
  if (readings.length > 0) {
    for (const reading of readings) renderPersistedReading(target, reading);
    return;
  }
  if (allowsDevelopmentSajuSamples()) {
    renderSajuReadingSamples(target, lifeFactsPayload);
    return;
  }
  renderSajuReadingEmpty(target);
}

function renderMemories(payload) {
  const target = byId('memory-records-list');
  clear(target);
  const memories = requireArray(payload, 'memories');
  if (memories.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'records-memory-empty';

    const rule = document.createElement('span');
    rule.className = 'records-memory-empty-rule';
    rule.setAttribute('aria-hidden', 'true');

    const ornament = document.createElement('span');
    ornament.className = 'records-memory-empty-ornament';
    ornament.setAttribute('aria-hidden', 'true');
    ornament.append(textElement('span', 'records-memory-empty-symbol', '之'));

    const copy = document.createElement('div');
    copy.className = 'records-memory-empty-copy';
    copy.append(textElement('h3', '', '아직 저장된 기억이 없습니다.'));
    copy.append(textElement('p', '', '대화와 기록이 쌓이면 이곳에서 다시 확인할 수 있습니다.'));

    empty.append(rule, ornament, copy);
    target.append(empty);
    return;
  }
  for (const memory of memories) {
    const item = document.createElement('div');
    item.className = 'timeline-item';
    item.append(textElement('strong', '', String(memory.memoryType ?? '기억 항목')));
    item.append(textElement('span', 'fine', formatStoredValue(memory.contentJsonb)));
    const provenance = memory.createdByCharacterId ? `${memory.createdByCharacterId} · ${formatTimestamp(memory.createdAt)}` : formatTimestamp(memory.createdAt);
    item.append(textElement('span', 'fine', provenance));
    target.append(item);
  }
}

function setReady() {
  const status = byId('records-status');
  status.hidden = true;
  status.textContent = '';
  byId('records-content').hidden = false;
}

function setFailure(error) {
  byId('records-content').hidden = true;
  const status = byId('records-status');
  status.hidden = false;
  status.setAttribute('role', 'status');
  if (error instanceof RecordsRuntimeError && error.code === 'WEB_RECORDS_SESSION_REQUIRED') {
    status.textContent = '기록을 확인하려면 현재 세션이 필요합니다. 로그인하거나 게스트 세션을 다시 연결한 뒤 확인해 주세요.';
    return;
  }
  status.textContent = '현재 기록을 불러올 수 없습니다. 잠시 뒤 다시 확인해 주세요.';
}

async function boot() {
  setupTabs();
  const status = byId('records-status');
  status.hidden = false;
  status.textContent = '기록을 불러오는 중입니다…';
  byId('records-content').hidden = true;
  try {
    const records = await createRecordsRuntimeClient().readRecords();
    renderProfile(records.profile);
    renderBirthProfileUnavailable();
    renderLifeFacts(records.lifeFacts);
    renderSajuReadings(records.readings, records.lifeFacts);
    renderMemories(records.memories);
    setReady();
  } catch (error) {
    setFailure(error);
  }
}

void boot();