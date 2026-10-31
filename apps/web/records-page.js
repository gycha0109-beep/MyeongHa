import { readerProvenanceLocaleLabelV1 } from './reader-provenance-locale.js';
import { getUiLocale, translateStaticUi } from './ui-i18n.js';
import { recordsReadingSummaryV1, recordsReportCountV1, recordsTimestampV1 } from './records-page-ui-locale.js';
import { createRecordsRuntimeClient, RecordsRuntimeError } from './records-runtime-client.js';
import { buildPersistedReadingHandoffUrlV1 } from './reading-history-handoff.js';
import { readingDomainPresentationV1 } from './reading-domain-presentation.js';
import { ensureActiveBearer, readMemberSession, readGuestBearer, PRODUCT_AUTH_STORAGE_V1 } from './product-auth.js';
import { captureReadingResponseOwnerV1, isReadingResponseOwnerCurrentV1 } from './reading-response-owner-guard.js';

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

function requireArray(payload, key) {
  if (!Array.isArray(payload?.[key])) {
    throw new RecordsRuntimeError('WEB_RECORDS_MALFORMED_RESPONSE', `Records payload is missing ${key}.`);
  }
  return payload[key];
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
    'records-display-name', 'records-subject-kind',
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

function renderSajuReadings(readingPayload) {
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
  renderSajuReadings(records.readings);
}

async function boot() {
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