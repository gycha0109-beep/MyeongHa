import type {
  OpenAiSajuConsultationShadowDispatchV1,
  OpenAiSajuConsultationShadowOutcomeV1,
} from './openai-saju-consultation-shadow-port-v1.js';
import {
  estimateSeyeonAiCallCostV1,
  type SeyeonAiPriceV1,
} from './seyeon-ai-usage-cost-v1.js';

export const READER_SAJU_CONSULTATION_BUDGET_GATE_VERSION_V1 =
  'reader-saju-consultation-budget-gate-v1' as const;

/**
 * A PRIVILEGED private evaluation budget boundary, not a public Reader grant.
 * The supplied authority must reserve spending atomically and durably for one
 * source-bound evaluation, including across server processes and retries.
 */
export interface ReaderSajuConsultationBudgetAuthorityV1 {
  reserve(input: Readonly<{
    evaluationId: string;
    officialReadingRef: string;
    sourceResponseHash: string;
    callId: string;
    purpose: OpenAiSajuConsultationShadowDispatchV1['purpose'];
    modelKey: string;
    priceVersion: string;
    maximumChargeMicroUsd: number;
    totalEvaluationLimitMicroUsd: number;
    maximumCalls: number;
  }>): Promise<Readonly<{ reservationRef: string }>>;
  settle(input: Readonly<{
    reservationRef: string;
    callId: string;
    outcome: OpenAiSajuConsultationShadowOutcomeV1['outcome'];
    priceVersion: string;
    observedCostMicroUsd: number | null;
    /** Unavailable provider counters must NOT silently become free. */
    retainedReservationMicroUsd: number;
    costStatus: 'estimated' | 'usage_unknown';
  }>): Promise<void>;
}

export interface ReaderSajuConsultationBudgetGateInputV1 {
  readonly evaluationId: string;
  readonly officialReadingRef: string;
  readonly sourceResponseHash: string;
  readonly totalEvaluationLimitMicroUsd: number;
  readonly maximumCalls: number;
  readonly allowedModels: readonly SeyeonAiPriceV1[];
  readonly authority: ReaderSajuConsultationBudgetAuthorityV1;
}

function positiveSafe(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(name + ' must be positive.');
  return value;
}

function required(value: string, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 ||
      value.length > 256 || /[\r\n]/u.test(value)) {
    throw new TypeError(name + ' must be a server-owned non-empty identifier.');
  }
  return value;
}

function maxCharge(inputBytes: number, outputTokens: number, quote: SeyeonAiPriceV1): number {
  // An upper estimate uses one input token per UTF-8 request byte and the
  // provider's submitted output-token ceiling; NO speculative cache savings.
  // This is intentionally an over-reservation, NOT a vendor invoice cap.
  const upperInputRate = Math.max(
    quote.inputMicroUsdPerMillion, quote.cachedInputMicroUsdPerMillion,
  );
  const numerator =
    BigInt(inputBytes) * BigInt(upperInputRate) +
    BigInt(outputTokens) * BigInt(quote.outputMicroUsdPerMillion);
  const value = (numerator + 999_999n) / 1_000_000n;
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new TypeError('Consultation budget estimate is outside safe integer range.');
  }
  return Number(value);
}

export function createReaderSajuConsultationBudgetGateV1(
  input: ReaderSajuConsultationBudgetGateInputV1,
) {
  const evaluationId = required(input.evaluationId, 'evaluationId');
  const officialReadingRef = required(input.officialReadingRef, 'officialReadingRef');
  const sourceResponseHash = required(input.sourceResponseHash, 'sourceResponseHash');
  const limit = positiveSafe(input.totalEvaluationLimitMicroUsd, 'totalEvaluationLimitMicroUsd');
  const maximumCalls = positiveSafe(input.maximumCalls, 'maximumCalls');
  if (maximumCalls > 32 || input.allowedModels.length === 0 || input.allowedModels.length > 8 ||
      typeof input.authority.reserve !== 'function' ||
      typeof input.authority.settle !== 'function') {
    throw new TypeError('Reader consultation budget requires a trusted durable authority.');
  }
  const quotes = new Map<string, SeyeonAiPriceV1>();
  for (const quote of input.allowedModels) {
    if (quote.providerKey !== 'openai-responses' ||
        quotes.has(quote.modelKey) ||
        !quote.priceVersion ||
        [quote.inputMicroUsdPerMillion, quote.cachedInputMicroUsdPerMillion,
          quote.outputMicroUsdPerMillion].some(
          (n) => !Number.isSafeInteger(n) || n < 0,
        )) {
      throw new TypeError('Unsupported or duplicate Reader consultation rate card.');
    }
    quotes.set(required(quote.modelKey, 'modelKey'), quote);
  }

  const reservations = new Map<string, {
    readonly ref: string;
    readonly quote: SeyeonAiPriceV1;
    readonly maximumChargeMicroUsd: number;
    settled: boolean;
  }>();
  const inFlight = new Set<string>();
  let committed = 0;
  let reservedTotal = 0;

  return Object.freeze({
    async beforeDispatch(call: OpenAiSajuConsultationShadowDispatchV1): Promise<void> {
      const quote = quotes.get(call.modelKey);
      if (!quote || typeof call.callId !== 'string' || !call.callId ||
          !Number.isSafeInteger(call.requestBytes) || call.requestBytes < 1 ||
          call.requestBytes > 65_536 ||
          !Number.isSafeInteger(call.maxOutputTokens) || call.maxOutputTokens < 1 ||
          call.maxOutputTokens > 1_600 ||
          !['consultation_generate', 'consultation_evaluate'].includes(call.purpose) ||
          reservations.has(call.callId) || inFlight.has(call.callId)) {
        throw new TypeError('Unpriced or unauthorized consultation provider dispatch.');
      }
      const upper = maxCharge(call.requestBytes, call.maxOutputTokens, quote);
      if (committed + inFlight.size >= maximumCalls ||
          reservedTotal + upper > limit) {
        throw new TypeError('Private consultation evaluation budget exceeded.');
      }
      inFlight.add(call.callId);
      reservedTotal += upper;
      try {
        const reservation = await input.authority.reserve({
          evaluationId,
          officialReadingRef,
          sourceResponseHash,
          callId: call.callId,
          purpose: call.purpose,
          modelKey: call.modelKey,
          priceVersion: quote.priceVersion,
          maximumChargeMicroUsd: upper,
          totalEvaluationLimitMicroUsd: limit,
          maximumCalls,
        });
        reservations.set(call.callId, {
          ref: required(reservation.reservationRef, 'reservationRef'),
          quote,
          maximumChargeMicroUsd: upper,
          settled: false,
        });
        committed += 1;
      } catch (e) {
        // No token dispatch may follow a failed durable reservation.
        reservedTotal -= upper;
        throw e;
      } finally {
        inFlight.delete(call.callId);
      }
    },

    async afterOutcome(receipt: OpenAiSajuConsultationShadowOutcomeV1): Promise<void> {
      const reserved = reservations.get(receipt.callId);
      if (!reserved || reserved.settled ||
          reserved.quote.modelKey !== receipt.modelKey ||
          !['consultation_generate', 'consultation_evaluate'].includes(receipt.purpose)) {
        throw new TypeError('Unbound or duplicated consultation provider cost receipt.');
      }
      const usage = {
        inputTokens: receipt.usage.inputTokens,
        outputTokens: receipt.usage.outputTokens,
        cachedInputTokens: receipt.usage.cachedInputTokens,
        reasoningTokens: null,
      };
      const estimate = estimateSeyeonAiCallCostV1({
        providerKey: 'openai-responses',
        modelKey: receipt.modelKey,
        usage,
        price: reserved.quote,
      });
      const known = receipt.outcome === 'response_received'
        && estimate.costStatus === 'estimated';
      const observed = known ? estimate.estimatedCostMicroUsd : null;
      await input.authority.settle({
        reservationRef: reserved.ref,
        callId: receipt.callId,
        outcome: receipt.outcome,
        priceVersion: reserved.quote.priceVersion,
        observedCostMicroUsd: observed,
        // Hold the entire reservation if the upstream outcome/counters are unknown.
        retainedReservationMicroUsd: observed ?? reserved.maximumChargeMicroUsd,
        costStatus: known ? 'estimated' : 'usage_unknown',
      });
      reserved.settled = true;
    },
  });
}
