// Web Chat transport reuses the authoritative shared receipt protocol.
// Do not interpret a response body as delivered before its server ACK.
import {
  MyeongHaApiClientV1,
  sendSeyeonChatTurnV1,
} from '../../packages/api-client/src/index.ts';

export async function sendSeyeonBrowserTurnWithReceiptV1({
  origin, bearer, threadId, turn, language, localeHeaders, fetchImpl = fetch,
}) {
  let receiptAckRequestCompleted = false;
  const client = new MyeongHaApiClientV1({
    origin,
    fetchImpl: (url, options) => {
      const headers = new Headers(options?.headers);
      headers.set('Accept-Language', language);
      for (const [key, value] of Object.entries(localeHeaders)) headers.set(key, value);
      return (async () => {
        const requestUrl = new URL(String(url), origin);
        const isReceiptAck = options?.method === 'POST' &&
          /^\/api\/chat\/delivery-receipts\/[a-f0-9-]+$/u.test(requestUrl.pathname) &&
          requestUrl.origin === new URL(origin).origin;
        const response = await fetchImpl(url, {
          ...options,
          headers,
          cache: 'no-store',
          credentials: 'same-origin',
        });
        // The shared client validates the ACK payload before returning a
        // turn result. This bit only proves it actually took that path.
        if (isReceiptAck && response.ok) receiptAckRequestCompleted = true;
        return response;
      })();
    },
  });
  // This shared helper validates the exact response and, only for a valid
  // receipt, sends the body-bound ACK before resolving to the UI.
  const result = await sendSeyeonChatTurnV1(client, bearer, threadId, turn);
  // Generic Chat APIs may return older unreceipted JSON. The S0 browser
  // MUST NOT treat those as a delivered response or clear its pending turn.
  if (!receiptAckRequestCompleted || result.replayed !== false) {
    throw new Error('SEYEON_RECEIPT_ACK_REQUIRED');
  }
  return result;
}
