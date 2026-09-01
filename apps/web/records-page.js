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
  const facts = requireArray(payload, 'facts');
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

function renderMemories(payload) {
  const target = byId('memory-records-list');
  clear(target);
  const memories = requireArray(payload, 'memories');
  if (memories.length === 0) {
    target.append(textElement('p', 'muted records-empty', '현재 저장된 대리자 기억이 없습니다.'));
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
    renderMemories(records.memories);
    setReady();
  } catch (error) {
    setFailure(error);
  }
}

void boot();
