import { handleCurrentSubjectBirthProfileRequestV1 } from './current-subject-birth-profile-http.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import { createProductionPostgresSubjectPoolLeaseV1 } from './production-postgres-subject-pool-lease.js';
import { createProductionRequestIdentityVerifierV1 } from './production-request-identity-verifier.js';
import {
  parseProductionUserDataRuntimeConfigV1,
  type ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';
import type { SupabaseMemberVerifierFetchV1 } from './supabase-member-identity-verifier.js';

export interface ProductionCurrentSubjectBirthProfileRequestV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
}

export interface ProductionCurrentSubjectBirthProfileRuntimeV1 {
  handleRequest(input: ProductionCurrentSubjectBirthProfileRequestV1): Promise<Response>;
  close(): Promise<void>;
}

export interface CreateProductionCurrentSubjectBirthProfileRuntimeInputV1 {
  readonly env: ProductionUserDataRuntimeEnvV1;
  /** Server-owned request pool injection; defaults to existing Vercel ownership. */
  readonly pool?: PostgresSubjectPoolV1;
  readonly memberFetchImpl?: SupabaseMemberVerifierFetchV1;
}

export function createProductionCurrentSubjectBirthProfileRuntimeV1(
  input: CreateProductionCurrentSubjectBirthProfileRuntimeInputV1,
): ProductionCurrentSubjectBirthProfileRuntimeV1 {
  const config = parseProductionUserDataRuntimeConfigV1(input.env);
  const poolLease = createProductionPostgresSubjectPoolLeaseV1({
    config,
    ...(input.pool === undefined ? {} : { pool: input.pool }),
  });
  const pool = poolLease.pool;
  const identityEvidenceVerifier = createProductionRequestIdentityVerifierV1({
    config,
    ...(input.memberFetchImpl === undefined ? {} : { memberFetchImpl: input.memberFetchImpl }),
  });

  return Object.freeze({
    handleRequest(requestInput: ProductionCurrentSubjectBirthProfileRequestV1) {
      return handleCurrentSubjectBirthProfileRequestV1({
        request: requestInput.request,
        requestId: requestInput.requestId,
        serverTime: requestInput.serverTime,
        identityEvidenceVerifier,
        pool,
      });
    },
    close() {
      return poolLease.close();
    },
  });
}
