import { getVercelOidcToken } from '@vercel/oidc';

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
import type { SeyeonAiGovernorAdmissionV1 } from './postgres-seyeon-ai-cost-ledger-v1.js';
import type { SeyeonProductionGovernorModeV1 } from './seyeon-production-governor-boundary-v1.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import {
  createProductionRequestIdentityVerifierV1,
} from './production-request-identity-verifier.js';
import {
  createProductionSeyeonChatRuntimeV1,
  type SeyeonProductionRoleProviderConfigsV1,
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
  vercelProject: 'prj_nXF0b5uv27Lyucz2SEBxzdCRXVsP',
  vercelTeam: 'team_xuYA9OhCWlJETaYFOmeVodgS',
} as const);

export type ProductionSeyeonOidcTokenProviderV1 = (input: {
  readonly project: string;
  readonly team: string;
}) => Promise<string>;

function optionalEnv(
  env: ProductionUserDataRuntimeEnvV1,
  name: string,
): string | null {
  const value = env[name];
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

function failClosedProviderConfig(): OpenAiSeyeonStructuredProviderConfigV1 {
  return Object.freeze({
    apiKey: '',
    model: SEYEON_PRODUCTION_PROVIDER_ROUTING_V1.directDefaultModel,
  });
}

export async function resolveProductionSeyeonProviderConfigAtRequestV1(
  env: ProductionUserDataRuntimeEnvV1,
  oidcTokenProvider: ProductionSeyeonOidcTokenProviderV1 =
    getVercelOidcToken,
): Promise<OpenAiSeyeonStructuredProviderConfigV1> {
  const directApiKey = optionalEnv(env, 'OPENAI_API_KEY');
  if (directApiKey !== null) {
    return Object.freeze({
      apiKey: directApiKey,
      model:
        optionalEnv(env, 'MYEONGHA_SEYEON_OPENAI_MODEL') ??
        SEYEON_PRODUCTION_PROVIDER_ROUTING_V1.directDefaultModel,
    });
  }

  let vercelOidcToken: string;
  try {
    vercelOidcToken = (
      await oidcTokenProvider({
        project: SEYEON_PRODUCTION_PROVIDER_ROUTING_V1.vercelProject,
        team: SEYEON_PRODUCTION_PROVIDER_ROUTING_V1.vercelTeam,
      })
    ).trim();
  } catch (error) {
    console.error(
      'MYEONGHA_SEYEON_PROVIDER_DIAGNOSTIC ' +
      JSON.stringify({
        schemaVersion: 'myeongha-seyeon-provider-diagnostic-v1',
        stage: 'oidc_resolution',
        outcome: 'failure',
        errorName: error instanceof Error ? error.name : 'UnknownError',
      }),
    );
    return failClosedProviderConfig();
  }

  if (vercelOidcToken.length === 0) {
    console.error(
      'MYEONGHA_SEYEON_PROVIDER_DIAGNOSTIC ' +
      JSON.stringify({
        schemaVersion: 'myeongha-seyeon-provider-diagnostic-v1',
        stage: 'oidc_resolution',
        outcome: 'empty',
      }),
    );
    return failClosedProviderConfig();
  }

  console.error(
    'MYEONGHA_SEYEON_PROVIDER_DIAGNOSTIC ' +
    JSON.stringify({
      schemaVersion: 'myeongha-seyeon-provider-diagnostic-v1',
      stage: 'oidc_resolution',
      outcome: 'success',
    }),
  );

  return Object.freeze({
    apiKey: vercelOidcToken,
    model:
      optionalEnv(env, 'MYEONGHA_SEYEON_AI_GATEWAY_MODEL') ??
      SEYEON_PRODUCTION_PROVIDER_ROUTING_V1.gatewayDefaultModel,
    origin: SEYEON_PRODUCTION_PROVIDER_ROUTING_V1.gatewayOrigin,
  });
}

/** Optional server-only role routing. Missing overrides retain the proven legacy provider. */
export function resolveProductionSeyeonRoleProviderConfigsV1(
  env: ProductionUserDataRuntimeEnvV1,
  base: OpenAiSeyeonStructuredProviderConfigV1,
): SeyeonProductionRoleProviderConfigsV1 | undefined {
  const preflight = optionalEnv(env, 'SEYEON_MODEL_PREFLIGHT');
  const interpreter = optionalEnv(env, 'SEYEON_MODEL_INTERPRETER');
  const renderer = optionalEnv(env, 'SEYEON_MODEL_RENDERER');
  const reviewer = optionalEnv(env, 'SEYEON_MODEL_REVIEWER');
  if (preflight === null && interpreter === null &&
      renderer === null && reviewer === null) return undefined;
  const role = (model: string) => Object.freeze({ ...base, model });
  return Object.freeze({
    ...(preflight === null ? {} : { preflight: role(preflight) }),
    ...(interpreter === null ? {} : { interpreter: role(interpreter) }),
    ...(renderer === null ? {} : { renderer: role(renderer) }),
    ...(reviewer === null ? {} : { reviewer: role(reviewer) }),
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
  /** Server-owned test override only. Production resolves credentials per turn. */
  readonly providerConfig?: OpenAiSeyeonStructuredProviderConfigV1;
  /** Server-owned test override only. Browser input can never supply this profile. */
  readonly clientCompatibilityProfile?: CharacterClientCompatibilityProfileV1;
  readonly pool?: PostgresSubjectPoolV1;
  readonly memberFetchImpl?: SupabaseMemberVerifierFetchV1;
  readonly identityEvidenceVerifier?: IdentityEvidenceVerificationPortV1;
  readonly createUuid?: () => string;
  /** Test seam for request-context OIDC only. */
  readonly oidcTokenProvider?: ProductionSeyeonOidcTokenProviderV1;
  /** Server-only explicit mode; default OFF. D5 owns activation approval. */
  readonly governorMode?: SeyeonProductionGovernorModeV1;
  readonly costGovernorForRole?: (
    role: keyof SeyeonProductionRoleProviderConfigsV1,
    config: OpenAiSeyeonStructuredProviderConfigV1,
  ) => SeyeonAiGovernorAdmissionV1;
}

/**
 * Public-boundary composition root. Provider credentials are resolved inside the
 * request lifecycle so Vercel request-context OIDC is never cached across turns.
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

  return Object.freeze({
    handleRequest(requestInput: ProductionSeyeonTurnSendRequestV1) {
      return handleSeyeonChatTurnSendRequestV1({
        request: requestInput.request,
        requestId: requestInput.requestId,
        serverTime: requestInput.serverTime,
        identityEvidenceVerifier,
        runtime: Object.freeze({
          run: async (runInput) => {
            const providerConfig =
              input.providerConfig ??
              await resolveProductionSeyeonProviderConfigAtRequestV1(
                input.env,
                input.oidcTokenProvider ?? getVercelOidcToken,
              );
            const roleProviderConfigs = input.providerConfig === undefined
              ? resolveProductionSeyeonRoleProviderConfigsV1(input.env, providerConfig)
              : undefined;
            const runtime = createProductionSeyeonChatRuntimeV1({
              databaseConfig: config,
              providerConfig,
              ...(input.governorMode === undefined ? {} : { governorMode: input.governorMode }),
              ...(input.costGovernorForRole === undefined ? {} : {
                costGovernorForRole: input.costGovernorForRole,
              }),
              ...(roleProviderConfigs === undefined ? {} : { roleProviderConfigs }),
              clientCompatibilityProfile:
                input.clientCompatibilityProfile ??
                SEYEON_PRODUCTION_WEB_COMPATIBILITY_PROFILE_V1,
              ...(input.pool === undefined ? {} : { pool: input.pool }),
              ...(input.createUuid === undefined ? {} : { createUuid: input.createUuid }),
            });
            try {
              return await runtime.run(runInput);
            } finally {
              await runtime.close();
            }
          },
        }),
      });
    },
    close() {
      return Promise.resolve();
    },
  });
}
