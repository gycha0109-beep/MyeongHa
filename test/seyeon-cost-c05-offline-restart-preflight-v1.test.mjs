import {describe,expect,it} from 'vitest';
import {SEYEON_DIALOGUE_PATH_CASE_IDS_V1} from '../scripts/seyeon-dialogue-path-eval-core-v1.mjs';
import {SEYEON_SECURITY_EVAL_CELLS_V1} from '../scripts/seyeon-security-four-cell-eval-plan-v1.mjs';
import {inspectSeyeonC05OfflineRestartBudgetV1 as audit} from '../scripts/seyeon-cost-c05-offline-restart-preflight-v1.mjs';

const ids=SEYEON_DIALOGUE_PATH_CASE_IDS_V1;
const sample=()=>({
  scope:'SYNTHETIC_OFFLINE_ONLY',caseIds:ids.slice(0,4),retries:0,
  proposedBudgetMicroUsd:120000,
  rateCards:[
    {providerKey:'openai-responses',modelKey:'gpt-5.6-luna',priceVersion:'synthetic-v1',
     inputMicroUsdPerMillion:1000000,cachedInputMicroUsdPerMillion:100000,cacheWriteMicroUsdPerMillion:1250000,outputMicroUsdPerMillion:2000000},
    {providerKey:'openai-responses',modelKey:'gpt-5.6-terra',priceVersion:'synthetic-v1',
     inputMicroUsdPerMillion:1000000,cachedInputMicroUsdPerMillion:100000,cacheWriteMicroUsdPerMillion:1250000,outputMicroUsdPerMillion:2000000},
  ],
  stageBounds:[...new Map(SEYEON_SECURITY_EVAL_CELLS_V1.flatMap(c=>c.stages)
    .map(([purpose,modelKey])=>[purpose,{purpose,modelKey,
       verifiedInputTokenUpperBound:1000,enforcedOutputTokenLimit:200}])).values()],
});
describe('COST-05 offline four-cell stage budget is never a paid-evaluation approval',()=>{
  it('calculates pilot 4x16=64 stage calls conservatively per dispatch, not per string byte',()=>{
    const r=audit(sample());
    expect(r.callCeiling).toBe(64);
    expect(r.cells.map(c=>c.callCeiling)).toEqual([20,20,12,12]);
    expect(r.stageOnlyConditionalMicroUsd).toBe(105600);
    expect(r.exceedsProposedBudget).toBe(false);
    expect(r.allInMaximumMicroUsd).toBeNull();
    expect(r.paidEvaluationPermitted).toBe(false);
    expect(r.actualRateVerified).toBe(false);
  });
  it('shows full 16-case four-cell matrix as 256 rather than the old 128-call dual route plan',()=>{
    const i=sample();i.caseIds=[...ids];
    const r=audit(i);
    expect(r.callCeiling).toBe(256);
    expect(r.stageOnlyConditionalMicroUsd).toBe(422400);
    expect(r.exceedsProposedBudget).toBe(true);
    expect(r.blockerCodes).toContain('PROPOSED_BUDGET_TOO_SMALL');
  });
  it('keeps incomplete rate cards or stage upper bounds UNKNOWN, not free',()=>{
    const i=sample();i.rateCards.pop();i.stageBounds.pop();
    const r=audit(i);
    expect(r.missingRateModels).toHaveLength(1);
    expect(r.missingStageBounds).toHaveLength(1);
    expect(r.stageOnlyConditionalMicroUsd).toBeNull();
    expect(r.exceedsProposedBudget).toBeNull();
    expect(r.knownStagePortionMicroUsd).toBeGreaterThan(0);
  });
  it('forbids cached-token discounts in prospective admission ceilings',()=>{
    const i=sample();
    const miss=audit(i).stageOnlyConditionalMicroUsd;
    for(const p of i.rateCards)p.cachedInputMicroUsdPerMillion=p.inputMicroUsdPerMillion;
    expect(audit(i).stageOnlyConditionalMicroUsd).toBe(miss);
  });
  it('includes cache-write premium; prospective ceiling cannot assume uncached-only input',()=>{
    const x=sample();
    expect(audit(x).stageOnlyConditionalMicroUsd).toBe(105600);
    for(const rate of x.rateCards)
      rate.cacheWriteMicroUsdPerMillion=rate.inputMicroUsdPerMillion;
    expect(audit(x).stageOnlyConditionalMicroUsd).toBe(89600);
  });
  it('refuses 272001-token short-context input or missing cache-write rate',()=>{
    const x=sample();
    x.stageBounds[0].verifiedInputTokenUpperBound=272001;
    expect(()=>audit(x)).toThrow(/invalid stage token bounds/u);
    const y=sample();
    delete y.rateCards[0].cacheWriteMicroUsdPerMillion;
    expect(()=>audit(y)).toThrow(/rate shape/u);
  });
  it('rejects retries, forged case IDs, budget/price nonsense and mislabeled models',()=>{
    const invalid=[x=>x.retries=1,x=>x.caseIds=[ids[0],ids[0]],
      x=>x.caseIds=['unlisted-case'],x=>x.proposedBudgetMicroUsd=-1,
      x=>x.rateCards[0].outputMicroUsdPerMillion=0,
      x=>x.stageBounds[0].modelKey='wrong',
      x=>x.stageBounds[0].verifiedInputTokenUpperBound=null,
      x=>x.stageBounds[0].enforcedOutputTokenLimit=0,
      x=>x.rateCards[0].providerKey='other',
    ];
    for(const f of invalid){const x=sample();f(x);expect(()=>audit(x)).toThrow();}
  });
  it('rejects duplicate/extra rows and microUSD overflow rather than dropping precision',()=>{
    let x=sample();x.rateCards.push({...x.rateCards[0]});
    expect(()=>audit(x)).toThrow();
    x=sample();x.stageBounds.push({...x.stageBounds[0]});
    expect(()=>audit(x)).toThrow();
    x=sample();
    x.stageBounds[0].verifiedInputTokenUpperBound=272000;
    x.rateCards[0].inputMicroUsdPerMillion=Number.MAX_SAFE_INTEGER;
    x.rateCards[0].cacheWriteMicroUsdPerMillion=Number.MAX_SAFE_INTEGER;
    // 272k input tokens alone still fits JS safe integer microUSD. Force
    // a genuinely overflowing capped output path instead of expecting a
    // false-positive overflow rejection from a mathematically safe result.
    x.stageBounds[0].enforcedOutputTokenLimit=Number.MAX_SAFE_INTEGER;
    x.rateCards[0].outputMicroUsdPerMillion=Number.MAX_SAFE_INTEGER;
    expect(()=>audit(x)).toThrow(/safe integer range/u);
  });
  it('no budget or unverified auxiliary costs can ever allow live inference',()=>{
    const x=sample();x.proposedBudgetMicroUsd=null;
    const r=audit(x);
    expect(r.exceedsProposedBudget).toBeNull();
    expect(r.blockerCodes).toContain('NO_OWNER_BUDGET');
    expect(r.actualProviderInvoiceMicroUsd).toBeNull();
    expect(r.securityAndOwnerApproved).toBe(false);
    expect(r.verdict).toBe('HOLD_COST_INCIDENT_APPROVAL_REQUIRED');
  });
});
