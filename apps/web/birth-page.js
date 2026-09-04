import { BirthRuntimeError, createBirthRuntimeClient } from './birth-runtime-client.js';

const client = createBirthRuntimeClient();

function byId(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing Birth Profile page element: ${id}`);
  return element;
}

function setStatus(message, tone = 'neutral') {
  const status = byId('birth-status');
  status.hidden = false;
  status.dataset.tone = tone;
  status.textContent = message;
}

function clearStatus() {
  const status = byId('birth-status');
  status.hidden = true;
  status.textContent = '';
  delete status.dataset.tone;
}

function selectedCalendarType() {
  const selected = document.querySelector('input[name="calendar"]:checked');
  return selected?.value === 'lunar' ? 'lunar' : 'solar';
}

function syncTimeKnown() {
  const unknown = byId('birth-time-unknown');
  const time = byId('birth-time');
  time.disabled = unknown.checked;
  time.required = !unknown.checked;
  if (unknown.checked) time.value = '';
}

function syncLeapMonth() {
  const lunar = selectedCalendarType() === 'lunar';
  const leap = byId('birth-leap-month');
  leap.disabled = !lunar;
  if (!lunar) leap.checked = false;
  byId('birth-leap-wrap').hidden = !lunar;
}

function buildCreateRequest() {
  const birthDate = byId('birth-date').value;
  const timeKnown = !byId('birth-time-unknown').checked;
  const birthTime = timeKnown ? byId('birth-time').value : null;
  const calendarType = selectedCalendarType();
  const sexValue = byId('birth-sex').value;

  if (!birthDate) {
    throw new BirthRuntimeError('WEB_BIRTH_INVALID_REQUEST', '생년월일을 입력해 주세요.');
  }
  if (timeKnown && !birthTime) {
    throw new BirthRuntimeError('WEB_BIRTH_INVALID_REQUEST', '태어난 시각을 입력하거나 시각 모름을 선택해 주세요.');
  }

  return Object.freeze({
    label: null,
    input: Object.freeze({
      calendarType,
      birthDate,
      birthTime,
      timeKnown,
      isLeapMonth: calendarType === 'lunar' ? byId('birth-leap-month').checked : false,
      sex: sexValue === 'male' || sexValue === 'female' || sexValue === 'unspecified' ? sexValue : null,
    }),
  });
}

function showCreateForm() {
  byId('birth-existing').hidden = true;
  byId('birth-form').hidden = false;
  clearStatus();
}

function showExisting(current) {
  byId('birth-form').hidden = true;
  byId('birth-existing').hidden = false;
  byId('birth-existing-revision').textContent = current?.revisionNo
    ? `현재 저장된 revision ${current.revisionNo}을 My에서 확인할 수 있습니다.`
    : '현재 저장된 출생 정보를 My에서 확인할 수 있습니다.';
  clearStatus();
}

function renderSuccess(receipt) {
  byId('birth-form').hidden = true;
  byId('birth-existing').hidden = true;
  const status = byId('birth-status');
  status.hidden = false;
  status.dataset.tone = 'success';
  status.replaceChildren();

  const strong = document.createElement('strong');
  strong.textContent = `명식록 revision ${receipt.revisionNo}이 저장되었습니다.`;
  status.append(strong);
  status.append(document.createElement('br'));

  for (const [href, label, className] of [
    ['my.html#my-birth-title', 'My에서 확인하기 →', 'button button-primary'],
    ['reading.html', '사주에서 결과 보기 →', 'button button-secondary'],
  ]) {
    const link = document.createElement('a');
    link.className = className;
    link.href = href;
    link.style.marginTop = '12px';
    link.style.marginRight = '8px';
    link.textContent = label;
    status.append(link);
  }
}

function renderFailure(error) {
  byId('birth-form').hidden = true;
  byId('birth-existing').hidden = true;
  if (error instanceof BirthRuntimeError) {
    switch (error.code) {
      case 'WEB_BIRTH_SESSION_REQUIRED':
      case 'WEB_BIRTH_SESSION_PREPARE_FAILED':
        setStatus('현재 세션을 확인하지 못했습니다. 서버에서 현재 출생 정보를 확인하기 전에는 새 명식록 생성을 허용하지 않습니다.', 'error');
        return;
      case 'WEB_BIRTH_INVALID_REQUEST':
        byId('birth-form').hidden = false;
        setStatus(error.message || '입력값을 확인해 주세요.', 'error');
        return;
      case 'WEB_BIRTH_NOT_AVAILABLE':
        setStatus('현재 계정에서는 명식록을 만들 수 없습니다.', 'error');
        return;
      case 'WEB_BIRTH_MALFORMED_CURRENT':
      case 'WEB_BIRTH_CURRENT_REQUEST_FAILED':
        setStatus('현재 저장된 출생 정보를 확인할 수 없습니다. 중복 생성을 막기 위해 새 명식록 입력을 잠갔습니다.', 'error');
        return;
      default:
        setStatus('명식록을 저장하지 못했습니다. 서버 command가 성공하기 전에는 저장된 것으로 표시하지 않습니다.', 'error');
        return;
    }
  }
  setStatus('명식록을 저장하지 못했습니다. 서버 상태를 확인하기 전에는 새 명식록 입력을 허용하지 않습니다.', 'error');
}

async function submitBirthProfile(event) {
  event.preventDefault();
  clearStatus();

  const submit = byId('birth-submit-button');
  submit.disabled = true;
  submit.textContent = '확인 중…';

  try {
    const current = await client.readCurrentBirthProfile();
    if (current) {
      showExisting(current);
      return;
    }

    const request = buildCreateRequest();
    submit.textContent = '저장 중…';
    const receipt = await client.createBirthProfile(request);
    renderSuccess(receipt);
  } catch (error) {
    renderFailure(error);
  } finally {
    submit.disabled = false;
    submit.textContent = '명식록 저장하기 →';
  }
}

async function boot() {
  byId('birth-form').hidden = true;
  byId('birth-existing').hidden = true;
  setStatus('현재 저장된 출생 정보를 확인하는 중입니다…');

  try {
    const current = await client.readCurrentBirthProfile();
    if (current) {
      showExisting(current);
      return;
    }
    showCreateForm();
  } catch (error) {
    renderFailure(error);
  }
}

byId('birth-time-unknown').addEventListener('change', syncTimeKnown);
for (const input of document.querySelectorAll('input[name="calendar"]')) {
  input.addEventListener('change', syncLeapMonth);
}
byId('birth-form').addEventListener('submit', submitBirthProfile);

syncTimeKnown();
syncLeapMonth();
void boot();
