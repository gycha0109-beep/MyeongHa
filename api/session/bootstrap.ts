import { executeSecurityObservedRequestV1 } from '../../apps/api/src/security-observability.js';
import { createProductionGuestBootstrapHttpRuntimeV1 } from '../../apps/api/src/production-guest-bootstrap-http-runtime.js';

let runtime: ReturnType<typeof createProductionGuestBootstrapHttpRuntimeV1> | undefined;

function getRuntime(): ReturnType<typeof createProductionGuestBootstrapHttpRuntimeV1> {
  runtime ??= createProductionGuestBootstrapHttpRuntimeV1({
    env: process.env,
  });
  return runtime;
}

export default {
  fetch(request: Request): Promise<Response> {
    return executeSecurityObservedRequestV1({
      request,
      routeId: 'api.session.bootstrap',
      execute: ({ requestId, serverTime }) =>
        getRuntime().handleRequest({
          request,
          requestId,
          serverTime,
        }),
    });
  },
};
