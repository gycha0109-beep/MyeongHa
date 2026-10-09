/**
 * Offline-only monetary projection for Se-yeon AI calls.
 * No prompts, responses, identifiers of users, or provider secrets belong here.
 * Vendor price schedules must be supplied and versioned by the server;
 * unpriced calls stay unknown rather than silently becoming free.
 */
export const SEYEON_AI_COST_CONTRACT_VERSION_V1 =
  'seyeon-ai-cost-v1' as const;

export type SeyeonAiCallOutcomeV1 =
  | 'response_received'
  | 'http_failure'
  | 'network_failure'
  | 'timeout'
  | 'invalid_content_type'
  | 'invalid_response';

export interface SeyeonAiTokenUsageV1 {
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  /** Subset of inputTokens, not an additional input quantity. */
  readonly cachedInputTokens: number | null;
  /** Subset of outputTokens, not an additional output quantity. */
  readonly reasoningTokens: number | null;
}

/** USD micro-units charged per million tokens (1 USD = 1,000,000 microUSD). */
export interface SeyeonAiPriceV1 {
  readonly priceVersion: string;
  readonly providerKey: string;
  readonly modelKey: string;
  readonly inputMicroUsdPerMillion: number;
  readonly cachedInputMicroUsdPerMillion: number;
  readonly outputMicroUsdPerMillion: number;
}

export interface SeyeonAiCostEventV1 extends SeyeonAiTokenUsageV1 {
  readonly schemaVersion: typeof SEYEON_AI_COST_CONTRACT_VERSION_V1;
  readonly callId: string;
  readonly purpose: string;
  readonly providerKey: string;
  readonly modelKey: string;
  readonly outcome: SeyeonAiCallOutcomeV1;
  readonly httpStatus: number | null;
  readonly elapsedMs: number;
  readonly priceVersion: string | null;
  readonly estimatedCostMicroUsd: number | null;
  readonly costStatus: 'estimated' | 'usage_unknown' | 'price_unknown';
  /** Always an estimate. This is never a provider invoice amount. */
  readonly invoiceReconciled: false;
}

function nonnegativeSafeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('Se-yeon AI cost ' + field + ' must be a nonnegative safe integer.');
  }
}

function id(value: string, field: string): string {
  if (typeof value !== 'string' || value.length === 0 ||
      value.length > 256 || !/^[a-zA-Z0-9_.:\/-]+$/u.test(value)) {
    throw new Error('Se-yeon AI cost ' + field + ' is invalid.');
  }
  return value;
}

export function estimateSeyeonAiCallCostV1(input: {
  readonly providerKey: string;
  readonly modelKey: string;
  readonly usage: SeyeonAiTokenUsageV1;
  readonly price?: SeyeonAiPriceV1;
}): Readonly<{
  priceVersion: string | null;
  estimatedCostMicroUsd: number | null;
  costStatus: SeyeonAiCostEventV1['costStatus'];
}> {
  const { usage, price } = input;
  for (const [key, value] of Object.entries(usage)) {
    if (value !== null) nonnegativeSafeInteger(value, key);
  }
  if (
    usage.cachedInputTokens !== null &&
    usage.inputTokens !== null &&
    usage.cachedInputTokens > usage.inputTokens
  ) {
    throw new Error('Cached input tokens cannot exceed total input tokens.');
  }
  if (
    usage.reasoningTokens !== null &&
    usage.outputTokens !== null &&
    usage.reasoningTokens > usage.outputTokens
  ) {
    throw new Error('Reasoning tokens cannot exceed total output tokens.');
  }
  if (price === undefined) {
    return Object.freeze({
      priceVersion: null,
      estimatedCostMicroUsd: null,
      costStatus: 'price_unknown' as const,
    });
  }
  id(price.priceVersion, 'priceVersion');
  if (price.providerKey !== input.providerKey ||
      price.modelKey !== input.modelKey) {
    throw new Error('AI cost price quote does not match the provider/model.');
  }
  for (const key of [
    'inputMicroUsdPerMillion',
    'cachedInputMicroUsdPerMillion',
    'outputMicroUsdPerMillion',
  ] as const) nonnegativeSafeInteger(price[key], key);

  if (usage.inputTokens === null ||
      usage.outputTokens === null ||
      usage.cachedInputTokens === null) {
    return Object.freeze({
      priceVersion: price.priceVersion,
      estimatedCostMicroUsd: null,
      costStatus: 'usage_unknown' as const,
    });
  }
  const uncached = usage.inputTokens - usage.cachedInputTokens;
  const numerator =
    BigInt(uncached) * BigInt(price.inputMicroUsdPerMillion) +
    BigInt(usage.cachedInputTokens) * BigInt(price.cachedInputMicroUsdPerMillion) +
    BigInt(usage.outputTokens) * BigInt(price.outputMicroUsdPerMillion);
  const roundedMicroUsd = (numerator + 999_999n) / 1_000_000n;
  if (roundedMicroUsd > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Se-yeon AI cost estimate is outside the safe integer range.');
  }
  return Object.freeze({
    priceVersion: price.priceVersion,
    estimatedCostMicroUsd: Number(roundedMicroUsd),
    costStatus: 'estimated' as const,
  });
}

export function createSeyeonAiCostEventV1(input: {
  readonly callId: string;
  readonly purpose: string;
  readonly providerKey: string;
  readonly modelKey: string;
  readonly outcome: SeyeonAiCallOutcomeV1;
  readonly httpStatus: number | null;
  readonly elapsedMs: number;
  readonly usage: SeyeonAiTokenUsageV1;
  readonly price?: SeyeonAiPriceV1;
}): SeyeonAiCostEventV1 {
  nonnegativeSafeInteger(input.elapsedMs, 'elapsedMs');
  if (input.httpStatus !== null) nonnegativeSafeInteger(input.httpStatus, 'httpStatus');
  const quote = estimateSeyeonAiCallCostV1({
    providerKey: input.providerKey,
    modelKey: input.modelKey,
    usage: input.usage,
    ...(input.price === undefined ? {} : { price: input.price }),
  });
  return Object.freeze({
    schemaVersion: SEYEON_AI_COST_CONTRACT_VERSION_V1,
    callId: id(input.callId, 'callId'),
    purpose: id(input.purpose, 'purpose'),
    providerKey: id(input.providerKey, 'providerKey'),
    modelKey: id(input.modelKey, 'modelKey'),
    outcome: input.outcome,
    httpStatus: input.httpStatus,
    elapsedMs: input.elapsedMs,
    ...input.usage,
    ...quote,
    invoiceReconciled: false as const,
  });
}

/**
 * An offline aggregation primitive. Attribution to subject/turn/attempt,
 * durable storage, and budget reservations are separate DB authority work.
 */
export function summarizeSeyeonAiCostsV1(events: readonly SeyeonAiCostEventV1[]) {
  const seen = new Set<string>();
  let knownCostMicroUsd = 0n;
  let unknownCostCalls = 0;
  let postTurnCalls = 0;
  let failedCalls = 0;
  for (const event of events) {
    if (seen.has(event.callId)) {
      throw new Error('Duplicate AI call id in cost summary.');
    }
    seen.add(event.callId);
    if (event.purpose === 'event_extraction') postTurnCalls++;
    if (event.outcome !== 'response_received') failedCalls++;
    if (event.estimatedCostMicroUsd === null) unknownCostCalls++;
    else knownCostMicroUsd += BigInt(event.estimatedCostMicroUsd);
  }
  if (knownCostMicroUsd > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('AI cost summary exceeds safe integer range.');
  }
  return Object.freeze({
    callCount: events.length,
    postTurnCalls,
    failedCalls,
    knownCostMicroUsd: Number(knownCostMicroUsd),
    unknownCostCalls,
    totalEstimatedCostMicroUsd:
      unknownCostCalls === 0 ? Number(knownCostMicroUsd) : null,
  });
}
