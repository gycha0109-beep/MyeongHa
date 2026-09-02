import { handleBirthProfileReadRequestV1 } from './birth-profile-read-http.js';
import { createNodePostgresSubjectPoolV1 } from './node-postgres-subject-pool.js';
import { createProductionRequestIdentityVerifierV1 } from './production-request-identity-verifier.js';
import {
  parseProductionUserDataRuntimeConfigV1,
  type ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';
import type { SupabaseMemberVerifierFetchV1 } from './supabase-member-identity-verifier.js';

export interface ProductionBirthProfileReadRequestV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
}

export interface ProductionBirthProfileReadRuntimeV1 {
  handleRequest(input: ProductionBirthProfileReadRequestV1): Promise<Response>;
  close(): Promise<void>;
}

export interface CreateProductionBirthProfileReadRuntimeInputV1 {
  readonly env: ProductionUserDataRuntimeEnvV1;
  /** Server-side test/runtime injection only. Never derived from the client request. */
  readonly memberFetchImpl?: SupabaseMemberVerifierFetchV1;
}

/** Production composition root for GET /api/birth-profiles/:id. */
export function createProductionBirthProfileReadRuntimeV1(
  input: CreateProductionBirthProfileReadRuntimeInputV1,
): ProductionBirthProfileReadRuntimeV1 {
  const config = parseProductionUserDataRuntimeConfigV1(input.env);
  const pool = createNodePostgresSubjectPoolV1(config);
  const identityEvidenceVerifier = createProductionRequestIdentityVerifierV1({
    config,
    ...(input.memberFetchImpl === undefined
      ? {}
      : { memberFetchImpl: input.memberFetchImpl }),
  });

  return Object.freeze({
    handleRequest(requestInput: ProductionBirthProfileReadRequestV1) {
      return handleBirthProfileReadRequestV1({
        request: requestInput.request,
        requestId: requestInput.requestId,
        serverTime: requestInput.serverTime,
        identityEvidenceVerifier,
        pool,
      });
    },
    close() {
      return pool.close();
    },
  });
}
