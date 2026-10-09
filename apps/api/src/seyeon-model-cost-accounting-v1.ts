/**
 * Offline and side-effect-free cost accounting contract.
 * This module DOES NOT invoke a model, grant chat access, persist usage, or
 * assert that repository-estimated costs equal an AI provider's invoice.
 *
 * Monetary units:
 *   microUsd = 1 / 1,000,000 US dollar;
 *   rateMicroUsdPerMillionTokens = microUsd charged for 1,000,000 tokens.
 */
export const SEYEON_MODEL_COST_ACCOUNTING_VERSION_V1 =
  'seyeon-model-cost-accounting-v1' as const;

export interface SeyeonTokenUsageV1 {
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens: number;
}

export interface SeyeonTokenRatesV1 {
  readonly inputMicroUsdPerMillionTokens: number;
  readonly cachedInputMicroUsdPerMillionTokens: number;
  readonly outputMicroUsdPerMillionTokens: number;
}

export interface SeyeonCostRateCardV1 {
  readonly version: string;
  readonly models: Readonly<Record<string, SeyeonTokenRatesV1>>;
}

export type SeyeonProviderUsageResolutionV1 =
  | Readonly<{ status: 'PRESENT'; usage: SeyeonTokenUsageV1 }>
  | Readonly<{ status: 'MISSING' | 'INVALID'; usage: null }>;

export type SeyeonEstimatedCostV1 =
  | Readonly<{
      status: 'ESTIMATED';
      microUsd: number;
      usage: SeyeonTokenUsageV1;
      modelKey: string;
      rateCardVersion: string;
    }>
  | Readonly<{
      status: 'USAGE_MISSING' | 'USAGE_INVALID' | 'MODEL_UNPRICED' | 'OVERFLOW';
      microUsd: null;
      usage: SeyeonTokenUsageV1 | null;
      modelKey: string;
      rateCardVersion: string;
    }>;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function tokens(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function moneyUnits(value: unknown): value is number {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) && value >= 0;
}

function normalModelKey(value: string): string {
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > 256) {
    throw new TypeError('Invalid Se-yeon model key.');
  }
  return normalized;
}

function normalRateCardVersion(value: string): string {
  const version = value.trim();
  if (version.length < 1 || version.length > 128) {
    throw new TypeError('Invalid Se-yeon model rate card version.');
  }
  return version;
}

function ratesFor(
  modelKey: string,
  card: SeyeonCostRateCardV1,
): SeyeonTokenRatesV1 | null {
  const rates = Object.hasOwn(card.models, modelKey)
    ? card.models[modelKey]
    : undefined;
  if (rates === undefined) return null;
  if (
    !moneyUnits(rates.inputMicroUsdPerMillionTokens) ||
    !moneyUnits(rates.cachedInputMicroUsdPerMillionTokens) ||
    !moneyUnits(rates.outputMicroUsdPerMillionTokens)
  ) {
    throw new TypeError('Invalid Se-yeon cost rate card: rates must be safe nonnegative microUSD integers.');
  }
  return rates;
}

function ceilCostMicroUsd(
  usage: Readonly<Pick<SeyeonTokenUsageV1, 'inputTokens' | 'cachedInputTokens' | 'outputTokens'>>,
  rates: SeyeonTokenRatesV1,
): number | null {
  const uncached = usage.inputTokens - usage.cachedInputTokens;
  const numerator =
    BigInt(uncached) * BigInt(rates.inputMicroUsdPerMillionTokens) +
    BigInt(usage.cachedInputTokens) * BigInt(rates.cachedInputMicroUsdPerMillionTokens) +
    BigInt(usage.outputTokens) * BigInt(rates.outputMicroUsdPerMillionTokens);
  const rounded = (numerator + 999_999n) / 1_000_000n;
  return rounded <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(rounded) : null;
}

/**
 * Parse a Responses-style provider payload. Cached inputs and reasoning outputs
 * are already INCLUDED in input_tokens/output_tokens respectively.
 * Unknown or corrupt usage MUST NOT be treated as a free request.
 */
export function resolveSeyeonProviderTokenUsageV1(
  providerPayload: unknown,
): SeyeonProviderUsageResolutionV1 {
  if (!isRecord(providerPayload) ||
      !Object.hasOwn(providerPayload, 'usage') ||
      providerPayload.usage === null ||
      providerPayload.usage === undefined) {
    return Object.freeze({ status: 'MISSING', usage: null });
  }
  if (!isRecord(providerPayload.usage)) {
    return Object.freeze({ status: 'INVALID', usage: null });
  }
  const raw = providerPayload.usage;
  const inputTokens = tokens(raw.input_tokens);
  const outputTokens = tokens(raw.output_tokens);
  const inputDetails = raw.input_tokens_details;
  const outputDetails = raw.output_tokens_details;
  if (
    inputTokens === null || outputTokens === null ||
    (inputDetails !== undefined && !isRecord(inputDetails)) ||
    (outputDetails !== undefined && !isRecord(outputDetails))
  ) {
    return Object.freeze({ status: 'INVALID', usage: null });
  }
  const cachedInputTokens = isRecord(inputDetails) && inputDetails.cached_tokens !== undefined
    ? tokens(inputDetails.cached_tokens) : 0;
  const reasoningTokens = isRecord(outputDetails) && outputDetails.reasoning_tokens !== undefined
    ? tokens(outputDetails.reasoning_tokens) : 0;
  if (
    cachedInputTokens === null || reasoningTokens === null ||
    cachedInputTokens > inputTokens || reasoningTokens > outputTokens
  ) {
    return Object.freeze({ status: 'INVALID', usage: null });
  }
  return Object.freeze({
    status: 'PRESENT',
    usage: Object.freeze({ inputTokens, cachedInputTokens, outputTokens, reasoningTokens }),
  });
}

export function estimateSeyeonProviderCallCostV1(input: {
  readonly providerPayload: unknown;
  readonly modelKey: string;
  readonly rateCard: SeyeonCostRateCardV1;
}): SeyeonEstimatedCostV1 {
  const modelKey = normalModelKey(input.modelKey);
  const rateCardVersion = normalRateCardVersion(input.rateCard.version);
  const usage = resolveSeyeonProviderTokenUsageV1(input.providerPayload);
  if (usage.status !== 'PRESENT') {
    return Object.freeze({
      status: usage.status === 'MISSING' ? 'USAGE_MISSING' : 'USAGE_INVALID',
      microUsd: null,
      usage: null,
      modelKey,
      rateCardVersion,
    });
  }
  const rates = ratesFor(modelKey, input.rateCard);
  if (rates === null) {
    return Object.freeze({
      status: 'MODEL_UNPRICED', microUsd: null, usage: usage.usage,
      modelKey, rateCardVersion,
    });
  }
  const microUsd = ceilCostMicroUsd(usage.usage, rates);
  if (microUsd === null) {
    return Object.freeze({
      status: 'OVERFLOW', microUsd: null, usage: usage.usage,
      modelKey, rateCardVersion,
    });
  }
  return Object.freeze({
    status: 'ESTIMATED', microUsd, usage: usage.usage,
    modelKey, rateCardVersion,
  });
}

/**
 * Estimate a worst-case reservation assuming ZERO cached tokens. This is only
 * a quote: the actual provider request MUST independently enforce the supplied
 * input/output token ceilings and model-call count.
 */
export function quoteSeyeonModelCallCeilingV1(input: {
  readonly modelKey: string;
  readonly rateCard: SeyeonCostRateCardV1;
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
}): Readonly<{ microUsd: number; modelKey: string; rateCardVersion: string }> {
  const modelKey = normalModelKey(input.modelKey);
  const rateCardVersion = normalRateCardVersion(input.rateCard.version);
  const rates = ratesFor(modelKey, input.rateCard);
  if (rates === null) throw new TypeError('Se-yeon model is not priced: deny admission.');
  const maxInputTokens = tokens(input.maxInputTokens);
  const maxOutputTokens = tokens(input.maxOutputTokens);
  if (maxInputTokens === null || maxOutputTokens === null ||
      maxInputTokens === 0 || maxOutputTokens === 0) {
    throw new TypeError('Se-yeon reservation requires enforceable positive token ceilings.');
  }
  const microUsd = ceilCostMicroUsd({
    inputTokens: maxInputTokens, cachedInputTokens: 0, outputTokens: maxOutputTokens,
  }, rates);
  if (microUsd === null) throw new RangeError('Se-yeon cost reservation would overflow.');
  return Object.freeze({ microUsd, modelKey, rateCardVersion });
}

export function sumSeyeonEstimatedCostMicroUsdV1(
  costs: readonly number[],
): number {
  let total = 0n;
  for (const cost of costs) {
    if (!moneyUnits(cost)) throw new TypeError('Invalid Se-yeon microUSD charge.');
    total += BigInt(cost);
  }
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('Se-yeon total microUSD charge would overflow.');
  }
  return Number(total);
}
