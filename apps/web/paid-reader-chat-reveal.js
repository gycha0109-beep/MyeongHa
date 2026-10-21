import {
  getActiveBearer,
  invalidateMemberSession,
} from './product-auth.js';

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CONTRACT = 'official-reader-paid-chat-message-v1';
let expanded = null;

function closeExpanded() {
  if (expanded === null) return;
  const previous = expanded;
  expanded = null;
  previous.abort();
  previous.body.textContent = '';
  previous.body.hidden = true;
  previous.button.textContent = '구매권 확인 후 해설 열기';
  previous.button.setAttribute('aria-expanded', 'false');
  previous.status.textContent = '';
}

function responseMessage(status, code) {
  if (status === 401 || code === 'AUTH_REQUIRED') {
    return '해설을 열려면 회원 로그인이 필요합니다.';
  }
  if (status === 403 || status === 404 || code === 'ACCESS_DENIED') {
    return '현재 이 해설을 열람할 수 있는 구매권이 확인되지 않았습니다.';
  }
  if (status === 503 || code === 'CAPABILITY_UNAVAILABLE') {
    return '현재 유료 해설 열람 서비스가 준비 중입니다.';
  }
  return '해설을 불러오지 못했습니다. 다시 시도해 주세요.';
}

export function clearProtectedReaderChatRevealV1() {
  closeExpanded();
}

/**
 * Adds the paid-record opening control to an already-authoritative ordinary
 * Chat safe marker. Never stores paid text in Chat state, sessionStorage,
 * localStorage, analytics, outbox, history, or a normal Chat message.
 */
export function appendProtectedReaderChatRevealV1(card, input) {
  if (!(card instanceof HTMLElement)
      || typeof input?.threadId !== 'string' || !ID.test(input.threadId)
      || typeof input.safeMessageId !== 'string' || !ID.test(input.safeMessageId)) {
    return;
  }

  const button = document.createElement('button');
  button.className = 'conversation-paid-reader-reveal-button';
  button.type = 'button';
  button.textContent = '구매권 확인 후 해설 열기';
  button.setAttribute('aria-expanded', 'false');

  const status = document.createElement('p');
  status.className = 'conversation-paid-reader-reveal-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  const body = document.createElement('div');
  body.className = 'conversation-paid-reader-revealed-body';
  body.hidden = true;
  body.setAttribute('aria-label', '현재 구매권으로 확인된 사주 해설');

  button.addEventListener('click', async () => {
    if (expanded?.button === button) {
      closeExpanded();
      return;
    }
    closeExpanded();

    const controller = new AbortController();
    const current = {
      button, status, body,
      abort: () => controller.abort(),
    };
    expanded = current;
    button.disabled = true;
    status.textContent = '현재 이용권을 확인하고 있습니다…';

    try {
      const bearer = await getActiveBearer();
      if (expanded !== current || !card.isConnected) return;
      if (!bearer || bearer.kind !== 'member') {
        status.textContent = '해설을 열려면 회원 로그인이 필요합니다.';
        return;
      }

      const response = await fetch(
        '/api/chat/' + encodeURIComponent(input.threadId)
          + '/paid-readings/' + encodeURIComponent(input.safeMessageId),
        {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
            Authorization: 'Bearer ' + bearer.token,
          },
          signal: controller.signal,
        },
      );
      if (expanded !== current || !card.isConnected) return;
      if (response.status === 401) invalidateMemberSession(bearer.token);

      let envelope = null;
      try { envelope = await response.json(); } catch { /* unavailable */ }
      if (!response.ok) {
        status.textContent = responseMessage(response.status, envelope?.error?.code);
        return;
      }

      const data = envelope?.ok === true ? envelope.data : null;
      if (!data || data.schemaVersion !== CONTRACT
          || data.threadId !== input.threadId
          || data.safeMessageId !== input.safeMessageId
          || typeof data.officialReadingId !== 'string'
          || !ID.test(data.officialReadingId)
          || typeof data.readerCharacterId !== 'string'
          || typeof data.committedAt !== 'string'
          || !Number.isFinite(Date.parse(data.committedAt))
          || typeof data.body !== 'string'
          || data.body.length === 0 || data.body.length > 262144) {
        status.textContent = '서버에서 확인된 해설 정보를 표시할 수 없습니다.';
        return;
      }

      body.textContent = data.body;
      body.hidden = false;
      button.textContent = '해설 닫기';
      button.setAttribute('aria-expanded', 'true');
      status.textContent = '현재 구매권으로 확인한 해설입니다.';
    } catch (error) {
      if (expanded === current && error?.name !== 'AbortError') {
        status.textContent = '해설을 불러오지 못했습니다. 다시 시도해 주세요.';
      }
    } finally {
      if (expanded === current) button.disabled = false;
    }
  });

  card.append(button, status, body);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) closeExpanded();
});
window.addEventListener('pagehide', closeExpanded);
