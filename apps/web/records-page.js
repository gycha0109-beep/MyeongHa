import { createRecordsRuntimeClient, RecordsRuntimeError } from './records-runtime-client.js';

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
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return '[표시할 수 없는 구조화 값]';
  }
}

function requireArray(payload, key) {
  if (!Array.isArray(payload?.[key])) {
    throw new RecordsRuntimeError('WEB_RECORDS_MALFORMED_RESPONSE', `Records payload is missing ${key}.`);
  }
  return payload[key];
}

function renderProfile(payload) {
  const name = payload?.profile?.displayName;
  byId('records-display-name').textContent = typeof name === 'string' && name.trim().length > 0 ? name : '호칭 미설정';
  const kind = payload?.subjectKind === 'member' ? '회원 기록' : payload?.subjectKind === 'guest' ? '게스트 기록' : '현재 기록';
  byId('records-subject-kind').textContent = kind;
}

function renderBirthProfile(payload) {
  const target = byId('birth-records-list');
  clear(target);
  const current = payload?.currentRevision;
  if (!current || typeof current !== 'object') {
    target.append(textElement('p', 'muted', '저장된 명식 revision이 없습니다.'));
    return;
  }

  const input = current.input && typeof current.input === 'object' ? current.input : {};
  const card = textElement('article', 'panel side-card', '');
  card.append(textElement('div', 'eyebrow', `현재 revision ${String(current.revisionNo ?? '—')}`));
  card.append(textElement('h3', 'display display-md', payload.label || '나의 명식록'));
  const facts = document.createElement('div');
  facts.className = 'timeline';
  for (const [label, value] of [
    ['달력', input.calendarType ?? '—'],
    ['생년월일', input.birthDate ?? '—'],
    ['출생시간', input.timeKnown === false ? '모름' : input.birthTime ?? '—'],
    ['성별 입력', input.sex ?? '미지정'],
  ]) {
    const item = document.createElement('div');
    item.className = 'timeline-item';
    item.append(textElement('strong', '', label));
    item.append(textElement('span', 'fine', String(value)));
    facts.append(item);
  }
  card.append(facts);
  const revisions = Array.isArray(payload.revisions) ? payload.revisions : [];
  card.append(textElement('p', 'fine', `보존된 revision ${revisions.length}개 · 과거 revision은 덮어쓰지 않습니다.`));
  target.append(card);
}

function renderLifeFacts(payload) {
  const target = byId('life-records-list');
  clear(target);
  const facts = requireArray(payload, 'facts');
  if (facts.length === 0) {
    target.append(textElement('p', 'muted', '저장된 현세록 사실이 없습니다.'));
    return;
  }
  for (const fact of facts) {
    const row = document.createElement('div');
    row.className = 'ledger-row';
    row.append(textElement('div', '', formatTimestamp(fact.confirmedAt)));
    const detail = document.createElement('div');
    detail.append(textElement('strong', '', String(fact.factType ?? '알 수 없는 fact type')));
    detail.append(document.createElement('br'));
    detail.append(textElement('span', 'fine', formatStoredValue(fact.valueJsonb)));
    row.append(detail);
    row.append(textElement('div', '', fact.revokedAt ? '철회됨' : '기록됨'));
    target.append(row);
  }
}

function renderMemories(payload) {
  const target = byId('memory-records-list');
  clear(target);
  const memories = requireArray(payload, 'memories');
  if (memories.length === 0) {
    target.append(textElement('p', 'muted', '현재 저장된 대리자 기억이 없습니다.'));
    return;
  }
  for (const memory of memories) {
    const item = document.createElement('div');
    item.className = 'timeline-item';
    item.append(textElement('strong', '', String(memory.memoryType ?? '알 수 없는 memory type')));
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
    status.textContent = '기록을 보려면 현재 세션이 필요합니다. 로그인/게스트 세션 연결 후 다시 열어 주세요.';
    return;
  }
  status.textContent = '현재 기록을 불러올 수 없습니다. 서버 read authority가 연결되기 전에는 임의의 기록을 대신 표시하지 않습니다.';
}

async function boot() {
  const status = byId('records-status');
  status.hidden = false;
  status.textContent = '기록을 불러오는 중입니다…';
  byId('records-content').hidden = true;
  try {
    const records = await createRecordsRuntimeClient().readRecords();
    renderProfile(records.profile);
    renderBirthProfile(records.birthProfile);
    renderLifeFacts(records.lifeFacts);
    renderMemories(records.memories);
    setReady();
  } catch (error) {
    setFailure(error);
  }
}

void boot();
