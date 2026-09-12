import { randomUUID } from 'node:crypto';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import { createProductionPostgresSubjectPoolLeaseV1 } from './production-postgres-subject-pool-lease.js';
import { createProductionRequestIdentityVerifierV1 } from './production-request-identity-verifier.js';
import {
  parseProductionUserDataRuntimeConfigV1,
  type ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';
import { handleReadingCreateRequestV1 } from './reading-create-http.js';
import { handleReadingHistoryRequestV1 } from './reading-history-http.js';
import {
  handleLifeRecordReadRequestV1,
  handleMemoryItemsReadRequestV1,
} from './records-read-http.js';
import type { SupabaseMemberVerifierFetchV1 } from './supabase-member-identity-verifier.js';

export interface ProductionRecordsReadRequestV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
}

export interface ProductionRecordsReadRuntimeV1 {
  handleRequest(input: ProductionRecordsReadRequestV1): Promise<Response>;
  close(): Promise<void>;
}

export interface CreateProductionRecordsReadRuntimeInputV1 {
  readonly env: ProductionUserDataRuntimeEnvV1;
  /** Server-side shared-pool injection only. Never derived from the client request. */
  readonly pool?: PostgresSubjectPoolV1;
  /** Server-side test/runtime injection only. Never derived from the client request. */
  readonly memberFetchImpl?: SupabaseMemberVerifierFetchV1;
}

type RecordsReadHandlerV1 = (input: {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
  readonly identityEvidenceVerifier: ReturnType<typeof createProductionRequestIdentityVerifierV1>;
  readonly pool: PostgresSubjectPoolV1;
}) => Promise<Response>;

function cancelUnusedRequestBodyBestEffort(request: Request): void {
  const body = request.body;
  if (body === null || request.bodyUsed) return;

  try {
    void body.cancel().catch(() => undefined);
  } catch {
    // Method rejection is authoritative; best-effort cleanup must never replace it.
  }
}

function createRuntime(
  input: CreateProductionRecordsReadRuntimeInputV1,
  handler: RecordsReadHandlerV1,
): ProductionRecordsReadRuntimeV1 {
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
    handleRequest(requestInput: ProductionRecordsReadRequestV1) {
      return handler({
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

/** Production composition root for owner-scoped GET /api/life-record. */
export function createProductionLifeRecordReadRuntimeV1(
  input: CreateProductionRecordsReadRuntimeInputV1,
): ProductionRecordsReadRuntimeV1 {
  return createRuntime(input, handleLifeRecordReadRequestV1);
}

/**
 * Production composition root for /api/readings.
 * GET remains the succeeded-only history projection. POST creates only the source-safe
 * logical Reading baseline and deliberately leaves provider execution pending.
 */
export function createProductionReadingHistoryReadRuntimeV1(
  input: CreateProductionRecordsReadRuntimeInputV1,
): ProductionRecordsReadRuntimeV1 {
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
  const idPort = Object.freeze({
    nextReadingSessionId: randomUUID,
    nextReadingId: randomUUID,
  });

  return Object.freeze({
    handleRequest(requestInput: ProductionRecordsReadRequestV1) {
      if (requestInput.request.method === 'GET') {
        return handleReadingHistoryRequestV1({
          request: requestInput.request,
          requestId: requestInput.requestId,
          serverTime: requestInput.serverTime,
          identityEvidenceVerifier,
          pool: poolLease.pool,
        });
      }
      if (requestInput.request.method === 'POST') {
        return handleReadingCreateRequestV1({
          request: requestInput.request,
          requestId: requestInput.requestId,
          serverTime: requestInput.serverTime,
          identityEvidenceVerifier,
          pool: poolLease.pool,
          idPort,
        });
      }
      cancelUnusedRequestBodyBestEffort(requestInput.request);
      return Promise.resolve(new Response(null, {
        status: 405,
        headers: {
          Allow: 'GET, POST',
          'Cache-Control': 'no-store',
        },
      }));
    },
    close() {
      return poolLease.close();
    },
  });
}

/** Production composition root for owner-scoped GET /api/memories. */
export function createProductionMemoryItemsReadRuntimeV1(
  input: CreateProductionRecordsReadRuntimeInputV1,
): ProductionRecordsReadRuntimeV1 {
  return createRuntime(input, handleMemoryItemsReadRequestV1);
}
