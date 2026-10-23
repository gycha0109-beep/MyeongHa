import { executeSecurityObservedRequestV1 } from '../apps/api/src/security-observability.js';
import { createNodePostgresSubjectPoolV1 } from '../apps/api/src/node-postgres-subject-pool.js';
import { createProductionRequestIdentityVerifierV1 } from '../apps/api/src/production-request-identity-verifier.js';
import { parseProductionUserDataRuntimeConfigV1 } from '../apps/api/src/production-user-data-runtime-config.js';
import { handleSeyeonMemberMemoryGrantStatusRequestV1 } from '../apps/api/src/seyeon-member-memory-grant-status-http-v1.js';

let shared:
  | Readonly<{
      pool: ReturnType<typeof createNodePostgresSubjectPoolV1>;
      identityEvidenceVerifier: ReturnType<typeof createProductionRequestIdentityVerifierV1>;
    }>
  | undefined;

function getRuntime() {
  if (shared !== undefined) return shared;
  const config = parseProductionUserDataRuntimeConfigV1(process.env);
  shared = Object.freeze({
    pool: createNodePostgresSubjectPoolV1(config),
    identityEvidenceVerifier: createProductionRequestIdentityVerifierV1({ config }),
  });
  return shared;
}

export default {
  fetch(request: Request): Promise<Response> {
    return executeSecurityObservedRequestV1({
      request,
      routeId: 'api.seyeon.memory.grant-status',
      execute: ({ requestId, serverTime }) => {
        const runtime = getRuntime();
        return handleSeyeonMemberMemoryGrantStatusRequestV1({
          request, requestId, serverTime,
          identityEvidenceVerifier: runtime.identityEvidenceVerifier,
          pool: runtime.pool,
        });
      },
    });
  },
};
