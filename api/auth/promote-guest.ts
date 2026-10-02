import { executeSecurityObservedRequestV1 } from '../../apps/api/src/security-observability.js';
import { createProductionGuestPromotionRuntimeV1 } from '../../apps/api/src/production-guest-promotion-runtime.js';

let runtime: ReturnType<typeof createProductionGuestPromotionRuntimeV1> | undefined;

function getRuntime(): ReturnType<typeof createProductionGuestPromotionRuntimeV1> {
  runtime ??= createProductionGuestPromotionRuntimeV1({ env: process.env });
  return runtime;
}

export const maxDuration = 10;

export default {
  fetch(request: Request): Promise<Response> {
    return executeSecurityObservedRequestV1({
      request,
      routeId: 'api.auth.promote-guest',
      execute: ({ requestId, serverTime }) =>
        getRuntime().handleRequest({
          request,
          requestId,
          serverTime,
        }),
    });
  },
};
