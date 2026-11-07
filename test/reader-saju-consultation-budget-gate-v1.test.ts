import { describe, expect, it, vi } from 'vitest';
import {
  createReaderSajuConsultationBudgetGateV1,
  type ReaderSajuConsultationBudgetAuthorityV1,
} from '../apps/api/src/reader-saju-consultation-budget-gate-v1.js';

const PRICE = {
  priceVersion: 'offline-v1',
  providerKey: 'openai-responses',
  modelKey: 'offline-model',
  inputMicroUsdPerMillion: 600_000,
  cachedInputMicroUsdPerMillion: 60_000,
  outputMicroUsdPerMillion: 3_000_000,
} as const;

function setup(input?: { readonly limit?: number; readonly calls?: number }) {
  const reserve = vi.fn<ReaderSajuConsultationBudgetAuthorityV1['reserve']>(
    async ({ callId }) => ({ reservationRef: 'reservation-' + callId }),
  );
  const settle = vi.fn<ReaderSajuConsultationBudgetAuthorityV1['settle']>(async () => undefined);
  const gate = createReaderSajuConsultationBudgetGateV1({
    evaluationId: 'offline-evaluation-1',
    officialReadingRef: 'official-reading-1',
    sourceResponseHash: 'a'.repeat(64),
    totalEvaluationLimitMicroUsd: input?.limit ?? 10_000,
    maximumCalls: input?.calls ?? 2,
    allowedModels: [PRICE],
    authority: { reserve, settle },
  });
  return { gate, reserve, settle };
}
const call = (callId: string, purpose: 'consultation_generate' | 'consultation_evaluate' = 'consultation_generate') => ({
  callId,
  purpose,
  modelKey: PRICE.modelKey,
  requestBytes: 1_000,
  maxOutputTokens: purpose === 'consultation_generate' ? 1_600 : 900,
});
const response = (callId: string, purpose: 'consultation_generate' | 'consultation_evaluate' = 'consultation_generate') => ({
  ...call(callId, purpose),
  outcome: 'response_received' as const,
  status: 200,
  usage: { inputTokens: 250, outputTokens: 90, cachedInputTokens: 10 },
});

describe('server-only Reader Saju consultation budget gate', () => {
  it('requires an atomic source-bound reserve before a paid model dispatch', async () => {
    const { gate, reserve, settle } = setup();
    await gate.beforeDispatch(call('call-1'));
    expect(reserve).toHaveBeenCalledWith(expect.objectContaining({
      officialReadingRef: 'official-reading-1',
      sourceResponseHash: 'a'.repeat(64),
      modelKey: PRICE.modelKey,
      priceVersion: PRICE.priceVersion,
      maximumChargeMicroUsd: 5_400,
      totalEvaluationLimitMicroUsd: 10_000,
      maximumCalls: 2,
    }));
    await gate.afterOutcome(response('call-1'));
    expect(settle).toHaveBeenCalledWith(expect.objectContaining({
      reservationRef: 'reservation-call-1',
      outcome: 'response_received',
      costStatus: 'estimated',
      observedCostMicroUsd: 415,
      retainedReservationMicroUsd: 415,
    }));
  });

  it('blocks when the worst-case reservation would exceed the evaluation limit', async () => {
    const { gate, reserve } = setup({ limit: 5_000 });
    await expect(gate.beforeDispatch(call('call-1'))).rejects.toThrow('budget exceeded');
    expect(reserve).not.toHaveBeenCalled();
  });

  it('holds the reservation when a provider fails without authentic usage', async () => {
    const { gate, settle } = setup();
    await gate.beforeDispatch(call('call-1'));
    await gate.afterOutcome({
      ...response('call-1'),
      outcome: 'timeout',
      status: null,
      usage: { inputTokens: null, outputTokens: null, cachedInputTokens: null },
    });
    expect(settle).toHaveBeenCalledWith(expect.objectContaining({
      observedCostMicroUsd: null,
      retainedReservationMicroUsd: 5_400,
      costStatus: 'usage_unknown',
    }));
  });

  it('fails closed when durable reservation denies spending', async () => {
    const reserve = vi.fn(async () => { throw new Error('owner policy has no paid model authority'); });
    const settle = vi.fn(async () => undefined);
    const gate = createReaderSajuConsultationBudgetGateV1({
      evaluationId: 'offline-evaluation-1',
      officialReadingRef: 'official-reading-1',
      sourceResponseHash: 'a'.repeat(64),
      totalEvaluationLimitMicroUsd: 10_000,
      maximumCalls: 2,
      allowedModels: [PRICE],
      authority: { reserve, settle },
    });
    await expect(gate.beforeDispatch(call('call-1'))).rejects.toThrow('no paid model authority');
    expect(settle).not.toHaveBeenCalled();
  });

  it('does not permit unknown models, duplicate dispatch, missing source, or duplicate settlement', async () => {
    const { gate } = setup();
    await expect(gate.beforeDispatch({
      ...call('call-1'),
      modelKey: 'new-unknown-model',
    })).rejects.toThrow('Unpriced');
    await gate.beforeDispatch(call('call-1'));
    await expect(gate.beforeDispatch(call('call-1'))).rejects.toThrow('Unpriced');
    await gate.afterOutcome(response('call-1'));
    await expect(gate.afterOutcome(response('call-1'))).rejects.toThrow('duplicated');
    expect(() => createReaderSajuConsultationBudgetGateV1({
      evaluationId: 'offline-evaluation-1',
      officialReadingRef: '',
      sourceResponseHash: 'a'.repeat(64),
      totalEvaluationLimitMicroUsd: 10_000,
      maximumCalls: 2,
      allowedModels: [PRICE],
      authority: { reserve: vi.fn(), settle: vi.fn() },
    })).toThrow('officialReadingRef');
  });

  it('limits the total calls, including calls currently awaiting durable reservation', async () => {
    const { gate, reserve } = setup({ calls: 1 });
    await gate.beforeDispatch(call('call-1'));
    await expect(gate.beforeDispatch(call('call-2', 'consultation_evaluate'))).rejects.toThrow('budget exceeded');
    expect(reserve).toHaveBeenCalledTimes(1);
  });
});
