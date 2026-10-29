// Web Chat transport reuses the authoritative shared receipt protocol.
// Do not interpret a response body as delivered before its server ACK.
import {
  MyeongHaApiClientV1,
  sendSeyeonChatTurnV1,
} from '../../packages/api-client/src/index.ts';

export async function sendSeyeonBrowserTurnWithReceiptV1({
  origin, bearer, threadId, turn, language, localeHeaders, fetchImpl = fetch,
}) {
  const client = new MyeongHaApiClientV1({
    origin,
    fetchImpl: (url, options) => {
      const headers = new Headers(options?.headers);
      headers.set('Accept-Language', language);
      for (const [key, value] of Object.entries(localeHeaders)) headers.set(key, value);
      return fetchImpl(url, {
        ...options,
        headers,
        cache: 'no-store',
        credentials: 'same-origin',
      });
    },
  });
  // This shared helper validates the exact response and, only for a valid
  // receipt, sends the body-bound ACK before resolving to the UI.
  return sendSeyeonChatTurnV1(client, bearer, threadId, turn, {
    requireDeliveryReceipt: true,
  });
}
