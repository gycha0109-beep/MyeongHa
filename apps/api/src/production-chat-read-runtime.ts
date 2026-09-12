import { randomUUID } from 'node:crypto';
import { handleChatOpenRequestV1 } from './chat-open-http.js';
import { handleChatReadRequestV1 } from './chat-read-http.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import { createProductionPostgresSubjectPoolLeaseV1 } from './production-postgres-subject-pool-lease.js';
import { createProductionRequestIdentityVerifierV1 } from './production-request-identity-verifier.js';
import {
  parseProductionUserDataRuntimeConfigV1,
  type ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';
import type { SupabaseMemberVerifierFetchV1 } from './supabase-member-identity-verifier.js';

export interface ProductionChatReadRequestV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
}

export interface ProductionChatReadRuntimeV1 {
  handleRequest(input: ProductionChatReadRequestV1): Promise<Response>;
  close(): Promise<void>;
}

export interface CreateProductionChatReadRuntimeInputV1 {
  readonly env: ProductionUserDataRuntimeEnvV1;
  /** Server-side shared-pool injection only. Never derived from the client request. */
  readonly pool?: PostgresSubjectPoolV1;
  /** Server-side test/runtime injection only. Never derived from the client request. */
  readonly memberFetchImpl?: SupabaseMemberVerifierFetchV1;
  /** Server-side deterministic-test injection only. */
  readonly createUuid?: () => string;
}

/** Production composition root for owner-scoped Chat read and Member thread open. */
export function createProductionChatReadRuntimeV1(
  input: CreateProductionChatReadRuntimeInputV1,
): ProductionChatReadRuntimeV1 {
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
  const createUuid = input.createUuid ?? randomUUID;

  return Object.freeze({
    handleRequest(requestInput: ProductionChatReadRequestV1) {
      const url = new URL(requestInput.request.url);
      if (url.pathname === '/api/chat') {
        return handleChatOpenRequestV1({
          request: requestInput.request,
          requestId: requestInput.requestId,
          serverTime: requestInput.serverTime,
          identityEvidenceVerifier,
          pool: poolLease.pool,
          createUuid,
        });
      }

      return handleChatReadRequestV1({
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
