import { randomUUID } from 'node:crypto';
import {
  derivePaymentAttemptProviderRequestIdV1,
  requirePaymentAttemptEnvironmentV1,
  type PaymentAttemptEnvironmentV1,
} from './payment-attempt-create-command.js';
import { handlePaymentAttemptCreateRequestV1 } from './payment-attempt-create-http.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import { createProductionPostgresSubjectPoolLeaseV1 } from './production-postgres-subject-pool-lease.js';
import { createProductionRequestIdentityVerifierV1 } from './production-request-identity-verifier.js';
import {
  parseProductionUserDataRuntimeConfigV1,
  type ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';
import type { SupabaseMemberVerifierFetchV1 } from './supabase-member-identity-verifier.js';

export interface ProductionPaymentAttemptCreateRequestV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
}

export interface ProductionPaymentAttemptCreateRuntimeV1 {
  handleRequest(input: ProductionPaymentAttemptCreateRequestV1): Promise<Response>;
  close(): Promise<void>;
}

export interface CreateProductionPaymentAttemptCreateRuntimeInputV1 {
  readonly env: ProductionUserDataRuntimeEnvV1;
  /** Server-owned Commerce rail selection. Never derived from the client request. */
  readonly paymentEnvironment: PaymentAttemptEnvironmentV1;
  readonly pool?: PostgresSubjectPoolV1;
  readonly memberFetchImpl?: SupabaseMemberVerifierFetchV1;
}

/**
 * Production dependency composition for Payment Attempt creation.
 * This creates no public route and performs no PSP network handoff.
 */
export function createProductionPaymentAttemptCreateRuntimeV1(
  input: CreateProductionPaymentAttemptCreateRuntimeInputV1,
): ProductionPaymentAttemptCreateRuntimeV1 {
  const config = parseProductionUserDataRuntimeConfigV1(input.env);
  const environment = requirePaymentAttemptEnvironmentV1(input.paymentEnvironment);
  const poolLease = createProductionPostgresSubjectPoolLeaseV1({
    config,
    ...(input.pool === undefined ? {} : { pool: input.pool }),
  });
  const identityEvidenceVerifier = createProductionRequestIdentityVerifierV1({
    config,
    ...(input.memberFetchImpl === undefined ? {} : { memberFetchImpl: input.memberFetchImpl }),
  });
  const identityPort = Object.freeze({
    nextPaymentAttemptId: randomUUID,
    providerRequestIdFor: derivePaymentAttemptProviderRequestIdV1,
  });

  return Object.freeze({
    handleRequest(requestInput: ProductionPaymentAttemptCreateRequestV1) {
      return handlePaymentAttemptCreateRequestV1({
        request: requestInput.request,
        requestId: requestInput.requestId,
        serverTime: requestInput.serverTime,
        environment,
        identityEvidenceVerifier,
        pool: poolLease.pool,
        identityPort,
      });
    },
    close() {
      return poolLease.close();
    },
  });
}
