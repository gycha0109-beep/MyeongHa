// Watchtower-Track: character-memory
// Deterministic offline cost/usage integrity check against EXISTING receipts.
// Read-only: no DB, Provider, reservation mutation or real-price assumptions.
import type {
  ModelTokenBudgetReceiptV1,
} from '../../../packages/domain/src/model-token-budget-profile-v1.js';
import {
  SEYEON_AI_COST_CONTRACT_VERSION_V1,
  type SeyeonAiCostEventV1,
} from './seyeon-ai-usage-cost-v1.js';
import type {
  SeyeonCostReservationV1,
} from './seyeon-cost-governor-contract-v1.js';

export const CHARACTER_MEMORY_COST_USAGE_OFFLINE_EVAL_VERSION_V1 =
  'character-memory-cost-usage-offline-eval-v1' as const;

export interface CharacterMemoryCostUsageOfflineCaseV1 {
  /** Safe synthetic-only label; never a real user or Provider call ID. */
  readonly caseId: string;
  /** Pinned by the offline fixture, not copied from the reservation under test. */
  readonly expectedScope: Readonly<{
    subjectId: string;
    turnId: string;
    attemptId: string;
  }>;
  readonly receipt: ModelTokenBudgetReceiptV1;
  readonly reservation: SeyeonCostReservationV1;
  readonly usageEvent: SeyeonAiCostEventV1;
}

export interface CharacterMemoryCostUsageOfflineResultV1 {
  readonly schemaVersion: typeof CHARACTER_MEMORY_COST_USAGE_OFFLINE_EVAL_VERSION_V1;
  readonly executionMode: 'offline_fixture_only';
  readonly caseCount: number;
  readonly passedCount: number;
  readonly failedCount: number;
  /** Historical per-case expected-billing estimates, never vendor invoices. */
  readonly knownEstimatedMicroUsd: number;
  readonly heldUnknownCeilingMicroUsd: number;
  readonly unknownUsageCases: number;
  readonly cases: readonly Readonly<{
    caseId: string;
    passed: boolean;
    accountingState: 'known_estimate' | 'held_unknown' | 'invalid';
    /** A held unknown event is safe accounting, NOT confirmed usage or tokens. */
    measuredUsageAvailable: boolean;
    checks: Readonly<{
      scopeAndAttemptPinned: boolean;
      distinctCallAndReservation: boolean;
      providerModelAndRateCardPinned: boolean;
      receiptAndUsageInternallyValid: boolean;
      knownTokenUsageWithinPreflightCaps: boolean;
      unknownUsageRemainsReserved: boolean;
      knownCostSettledWithinCeiling: boolean;
    }>;
  }>[];
}

function validCaseId(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value);
}
function uint(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function optionalUint(value: unknown): value is number | null {
  return value === null || uint(value);
}

/**
 * Inspect already-generated token and accounting receipts. This is not a
 * cost authority: rate cards, model profiles, usage and reservation records
 * MUST come from independently governed server paths in a real deployment.
 *
 * An unknown-usage call may PASS the safety/accounting check only if its
 * maximum reservation remains HELD; no token compliance is claimed for it.
 * Duplicate call/reservation evidence, over-ceiling and false zero-cost
 * settlements fail. Reports contain no Subject/turn/call IDs or source text.
 */
export function evaluateCharacterMemoryCostUsageOfflineV1(
  inputCases: readonly CharacterMemoryCostUsageOfflineCaseV1[],
): CharacterMemoryCostUsageOfflineResultV1 {
  const cases: readonly CharacterMemoryCostUsageOfflineCaseV1[] = inputCases;
  if (!Array.isArray(inputCases) || cases.length < 1 || cases.length > 100) {
    throw new TypeError('Offline cost evaluation requires 1 to 100 cases.');
  }
  const seenCaseIds = new Set<string>();
  const seenReservationKeys = new Set<string>();
  const seenCallIds = new Set<string>();
  let knownEstimated = 0n;
  let heldUnknown = 0n;
  let unknownUsageCases = 0;
  const results = cases.map(item => {
    if (!validCaseId(item.caseId) || seenCaseIds.has(item.caseId)) {
      throw new TypeError('Offline cost evaluation case labels must be unique and bounded.');
    }
    seenCaseIds.add(item.caseId);
    const { expectedScope, receipt, reservation, usageEvent } = item;
    const distinctCallAndReservation =
      typeof reservation.reservationKey === 'string' &&
      typeof usageEvent.callId === 'string' &&
      !seenReservationKeys.has(reservation.reservationKey) &&
      !seenCallIds.has(usageEvent.callId);
    seenReservationKeys.add(reservation.reservationKey);
    seenCallIds.add(usageEvent.callId);
    const scopeAndAttemptPinned =
      typeof expectedScope?.subjectId === 'string' &&
      typeof expectedScope?.turnId === 'string' &&
      typeof expectedScope?.attemptId === 'string' &&
      reservation.subjectId === expectedScope.subjectId &&
      reservation.turnId === expectedScope.turnId &&
      reservation.attemptId === expectedScope.attemptId;
    const providerModelAndRateCardPinned =
      typeof receipt.profileId === 'string' &&
      receipt.profileId.length > 0 &&
      receipt.modelKey === reservation.modelKey &&
      receipt.modelKey === usageEvent.modelKey &&
      receipt.providerKey === usageEvent.providerKey &&
      receipt.pricingVersion === reservation.rateCardVersion &&
      usageEvent.purpose === reservation.stage &&
      (usageEvent.priceVersion === null ||
        usageEvent.priceVersion === receipt.pricingVersion);
    const receiptAndUsageInternallyValid =
      receipt.schemaVersion === 'model-token-budget-receipt-v1' &&
      usageEvent.schemaVersion === SEYEON_AI_COST_CONTRACT_VERSION_V1 &&
      usageEvent.invoiceReconciled === false &&
      uint(receipt.certifiedInputTokenUpperBound) &&
      uint(receipt.reservedHeadroomTokens) &&
      uint(receipt.outputTokenLimit) &&
      uint(receipt.contextWindowTokens) &&
      uint(receipt.serializedRequestBodyBytes) &&
      receipt.serializedRequestBodyBytes > 0 &&
      uint(receipt.availableInputTokens) &&
      receipt.certifiedInputTokenUpperBound >= receipt.reservedHeadroomTokens &&
      receipt.outputTokenLimit <= receipt.contextWindowTokens &&
      receipt.availableInputTokens <=
        receipt.contextWindowTokens - receipt.outputTokenLimit &&
      receipt.certifiedInputTokenUpperBound <= receipt.availableInputTokens &&
      receipt.remainingInputTokens === receipt.availableInputTokens -
        receipt.certifiedInputTokenUpperBound &&
      uint(reservation.ceilingMicroUsd) &&
      uint(usageEvent.elapsedMs) &&
      optionalUint(usageEvent.inputTokens) &&
      optionalUint(usageEvent.outputTokens) &&
      optionalUint(usageEvent.cachedInputTokens) &&
      optionalUint(usageEvent.reasoningTokens) &&
      (usageEvent.inputTokens === null || usageEvent.cachedInputTokens === null ||
        usageEvent.cachedInputTokens <= usageEvent.inputTokens) &&
      (usageEvent.outputTokens === null || usageEvent.reasoningTokens === null ||
        usageEvent.reasoningTokens <= usageEvent.outputTokens);
    const measuredUsageAvailable =
      usageEvent.inputTokens !== null && usageEvent.outputTokens !== null;
    // A partially known response must still honor every independently
    // observed hard cap; missing input usage cannot excuse known excess output.
    const knownTokenUsageWithinPreflightCaps =
      (usageEvent.inputTokens === null ||
        BigInt(usageEvent.inputTokens) + BigInt(receipt.reservedHeadroomTokens) <=
          BigInt(receipt.certifiedInputTokenUpperBound)) &&
      (usageEvent.outputTokens === null ||
        usageEvent.outputTokens <= receipt.outputTokenLimit);
    const isKnown = usageEvent.costStatus === 'estimated' &&
      uint(usageEvent.estimatedCostMicroUsd) &&
      measuredUsageAvailable &&
      usageEvent.cachedInputTokens !== null &&
      usageEvent.priceVersion !== null;
    const isUnknown =
      (usageEvent.costStatus === 'usage_unknown' ||
       usageEvent.costStatus === 'price_unknown') &&
      usageEvent.estimatedCostMicroUsd === null;
    const unknownUsageRemainsReserved = !isUnknown ||
      (reservation.state === 'HELD_UNKNOWN_USAGE' &&
        reservation.actualEstimatedMicroUsd === null &&
        reservation.reconciliationEvidenceId === null);
    const knownCostSettledWithinCeiling = !isKnown ||
      (reservation.state === 'SETTLED' &&
        reservation.actualEstimatedMicroUsd === usageEvent.estimatedCostMicroUsd &&
        usageEvent.estimatedCostMicroUsd! <= reservation.ceilingMicroUsd);
    const checks = Object.freeze({
      scopeAndAttemptPinned,
      distinctCallAndReservation,
      providerModelAndRateCardPinned,
      receiptAndUsageInternallyValid,
      knownTokenUsageWithinPreflightCaps,
      unknownUsageRemainsReserved,
      knownCostSettledWithinCeiling,
    });
    const passed = Object.values(checks).every(Boolean) &&
      (isKnown || isUnknown) &&
      // Never represent an unpriced/unknown call as a proven settled cost.
      (!isUnknown || reservation.state === 'HELD_UNKNOWN_USAGE');
    if (passed && isKnown) {
      knownEstimated += BigInt(usageEvent.estimatedCostMicroUsd!);
    }
    if (passed && isUnknown) {
      heldUnknown += BigInt(reservation.ceilingMicroUsd);
      unknownUsageCases++;
    }
    return Object.freeze({
      caseId: item.caseId,
      passed,
      accountingState:
        passed && isKnown ? 'known_estimate' as const :
        passed && isUnknown ? 'held_unknown' as const : 'invalid' as const,
      measuredUsageAvailable,
      checks,
    });
  });
  if (knownEstimated > BigInt(Number.MAX_SAFE_INTEGER) ||
      heldUnknown > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('Offline cost evaluation aggregate exceeds safe bounds.');
  }
  const passedCount = results.filter(x => x.passed).length;
  return Object.freeze({
    schemaVersion: CHARACTER_MEMORY_COST_USAGE_OFFLINE_EVAL_VERSION_V1,
    executionMode: 'offline_fixture_only' as const,
    caseCount: results.length,
    passedCount,
    failedCount: results.length - passedCount,
    knownEstimatedMicroUsd: Number(knownEstimated),
    heldUnknownCeilingMicroUsd: Number(heldUnknown),
    unknownUsageCases,
    cases: Object.freeze(results),
  });
}
