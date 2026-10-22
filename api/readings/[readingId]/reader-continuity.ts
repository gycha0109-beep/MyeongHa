import { executeSecurityObservedRequestV1 } from '../../../apps/api/src/security-observability.js';
import { handleCommerceReaderRecordContinuityHttpV1 } from '../../../apps/api/src/commerce-reader-record-continuity-http-v1.js';

/**
 * Product activation and S5/S6/Records policies remain gated.
 * Do not turn this route on with an environment variable or browser input.
 */
export default {
  fetch(request: Request): Promise<Response> {
    return executeSecurityObservedRequestV1({
      request,
      routeId: 'api.readings.reader_continuity.held',
      execute: ({ requestId, serverTime }) =>
        handleCommerceReaderRecordContinuityHttpV1({
          request,
          requestId,
          serverTime,
          productReleaseEnabled: false,
        }),
    });
  },
};
