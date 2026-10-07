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
  type ProductionSeyeonChatRuntimeV1,
} from './production-seyeon-chat-runtime-v1.js';
import {
  SEYEON_PRODUCTION_WEB_COMPATIBILITY_PROFILE_V1,
} from './seyeon-public-content-compatibility-v1.js';
import {
  parseProductionUserDataRuntimeConfigV1,
  type ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';
import type {
  SupabaseMemberVerifierFetchV1,
} from './supabase-member-identity-verifier.js';

export const SEYEON_PRODUCTION_PROVIDER_ROUTING_V1 = Object.freeze({
  directDefaultModel: 'gpt-5.6-terra',
  gatewayOrigin: 'https://ai-gateway.vercel.sh',
  gatewayDefaultModel: 'openai/gpt-5.6-sol',
} as const);

function optionalEnv(
  env: ProductionUserDataRuntimeEnvV1,
  name: string,
): string | null {
  const value = env[name];
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

export function resolveProductionSeyeonProviderConfigV1(
  env: ProductionUserDataRuntimeEnvV1,
): OpenAiSeyeonStructuredProviderConfigV1 {
  const directApiKey = optionalEnv(env, 'OPENAI_API_KEY');
  if (directApiKey !== null) {
    return Object.freeze({
      apiKey: directApiKey,
      model:
        optionalEnv(env, 'MYEONGHA_SEYEON_OPENAI_MODEL') ??
        SEYEON_PRODUCTION_PROVIDER_ROUTING_V1.directDefaultModel,
    });
  }

  const vercelOidcToken = optionalEnv(env, 'VERCEL_OIDC_TOKEN');
  if (vercelOidcToken !== null) {
    return Object.freeze({
      apiKey: vercelOidcToken,
      model:
        optionalEnv(env, 'MYEONGHA_SEYEON_AI_GATEWAY_MODEL') ??
        SEYEON_PRODUCTION_PROVIDER_ROUTING_V1.gatewayDefaultModel,
      origin: SEYEON_PRODUCTION_PROVIDER_ROUTING_V1.gatewayOrigin,
    });
  }

  return Object.freeze({
    apiKey: '',
    model: SEYEON_PRODUCTION_PROVIDER_ROUTING_V1.directDefaultModel,
  });
}

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
  /** Server-owned test override only. Production defaults to the approved Seyeon Web profile. */
  readonly providerConfig?: OpenAiSeyeonStructuredProviderConfigV1;
  /** Server-owned test override only. Browser input can never supply this profile. */
  readonly clientCompatibilityProfile?: CharacterClientCompatibilityProfileV1;
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

  let runtime: ProductionSeyeonChatRuntimeV1 | undefined;
  const getRuntime = () => {
    runtime ??= createProductionSeyeonChatRuntimeV1({
      databaseConfig: config,
      providerConfig:
        input.providerConfig ??
        resolveProductionSeyeonProviderConfigV1(input.env),
      clientCompatibilityProfile:
        input.clientCompatibilityProfile ??
        SEYEON_PRODUCTION_WEB_COMPATIBILITY_PROFILE_V1,
      ...(input.pool === undefined ? {} : { pool: input.pool }),
      ...(input.createUuid === undefined ? {} : { createUuid: input.createUuid }),
    });
    return runtime;
  };

  return Object.freeze({
    handleRequest(requestInput: ProductionSeyeonTurnSendRequestV1) {
      return handleSeyeonChatTurnSendRequestV1({
        request: requestInput.request,
        requestId: requestInput.requestId,
        serverTime: requestInput.serverTime,
        identityEvidenceVerifier,
        runtime: Object.freeze({
          run: (runInput) => getRuntime().run(runInput),
        }),
      });
    },
    close() {
      return runtime?.close() ?? Promise.resolve();
    },
  });
}
