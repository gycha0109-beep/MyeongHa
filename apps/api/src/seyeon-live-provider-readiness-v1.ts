import {
  OpenAiSeyeonStructuredProviderErrorV1,
  createOpenAiSeyeonStructuredProviderV1,
  type OpenAiSeyeonStructuredProviderConfigV1,
} from './openai-seyeon-structured-provider-v1.js';
import {
  parseSeyeonInternalLiveProviderConfigV1,
} from './seyeon-internal-live-dogfood-v1.js';
import type {
  ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';

export const SEYEON_LIVE_PROVIDER_READINESS_VERSION_V1 =
  'seyeon-live-provider-readiness-v1' as const;

export interface SeyeonLiveProviderReadinessResultV1 {
  readonly version:
    typeof SEYEON_LIVE_PROVIDER_READINESS_VERSION_V1;
  readonly verdict: 'PASS';
  readonly providerKey: string;
  readonly modelKey: string;
}

const READINESS_SCHEMA_V1 = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['ready'],
  properties: {
    ready: Object.freeze({
      type: 'boolean',
      const: true,
    }),
  },
} as const);

function assertReadyOutput(raw: unknown): void {
  if (
    typeof raw !== 'object' ||
    raw === null ||
    Array.isArray(raw) ||
    (raw as { ready?: unknown }).ready !== true ||
    Object.keys(raw).length !== 1
  ) {
    throw new OpenAiSeyeonStructuredProviderErrorV1(
      'INVALID_STRUCTURED_OUTPUT',
      'OpenAI readiness probe did not return the pinned ready=true payload.',
      200,
    );
  }
}

export async function runSeyeonLiveProviderReadinessV1(
  config: OpenAiSeyeonStructuredProviderConfigV1,
): Promise<SeyeonLiveProviderReadinessResultV1> {
  const provider = createOpenAiSeyeonStructuredProviderV1(config);
  const raw = await provider.generate(Object.freeze({
    contractVersion: 'seyeon-structured-provider-v2' as const,
    purpose: 'semantic_review' as const,
    instructions:
      'This is a non-conversational server readiness probe. Return only schema-valid JSON with ready=true. Do not add any other fields.',
    input: Object.freeze({
      probe: 'seyeon-live-provider-readiness-v1',
      requiresConversation: false,
      requiresDatabaseWrite: false,
    }),
    responseSchema: READINESS_SCHEMA_V1,
  }));
  assertReadyOutput(raw);

  return Object.freeze({
    version: SEYEON_LIVE_PROVIDER_READINESS_VERSION_V1,
    verdict: 'PASS' as const,
    providerKey: provider.providerKey,
    modelKey: provider.modelKey,
  });
}

export async function runConfiguredSeyeonLiveProviderReadinessV1(
  env: ProductionUserDataRuntimeEnvV1,
): Promise<SeyeonLiveProviderReadinessResultV1> {
  return runSeyeonLiveProviderReadinessV1(
    parseSeyeonInternalLiveProviderConfigV1(env),
  );
}
