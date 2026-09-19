import { handleTargetPersonReadRequestV1 } from './target-person-read-http.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import { createProductionPostgresSubjectPoolLeaseV1 } from './production-postgres-subject-pool-lease.js';
import { createProductionRequestIdentityVerifierV1 } from './production-request-identity-verifier.js';
import {
  parseProductionUserDataRuntimeConfigV1,
  type ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';
import type { SupabaseMemberVerifierFetchV1 } from './supabase-member-identity-verifier.js';

export interface ProductionTargetPersonReadRequestV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
}

export interface ProductionTargetPersonReadRuntimeV1 {
  handleRequest(input: ProductionTargetPersonReadRequestV1): Promise<Response>;
  close(): Promise<void>;
}

export interface CreateProductionTargetPersonReadRuntimeInputV1 {
  readonly env: ProductionUserDataRuntimeEnvV1;
  /** Server-side shared-pool injection only. Never derived from the client request. */
  readonly pool?: PostgresSubjectPoolV1;
  /** Server-side test/runtime injection only. Never derived from the client request. */
  readonly memberFetchImpl?: SupabaseMemberVerifierFetchV1;
}

function cancelUnusedRequestBodyBestEffort(request: Request): void {
  const body = request.body;
  if (body === null || request.bodyUsed) return;

  try {
    void body.cancel().catch(() => undefined);
  } catch {
    // Method rejection remains authoritative.
  }
}

/** Production composition root for owner-scoped GET /api/target-persons[/:id]. */
export function createProductionTargetPersonReadRuntimeV1(
  input: CreateProductionTargetPersonReadRuntimeInputV1,
): ProductionTargetPersonReadRuntimeV1 {
  const config = parseProductionUserDataRuntimeConfigV1(input.env);
  const poolLease = createProductionPostgresSubjectPoolLeaseV1({
    config,
    ...(input.pool === undefined ? {} : { pool: input.pool }),
  });
  const identityEvidenceVerifier = createProductionRequestIdentityVerifierV1({
    config,
    ...(input.memberFetchImpl === undefined
      ? {}
      : { memberFetchImpl: input.memberFetchImpl }),
  });

  return Object.freeze({
    async handleRequest(requestInput: ProductionTargetPersonReadRequestV1) {
      const response = await handleTargetPersonReadRequestV1({
        request: requestInput.request,
        requestId: requestInput.requestId,
        serverTime: requestInput.serverTime,
        identityEvidenceVerifier,
        pool: poolLease.pool,
      });
      if (response.status === 405) {
        cancelUnusedRequestBodyBestEffort(requestInput.request);
      }
      return response;
    },
    close() {
      return poolLease.close();
    },
  });
}
