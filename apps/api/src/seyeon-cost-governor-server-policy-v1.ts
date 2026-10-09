import type { SeyeonAiPriceV1 } from './seyeon-ai-usage-cost-v1.js';
import type { SeyeonStructuredPurposeV2 } from './seyeon-character-runtime-v2.js';

/**
 * PR-04A: offline validation and upper-cost quotation from SERVER-owned inputs.
 * This is NOT a tokenizer, admission authority, provider limit, or DB lock.
 * Production ENFORCE requires an independent trusted input-token bound and
 * verified provider output enforcement before invoking this function.
 */
export const SEYEON_COST_GOVERNOR_SERVER_POLICY_VERSION_V1 =
  'seyeon-cost-governor-server-policy-v1' as const;

export interface SeyeonCostGovernorModelPolicyV1 {
  readonly policyVersion: string;
  readonly providerKey: string;
  readonly modelKey: string;
  readonly priceQuote: SeyeonAiPriceV1;
  readonly allowedPurposes: readonly SeyeonStructuredPurposeV2[];
  /** Approved model context window, including request framing. */
  readonly contextWindowTokens: number;
  readonly maximumInputTokens: number;
  /** Must be enforced by the model provider, including reasoning tokens. */
  readonly maximumOutputTokens: number;
  readonly maximumSerializedRequestBytes: number;
}

export interface SeyeonCostGovernorBoundedRequestV1 {
  readonly purpose: SeyeonStructuredPurposeV2;
  readonly providerKey: string;
  readonly modelKey: string;
  /**
   * Conservative upper bound provided by a trusted server token-counting port.
   * Includes instructions, schema, tool/framing overhead, and input payload.
   * Estimates, client-supplied counts, or nullable usage are NOT admissible.
   */
  readonly verifiedInputTokenUpperBound: number | null;
  /** Full serialized upstream request bytes, independently measured by server. */
  readonly serializedRequestBytes: number | null;
  /** Exactly the cap that will be sent to and enforced by the provider. */
  readonly enforcedOutputTokenLimit: number | null;
}

export interface SeyeonCostGovernorQuoteV1 {
  readonly policyVersion: string;
  readonly rateCardVersion: string;
  readonly providerKey: string;
  readonly modelKey: string;
  readonly purpose: SeyeonStructuredPurposeV2;
  readonly inputCeilingTokens: number;
  readonly outputCeilingTokens: number;
  readonly ceilingMicroUsd: number;
}

const PURPOSES: ReadonlySet<SeyeonStructuredPurposeV2> = new Set([
  'integrity_classification',
  'unified_preflight_shadow',
  'turn_interpret_render_shadow',
  'disclosure_classification',
  'turn_interpretation',
  'dialogue_render',
  'semantic_review',
  'event_extraction',
]);

function id(value: string, label: string): void {
  if (typeof value !== 'string' ||
      !/^[a-zA-Z0-9_.:/-]{1,128}$/u.test(value)) {
    throw new Error('Se-yeon budget policy invalid ' + label + '.');
  }
}

function integer(value: unknown, label: string, positive = true): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) ||
      value < (positive ? 1 : 0)) {
    throw new Error('Se-yeon budget policy invalid ' + label + '.');
  }
  return value;
}

export function validateSeyeonCostGovernorModelPolicyV1(
  policy: SeyeonCostGovernorModelPolicyV1,
): SeyeonCostGovernorModelPolicyV1 {
  id(policy.policyVersion, 'policy version');
  id(policy.providerKey, 'provider');
  id(policy.modelKey, 'model');
  id(policy.priceQuote.priceVersion, 'rate card version');
  if (policy.providerKey !== policy.priceQuote.providerKey ||
      policy.modelKey !== policy.priceQuote.modelKey) {
    throw new Error('Se-yeon budget policy rate card provider/model mismatch.');
  }
  const rates = policy.priceQuote;
  integer(rates.inputMicroUsdPerMillion, 'input rate', false);
  integer(rates.cachedInputMicroUsdPerMillion, 'cached input rate', false);
  integer(rates.outputMicroUsdPerMillion, 'output rate', false);
  if (rates.inputMicroUsdPerMillion === 0 ||
      rates.outputMicroUsdPerMillion === 0) {
    throw new Error('Se-yeon budget policy missing billable input/output rate.');
  }
  const window = integer(policy.contextWindowTokens, 'context window');
  const inputMax = integer(policy.maximumInputTokens, 'input ceiling');
  const outputMax = integer(policy.maximumOutputTokens, 'output ceiling');
  integer(policy.maximumSerializedRequestBytes, 'request byte ceiling');
  if (BigInt(inputMax) + BigInt(outputMax) > BigInt(window)) {
    throw new Error('Se-yeon budget policy token ceilings exceed context window.');
  }
  if (!Array.isArray(policy.allowedPurposes) ||
      policy.allowedPurposes.length === 0 ||
      policy.allowedPurposes.some(purpose => !PURPOSES.has(purpose)) ||
      new Set(policy.allowedPurposes).size !== policy.allowedPurposes.length) {
    throw new Error('Se-yeon budget policy invalid allowed purposes.');
  }
  return policy;
}

/**
 * Quote the worst-case uncached input and output cost, rounded UP.
 * Cached tokens are priced at the greater of cached and standard input rates:
 * no speculative cache discount is ever used to admit a paid request.
 * Actual provider invoice and costs outside the approved token model remain
 * outside this quotation. Never call this with client-controlled policy.
 */
export function quoteSeyeonCostGovernorMaximumV1(input: {
  readonly policy: SeyeonCostGovernorModelPolicyV1;
  readonly request: SeyeonCostGovernorBoundedRequestV1;
}): SeyeonCostGovernorQuoteV1 {
  const policy = validateSeyeonCostGovernorModelPolicyV1(input.policy);
  const request = input.request;
  if (request.providerKey !== policy.providerKey ||
      request.modelKey !== policy.modelKey) {
    throw new Error('Se-yeon budget request does not match approved provider/model.');
  }
  if (!policy.allowedPurposes.includes(request.purpose)) {
    throw new Error('Se-yeon budget request purpose is not approved.');
  }
  const actualBytes = integer(request.serializedRequestBytes, 'serialized request bytes');
  if (actualBytes > policy.maximumSerializedRequestBytes) {
    throw new Error('Se-yeon budget request exceeds approved byte ceiling.');
  }
  const inputTokens = integer(request.verifiedInputTokenUpperBound, 'verified input bound');
  if (inputTokens > policy.maximumInputTokens) {
    throw new Error('Se-yeon budget request exceeds approved input ceiling.');
  }
  const outputTokens = integer(request.enforcedOutputTokenLimit, 'provider output limit');
  if (outputTokens !== policy.maximumOutputTokens) {
    throw new Error('Se-yeon budget request requires the approved provider output limit.');
  }
  if (BigInt(inputTokens) + BigInt(outputTokens) >
      BigInt(policy.contextWindowTokens)) {
    throw new Error('Se-yeon budget request exceeds context window.');
  }
  const rate = policy.priceQuote;
  const inputRate = Math.max(
    rate.inputMicroUsdPerMillion,
    rate.cachedInputMicroUsdPerMillion,
  );
  const numerator =
    BigInt(inputTokens) * BigInt(inputRate) +
    BigInt(outputTokens) * BigInt(rate.outputMicroUsdPerMillion);
  const microUsd = (numerator + 999_999n) / 1_000_000n;
  if (microUsd > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Se-yeon budget quote exceeds safe integer range.');
  }
  return Object.freeze({
    policyVersion: policy.policyVersion,
    rateCardVersion: rate.priceVersion,
    providerKey: policy.providerKey,
    modelKey: policy.modelKey,
    purpose: request.purpose,
    inputCeilingTokens: inputTokens,
    outputCeilingTokens: outputTokens,
    ceilingMicroUsd: Number(microUsd),
  });
}
