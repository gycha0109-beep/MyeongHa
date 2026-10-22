import {
  executeSecurityObservedRequestV1,
} from '../../../../../apps/api/src/security-observability.js';
import {
  handleOfficialReaderPaidDeliveryAckHttpV1,
} from '../../../../../apps/api/src/official-reader-paid-chat-delivery-ack-http-v1.js';

/**
 * S7 non-disclosing production adapter. User-provided headers, environment,
 * request bodies or account ownership cannot turn on paid delivery.
 *
 * This route remains explicitly OFF until Saju Production source authority,
 * S4 independent Privacy recovery, S5 atomic persist, and S7 Legal/privacy
 * release are all accepted. Prepared != client acknowledged != human read.
 */
export default {
  fetch(request: Request): Promise<Response> {
    return executeSecurityObservedRequestV1({
      request,
      routeId:'api.chat.paid_reader_delivery_ack.held',
      execute:({requestId,serverTime})=>
        handleOfficialReaderPaidDeliveryAckHttpV1({
          request,requestId,serverTime,
          paidReadReleaseEnabled:false,
        }),
    });
  },
};
