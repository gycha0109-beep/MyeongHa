// Watchtower-Track: security
// A review surface for an already-authorized, exact original source.
// Deliberately NOT mounted by Chat or Records while the canonical source
// Turn/Message offer and S0 proposal route remain unavailable in production.
import { getUiLocale, translateStaticUi } from './ui-i18n.js';
import { createSeyeonPrivateMemoryReviewClientV1 } from './seyeon-private-memory-review-client.js';

function uiText(source) {
  return translateStaticUi(source, getUiLocale());
}

function control(tag, className, message) {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = uiText(message);
  return node;
}

export function mountSeyeonPrivateMemoryReviewV1(options) {
  const { container, originalSource } = options ?? {};
  if (!(container instanceof HTMLElement) || container.isConnected !== true ||
      originalSource === null || typeof originalSource !== 'object' ||
      originalSource.sourceAuthority !== 'server_original_message' ||
      originalSource.characterId !== 'seyeon' ||
      originalSource.redacted !== false ||
      !['threadId', 'turnId', 'messageId'].every((field) =>
        typeof originalSource[field] === 'string')) {
    return null;
  }
  const client = options.client ?? createSeyeonPrivateMemoryReviewClientV1();
  const panel = control('section', 's0-private-memory-review', '');
  panel.setAttribute('aria-label', uiText('비공개 기억 저장'));
  const explanation = control(
    'p', 's0-private-memory-review-description',
    '원본 사용자 메시지만 제안합니다. 비공개 저장 후에도 세연에게 자동 공유되지 않습니다.',
  );
  const prepare = control('button', 's0-private-memory-review-prepare', '이 메시지를 기억 제안으로 만들기');
  prepare.type = 'button';
  const accept = control('button', 's0-private-memory-review-accept', '비공개 기억으로 저장 확정');
  accept.type = 'button';
  accept.hidden = true;
  const status = control('p', 's0-private-memory-review-status', '');
  status.setAttribute('role', 'status');
  let receipt = null;
  let inFlight = false;
  let finished = false;

  prepare.addEventListener('click', async () => {
    if (inFlight || finished || receipt !== null) return;
    inFlight = true;
    prepare.disabled = true;
    status.textContent = uiText('기억 제안 결과를 확인 중입니다…');
    try {
      receipt = await client.prepareOriginalUserMessage({
        threadId: originalSource.threadId,
        turnId: originalSource.turnId,
        messageId: originalSource.messageId,
      });
      if (panel.isConnected) {
        prepare.hidden = true;
        accept.hidden = false;
        status.textContent = uiText('비공개 기억 제안이 준비됐습니다. 저장하려면 별도로 확인해야 합니다.');
      }
    } catch {
      // An uncertain POST is not proof of a missing proposal. Do not offer
      // blind retries or accept a guessed ID.
      finished = true;
      if (panel.isConnected) {
        prepare.hidden = true;
        accept.hidden = true;
        status.textContent = uiText('기억 제안 결과를 확인할 수 없습니다. 현재 기록을 다시 확인해 주세요.');
      }
    } finally {
      inFlight = false;
    }
  });

  accept.addEventListener('click', async () => {
    if (inFlight || finished || receipt === null) return;
    if (!window.confirm(uiText(
      '이 원본 메시지를 비공개 기억으로 저장하시겠습니까? 세연 공유 권한은 부여되지 않습니다.',
    ))) return;
    inFlight = true;
    accept.disabled = true;
    accept.hidden = true;
    status.textContent = uiText('비공개 기억 저장을 확인 중입니다…');
    try {
      const accepted = await client.acceptPreparedPrivate(receipt, true);
      finished = true;
      if (panel.isConnected && accepted.grantCount === 0) {
        status.textContent = uiText('비공개 기억으로 저장됐습니다. 세연의 접근권한은 없습니다.');
      }
    } catch {
      finished = true;
      if (panel.isConnected) {
        status.textContent = uiText('저장 결과를 확인할 수 없습니다. 현재 기록을 다시 조회해 주세요.');
      }
    } finally {
      inFlight = false;
    }
  });

  panel.append(explanation, prepare, accept, status);
  container.append(panel);
  return panel;
}
