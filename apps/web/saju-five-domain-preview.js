import {
  getActiveBearer, readMemberSession, readGuestBearer, PRODUCT_AUTH_STORAGE_V1,
} from './product-auth.js';
import {
  captureReadingResponseOwnerV1, isReadingResponseOwnerCurrentV1,
} from './reading-response-owner-guard.js';
import { getUiLocale } from './ui-i18n.js';
import {
  SAJU_FIVE_PREVIEW_TOPICS_V1, projectSajuFiveDomainPreviewV1,
} from './saju-five-domain-preview-projection.js';

const ENDPOINT = '/api/me/saju/preview-reading';
const button = document.getElementById('saju-five-domain-run');
const status = document.getElementById('saju-five-domain-status');
const results = document.getElementById('saju-five-domain-results');
let activeRun = 0;

function isSameOwner(owner) {
  return isReadingResponseOwnerCurrentV1(owner, readMemberSession(), readGuestBearer());
}

function setStatus(message) {
  if (status) status.textContent = message;
}

function addText(parent, tag, text, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  parent.append(node);
  return node;
}

function renderDomain(topic, projected, failure) {
  if (!results) return;
  const card = document.createElement('article');
  card.className = 'saju-five-preview-card';
  card.dataset.sajuDomain = topic.key;
  addText(card, 'h3', topic.label);

  if (projected === null) {
    card.dataset.delivery = 'unavailable';
    addText(card, 'p', failure || '이 분야는 지금 읽을 수 있는 근거가 없습니다.', 'saju-five-preview-empty');
  } else {
    card.dataset.delivery = 'delivered';
    for (const section of projected.sections) {
      const sectionElement = document.createElement('section');
      addText(sectionElement, 'h4', section.title);
      for (const paragraph of section.paragraphs) {
        addText(sectionElement, 'p', paragraph);
      }
      card.append(sectionElement);
    }
    for (const notice of projected.disclosures) {
      addText(card, 'p', notice, 'saju-five-preview-disclosure');
    }
    if (projected.fallback) {
      addText(card, 'p', '일부 근거가 제한되어 확인된 범위만 표시합니다.', 'saju-five-preview-disclosure');
    }
  }
  results.append(card);
}

async function requestDomain(token, topic) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Language': getUiLocale(),
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    credentials: 'same-origin',
    cache: 'no-store',
    body: JSON.stringify({ readingText: topic.readingText }),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    return { projected: null, reason: '서버 응답을 읽을 수 없습니다.' };
  }
  if (response.status === 401) {
    return { projected: null, reason: '세션이 만료되었습니다. 다시 로그인해 주세요.', expired: true };
  }
  if (response.status === 404) {
    return { projected: null, reason: '등록된 출생정보가 없습니다. 먼저 내 사주를 생성해 주세요.' };
  }
  if (!response.ok) {
    return { projected: null, reason: '현재 해당 사주 풀이를 제공할 수 없습니다.' };
  }
  const projected = projectSajuFiveDomainPreviewV1(payload);
  return {
    projected,
    reason: projected === null ? '검증된 풀이가 전달되지 않아 결과를 표시하지 않았습니다.' : null,
  };
}

async function runFiveDomainPreview() {
  if (!button || !results || button.disabled) return;
  const run = ++activeRun;
  button.disabled = true;
  results.replaceChildren();
  setStatus('등록된 출생정보와 계정을 확인하는 중입니다.');
  let owner = null;
  try {
    const credential = await getActiveBearer();
    if (run !== activeRun) return;
    if (!credential) {
      setStatus('내 사주를 만든 후 다섯 분야 풀이를 요청해 주세요.');
      return;
    }
    owner = captureReadingResponseOwnerV1(
      credential, readMemberSession(), readGuestBearer(),
    );
    if (!owner) {
      setStatus('세션이 변경되었습니다. 다시 시도해 주세요.');
      return;
    }

    let delivered = 0;
    for (const [index, topic] of SAJU_FIVE_PREVIEW_TOPICS_V1.entries()) {
      if (run !== activeRun || !isSameOwner(owner)) {
        results.replaceChildren();
        setStatus('계정이 변경되어 이전 결과를 표시하지 않았습니다.');
        return;
      }
      setStatus('사주 풀이를 불러오는 중입니다: ' + String(index + 1) + '/5 · ' + topic.label);
      let result;
      try {
        result = await requestDomain(credential.token, topic);
      } catch {
        result = { projected: null, reason: '통신 오류로 풀이를 받지 못했습니다.' };
      }
      if (run !== activeRun || !isSameOwner(owner)) {
        results.replaceChildren();
        setStatus('계정이 변경되어 이전 결과를 표시하지 않았습니다.');
        return;
      }
      renderDomain(topic, result.projected, result.reason);
      if (result.projected) delivered++;
      if (result.expired) {
        setStatus('세션이 만료되었습니다. 현재까지의 결과만 표시합니다.');
        return;
      }
    }
    setStatus(delivered === 0
      ? '현재 전달 가능한 풀이가 없습니다. 등록된 명식과 Saju 서비스 연결을 확인해 주세요.'
      : '다섯 분야 중 ' + String(delivered) + '개 풀이를 표시했습니다. 나머지는 미지원 또는 일시적으로 사용할 수 없습니다.');
  } catch {
    setStatus('현재 사주 풀이를 요청할 수 없습니다. 세션 상태를 확인해 주세요.');
  } finally {
    if (run === activeRun) button.disabled = false;
  }
}

button?.addEventListener('click', () => { void runFiveDomainPreview(); });
window.addEventListener(PRODUCT_AUTH_STORAGE_V1.changedEvent, () => {
  activeRun++;
  results?.replaceChildren();
  if (button) button.disabled = false;
  setStatus('계정이 변경되었습니다. 현재 계정에서 다시 풀이를 요청해 주세요.');
});
