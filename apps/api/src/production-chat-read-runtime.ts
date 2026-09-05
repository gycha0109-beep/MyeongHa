import { createNodePostgresSubjectPoolV1 } from './node-postgres-subject-pool.js';
import { createProductionRequestIdentityVerifierV1 } from './production-request-identity-verifier.js';
import {
  parseProductionUserDataRuntimeConfigV1,
  type ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';
import { handleChatReadRequestV1 } from './chat-read-http.js';
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

export function createProductionChatReadRuntimeV1(input: {
  readonly env: ProductionUserDataRuntimeEnvV1;
  readonly memberFetchImpl?: SupabaseMemberVerifierFetchV1;
}): ProductionChatReadRuntimeV1 {
  const config = parseProductionUserDataRuntimeConfigV1(input.env);
  const pool = createNodePostgresSubjectPoolV1(config);
  const identityEvidenceVerifier = createProductionRequestIdentityVerifierV1({
    config,
    ...(input.memberFetchImpl === undefined ? {} : { memberFetchImpl: input.memberFetchImpl }),
  });

  return Object.freeze({
    handleRequest(requestInput: ProductionChatReadRequestV1) {
      return handleChatReadRequestV1({
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
