import { readerProvenanceLocaleLabelV1 } from './reader-provenance-locale.js';
import { getUiLocale, translateStaticUi } from './ui-i18n.js';
import { recordsReadingSummaryV1, recordsReportCountV1, recordsTimestampV1 } from './records-page-ui-locale.js';
import { createRecordsRuntimeClient, RecordsRuntimeError } from './records-runtime-client.js';
import { buildPersistedReadingHandoffUrlV1 } from './reading-history-handoff.js';
import { readingDomainPresentationV1 } from './reading-domain-presentation.js';
import { ensureActiveBearer, readMemberSession, readGuestBearer, PRODUCT_AUTH_STORAGE_V1 } from './product-auth.js';
import { captureReadingResponseOwnerV1, isReadingResponseOwnerCurrentV1 } from './reading-response-owner-guard.js';

const SAMPLE_SAJU_FACT_TYPE = 'sample_saju_reading_result';
const SAMPLE_SAJU_SCHEMA_VERSION = 'sample.v1';
const DEVELOPMENT_SAMPLE_HOSTS = Object.freeze(new Set(['localhost', '127.0.0.1', '::1', '[::1]']));

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
  return recordsTimestampV1(value, getUiLocale());
}

function uiText(source) {
  return translateStaticUi(source, getUiLocale());
}

function uiElement(tag, className, source) {
  return textElement(tag, className, uiText(source));
}

function sourceElement(tag, className, value) {
  const element = textElement(tag, className, value);
  element.dataset.recordsSource = '';
  return element;
}

function formatStoredValue(value) {
  if (value === null) return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return uiText('[표시할 수 없는 기록]');
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
    for (const candidate of tabs) {
      candidate.setAttribute('aria-selected', candidate === tab ? 'true' : 'false');
      candidate.tabIndex = candidate === tab ? 0 : -1;
    }
    for (const panel of panels) panel.hidden = panel.id !== targetId;
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activate(tab));
    tab.addEventListener('keydown', (event) => {
      let targetIndex;
      if (event.key === 'Home') targetIndex = 0;
      else if (event.key === 'End') targetIndex = tabs.length - 1;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const delta = event.key === 'ArrowRight' ? 1 : -1;
        targetIndex = (index + delta + tabs.length) % tabs.length;
      } else return;
      event.preventDefault();
      const next = tabs[targetIndex];
      next.focus();
      activate(next);
    });
  });

  const params = new URLSearchParams(window.location.search);
  const requestedTab = params.get('tab');
  const fromReading = params.get('from') === 'reading';
  const targetTabId = fromReading || requestedTab === 'saju'
    ? 'saju-records-tab'
    : ({ life: 'life-records-tab' }[requestedTab] ?? 'saju-records-tab');
  const initialTab = tabs.find((tab) => tab.id === targetTabId);
  if (initialTab) activate(initialTab);
  if (fromReading || requestedTab === 'saju') {
    document.body.dataset.recordsEntry = fromReading ? 'reading-handoff' : 'saju-deeplink';
  }
}

function renderProfile(payload) {
  const name = payload?.profile?.displayName;
  const nameNode = byId('records-display-name');
  if (typeof name === 'string' && name.trim().length > 0) {
    nameNode.dataset.recordsSource = '';
    nameNode.textContent = name;
  } else {
    delete nameNode.dataset.recordsSource;
    nameNode.textContent = uiText('호칭 미설정');
  }
  const kind = payload?.subjectKind === 'member' ? '회원 기록' : payload?.subjectKind === 'guest' ? '게스트 기록' : '현재 기록';
  byId('records-subject-kind').textContent = uiText(kind);
}

function renderLifeFacts(payload) {
  const target = byId('life-records-list');
  clear(target);
  if (payload?.status === 'unavailable') {
    target.append(uiElement('p', 'muted records-empty', '현세록을 지금 확인할 수 없습니다. 다른 기록은 계속 확인할 수 있습니다.'));
    return;
  }
  const facts = requireArray(payload, 'facts').filter((fact) => !isSampleSajuReadingFact(fact));
  if (facts.length === 0) {
    target.append(uiElement('p', 'muted records-empty', '아직 남아 있는 현세록이 없습니다.'));
    return;
  }
  for (const fact of facts) {
    const row = document.createElement('div');
    row.className = 'ledger-row';
    row.append(textElement('div', '', formatTimestamp(fact.confirmedAt)));
    const detail = document.createElement('div');
    detail.append(sourceElement('strong', '', String(fact.factType ?? uiText('기록 항목'))));
    detail.append(document.createElement('br'));
    detail.append(sourceElement('span', 'fine', formatStoredValue(fact.valueJsonb)));
    row.append(detail);
    row.append(textElement('div', '', uiText(fact.revokedAt ? '철회됨' : '기록됨')));
    target.append(row);
  }
}

function readingPresentation(sajuDomain) {
  return readingDomainPresentationV1(sajuDomain);
}

function productResponseStateLabel(value) {
  if (value === 'delivered' || value === 'delivered_with_fallback') return '완료';
  if (value === 'clarification_required') return '추가 확인 필요';
  return '상태 확인 불가';
}

let displayedRecords = null;
let displayedRecordsOwner = null;
let recordsStatusSource = '기록을 불러오는 중입니다…';

function currentRecordsOwnerEvidence() {
  return { memberSession: readMemberSession(), guestCredential: readGuestBearer() };
}

function captureRecordsOwner(credential) {
  const evidence = currentRecordsOwnerEvidence();
  return captureReadingResponseOwnerV1(
    credential, evidence.memberSession, evidence.guestCredential,
  );
}

function isRecordsOwnerCurrent(owner) {
  const evidence = currentRecordsOwnerEvidence();
  return isReadingResponseOwnerCurrentV1(
    owner, evidence.memberSession, evidence.guestCredential,
  );
}

function clearRecordsForSessionChange() {
  displayedRecords = null;
  displayedRecordsOwner = null;
  byId('records-content').hidden = true;
  for (const id of [
    'records-display-name', 'records-subject-kind', 'life-records-list',
    'saju-records-list', 'saju-records-count',
  ]) {
    byId(id).replaceChildren();
  }
  recordsStatusSource = '계정 또는 세션이 변경되었습니다. 현재 계정의 기록을 보려면 새로고침해 주세요.';
  const status = byId('records-status');
  status.hidden = false;
  status.textContent = uiText(recordsStatusSource);
}

function onRecordsAuthChanged() {
  if (!displayedRecordsOwner) return;
  try {
    if (isRecordsOwnerCurrent(displayedRecordsOwner)) return;
  } catch {
    // Unreadable session evidence cannot keep the previous owner's records.
  }
  clearRecordsForSessionChange();
}

window.addEventListener(PRODUCT_AUTH_STORAGE_V1.changedEvent, onRecordsAuthChanged);
window.addEventListener('storage', (event) => {
  if (event.key === null || [
    PRODUCT_AUTH_STORAGE_V1.memberSession,
    PRODUCT_AUTH_STORAGE_V1.guestBearer,
    PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer,
  ].includes(event.key)) onRecordsAuthChanged();
});
window.addEventListener('pageshow', onRecordsAuthChanged);

function isPersistedReadingOpenableState(value) {
  return value === 'delivered' || value === 'delivered_with_fallback';
}

const readerBadgeSources = new WeakMap();
document.addEventListener('myeongha:localechange', () => {
  // Repaint only browser-authored UI from an already loaded snapshot; never refetch history.
  if (displayedRecords) {
    onRecordsAuthChanged();
    if (!displayedRecords) return;
    renderLoadedRecords(displayedRecords);
    return;
  }
  for (const badge of document.querySelectorAll('.records-reading-badge')) {
    const ids = readerBadgeSources.get(badge);
    if (ids) badge.textContent = readerProvenanceLocaleLabelV1(ids, getUiLocale());
  }
  const status = byId('records-status');
  if (!status.hidden && recordsStatusSource) status.textContent = uiText(recordsStatusSource);
});

function appendReadingFooter(card, leftText, options = {}) {
  const footer = document.createElement('div');
  footer.className = 'records-reading-footer';
  footer.append(textElement('span', 'fine', leftText));
  if (options.href === null) {
    footer.append(textElement('span', 'fine', uiText(options.label ?? '현재 다시 열 수 없습니다.')));
    card.append(footer);
    return;
  }
  const link = document.createElement('a');
  link.href = options.href ?? 'reading.html';
  link.textContent = uiText(options.label ?? '사주 페이지에서 보기 →');
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
  const badge = textElement('span', 'records-reading-badge',
    readerProvenanceLocaleLabelV1(reading.readerCharacterIds, getUiLocale()));
  readerBadgeSources.set(badge, reading.readerCharacterIds);
  eyebrow.append(badge);
  eyebrow.append(textElement('span', 'records-reading-period', uiText(productResponseStateLabel(reading.productResponseState))));
  heading.append(eyebrow, textElement('h3', 'records-reading-title', uiText(presentation.title)));
  identity.append(heading);
  top.append(identity);
  top.append(textElement('span', 'records-reading-date', formatTimestamp(reading.completedAt)));
  card.append(top);

  const openable = isPersistedReadingOpenableState(reading.productResponseState);
  card.append(textElement(
    'p', 'records-reading-summary',
    recordsReadingSummaryV1({
      completedAt: reading.completedAt,
      title: uiText(presentation.title),
      openable,
    }, getUiLocale()),
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
  empty.append(uiElement('h3', '', '아직 저장된 사주 풀이가 없습니다.'));
  empty.append(uiElement('p', 'muted', '완료된 사주 풀이가 저장되면 이곳에서 풀이 이력을 확인할 수 있습니다.'));
  const explore = uiElement('a', 'records-report-explore', '다른 사주 주제 둘러보기');
  explore.href = 'reading.html';
  empty.append(explore);
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
    const title = asNonEmptyString(value.title) ?? uiText('사주 풀이');
    const period = asNonEmptyString(value.period);
    const summary = asNonEmptyString(value.summary) ?? uiText('샘플 풀이 요약이 없습니다.');
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
    eyebrow.append(textElement('span', 'records-reading-badge', uiText('개발 샘플')));
    if (period) eyebrow.append(sourceElement('span', 'records-reading-period', period));
    heading.append(eyebrow, sourceElement('h3', 'records-reading-title', title));
    identity.append(heading);
    top.append(identity);
    top.append(textElement('span', 'records-reading-date', formatTimestamp(fact.confirmedAt)));
    card.append(top);

    card.append(sourceElement('p', 'records-reading-summary', summary));

    if (keywords.length > 0) {
      const chips = document.createElement('div');
      chips.className = 'records-reading-keywords';
      for (const keyword of keywords) chips.append(sourceElement('span', 'records-reading-chip', keyword));
      card.append(chips);
    }

    if (highlights.length > 0) {
      const list = document.createElement('ul');
      list.className = 'records-reading-highlights';
      for (const highlight of highlights) list.append(sourceElement('li', '', highlight));
      card.append(list);
    }

    appendReadingFooter(card, uiText('실제 Reading이 없을 때만 보이는 UI fixture'));
    target.append(card);
  }
}

function renderSajuReadings(readingPayload, lifeFactsPayload) {
  const target = byId('saju-records-list');
  clear(target);
  if (readingPayload?.status === 'unavailable') {
    byId('saju-records-count').textContent = uiText('조회할 수 없음');
    const failure = document.createElement('article');
    failure.className = 'records-reading-empty records-reading-unavailable';
    failure.append(uiElement('h3', '', '저장된 사주 보고서를 지금 확인할 수 없습니다.'));
    failure.append(uiElement('p', 'muted', '조회가 실패한 상태이며, 기록이 없다는 뜻은 아닙니다. 나중에 다시 확인해 주세요.'));
    target.append(failure);
    return;
  }
  const readings = requireArray(readingPayload, 'readings');
  // Only the authorized Reading History collection contributes to the count.
  // Development-only fixture cards must never be counted as saved reports.
  byId('saju-records-count').textContent = recordsReportCountV1(readings.length, getUiLocale());
  if (readings.length > 0) {
    for (const reading of readings) renderPersistedReading(target, reading);
    return;
  }
  if (allowsDevelopmentSajuSamples()) {
    if (lifeFactsPayload?.status === 'unavailable') renderSajuReadingEmpty(target);
    else renderSajuReadingSamples(target, lifeFactsPayload);
    return;
  }
  renderSajuReadingEmpty(target);
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
    recordsStatusSource = '기록을 확인하려면 현재 세션이 필요합니다. 로그인하거나 게스트 세션을 다시 연결한 뒤 확인해 주세요.';
  } else {
    recordsStatusSource = '현재 기록을 불러올 수 없습니다. 잠시 뒤 다시 확인해 주세요.';
  }
  status.textContent = uiText(recordsStatusSource);
}

function renderLoadedRecords(records) {
  renderProfile(records.profile);
  renderLifeFacts(records.lifeFacts);
  renderSajuReadings(records.readings, records.lifeFacts);
}

async function boot() {
  setupTabs();
  const status = byId('records-status');
  status.hidden = false;
  status.textContent = uiText(recordsStatusSource);
  byId('records-content').hidden = true;
  try {
    const bearer = await ensureActiveBearer();
    const owner = captureRecordsOwner(bearer);
    if (!owner) throw new RecordsRuntimeError('WEB_RECORDS_SESSION_CHANGED', 'Records owner is unavailable.');
    const records = await createRecordsRuntimeClient().readRecords();
    if (!isRecordsOwnerCurrent(owner)) {
      throw new RecordsRuntimeError('WEB_RECORDS_SESSION_CHANGED', 'Records owner changed during loading.');
    }
    renderLoadedRecords(records);
    displayedRecordsOwner = owner;
    displayedRecords = records;
    setReady();
  } catch (error) {
    setFailure(error);
  }
}

void boot();