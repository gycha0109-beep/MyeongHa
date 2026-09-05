import { createNodePostgresSubjectPoolV1 } from './node-postgres-subject-pool.js';
import { createProductionRequestIdentityVerifierV1 } from './production-request-identity-verifier.js';
import {
  parseProductionUserDataRuntimeConfigV1,
  type ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';
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
  /** Server-side test/runtime injection only. Never derived from the client request. */
  readonly memberFetchImpl?: SupabaseMemberVerifierFetchV1;
}

type RecordsReadHandlerV1 = (input: {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
  readonly identityEvidenceVerifier: ReturnType<typeof createProductionRequestIdentityVerifierV1>;
  readonly pool: ReturnType<typeof createNodePostgresSubjectPoolV1>;
}) => Promise<Response>;

function createRuntime(
  input: CreateProductionRecordsReadRuntimeInputV1,
  handler: RecordsReadHandlerV1,
): ProductionRecordsReadRuntimeV1 {
  const config = parseProductionUserDataRuntimeConfigV1(input.env);
  const pool = createNodePostgresSubjectPoolV1(config);
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
        pool,
      });
    },
    close() {
      return pool.close();
    },
  });
}

/** Production composition root for owner-scoped GET /api/life-record. */
export function createProductionLifeRecordReadRuntimeV1(
  input: CreateProductionRecordsReadRuntimeInputV1,
): ProductionRecordsReadRuntimeV1 {
  return createRuntime(input, handleLifeRecordReadRequestV1);
}

/** Production composition root for owner-scoped GET /api/memories. */
export function createProductionMemoryItemsReadRuntimeV1(
  input: CreateProductionRecordsReadRuntimeInputV1,
): ProductionRecordsReadRuntimeV1 {
  return createRuntime(input, handleMemoryItemsReadRequestV1);
}
