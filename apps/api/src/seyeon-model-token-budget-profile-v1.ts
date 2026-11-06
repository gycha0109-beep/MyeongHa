import {
  MODEL_TOKEN_BUDGET_INPUT_BOUND_SEMANTICS_V1,
  MODEL_TOKEN_BUDGET_PROFILE_SCHEMA_VERSION_V1,
  validateModelTokenBudgetProfileV1,
  type ModelTokenBudgetProfileV1,
  type ModelTokenCountAdapterV1,
  type ModelTokenCountExactRequestV1,
  type ModelTokenBudgetReceiptV1,
} from '../../../packages/domain/src/model-token-budget-profile-v1.js';
import type { SeyeonStructuredProviderRequestV2 } from './seyeon-character-runtime-v2.js';
import type { SeyeonAiGovernorAdmissionV1 } from './postgres-seyeon-ai-cost-ledger-v1.js';
import {
  createSeyeonOpenAiInputTokenCountAdmissionV1,
  SEYEON_OPENAI_INPUT_TOKEN_COUNT_VERSION_V1,
  type SeyeonOpenAiInputTokenCountConfigV1,
} from './seyeon-openai-input-token-count-port-v1.js';
import {
  quoteSeyeonCostGovernorMaximumV1,
  validateSeyeonCostGovernorModelPolicyV1,
  type SeyeonCostGovernorModelPolicyV1,
  type SeyeonCostGovernorQuoteV1,
} from './seyeon-cost-governor-server-policy-v1.js';

export const SEYEON_OPENAI_RESPONSES_TEXT_JSON_SCHEMA_REQUEST_FORMAT_V1 =
  'openai-responses-text-json-schema-v1' as const;

export interface SeyeonOpenAiModelTokenBudgetBindingV1 {
  readonly profile: ModelTokenBudgetProfileV1;
  readonly counter: ModelTokenCountAdapterV1<SeyeonStructuredProviderRequestV2>;
}

export function createSeyeonOpenAiModelTokenBudgetProfileV1(input: Readonly<{
  policy: SeyeonCostGovernorModelPolicyV1;
  reservedHeadroomTokens: number;
}>): ModelTokenBudgetProfileV1 {
  const policy = validateSeyeonCostGovernorModelPolicyV1(input.policy);
  if (policy.providerKey !== 'openai-responses') {
    throw new TypeError('Se-yeon OpenAI token budget requires the native Responses provider.');
  }
  if (
    !Number.isSafeInteger(input.reservedHeadroomTokens) ||
    input.reservedHeadroomTokens < 1 ||
    input.reservedHeadroomTokens >= policy.maximumInputTokens
  ) {
    throw new TypeError('Se-yeon OpenAI token budget headroom is outside the approved input ceiling.');
  }

  return validateModelTokenBudgetProfileV1({
    schemaVersion: MODEL_TOKEN_BUDGET_PROFILE_SCHEMA_VERSION_V1,
    profileId: [
      'model-token-budget',
      policy.providerKey,
      policy.modelKey,
      policy.policyVersion,
      policy.priceQuote.priceVersion,
    ].join(':'),
    policyVersion: policy.policyVersion,
    providerKey: policy.providerKey,
    modelKey: policy.modelKey,
    pricingVersion: policy.priceQuote.priceVersion,
    contextWindowTokens: policy.contextWindowTokens,
    maximumInputTokens: policy.maximumInputTokens,
    maximumOutputTokens: policy.maximumOutputTokens,
    reservedHeadroomTokens: input.reservedHeadroomTokens,
    maximumSerializedRequestBytes: policy.maximumSerializedRequestBytes,
    tokenCounter: {
      adapterId: SEYEON_OPENAI_INPUT_TOKEN_COUNT_VERSION_V1,
      adapterVersion: SEYEON_OPENAI_INPUT_TOKEN_COUNT_VERSION_V1,
      supportedRequestFormat: SEYEON_OPENAI_RESPONSES_TEXT_JSON_SCHEMA_REQUEST_FORMAT_V1,
      inputBoundSemantics: MODEL_TOKEN_BUDGET_INPUT_BOUND_SEMANTICS_V1,
    },
  });
}

/**
 * Converts a certified provider-neutral budget receipt into the existing
 * Seyeon Cost Governor quote. The caller still persists the reservation only
 * through startGovernedSeyeonAiCallV1 in its canonical Subject transaction.
 */
export function quoteSeyeonCostGovernorFromModelTokenBudgetReceiptV1(input: Readonly<{
  policy: SeyeonCostGovernorModelPolicyV1;
  purpose: SeyeonStructuredProviderRequestV2['purpose'];
  receipt: ModelTokenBudgetReceiptV1;
}>): SeyeonCostGovernorQuoteV1 {
  const policy = validateSeyeonCostGovernorModelPolicyV1(input.policy);
  const receipt = input.receipt;
  const expectedAvailableInputTokens = Math.min(
    policy.maximumInputTokens,
    policy.contextWindowTokens - policy.maximumOutputTokens,
  );

  if (
    receipt.schemaVersion !== 'model-token-budget-receipt-v1' ||
    typeof receipt.profileId !== 'string' ||
    receipt.profileId.trim().length === 0 ||
    receipt.providerKey !== policy.providerKey ||
    receipt.modelKey !== policy.modelKey ||
    receipt.policyVersion !== policy.policyVersion ||
    receipt.pricingVersion !== policy.priceQuote.priceVersion ||
    receipt.contextWindowTokens !== policy.contextWindowTokens ||
    receipt.availableInputTokens !== expectedAvailableInputTokens ||
    receipt.outputTokenLimit !== policy.maximumOutputTokens ||
    !Number.isSafeInteger(receipt.reservedHeadroomTokens) ||
    receipt.reservedHeadroomTokens < 1 ||
    receipt.certifiedInputTokenUpperBound < receipt.reservedHeadroomTokens ||
    !Number.isSafeInteger(receipt.remainingInputTokens) ||
    receipt.remainingInputTokens !==
      expectedAvailableInputTokens - receipt.certifiedInputTokenUpperBound ||
    !Number.isSafeInteger(receipt.serializedRequestBodyBytes) ||
    receipt.serializedRequestBodyBytes < 1 ||
    receipt.serializedRequestBodyBytes > policy.maximumSerializedRequestBytes
  ) {
    throw new TypeError(
      'Se-yeon Cost Governor receipt does not match the exact model, policy, price, or token ceilings.',
    );
  }

  return quoteSeyeonCostGovernorMaximumV1({
    policy,
    request: {
      purpose: input.purpose,
      providerKey: receipt.providerKey,
      modelKey: receipt.modelKey,
      verifiedInputTokenUpperBound: receipt.certifiedInputTokenUpperBound,
      serializedRequestBytes: receipt.serializedRequestBodyBytes,
      enforcedOutputTokenLimit: receipt.outputTokenLimit,
    },
  });
}

function adaptSeyeonOpenAiInputTokenCountAdmissionV1(
  admission: SeyeonAiGovernorAdmissionV1,
  reservedHeadroomTokens: number,
): ModelTokenCountAdapterV1<SeyeonStructuredProviderRequestV2> {
  const policy = validateSeyeonCostGovernorModelPolicyV1(admission.policy);
  if (policy.providerKey !== 'openai-responses') {
    throw new TypeError('Se-yeon OpenAI token counter cannot bind a different provider.');
  }
  return Object.freeze({
    adapterId: SEYEON_OPENAI_INPUT_TOKEN_COUNT_VERSION_V1,
    adapterVersion: SEYEON_OPENAI_INPUT_TOKEN_COUNT_VERSION_V1,
    providerKey: policy.providerKey,
    modelKey: policy.modelKey,
    supportedRequestFormat: SEYEON_OPENAI_RESPONSES_TEXT_JSON_SCHEMA_REQUEST_FORMAT_V1,
    reservedHeadroomTokens,
    inputBoundSemantics: MODEL_TOKEN_BUDGET_INPUT_BOUND_SEMANTICS_V1,
    countExactRequest: (input: ModelTokenCountExactRequestV1<SeyeonStructuredProviderRequestV2>) => admission.certifiedInputTokenUpperBound(
      input.request,
      input.serializedRequestBodyBytes,
      input.serializedRequestBody,
    ),
  });
}

/**
 * Builds one server-owned profile and its matching opt-in official OpenAI
 * counter from the same configuration, preventing headroom/model drift.
 * Creating the binding performs no HTTP request; counting occurs only when
 * certifyModelTokenBudgetV1 is explicitly called.
 */
export function createSeyeonOpenAiModelTokenBudgetBindingV1(
  config: SeyeonOpenAiInputTokenCountConfigV1,
): SeyeonOpenAiModelTokenBudgetBindingV1 {
  const profile = createSeyeonOpenAiModelTokenBudgetProfileV1({
    policy: config.policy,
    reservedHeadroomTokens: config.reservedHeadroomTokens,
  });
  if (config.model !== profile.modelKey) {
    throw new TypeError('Se-yeon OpenAI model configuration does not match its budget profile.');
  }
  const admission = createSeyeonOpenAiInputTokenCountAdmissionV1(config);
  const counter = adaptSeyeonOpenAiInputTokenCountAdmissionV1(
    admission,
    config.reservedHeadroomTokens,
  );
  return Object.freeze({ profile, counter });
}
