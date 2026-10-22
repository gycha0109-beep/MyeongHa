import {
  getActiveBearer,
  invalidateMemberSession,
} from './product-auth.js';

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CONTRACT = 'official-reader-paid-chat-message-v1';
const DELIVERY_CONTRACT = 'official-reader-s7-private-delivery-v1';
const DELIVERY_TOKEN = /^[A-Za-z0-9_-]{43}$/u;
let expanded = null;

function closeExpanded() {
  if (expanded === null) return;
  const previous = expanded;
  expanded = null;
  previous.abort();
  previous.retry.hidden = true;
  previous.retry.onclick = null;
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

  // Keep the original S7 receipt available only while this protected card
  // remains expanded. A lost ACK can be replayed without a new paid GET.
  const retry = document.createElement('button');
  retry.className = 'conversation-paid-reader-reveal-button conversation-paid-reader-reveal-retry-button';
  retry.type = 'button';
  retry.textContent = '기기 수신 확인 다시 시도';
  retry.hidden = true;

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
      button, status, body, retry,
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

      // A fresh, browser-owned request identity is reused if the same GET
      // is retried. It is NEVER reused across unrelated Reading/Reader scope.
      const deliveryRequestId = crypto.randomUUID();
      const readerPath = '/api/chat/' + encodeURIComponent(input.threadId)
        + '/paid-readings/' + encodeURIComponent(input.safeMessageId);
      let response;
      for (let networkAttempt = 0; networkAttempt < 2; networkAttempt += 1) {
        try {
          response = await fetch(readerPath, {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-store',
            headers: {
              Accept: 'application/json',
              Authorization: 'Bearer ' + bearer.token,
              'X-Reader-Delivery-Request-Id': deliveryRequestId,
            },
            signal: controller.signal,
          });
          break;
        } catch (error) {
          if (controller.signal.aborted || networkAttempt === 1) throw error;
          // A lost HTTP response may already have prepared an S7 record.
          // Retrying with the SAME ID gets the original token/timestamp.
        }
      }
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
          || data.body.length === 0 || data.body.length > 262144
          || !data.delivery
          || data.delivery.deliveryRequestId !== deliveryRequestId
          || typeof data.delivery.deliveryAttemptId !== 'string'
          || !ID.test(data.delivery.deliveryAttemptId)
          || typeof data.delivery.responsePreparedAt !== 'string'
          || !Number.isFinite(Date.parse(data.delivery.responsePreparedAt))
          || typeof data.delivery.acknowledgementToken !== 'string'
          || !DELIVERY_TOKEN.test(data.delivery.acknowledgementToken)
          || typeof data.delivery.replayed !== 'boolean') {
        status.textContent = '서버에서 확인된 해설 정보를 표시할 수 없습니다.';
        return;
      }

      body.textContent = data.body;
      body.hidden = false;
      button.textContent = '해설 닫기';
      button.setAttribute('aria-expanded', 'true');
      // Do not claim delivery when the server merely built its HTTP
      // Response. Wait until the protected answer is inserted into the DOM,
      // then send a separate client acknowledgment. This proves a client
      // callback, not that the user personally read or understood it.
      status.textContent = '현재 구매권으로 확인한 해설입니다. 수신 확인 중…';
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (expanded !== current || !card.isConnected
          || body.hidden || controller.signal.aborted) return;

      // Reuse the exact client request/attempt/token for a failed ACK. A
      // fresh GET would create another delivery attempt and lose the status
      // of the original one. Nothing is persisted in browser storage.
      const acknowledgementBody = JSON.stringify({
        schemaVersion: DELIVERY_CONTRACT,
        deliveryRequestId,
        deliveryAttemptId: data.delivery.deliveryAttemptId,
        acknowledgementToken: data.delivery.acknowledgementToken,
      });
      async function recordClientReceipt() {
        if (expanded !== current || !card.isConnected || body.hidden
            || controller.signal.aborted) return;
        retry.disabled = true;
        retry.hidden = true;
        let acknowledged = false;
        try {
          // Never replay a delivery proof under a changed login. The server
          // independently binds its original attempt to the owning Subject.
          const activeBearer = await getActiveBearer();
          if (!activeBearer || activeBearer.kind !== 'member'
              || activeBearer.token !== bearer.token) {
            closeExpanded();
            return;
          }
          let ackResponse;
          for (let networkAttempt = 0; networkAttempt < 2; networkAttempt += 1) {
            try {
              ackResponse = await fetch(readerPath + '/ack', {
                method: 'POST',
                credentials: 'same-origin',
                cache: 'no-store',
                headers: {
                  Accept: 'application/json',
                  'Content-Type': 'application/json',
                  Authorization: 'Bearer ' + activeBearer.token,
                  'X-Reader-Delivery-Ack': '1',
                },
                body: acknowledgementBody,
                signal: controller.signal,
              });
              break;
            } catch (error) {
              if (controller.signal.aborted || networkAttempt === 1) throw error;
              // A missing response is ambiguous; retry the SAME S7 receipt.
            }
          }
          if (ackResponse.status === 401) invalidateMemberSession(activeBearer.token);
          const ackEnvelope = ackResponse.ok ? await ackResponse.json() : null;
          acknowledged = ackResponse.ok
            && ackEnvelope?.ok === true
            && ackEnvelope.data?.schemaVersion === DELIVERY_CONTRACT
            && ackEnvelope.data?.deliveryAttemptId === data.delivery.deliveryAttemptId
            && typeof ackEnvelope.data?.clientAcknowledgedAt === 'string'
            && Number.isFinite(Date.parse(ackEnvelope.data.clientAcknowledgedAt));
        } catch {
          // Do not claim receipt from a client display or missing ACK response.
        }
        if (expanded === current && !body.hidden && !controller.signal.aborted) {
          status.textContent = acknowledged
            ? '현재 구매권으로 확인한 해설입니다. 기기 수신 확인이 기록되었습니다.'
            : '해설이 표시되었으나 기기 수신 확인은 기록되지 않았습니다.';
          retry.hidden = acknowledged;
          retry.disabled = false;
          if (acknowledged) retry.onclick = null;
        }
      }
      retry.onclick = () => {
        if (expanded !== current || controller.signal.aborted || retry.disabled) return;
        status.textContent = '기기 수신 확인을 다시 요청하고 있습니다…';
        void recordClientReceipt();
      };
      await recordClientReceipt();
    } catch (error) {
      if (expanded === current && error?.name !== 'AbortError') {
        status.textContent = '해설을 불러오지 못했습니다. 다시 시도해 주세요.';
      }
    } finally {
      button.disabled = false;
      // An unavailable/denied read remains retryable on the next click.
      if (expanded === current && body.hidden) expanded = null;
    }
  });

  card.append(button, status, retry, body);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) closeExpanded();
});
window.addEventListener('pagehide', closeExpanded);
