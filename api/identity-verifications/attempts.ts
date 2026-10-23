import { randomUUID } from 'node:crypto';
import { executeSecurityObservedRequestV1 } from '../../apps/api/src/security-observability.js';
import { handlePortOneV2IdentityIssueRequestV1 } from '../../apps/api/src/portone-v2-identity-http-v1.js';

// Deliberately public-but-inert. No SDK, DB pool, PortOne credential or
// test-only activation is composed. Production activation is a separate gate.
export default {
  fetch(request: Request): Promise<Response> {
    return executeSecurityObservedRequestV1({
      request,
      routeId: 'api.identity-verifications.attempts',
      execute: () => handlePortOneV2IdentityIssueRequestV1({
        request,
        requestId: randomUUID(),
      }),
    });
  },
};
