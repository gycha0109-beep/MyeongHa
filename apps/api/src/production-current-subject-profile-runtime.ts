import { handleCurrentSubjectProfileRequestV1 } from './current-subject-profile-http.js';
import { createNodePostgresSubjectPoolV1 } from './node-postgres-subject-pool.js';
import { createProductionRequestIdentityVerifierV1 } from './production-request-identity-verifier.js';
import {
  parseProductionUserDataRuntimeConfigV1,
  type ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';
import type { SupabaseMemberVerifierFetchV1 } from './supabase-member-identity-verifier.js';

export interface ProductionCurrentSubjectProfileRequestV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
}

export interface ProductionCurrentSubjectProfileRuntimeV1 {
  handleRequest(input: ProductionCurrentSubjectProfileRequestV1): Promise<Response>;
  close(): Promise<void>;
}

export interface CreateProductionCurrentSubjectProfileRuntimeInputV1 {
  readonly env: ProductionUserDataRuntimeEnvV1;
  /** Server-side test/runtime injection only. Never derived from the client request. */
  readonly memberFetchImpl?: SupabaseMemberVerifierFetchV1;
}

/**
 * Production composition root for GET /api/me.
 *
 * Raw request credentials become trusted Member/Guest evidence only through the
 * production verifier. Canonical subject resolution and owner authorization remain
 * inside the existing subject-scoped PostgreSQL transaction boundary.
 */
export function createProductionCurrentSubjectProfileRuntimeV1(
  input: CreateProductionCurrentSubjectProfileRuntimeInputV1,
): ProductionCurrentSubjectProfileRuntimeV1 {
  const config = parseProductionUserDataRuntimeConfigV1(input.env);
  const pool = createNodePostgresSubjectPoolV1(config);
  const identityEvidenceVerifier = createProductionRequestIdentityVerifierV1({
    config,
    ...(input.memberFetchImpl === undefined
      ? {}
      : { memberFetchImpl: input.memberFetchImpl }),
  });

  return Object.freeze({
    handleRequest(requestInput: ProductionCurrentSubjectProfileRequestV1) {
      return handleCurrentSubjectProfileRequestV1({
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
