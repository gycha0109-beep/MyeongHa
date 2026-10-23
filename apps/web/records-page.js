import { resolveCanonicalCharacterPresentationV1 } from './character-presentation-identity.js';
import { readerProvenanceLocaleLabelV1 } from './reader-provenance-locale.js';
import { getUiLocale, translateStaticUi } from './ui-i18n.js';
import { recordsBirthRevisionV1, recordsBirthUnavailableV1, recordsReadingSummaryV1, recordsTimestampV1 } from './records-page-ui-locale.js';
import { createRecordsRuntimeClient, RecordsRuntimeError } from './records-runtime-client.js';
import { buildPersistedReadingHandoffUrlV1 } from './reading-history-handoff.js';
import { buildChatThreadUrlV1 } from './chat-open-client.js';
import { parseVerifiedReaderRecordsEntryV1 } from './commerce-reader-records-continuity.js';

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
  const verifiedReaderEntry = parseVerifiedReaderRecordsEntryV1(params);
  if (requestedTab === 'saju' || fromReading
      || verifiedReaderEntry.state === 'ready') {
    const sajuTab = tabs.find((tab) => tab.id === 'saju-records-tab');
    if (sajuTab) {
      activate(sajuTab);
      document.body.dataset.recordsEntry = fromReading ? 'reading-handoff' : 'saju-deeplink';
    }
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

function renderBirthProfileUnavailable(message = recordsBirthUnavailableV1(getUiLocale())) {
  const target = byId('birth-records-list');
  clear(target);
  const card = textElement('article', 'panel side-card', '');
  card.append(uiElement('h3', '', '출생 정보 확인'));
  card.append(textElement('p', 'muted', message));
  target.append(card);
}

function renderCurrentBirthProfile(birth) {
  if (birth?.status !== 'ready') {
    renderBirthProfileUnavailable();
    return;
  }

  const target = byId('birth-records-list');
  const profile = birth.payload?.birthProfile;
  if (profile === null) {
    clear(target);
    const card = textElement('article', 'panel side-card', '');
    card.append(uiElement('h3', '', '아직 등록된 출생 정보가 없습니다.'));
    card.append(uiElement('p', 'muted', '현재 계정의 본인 출생 정보가 저장되면 이곳에 표시됩니다.'));
    const link = uiElement('a', 'records-birth-link', '출생 정보 입력하기 →');
    link.href = 'birth.html';
    card.append(link);
    target.append(card);
    return;
  }
  if (!profile || !profile.currentRevision?.input) {
    renderBirthProfileUnavailable();
    return;
  }

  const { revisionNo, input } = profile.currentRevision;
  const calendar = input.calendarType === 'solar'
    ? '양력'
    : input.isLeapMonth ? '음력 · 윤달' : '음력';
  const birthTime = input.timeKnown ? input.birthTime.slice(0, 5) : '시간 모름';
  const sex = {
    male: '남성',
    female: '여성',
    unspecified: '미지정',
  }[input.sex] ?? '미입력';

  clear(target);
  const card = textElement('article', 'panel side-card records-birth-card', '');
  card.append(uiElement('h3', '', '현재 등록된 출생 정보'));
  card.append(uiElement('p', 'records-birth-description',
    '서버가 확인한 현재 본인 출생 정보입니다. 과거 수정 이력이나 사주 풀이 결과가 아닙니다.'));

  const facts = document.createElement('dl');
  facts.className = 'records-birth-facts';
  for (const [title, value] of [
    ['생년월일', input.birthDate.replaceAll('-', '.')],
    ['태어난 시간', birthTime],
    ['달력 기준', calendar],
    ['성별 정보', sex],
  ]) {
    const row = document.createElement('div');
    row.append(uiElement('dt', '', title), textElement('dd', '', uiText(value)));
    facts.append(row);
  }
  card.append(facts);
  card.append(textElement('span', 'records-birth-revision', recordsBirthRevisionV1(revisionNo, getUiLocale())));
  target.append(card);
}

function renderLifeFacts(payload) {
  const target = byId('life-records-list');
  clear(target);
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
  return SAJU_DOMAIN_PRESENTATION[sajuDomain] ?? Object.freeze({ icon: '命', title: '사주 풀이' });
}

function productResponseStateLabel(value) {
  if (value === 'delivered' || value === 'delivered_with_fallback') return '완료';
  if (value === 'clarification_required') return '추가 확인 필요';
  return '저장됨';
}

let displayedRecords = null;
let recordsStatusSource = '기록을 불러오는 중입니다…';

function isPersistedReadingOpenableState(value) {
  return value === 'delivered' || value === 'delivered_with_fallback';
}

const readerBadgeSources = new WeakMap();
document.addEventListener('myeongha:localechange', () => {
  // Repaint only browser-authored UI from an already loaded snapshot; never refetch history.
  if (displayedRecords) {
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

const READER_CONTINUITY_HINT = /^[a-z][a-z0-9_-]{0,63}$/u;

function appendCurrentReaderAccessControl(card, reading, readerCharacterId, autoCheck = false) {
  if (typeof reading?.readingId !== 'string'
      || typeof readerCharacterId !== 'string'
      || !READER_CONTINUITY_HINT.test(readerCharacterId)) return;

  const name = resolveCanonicalCharacterPresentationV1(readerCharacterId)?.name ?? '이 대리자';
  const controls = document.createElement('section');
  controls.className = 'records-reader-current-access';
  controls.dataset.readerCharacterId = readerCharacterId;
  controls.setAttribute('aria-label', name + '의 현재 유료 해설·대화 접근 확인');

  const button = textElement('button', 'records-reader-current-action', name + ' 대화 권한 확인');
  button.type = 'button';
  const status = textElement('p', 'records-reader-current-status', '');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  controls.append(button, status);
  card.append(controls);

  let generation = 0;
  button.addEventListener('click', async () => {
    const ownRequest = ++generation;
    button.disabled = true;
    status.replaceChildren();
    status.textContent = '현재 Reader 구매권과 대화방을 확인하고 있습니다…';
    try {
      const result = await createRecordsRuntimeClient().readReaderContinuity({
        readingId: reading.readingId,
        readerCharacterId,
      });
      if (!controls.isConnected || generation !== ownRequest) return;
      controls.dataset.currentAccess = '';
      if (result.state === 'held') {
        status.textContent = '유료 Reader 대화 연결은 준비 중입니다. 저장된 공식 사주 보고서의 열람과는 별개입니다.';
      } else if (result.state === 'not_confirmed') {
        status.textContent = '현재 계정에서 이 Reader의 접근을 확인할 수 없습니다. 과거 구매·대리자 기록은 현재 이용권이 아닙니다.';
      } else if (result.state === 'not_available'
          && result.purchaseState === 'verified_full_cancellation') {
        controls.dataset.currentAccess = 'cancelled';
        status.textContent = '검증된 원거래 전액취소와 해당 Reader 구매권 회수가 확인되었습니다. 이 구매권으로 유료 해설을 생성·재열람하거나 원문을 기억에 재주입할 수 없습니다. 일반 캐릭터 채팅과 기존 공식 사주 보고서는 별도 접근 정책을 따릅니다.';
      } else if (result.state === 'not_available'
          && result.purchaseState === 'current_verified_purchase') {
        controls.dataset.currentAccess = 'reader-unavailable';
        status.textContent = '정상 구매권은 확인되지만 현재 연결 가능한 Reader 대화방 또는 정책 승인이 확인되지 않습니다. 유료 해설 접근은 계속 차단됩니다.';
      } else if (result.state === 'not_available') {
        controls.dataset.currentAccess = 'not-confirmed';
        status.textContent = '현재 이 Reader의 유료 해설·후속 대화 권한이 확인되지 않았습니다. 환불·권한 회수·만료 여부를 임의로 단정하지 않습니다.';
      } else if (result.state === 'existing_thread_candidate') {
        controls.dataset.currentAccess = 'currently-authorized';
        status.textContent = '현재 확인된 대화방입니다. 이동 후 서버에서 Reader 구매권을 다시 확인합니다. ';
        const link = textElement('a', 'records-reader-current-thread', '기존 대화방으로 이동 →');
        link.href = buildChatThreadUrlV1(result.threadId);
        status.append(link);
      }
    } catch {
      if (controls.isConnected && generation === ownRequest) {
        status.textContent = 'Reader 권한 상태를 불러오지 못했습니다. 다시 확인할 수 있습니다.';
      }
    } finally {
      if (controls.isConnected && generation === ownRequest) button.disabled = false;
    }
  });
  if (autoCheck) button.click();
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
    // Historical Reader provenance does not imply a current entitlement.
    // Require an explicit server-side check per historically associated Reader.
    card.append(textElement('p', 'records-reading-provenance-note',
      '위 대리자 정보는 해설 이력이며 현재 이용권을 의미하지 않습니다.'));
    for (const readerId of new Set(reading.readerCharacterIds ?? [])) {
      appendCurrentReaderAccessControl(card, reading, readerId);
    }
  } else {
    appendReadingFooter(
      card,
      `Reading contract · ${String(reading.readingContractVersion ?? '—')}`,
      { href: null, label: '완료 후 다시 열 수 있습니다.' },
    );
  }
  card.dataset.officialReadingId = String(reading.readingId);
  target.append(card);
}

function renderSajuReadingEmpty(target) {
  const empty = document.createElement('article');
  empty.className = 'records-reading-empty';
  empty.append(uiElement('h3', '', '아직 저장된 사주 풀이가 없습니다.'));
  empty.append(uiElement('p', 'muted', '완료된 사주 풀이가 저장되면 이곳에서 풀이 이력을 확인할 수 있습니다.'));
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
  const readings = requireArray(readingPayload, 'readings');
  if (readings.length > 0) {
    for (const reading of readings) renderPersistedReading(target, reading);
    const entry = parseVerifiedReaderRecordsEntryV1(window.location.search);
    if (entry.state === 'ready') {
      const selected = readings.find(reading => reading.readingId === entry.readingId);
      if (selected) {
        const highlight = [...target.children].find(card =>
          card.dataset.officialReadingId === entry.readingId);
        if (highlight) {
          highlight.classList.add('records-reading-card--purchase-entry');
          const note = textElement('p', 'records-reading-purchase-note',
            '요청하신 공식 사주 기록입니다. 진입 링크의 구매 정보는 이용권이 아니며, Reader 대화 권한은 서버가 다시 확인합니다.');
          highlight.prepend(note);
          const existing = [...highlight.querySelectorAll('.records-reader-current-access')]
            .find(section => section.dataset.readerCharacterId === entry.readerCharacterId);
          if (existing) {
            existing.querySelector('button')?.click();
          } else {
            appendCurrentReaderAccessControl(highlight, selected, entry.readerCharacterId, true);
          }
        }
      } else {
        const info = textElement('p', 'records-reader-entry-note',
          '요청하신 공식 Reading이 현재 계정의 기록에서 확인되지 않습니다. 진입 링크만으로 보고서 소유권이나 Reader 이용권을 확정하지 않습니다.');
        target.prepend(info);
      }
    }
    return;
  }
  const entry = parseVerifiedReaderRecordsEntryV1(window.location.search);
  if (entry.state === 'ready') {
    target.append(textElement('p', 'records-reader-entry-note',
      '요청하신 공식 사주 기록이 아직 이 계정의 기록 목록에서 확인되지 않습니다. 영수증·URL만으로 보고서 생성이나 유료 해설 제공 완료를 인정하지 않습니다.'));
    renderSajuReadingEmpty(target);
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
    copy.append(uiElement('h3', '', '아직 저장된 기억이 없습니다.'));
    copy.append(uiElement('p', '', '대화와 기록이 쌓이면 이곳에서 다시 확인할 수 있습니다.'));

    empty.append(rule, ornament, copy);
    target.append(empty);
    return;
  }
  for (const memory of memories) {
    const item = document.createElement('div');
    item.className = 'timeline-item';
    item.append(sourceElement('strong', '', String(memory.memoryType ?? uiText('기억 항목'))));
    item.append(sourceElement('span', 'fine', formatStoredValue(memory.contentJsonb)));
    const provenance = memory.createdByCharacterId ? `${memory.createdByCharacterId} · ${formatTimestamp(memory.createdAt)}` : formatTimestamp(memory.createdAt);
    item.append(sourceElement('span', 'fine', provenance));
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
    recordsStatusSource = '기록을 확인하려면 현재 세션이 필요합니다. 로그인하거나 게스트 세션을 다시 연결한 뒤 확인해 주세요.';
  } else {
    recordsStatusSource = '현재 기록을 불러올 수 없습니다. 잠시 뒤 다시 확인해 주세요.';
  }
  status.textContent = uiText(recordsStatusSource);
}

function renderLoadedRecords(records) {
  renderProfile(records.profile);
  renderCurrentBirthProfile(records.birth);
  renderLifeFacts(records.lifeFacts);
  renderSajuReadings(records.readings, records.lifeFacts);
  renderMemories(records.memories);
}

async function boot() {
  setupTabs();
  const status = byId('records-status');
  status.hidden = false;
  status.textContent = uiText(recordsStatusSource);
  byId('records-content').hidden = true;
  try {
    const records = await createRecordsRuntimeClient().readRecords();
    renderLoadedRecords(records);
    displayedRecords = records;
    setReady();
  } catch (error) {
    setFailure(error);
  }
}

void boot();