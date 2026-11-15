import { describe, expect, it } from 'vitest';
import type { ModelTokenBudgetReceiptV1 } from '../packages/domain/src/model-token-budget-profile-v1.js';
import {
  evaluateCharacterMemoryCostUsageOfflineV1,
  type CharacterMemoryCostUsageOfflineCaseV1,
} from '../apps/api/src/character-memory-cost-usage-offline-evaluation-v1.js';
import {
  createSeyeonAiCostEventV1,
} from '../apps/api/src/seyeon-ai-usage-cost-v1.js';
import {
  emptySeyeonCostGovernorSnapshotV1,
  holdUnknownSeyeonCostUsageV1,
  markSeyeonCostDispatchedV1,
  reserveSeyeonCostCandidateV1,
  settleSeyeonCostReservationV1,
} from '../apps/api/src/seyeon-cost-governor-contract-v1.js';

const subjectId = '11111111-1111-4111-8111-111111111111';
const turnId = '22222222-2222-4222-8222-222222222222';
const attemptId = '33333333-3333-4333-8333-333333333333';
const receipt: ModelTokenBudgetReceiptV1 = Object.freeze({
  schemaVersion: 'model-token-budget-receipt-v1',
  profileId: 'synthetic-offline-v1',
  policyVersion: 'offline-policy-v1',
  pricingVersion: 'offline-price-v1',
  providerKey: 'synthetic-only',
  modelKey: 'synthetic-only',
  requestFormat: 'offline-test',
  tokenCounterAdapterId: 'offline-counter',
  tokenCounterAdapterVersion: 'v1',
  serializedRequestBodyBytes: 123,
  certifiedInputTokenUpperBound: 150,
  reservedHeadroomTokens: 20,
  outputTokenLimit: 120,
  contextWindowTokens: 600,
  availableInputTokens: 300,
  remainingInputTokens: 150,
});

function fixture(key: string, callId: string, unknown = false):
  CharacterMemoryCostUsageOfflineCaseV1 {
  const identity = {
    reservationKey: key,
    bucketUtcDate: '2026-11-08',
    subjectId, turnId, attemptId,
    stage: 'dialogue_render' as const,
    modelKey: 'synthetic-only',
    rateCardVersion: 'offline-price-v1',
    ceilingMicroUsd: 1000,
  };
  const reserve = reserveSeyeonCostCandidateV1({
    snapshot: emptySeyeonCostGovernorSnapshotV1(),
    identity,
    policy: {
      bucketUtcDate: '2026-11-08',
      globalLimitMicroUsd: 5000,
      subjectLimitMicroUsd: 3000,
    },
  });
  if (reserve.reservation === null) throw new Error('Expected synthetic reservation.');
  const dispatched = markSeyeonCostDispatchedV1(reserve.snapshot, key);
  const cost = createSeyeonAiCostEventV1({
    callId,
    purpose: 'dialogue_render',
    providerKey: 'synthetic-only',
    modelKey: 'synthetic-only',
    outcome: unknown ? 'timeout' : 'response_received',
    httpStatus: unknown ? null : 200,
    elapsedMs: unknown ? 5000 : 120,
    usage: {
      inputTokens: unknown ? null : 105,
      outputTokens: unknown ? null : 42,
      cachedInputTokens: unknown ? null : 5,
      reasoningTokens: unknown ? null : 0,
    },
    price: {
      priceVersion: 'offline-price-v1',
      providerKey: 'synthetic-only',
      modelKey: 'synthetic-only',
      inputMicroUsdPerMillion: 1000000,
      cachedInputMicroUsdPerMillion: 500000,
      outputMicroUsdPerMillion: 3000000,
    },
  });
  const snapshot = unknown
    ? holdUnknownSeyeonCostUsageV1(dispatched, key)
    : settleSeyeonCostReservationV1(dispatched, key, cost.estimatedCostMicroUsd!);
  return {
    caseId: key,
    expectedScope: { subjectId, turnId, attemptId },
    receipt,
    reservation: snapshot.reservations[0]!,
    usageEvent: cost,
  };
}

describe('Character Memory offline cost/usage reconciliation', () => {
  it('reconciles governed reserved and settled estimated cost against preflight caps', () => {
    const result = evaluateCharacterMemoryCostUsageOfflineV1([
      fixture('cost-ok', 'call-ok'),
    ]);
    expect(result).toMatchObject({
      executionMode: 'offline_fixture_only',
      caseCount: 1, passedCount: 1, failedCount: 0,
      unknownUsageCases: 0,
      heldUnknownCeilingMicroUsd: 0,
    });
    expect(result.knownEstimatedMicroUsd).toBeGreaterThan(0);
    expect(result.cases[0]).toMatchObject({
      passed: true, accountingState: 'known_estimate',
      measuredUsageAvailable: true,
    });
  });

  it('keeps the entire reservation held when Provider usage is unknown', () => {
    const result = evaluateCharacterMemoryCostUsageOfflineV1([
      fixture('cost-unknown', 'call-timeout', true),
    ]);
    expect(result).toMatchObject({
      passedCount: 1, failedCount: 0,
      knownEstimatedMicroUsd: 0,
      heldUnknownCeilingMicroUsd: 1000,
      unknownUsageCases: 1,
    });
    expect(result.cases[0]?.accountingState).toBe('held_unknown');
    expect(result.cases[0]?.measuredUsageAvailable).toBe(false);
  });

  it('rejects fake zero-cost settlement after unknown usage', () => {
    const unknown = fixture('cost-false-free', 'call-false-free', true);
    const result = evaluateCharacterMemoryCostUsageOfflineV1([{
      ...unknown,
      reservation: {
        ...unknown.reservation,
        state: 'SETTLED', actualEstimatedMicroUsd: 0,
      },
    }]);
    expect(result.failedCount).toBe(1);
    expect(result.cases[0]?.checks.unknownUsageRemainsReserved).toBe(false);
  });

  it('rejects over-ceiling, unexpected measured token use, and altered cost', () => {
    const base = fixture('cost-bad', 'call-bad');
    const cases = [{
      ...base, caseId: 'over-ceiling',
      reservation: { ...base.reservation, state: 'OVER_CEILING' as const },
    }, {
      ...base, caseId: 'output-over-cap',
      usageEvent: { ...base.usageEvent, outputTokens: 121 },
    }, {
      ...base, caseId: 'estimate-mismatch',
      reservation: { ...base.reservation, actualEstimatedMicroUsd: 0 },
    }].map((v, i) => ({
      ...v, reservation: { ...v.reservation,
        reservationKey: 'distinct-cost-bad-' + i },
      usageEvent: { ...v.usageEvent, callId: 'distinct-call-bad-' + i },
    }));
    const result = evaluateCharacterMemoryCostUsageOfflineV1(cases);
    expect(result.failedCount).toBe(3);
    expect(result.cases[0]?.checks.knownCostSettledWithinCeiling).toBe(false);
    expect(result.cases[1]?.checks.knownTokenUsageWithinPreflightCaps).toBe(false);
    expect(result.cases[2]?.checks.knownCostSettledWithinCeiling).toBe(false);
  });

  it('rejects an event attributed to the wrong reserved call purpose', () => {
    const correct = fixture('stage-check', 'call-stage-check');
    const result = evaluateCharacterMemoryCostUsageOfflineV1([{
      ...correct,
      usageEvent: { ...correct.usageEvent, purpose: 'event_extraction' },
    }]);
    expect(result.failedCount).toBe(1);
    expect(result.cases[0]?.checks.providerModelAndRateCardPinned).toBe(false);
  });

  it('rejects known output overrun despite otherwise missing Provider usage', () => {
    const timeout = fixture('partial-usage', 'call-partial-usage', true);
    const result = evaluateCharacterMemoryCostUsageOfflineV1([{
      ...timeout,
      usageEvent: { ...timeout.usageEvent, outputTokens: 121 },
    }]);
    expect(result.failedCount).toBe(1);
    expect(result.cases[0]?.checks.knownTokenUsageWithinPreflightCaps).toBe(false);
  });

  it('rejects a forged receipt that loses its reserved headroom', () => {
    const original = fixture('missing-headroom', 'call-missing-headroom');
    const result = evaluateCharacterMemoryCostUsageOfflineV1([{
      ...original,
      receipt: { ...receipt,
        certifiedInputTokenUpperBound: 10,
      },
    }]);
    expect(result.failedCount).toBe(1);
    expect(result.cases[0]?.checks.receiptAndUsageInternallyValid).toBe(false);
  });

  it('flags replayed provider call and reservation IDs without echoing them', () => {
    const original = fixture('cost-replay', 'call-replay');
    const replay = { ...original, caseId: 'cost-replay-second' };
    const result = evaluateCharacterMemoryCostUsageOfflineV1([original, replay]);
    expect(result.passedCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(result.cases[1]?.checks.distinctCallAndReservation).toBe(false);
    expect(JSON.stringify(result)).not.toContain('call-replay');
    expect(JSON.stringify(result)).not.toContain(subjectId);
  });
});
