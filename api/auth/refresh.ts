import { executeSecurityObservedRequestV1 } from '../../apps/api/src/security-observability.js';
import { createProductionMemberAuthHttpRuntimeV1 } from '../../apps/api/src/production-member-auth-http-runtime.js';

export const maxDuration = 10;

let runtime: ReturnType<typeof createProductionMemberAuthHttpRuntimeV1> | undefined;

function getRuntime(): ReturnType<typeof createProductionMemberAuthHttpRuntimeV1> {
  runtime ??= createProductionMemberAuthHttpRuntimeV1({
    env: process.env,
  });
  return runtime;
}

export default {
  fetch(request: Request): Promise<Response> {
    return executeSecurityObservedRequestV1({
      request,
      routeId: 'api.auth.refresh',
      execute: () =>
        getRuntime().handleRequest({
          request,
          action: 'refresh',
        }),
    });
  },
};
