import type { OpenAiSeyeonStructuredProviderConfigV1 } from './openai-seyeon-structured-provider-v1.js';
import type { SeyeonAiGovernorAdmissionV1 } from './postgres-seyeon-ai-cost-ledger-v1.js';
import {
  SEYEON_GOVERNOR_CHAT_ROLES_V1,
  type SeyeonGovernorChatRoleV1,
} from './seyeon-production-governor-boundary-v1.js';
import {
  validateSeyeonCostGovernorModelPolicyV1,
  type SeyeonCostGovernorModelPolicyV1,
} from './seyeon-cost-governor-server-policy-v1.js';
import {
  createSeyeonOpenAiInputTokenCountAdmissionV1,
} from './seyeon-openai-input-token-count-port-v1.js';

/** Only trusted server configuration may supply these immutable policy versions. */
export interface SeyeonProductionChatGovernorApprovalV1 {
  readonly policies: Readonly<Record<SeyeonGovernorChatRoleV1, SeyeonCostGovernorModelPolicyV1>>;
  readonly reservedHeadroomTokens: number;
  readonly timeoutMs?: number;
}
const PURPOSES = Object.freeze({
  preflight: ['integrity_classification', 'disclosure_classification'],
  interpreter: ['turn_interpretation'],
  renderer: ['dialogue_render'],
  reviewer: ['semantic_review'],
} as const);

function bindNative(
  config: OpenAiSeyeonStructuredProviderConfigV1,
  policy: SeyeonCostGovernorModelPolicyV1,
  purposes: readonly string[],
): OpenAiSeyeonStructuredProviderConfigV1 {
  const p = validateSeyeonCostGovernorModelPolicyV1(policy);
  if (p.providerKey !== 'openai-responses' || config.model !== p.modelKey ||
      config.origin !== undefined || config.fetchImpl !== undefined ||
      config.beforeDispatch !== undefined ||
      config.meteredBeforeDispatch !== undefined ||
      (config.maxOutputTokens !== undefined &&
       config.maxOutputTokens !== p.maximumOutputTokens) ||
      purposes.some(purpose => !p.allowedPurposes.includes(
        purpose as (typeof p.allowedPurposes)[number],
      ))) {
    throw new Error('Production Governor requires an approved native role policy.');
  }
  const rate = config.priceQuote;
  if (rate !== undefined && (
      rate.priceVersion !== p.priceQuote.priceVersion ||
      rate.providerKey !== p.priceQuote.providerKey ||
      rate.modelKey !== p.priceQuote.modelKey ||
      rate.inputMicroUsdPerMillion !== p.priceQuote.inputMicroUsdPerMillion ||
      rate.cachedInputMicroUsdPerMillion !== p.priceQuote.cachedInputMicroUsdPerMillion ||
      rate.outputMicroUsdPerMillion !== p.priceQuote.outputMicroUsdPerMillion)) {
    throw new Error('Production Governor rejects a divergent Provider price.');
  }
  return Object.freeze({
    ...config, priceQuote: p.priceQuote,
    maxOutputTokens: p.maximumOutputTokens,
  });
}

/** Creates no network requests; OFF remains the default. */
export function createSeyeonProductionChatGovernorsV1(input: {
  readonly baseProviderConfig: OpenAiSeyeonStructuredProviderConfigV1;
  readonly roleProviderConfigs?: Readonly<Partial<Record<
    SeyeonGovernorChatRoleV1, OpenAiSeyeonStructuredProviderConfigV1
  >>>;
  readonly approval: SeyeonProductionChatGovernorApprovalV1;
}): Readonly<{
  roleProviderConfigs: Readonly<Record<
    SeyeonGovernorChatRoleV1, OpenAiSeyeonStructuredProviderConfigV1
  >>;
  costGovernorForRole: (
    role: SeyeonGovernorChatRoleV1,
    config: OpenAiSeyeonStructuredProviderConfigV1,
  ) => SeyeonAiGovernorAdmissionV1;
}> {
  const approval = input.approval;
  if (approval === undefined || approval === null ||
      approval.policies === undefined || approval.policies === null ||
      Object.keys(approval.policies).length !== SEYEON_GOVERNOR_CHAT_ROLES_V1.length) {
    throw new Error('Production Governor requires all four approved role policies.');
  }
  const configs = {} as Record<SeyeonGovernorChatRoleV1, OpenAiSeyeonStructuredProviderConfigV1>;
  const admission = {} as Record<SeyeonGovernorChatRoleV1, SeyeonAiGovernorAdmissionV1>;
  for (const role of SEYEON_GOVERNOR_CHAT_ROLES_V1) {
    const policy = approval.policies[role];
    if (policy === undefined) throw new Error('Production Governor requires all four approved role policies.');
    const config = bindNative(
      input.roleProviderConfigs?.[role] ?? input.baseProviderConfig,
      policy, PURPOSES[role],
    );
    configs[role] = config;
    admission[role] = createSeyeonOpenAiInputTokenCountAdmissionV1({
      apiKey: config.apiKey, model: config.model, policy,
      reservedHeadroomTokens: approval.reservedHeadroomTokens,
      ...(approval.timeoutMs === undefined ? {} : { timeoutMs: approval.timeoutMs }),
    });
  }
  const frozen = Object.freeze(configs);
  return Object.freeze({
    roleProviderConfigs: frozen,
    costGovernorForRole(role: SeyeonGovernorChatRoleV1,
      config: OpenAiSeyeonStructuredProviderConfigV1): SeyeonAiGovernorAdmissionV1 {
      if (!SEYEON_GOVERNOR_CHAT_ROLES_V1.includes(role) || frozen[role] !== config) {
        throw new Error('Production Governor role configuration identity drift.');
      }
      return admission[role];
    },
  });
}

/** Same bound policy and official count endpoint for Post-turn extraction. */
export function createSeyeonProductionPostTurnGovernorV1(input: {
  readonly providerConfig: OpenAiSeyeonStructuredProviderConfigV1;
  readonly policy: SeyeonCostGovernorModelPolicyV1;
  readonly reservedHeadroomTokens: number;
  readonly timeoutMs?: number;
}): Readonly<{
  providerConfig: OpenAiSeyeonStructuredProviderConfigV1;
  costGovernor: SeyeonAiGovernorAdmissionV1;
}> {
  const config = bindNative(input.providerConfig, input.policy, ['event_extraction']);
  return Object.freeze({
    providerConfig: config,
    costGovernor: createSeyeonOpenAiInputTokenCountAdmissionV1({
      apiKey: config.apiKey, model: config.model, policy: input.policy,
      reservedHeadroomTokens: input.reservedHeadroomTokens,
      ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
    }),
  });
}
