import { executeSecurityObservedRequestV1 } from '../../../../apps/api/src/security-observability.js';
import { handleOfficialReaderPaidChatMessageHttpV1 } from '../../../../apps/api/src/official-reader-paid-chat-message-http-v1.js';

/**
 * Deliberate, non-disclosing production adapter. The real S6 handler and
 * current-purchase SQL are implemented behind this endpoint, but the
 * Production Saju/Privacy authorization+key provider are not yet present.
 * This adapter cannot enable itself from an HTTP header, query or env var.
 */
export default {
  fetch(request: Request): Promise<Response> {
    return executeSecurityObservedRequestV1({
      request,
      routeId: 'api.chat.paid_reader_message.held',
      execute: ({ requestId, serverTime }) =>
        handleOfficialReaderPaidChatMessageHttpV1({
          request,
          requestId,
          serverTime,
          paidReadReleaseEnabled: false,
        }),
    });
  },
};
