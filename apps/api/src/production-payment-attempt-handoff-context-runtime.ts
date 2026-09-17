import { handlePaymentAttemptHandoffContextRequestV1 } from './payment-attempt-handoff-context-http.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import { createProductionPostgresSubjectPoolLeaseV1 } from './production-postgres-subject-pool-lease.js';
import { createProductionRequestIdentityVerifierV1 } from './production-request-identity-verifier.js';
import {
  parseProductionUserDataRuntimeConfigV1,
  type ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';
import type { SupabaseMemberVerifierFetchV1 } from './supabase-member-identity-verifier.js';

export interface ProductionPaymentAttemptHandoffContextRequestV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
}

export interface ProductionPaymentAttemptHandoffContextRuntimeV1 {
  handleRequest(input: ProductionPaymentAttemptHandoffContextRequestV1): Promise<Response>;
  close(): Promise<void>;
}

export interface CreateProductionPaymentAttemptHandoffContextRuntimeInputV1 {
  readonly env: ProductionUserDataRuntimeEnvV1;
  readonly pool?: PostgresSubjectPoolV1;
  readonly memberFetchImpl?: SupabaseMemberVerifierFetchV1;
}

/**
 * Production dependency composition for owned Payment Attempt handoff-context reads.
 * This creates no public route, performs no PSP network I/O, and does not invoke a
 * browser payment SDK.
 */
export function createProductionPaymentAttemptHandoffContextRuntimeV1(
  input: CreateProductionPaymentAttemptHandoffContextRuntimeInputV1,
): ProductionPaymentAttemptHandoffContextRuntimeV1 {
  const config = parseProductionUserDataRuntimeConfigV1(input.env);
  const poolLease = createProductionPostgresSubjectPoolLeaseV1({
    config,
    ...(input.pool === undefined ? {} : { pool: input.pool }),
  });
  const identityEvidenceVerifier = createProductionRequestIdentityVerifierV1({
    config,
    ...(input.memberFetchImpl === undefined ? {} : { memberFetchImpl: input.memberFetchImpl }),
  });

  return Object.freeze({
    handleRequest(requestInput: ProductionPaymentAttemptHandoffContextRequestV1) {
      return handlePaymentAttemptHandoffContextRequestV1({
        request: requestInput.request,
        requestId: requestInput.requestId,
        serverTime: requestInput.serverTime,
        identityEvidenceVerifier,
        pool: poolLease.pool,
      });
    },
    close() {
      return poolLease.close();
    },
  });
}
