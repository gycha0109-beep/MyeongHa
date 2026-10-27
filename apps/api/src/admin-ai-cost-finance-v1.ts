import { estimateSeyeonAiCallCostV1, type SeyeonAiPriceV1, type SeyeonAiTokenUsageV1 } from './seyeon-ai-usage-cost-v1.js';

export interface AdminAiFinanceCallV1 extends SeyeonAiTokenUsageV1 {
  readonly callId: string;
  readonly subjectId: string;
  readonly attemptId: string;
  readonly turnId: string;
  readonly createdAt: string;
  readonly workload: 'character_chat' | 'reading';
  readonly feature: string;
  readonly provider: string;
  readonly model: string;
  readonly outcome: string;
  readonly priceVersion: string | null;
  readonly priceAppliedAt?: string;
  readonly recordedEstimateMicroUsd: number | null;
  readonly appliedPrice?: SeyeonAiPriceV1;
}

/** Trusted server-side import/lookup contract; never populated from a browser body. */
export interface AdminAiBillingEvidenceV1 {
  readonly callId: string;
  readonly provider: string;
  readonly model: string;
  readonly currency: 'USD';
  readonly amountMicroUsd: number;
  readonly match: 'exact_call';
  readonly source: 'provider_billing_export';
  readonly evidenceSha256: string;
  readonly billedFrom: string;
  readonly billedTo: string;
}
export interface AdminAiBillingEvidencePortV1 {
  lookup(callIds: readonly string[]): Promise<readonly AdminAiBillingEvidenceV1[]>;
}

export interface AdminAiPriceHistoryV1 extends SeyeonAiPriceV1 {
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly sourceSha256: string;
}

export interface AdminAiFxEvidenceV1 {
  readonly currency: 'USD/KRW';
  readonly rateNumerator: number;
  readonly rateDenominator: number;
  readonly effectiveFrom: string;
  readonly effectiveTo: string;
  readonly sourceSha256: string;
}

const SHA256 = /^[a-f0-9]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9_.:/-]{1,256}$/u;
function integer(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid AI finance ' + label);
  return value;
}
function timestamp(value: string): number {
  const result = Date.parse(value);
  if (!Number.isFinite(result)) throw new Error('Invalid AI finance timestamp');
  return result;
}
function safeAmount(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('AI finance exceeds exact integer range');
  return Number(value);
}

/** Match an explicitly versioned time range; current prices cannot rewrite older calls. */
export function selectAdminAiPriceV1(call: AdminAiFinanceCallV1, history: readonly AdminAiPriceHistoryV1[]): SeyeonAiPriceV1 | undefined {
  const at = timestamp(call.createdAt);
  const matches = history.filter(price => {
    if (!SHA256.test(price.sourceSha256) || timestamp(price.effectiveFrom) >= (price.effectiveTo === null ? Infinity : timestamp(price.effectiveTo))) {
      throw new Error('Invalid AI price provenance or interval');
    }
    return price.providerKey === call.provider && price.modelKey === call.model &&
      price.priceVersion === call.priceVersion && at >= timestamp(price.effectiveFrom) &&
      (price.effectiveTo === null || at < timestamp(price.effectiveTo));
  });
  if (matches.length > 1) throw new Error('Ambiguous AI price history');
  return matches[0];
}

function matchingBill(call: AdminAiFinanceCallV1, evidence: readonly AdminAiBillingEvidenceV1[]): AdminAiBillingEvidenceV1 | undefined {
  const matches = evidence.filter(bill => bill.callId === call.callId);
  if (matches.length > 1) throw new Error('Duplicate AI billing reconciliation');
  const bill = matches[0];
  if (bill === undefined) return undefined;
  if (bill.source !== 'provider_billing_export' || bill.match !== 'exact_call' || bill.currency !== 'USD' ||
      bill.provider !== call.provider || bill.model !== call.model || !SHA256.test(bill.evidenceSha256) ||
      timestamp(bill.billedFrom) > timestamp(call.createdAt) || timestamp(bill.billedTo) <= timestamp(call.createdAt)) {
    throw new Error('AI billing evidence does not bind the exact call and period');
  }
  integer(bill.amountMicroUsd, 'invoice amount');
  return bill;
}

function krwMicroAmount(amountMicroUsd: number | null, at: string, fx: AdminAiFxEvidenceV1 | undefined): string | null {
  if (amountMicroUsd === null || fx === undefined) return null;
  if (fx.currency !== 'USD/KRW' || !SHA256.test(fx.sourceSha256) ||
      integer(fx.rateNumerator, 'FX numerator') === 0 || integer(fx.rateDenominator, 'FX denominator') === 0 ||
      timestamp(fx.effectiveFrom) > timestamp(at) || timestamp(fx.effectiveTo) <= timestamp(at)) return null;
  const numerator = BigInt(amountMicroUsd) * BigInt(fx.rateNumerator);
  return ((numerator + BigInt(fx.rateDenominator) - 1n) / BigInt(fx.rateDenominator)).toString();
}

export function reconcileAdminAiCallV1(call: AdminAiFinanceCallV1, input: {
  readonly billing?: readonly AdminAiBillingEvidenceV1[];
  readonly prices?: readonly AdminAiPriceHistoryV1[];
  readonly fx?: AdminAiFxEvidenceV1;
} = {}) {
  if (![call.feature, call.provider, call.model].every(value => IDENTIFIER.test(value))) throw new Error('Invalid AI finance metadata');
  timestamp(call.createdAt);
  for (const count of [call.inputTokens, call.outputTokens, call.cachedInputTokens, call.reasoningTokens, call.recordedEstimateMicroUsd]) {
    if (count !== null) integer(count, 'usage or amount');
  }
  const price = call.appliedPrice ?? selectAdminAiPriceV1(call, input.prices ?? []);
  if (price !== undefined && price.priceVersion !== call.priceVersion) throw new Error('AI call pinned price version differs');
  const usage = { inputTokens: call.inputTokens, outputTokens: call.outputTokens, cachedInputTokens: call.cachedInputTokens, reasoningTokens: call.reasoningTokens };
  const estimate = estimateSeyeonAiCallCostV1({ providerKey: call.provider, modelKey: call.model, usage,
    ...(price === undefined ? {} : { price }) });
  const estimated = estimate.estimatedCostMicroUsd ?? (call.priceVersion === null ? null : call.recordedEstimateMicroUsd);
  const bill = matchingBill(call, input.billing ?? []);
  const amount = bill?.amountMicroUsd ?? estimated;
  return Object.freeze({
    callId: call.callId, subjectId: call.subjectId, attemptId: call.attemptId, turnId: call.turnId,
    createdAt: call.createdAt, workload: call.workload, feature: call.feature, provider: call.provider,
    model: call.model, outcome: call.outcome, inputTokens: call.inputTokens, outputTokens: call.outputTokens,
    cachedInputTokens: call.cachedInputTokens, reasoningTokens: call.reasoningTokens,
    priceVersion: call.priceVersion,
    estimatedMicroUsd: estimated === null ? null : String(estimated),
    confirmedMicroUsd: bill === undefined ? null : String(bill.amountMicroUsd),
    billingStatus: bill === undefined ? 'billing_source_unconnected_or_unmatched' : 'provider_confirmed_exact_call',
    costClass: bill !== undefined ? 'provider_confirmed' : estimated !== null ? 'usage_price_estimate' : 'unknown',
    estimateSource: estimate.estimatedCostMicroUsd !== null ? 'pinned_usage_and_rates' : estimated !== null ? 'recorded_versioned_estimate' : 'missing_usage_or_price',
    estimateDeltaMicroUsd: bill === undefined || estimated === null ? null : String(bill.amountMicroUsd - estimated),
    priceAppliedAt: call.priceAppliedAt ?? call.createdAt,
    confirmedMicroKrw: krwMicroAmount(bill?.amountMicroUsd ?? null, call.createdAt, input.fx),
    estimatedMicroKrw: krwMicroAmount(estimated, call.createdAt, input.fx),
    fxEvidenceStatus: input.fx === undefined ? 'unmeasured' : krwMicroAmount(amount, call.createdAt, input.fx) === null ? 'out_of_scope_or_invalid' : 'verified_rate_supplied',
    otherChargesStatus: bill === undefined ? 'not_in_token_estimate' : 'included_in_provider_amount',
    billingEvidenceSha256: bill?.evidenceSha256 ?? null,
  });
}

/** Input must be the complete selected cohort, never a paginated list. */
export function summarizeAdminAiFinanceV1(calls: readonly AdminAiFinanceCallV1[], input: {
  readonly completeCohort: true;
  readonly billing?: readonly AdminAiBillingEvidenceV1[];
  readonly prices?: readonly AdminAiPriceHistoryV1[];
  readonly fx?: AdminAiFxEvidenceV1;
  readonly granularity: 'day' | 'month';
  readonly groupBy: 'feature' | 'subject';
}) {
  if (input.completeCohort !== true) throw new Error('Incomplete AI finance cohort');
  const seen = new Set<string>();
  const groups = new Map<string, { period: string; subjectId: string | null; feature: string; workload: string; provider: string; model: string;
    calls: number; failedCalls: number; confirmedCalls: number; estimatedCalls: number; unknownCalls: number; distinctAttempts: Set<string>;
    confirmed: bigint; estimated: bigint; failedEstimate: bigint; missingEstimates: number }>();
  for (const call of calls) {
    if (seen.has(call.callId)) throw new Error('Duplicate AI cost call');
    seen.add(call.callId);
    const row = reconcileAdminAiCallV1(call, input);
    const day = new Date(timestamp(call.createdAt)).toISOString().slice(0, input.granularity === 'day' ? 10 : 7);
    const key = [day,call.workload,call.feature,call.provider,call.model,input.groupBy === 'subject' ? call.subjectId : ''].join('|');
    const group = groups.get(key) ?? { period: day,subjectId: input.groupBy === 'subject' ? call.subjectId : null,feature: call.feature,
      workload: call.workload,provider: call.provider,model: call.model,calls:0,failedCalls:0,confirmedCalls:0,estimatedCalls:0,unknownCalls:0,
      distinctAttempts: new Set<string>(),confirmed:0n,estimated:0n,failedEstimate:0n,missingEstimates:0 };
    group.calls++; group.distinctAttempts.add(call.attemptId);
    if (call.outcome !== 'response_received') group.failedCalls++;
    if (row.confirmedMicroUsd !== null) { group.confirmedCalls++; group.confirmed += BigInt(row.confirmedMicroUsd); }
    else if (row.estimatedMicroUsd !== null) group.estimatedCalls++;
    else group.unknownCalls++;
    if (row.estimatedMicroUsd !== null) { group.estimated += BigInt(row.estimatedMicroUsd); if (call.outcome !== 'response_received') group.failedEstimate += BigInt(row.estimatedMicroUsd); }
    else group.missingEstimates++;
    groups.set(key,group);
  }
  return [...groups.values()].map(group => Object.freeze({ period:group.period,subjectId:group.subjectId,workload:group.workload,
    feature:group.feature,provider:group.provider,model:group.model,calls:group.calls,failedCalls:group.failedCalls,
    observedAttempts:group.distinctAttempts.size,confirmedCalls:group.confirmedCalls,estimatedCalls:group.estimatedCalls,unknownCalls:group.unknownCalls,
    confirmedMicroUsd:group.confirmedCalls === group.calls ? group.confirmed.toString() : null,
    knownConfirmedMicroUsd:group.confirmedCalls > 0 ? group.confirmed.toString() : null,
    estimatedMicroUsd:group.missingEstimates === 0 ? group.estimated.toString() : null,
    knownEstimateMicroUsd:group.estimated.toString(),failedEstimateMicroUsd:group.failedEstimate.toString(),
  }));
}

export function compareAdminAiRevenueV1(input: { readonly verifiedRevenueMicroKrw: number | null; readonly confirmedCostMicroKrw: number | null; readonly samePeriodAndCohort: boolean }) {
  if (!input.samePeriodAndCohort || input.verifiedRevenueMicroKrw === null || input.confirmedCostMicroKrw === null) return null;
  integer(input.verifiedRevenueMicroKrw,'revenue'); integer(input.confirmedCostMicroKrw,'confirmed cost');
  if (input.verifiedRevenueMicroKrw === 0) return null;
  return String(safeAmount(BigInt(input.confirmedCostMicroKrw) * 10_000n / BigInt(input.verifiedRevenueMicroKrw)));
}
