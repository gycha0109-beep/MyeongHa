// Watchtower-Track: character-memory
import { handleCharacterSharedMemoryRequestV1 } from './character-shared-memory-http-v1.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import { createProductionPostgresSubjectPoolLeaseV1 } from './production-postgres-subject-pool-lease.js';
import { createProductionRequestIdentityVerifierV1 } from './production-request-identity-verifier.js';
import {
  parseProductionUserDataRuntimeConfigV1,
  type ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';

export function createProductionCharacterSharedMemoryRuntimeV1(input: Readonly<{
  env: ProductionUserDataRuntimeEnvV1;
  pool?: PostgresSubjectPoolV1;
}>) {
  const config = parseProductionUserDataRuntimeConfigV1(input.env);
  const poolLease = createProductionPostgresSubjectPoolLeaseV1({
    config,
    ...(input.pool === undefined ? {} : { pool: input.pool }),
  });
  const identityEvidenceVerifier = createProductionRequestIdentityVerifierV1({ config });
  return Object.freeze({
    handleRequest(requestInput: Readonly<{request: Request; requestId: string; serverTime: string}>) {
      return handleCharacterSharedMemoryRequestV1({
        ...requestInput, identityEvidenceVerifier, pool: poolLease.pool,
      });
    },
    close() { return poolLease.close(); },
  });
}
