import { randomUUID } from 'node:crypto';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import { createProductionPostgresSubjectPoolLeaseV1 } from './production-postgres-subject-pool-lease.js';
import { createProductionRequestIdentityVerifierV1 } from './production-request-identity-verifier.js';
import {
  parseProductionUserDataRuntimeConfigV1,
  type ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';
import { handlePurchaseIntentCreateRequestV3 } from './purchase-intent-create-http-v3.js';
import type { SupabaseMemberVerifierFetchV1 } from './supabase-member-identity-verifier.js';

export interface ProductionPurchaseIntentCreateRequestV3 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
}

export interface ProductionPurchaseIntentCreateRuntimeV3 {
  handleRequest(input: ProductionPurchaseIntentCreateRequestV3): Promise<Response>;
  close(): Promise<void>;
}

export interface CreateProductionPurchaseIntentCreateRuntimeInputV3 {
  readonly env: ProductionUserDataRuntimeEnvV1;
  readonly pool?: PostgresSubjectPoolV1;
  readonly memberFetchImpl?: SupabaseMemberVerifierFetchV1;
}

/**
 * Production dependency composition for Purchase Intent v3.
 * This does not publish a Vercel/API route. Public checkout reachability remains
 * a separate reviewed activation step after the saleable Product/Capability gate.
 */
export function createProductionPurchaseIntentCreateRuntimeV3(
  input: CreateProductionPurchaseIntentCreateRuntimeInputV3,
): ProductionPurchaseIntentCreateRuntimeV3 {
  const config = parseProductionUserDataRuntimeConfigV1(input.env);
  const poolLease = createProductionPostgresSubjectPoolLeaseV1({
    config,
    ...(input.pool === undefined ? {} : { pool: input.pool }),
  });
  const identityEvidenceVerifier = createProductionRequestIdentityVerifierV1({
    config,
    ...(input.memberFetchImpl === undefined ? {} : { memberFetchImpl: input.memberFetchImpl }),
  });
  const idPort = Object.freeze({ nextPurchaseIntentId: randomUUID });

  return Object.freeze({
    handleRequest(requestInput: ProductionPurchaseIntentCreateRequestV3) {
      return handlePurchaseIntentCreateRequestV3({
        request: requestInput.request,
        requestId: requestInput.requestId,
        serverTime: requestInput.serverTime,
        identityEvidenceVerifier,
        pool: poolLease.pool,
        idPort,
      });
    },
    close() {
      return poolLease.close();
    },
  });
}
