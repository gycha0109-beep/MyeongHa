import type {
  CharacterClientCompatibilityProfileV1,
} from '../../../packages/domain/src/index.js';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import {
  handleSeyeonChatTurnSendRequestV1,
} from './chat-turn-send-http.js';
import type {
  OpenAiSeyeonStructuredProviderConfigV1,
} from './openai-seyeon-structured-provider-v1.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import {
  createProductionRequestIdentityVerifierV1,
} from './production-request-identity-verifier.js';
import {
  createProductionSeyeonChatRuntimeV1,
} from './production-seyeon-chat-runtime-v1.js';
import {
  parseProductionUserDataRuntimeConfigV1,
  type ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';
import type {
  SupabaseMemberVerifierFetchV1,
} from './supabase-member-identity-verifier.js';

export interface ProductionSeyeonTurnSendRequestV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
}

export interface ProductionSeyeonTurnSendRuntimeV1 {
  handleRequest(input: ProductionSeyeonTurnSendRequestV1): Promise<Response>;
  close(): Promise<void>;
}

export interface CreateProductionSeyeonTurnSendRuntimeInputV1 {
  readonly env: ProductionUserDataRuntimeEnvV1;
  readonly providerConfig: OpenAiSeyeonStructuredProviderConfigV1;
  readonly clientCompatibilityProfile: CharacterClientCompatibilityProfileV1;
  readonly pool?: PostgresSubjectPoolV1;
  readonly memberFetchImpl?: SupabaseMemberVerifierFetchV1;
  readonly identityEvidenceVerifier?: IdentityEvidenceVerificationPortV1;
  readonly createUuid?: () => string;
}

/**
 * Public-boundary composition root. Callers must supply the approved, server-owned
 * Web compatibility profile explicitly; there is deliberately no fallback/default.
 */
export function createProductionSeyeonTurnSendRuntimeV1(
  input: CreateProductionSeyeonTurnSendRuntimeInputV1,
): ProductionSeyeonTurnSendRuntimeV1 {
  const config = parseProductionUserDataRuntimeConfigV1(input.env);
  const identityEvidenceVerifier = input.identityEvidenceVerifier ??
    createProductionRequestIdentityVerifierV1({
      config,
      ...(input.memberFetchImpl === undefined ? {} : { memberFetchImpl: input.memberFetchImpl }),
    });
  const runtime = createProductionSeyeonChatRuntimeV1({
    databaseConfig: config,
    providerConfig: input.providerConfig,
    clientCompatibilityProfile: input.clientCompatibilityProfile,
    ...(input.pool === undefined ? {} : { pool: input.pool }),
    ...(input.createUuid === undefined ? {} : { createUuid: input.createUuid }),
  });

  return Object.freeze({
    handleRequest(requestInput: ProductionSeyeonTurnSendRequestV1) {
      return handleSeyeonChatTurnSendRequestV1({
        request: requestInput.request,
        requestId: requestInput.requestId,
        serverTime: requestInput.serverTime,
        identityEvidenceVerifier,
        runtime,
      });
    },
    close() {
      return runtime.close();
    },
  });
}
