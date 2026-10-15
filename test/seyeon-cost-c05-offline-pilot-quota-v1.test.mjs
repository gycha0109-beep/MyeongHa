import { describe, expect, it } from 'vitest';
import { SEYEON_DIALOGUE_PATH_CASE_IDS_V1 as CASES } from '../scripts/seyeon-dialogue-path-eval-core-v1.mjs';
import { SEYEON_SECURITY_EVAL_CELLS_V1 as CELLS } from '../scripts/seyeon-security-four-cell-eval-plan-v1.mjs';
import { createSeyeonC05OfflinePilotQuotaV1 as gate } from '../scripts/seyeon-cost-c05-offline-pilot-quota-v1.mjs';

function fixture() {
  return {
    mode: 'NO_NETWORK_SYNTHETIC_ONLY', callCap: 64, auxiliaryReserveMicroUsd: 14400,
    reviewInput: {
      scope: 'SYNTHETIC_OFFLINE_ONLY', caseIds: CASES.slice(0, 4),
      retries: 0, proposedBudgetMicroUsd: 120000,
      rateCards: ['gpt-5.6-luna','gpt-5.6-terra'].map(modelKey => ({
        providerKey:'openai-responses',modelKey,priceVersion:'fictional-test-only',
        inputMicroUsdPerMillion:1000000,cachedInputMicroUsdPerMillion:100000,
        cacheWriteMicroUsdPerMillion:1250000,
        outputMicroUsdPerMillion:2000000,
      })),
      stageBounds: [...new Map(CELLS.flatMap(c => c.stages)
        .map(([purpose,modelKey]) => [purpose, {
          purpose, modelKey, verifiedInputTokenUpperBound:1000,
          enforcedOutputTokenLimit:200,
        }])).values()],
    },
  };
}
const first = { cell:'A',caseId:CASES[0],purpose:'integrity_classification' };
describe('COST-05 synthetic quota: never a real dispatch/Provider admission', () => {
  it('reserves all 4-cell pilot 64 calls with finite assumed auxiliary budget', () => {
    const quota = gate(fixture());
    for (const cell of CELLS) for (const caseId of CASES.slice(0, 4)) {
      for (const [purpose] of cell.stages) {
        const result = quota.reserveSyntheticStage({cell:cell.cell,caseId,purpose});
        expect(result.dispatchAuthorized).toBe(false);
        expect(result.paidEvaluationPermitted).toBe(false);
        expect(result.stageOnlyReservedMicroUsd).toBe(1650);
      }
    }
    expect(quota.snapshot()).toMatchObject({
      reservedCalls:64,stageOnlyReservedMicroUsd:105600,
      remainingStageOnlyMicroUsd:0,unresolvedOutcomes:64,
      auxiliaryAssumedReserveMicroUsd:10400,
      paidEvaluationPermitted:false,actualProviderInvoiceMicroUsd:null,
    });
    expect(() => quota.reserveSyntheticStage(first)).toThrow(/duplicate/u);
  });
  it('blocks before calls exceed a deliberately smaller cap', () => {
    const i=fixture(); i.callCap=1;
    const quota=gate(i);
    quota.reserveSyntheticStage(first);
    expect(() => quota.reserveSyntheticStage({
      ...first,purpose:'disclosure_classification',
    })).toThrow(/ceiling exhausted/u);
    expect(quota.snapshot().reservedCalls).toBe(1);
  });
  it('blocks budget BEFORE new reservation and never assigns zero to missing usage', () => {
    const i=fixture();i.auxiliaryReserveMicroUsd=0;
    i.reviewInput.proposedBudgetMicroUsd=3300;
    const quota=gate(i);
    const q=quota.reserveSyntheticStage(first);
    quota.reserveSyntheticStage({...first,purpose:'disclosure_classification'});
    expect(quota.recordSyntheticOutcome({
      callRef:q.callRef,outcome:'timeout',estimatedCostMicroUsd:null,
    }).observation).toBe('UNKNOWN_OR_OVER_CEILING_HOLD');
    expect(() => quota.reserveSyntheticStage({
      ...first,purpose:'turn_interpretation',
    })).toThrow(/ceiling exhausted/u);
    expect(quota.snapshot()).toMatchObject({
      stageOnlyReservedMicroUsd:3300,unknownOrOverCeilingOutcomes:1,
      actualProviderInvoiceMicroUsd:null,
    });
  });
  it('estimates never release committed quota, including successful replies', () => {
    const quota=gate(fixture());
    const q=quota.reserveSyntheticStage(first);
    expect(quota.recordSyntheticOutcome({
      callRef:q.callRef,outcome:'response_received',estimatedCostMicroUsd:50,
    }).observation).toBe('UNVERIFIED_SYNTHETIC_ESTIMATE');
    expect(quota.snapshot()).toMatchObject({
      reservedCalls:1,stageOnlyReservedMicroUsd:1650,
      unresolvedOutcomes:0,remainingStageOnlyMicroUsd:103950,
      hasDurableProviderReceiptEvidence:false,
    });
    expect(quota.recordSyntheticOutcome({
      callRef:q.callRef,outcome:'response_received',estimatedCostMicroUsd:50,
    }).observation).toBe('DUPLICATE_SYNTHETIC_OUTCOME');
    expect(quota.snapshot().stageOnlyReservedMicroUsd).toBe(1650);
  });
  it('conflicting outcome replays fail rather than overwriting first evidence', () => {
    const quota=gate(fixture());const q=quota.reserveSyntheticStage(first);
    quota.recordSyntheticOutcome({
      callRef:q.callRef,outcome:'network_failure',estimatedCostMicroUsd:null,
    });
    expect(() => quota.recordSyntheticOutcome({
      callRef:q.callRef,outcome:'response_received',estimatedCostMicroUsd:0,
    })).toThrow(/conflicting/u);
    expect(quota.snapshot().unknownOrOverCeilingOutcomes).toBe(1);
  });
  it('over-ceiling synthetic observations remain UNKNOWN and reserve remains intact', () => {
    const quota=gate(fixture());const q=quota.reserveSyntheticStage(first);
    expect(quota.recordSyntheticOutcome({
      callRef:q.callRef,outcome:'response_received',estimatedCostMicroUsd:1651,
    }).observation).toBe('UNKNOWN_OR_OVER_CEILING_HOLD');
    expect(quota.snapshot().stageOnlyReservedMicroUsd).toBe(1650);
  });
  it('cannot accept forged cases, extra stages, duplicate call identities or outcomes', () => {
    const quota=gate(fixture());
    for(const req of [
      {...first,caseId:'attacker'},
      {...first,purpose:'not-approved'},
      {...first,cell:'Z'},
      {...first,model:'forged'},
    ]) expect(()=>quota.reserveSyntheticStage(req)).toThrow();
    expect(() => quota.recordSyntheticOutcome({
      callRef:'no-reservation',outcome:'timeout',estimatedCostMicroUsd:null,
    })).toThrow(/without prior reservation/u);
    const r=quota.reserveSyntheticStage(first);
    expect(() => quota.reserveSyntheticStage(first)).toThrow(/duplicate/u);
    expect(() => quota.recordSyntheticOutcome({
      callRef:r.callRef,outcome:'bogus',estimatedCostMicroUsd:0,
    })).toThrow();
  });
  it('fails closed if auxiliary budget, model price or trusted stage limit is missing', () => {
    let i=fixture();i.auxiliaryReserveMicroUsd=120000;
    expect(()=>gate(i)).toThrow(/no budget/u);
    i=fixture();i.auxiliaryReserveMicroUsd=null;
    expect(()=>gate(i)).toThrow();
    i=fixture();i.reviewInput.rateCards.pop();
    expect(()=>gate(i)).toThrow(/incomplete/u);
    i=fixture();i.reviewInput.stageBounds.pop();
    expect(()=>gate(i)).toThrow(/incomplete/u);
    i=fixture();i.callCap=65;
    expect(()=>gate(i)).toThrow(/excessive/u);
  });
  it('full 16-case four-cell 256-call budget cannot reuse the old 128-call cap', () => {
    const i=fixture();i.callCap=256;i.reviewInput.caseIds=[...CASES];
    i.reviewInput.proposedBudgetMicroUsd=424000;
    i.auxiliaryReserveMicroUsd=1600;
    const quota=gate(i);
    for(const cell of CELLS)for(const caseId of CASES)for(const [purpose] of cell.stages)
      quota.reserveSyntheticStage({cell:cell.cell,caseId,purpose});
    expect(quota.snapshot()).toMatchObject({
      reservedCalls:256,stageOnlyReservedMicroUsd:422400,
      remainingStageOnlyMicroUsd:0,paidEvaluationPermitted:false,
    });
  });
});
