// Watchtower-Track: security
// Production-composition candidate: actual verified JWT/Subject DB port wired,
// but the public dispatch remains UNMOUNTED and the DB-write gate remains DENY.
import { handleSeyeonMemoryGrantRevokeRequestV1 } from './seyeon-memory-grant-revoke-http-v1.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import { createProductionPostgresSubjectPoolLeaseV1 } from './production-postgres-subject-pool-lease.js';
import { createProductionRequestIdentityVerifierV1 } from './production-request-identity-verifier.js';
import {
  parseProductionUserDataRuntimeConfigV1,
  type ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';
import type { SupabaseMemberVerifierFetchV1 } from './supabase-member-identity-verifier.js';

export const SEYEON_PRODUCTION_REVOKE_RUNTIME_V1 = Object.freeze({
  version: 'seyeon-production-revoke-runtime-v1',
  publicRouteMounted: false,
  writeAdmission: 'DENY',
  verifiedMemberTransport: true,
} as const);

export interface CreateProductionSeyeonMemoryGrantRevokeRuntimeInputV1 {
  readonly env: ProductionUserDataRuntimeEnvV1;
  readonly pool?: PostgresSubjectPoolV1;
  readonly memberFetchImpl?: SupabaseMemberVerifierFetchV1;
}

export function createProductionSeyeonMemoryGrantRevokeRuntimeV1(
  input: CreateProductionSeyeonMemoryGrantRevokeRuntimeInputV1,
) {
  const config = parseProductionUserDataRuntimeConfigV1(input.env);
  const poolLease = createProductionPostgresSubjectPoolLeaseV1({
    config,
    ...(input.pool === undefined ? {} : { pool: input.pool }),
  });
  const identityEvidenceVerifier = createProductionRequestIdentityVerifierV1({
    config,
    ...(input.memberFetchImpl === undefined
      ? {} : { memberFetchImpl: input.memberFetchImpl }),
  });

  return Object.freeze({
    handleRequest(requestInput: {
      readonly request: Request;
      readonly requestId: string;
      readonly serverTime: string;
    }): Promise<Response> {
      // Deliberately DO NOT pass approvedDbWriteAdmission: the real PG role
      // has no EXECUTE or UPDATE permission. Until a separately approved,
      // narrowly scoped authority replaces it, this returns 503 after Member
      // authentication without starting a write transaction.
      return handleSeyeonMemoryGrantRevokeRequestV1({
        request: requestInput.request,
        requestId: requestInput.requestId,
        serverTime: requestInput.serverTime,
        identityEvidenceVerifier,
        pool: poolLease.pool,
      });
    },
    close() { return poolLease.close(); },
  });
}
