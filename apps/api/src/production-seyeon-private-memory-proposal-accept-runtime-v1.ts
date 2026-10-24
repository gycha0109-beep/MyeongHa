// Watchtower-Track: security
// Server production-composition code; no route registration or DB write ACL.
// This is a real verified Member identity verifier + PostgreSQL pool, not an
// authorization to accept proposals while SRC-25/DB ACL remains unresolved.
import {
  handleSeyeonPrivateMemoryProposalAcceptRequestV1,
} from './seyeon-private-memory-proposal-accept-http-v1.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import { createProductionPostgresSubjectPoolLeaseV1 } from './production-postgres-subject-pool-lease.js';
import { createProductionRequestIdentityVerifierV1 } from './production-request-identity-verifier.js';
import {
  parseProductionUserDataRuntimeConfigV1,
  type ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';
import type { SupabaseMemberVerifierFetchV1 } from './supabase-member-identity-verifier.js';

export const SEYEON_PRODUCTION_PRIVATE_MEMORY_ACCEPT_RUNTIME_V1 = Object.freeze({
  version: 'seyeon-production-private-memory-accept-runtime-v1',
  publicRouteMounted: false,
  writeAdmission: 'DENY',
  memberIdentityVerified: true,
} as const);

export interface CreateProductionSeyeonPrivateMemoryAcceptRuntimeV1Input {
  readonly env: ProductionUserDataRuntimeEnvV1;
  readonly pool?: PostgresSubjectPoolV1;
  readonly memberFetchImpl?: SupabaseMemberVerifierFetchV1;
  /** Explicit reviewed server composition only; absent on all public callers. */
  readonly approvedDbWriteAdmission?: () => boolean | Promise<boolean>;
}

/**
 * A future router may reference this adapter, but it returns 503 after
 * authentication until a separate explicit server-owned DB admission exists.
 * No env flag or caller-provided JSON can override this restriction.
 */
export function createProductionSeyeonPrivateMemoryAcceptRuntimeV1(
  input: CreateProductionSeyeonPrivateMemoryAcceptRuntimeV1Input,
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
    handleRequest(requestInput: Readonly<{
      request: Request;
      requestId: string;
      serverTime: string;
    }>): Promise<Response> {
      // Default stays DENY. Only a reviewed server composition can supply
      // admission; requests, environment variables and model text cannot.
      return handleSeyeonPrivateMemoryProposalAcceptRequestV1({
        request: requestInput.request,
        requestId: requestInput.requestId,
        serverTime: requestInput.serverTime,
        identityEvidenceVerifier,
        pool: poolLease.pool,
        ...(input.approvedDbWriteAdmission === undefined ? {} : {
          approvedDbWriteAdmission: input.approvedDbWriteAdmission,
        }),
      });
    },
    close() { return poolLease.close(); },
  });
}
