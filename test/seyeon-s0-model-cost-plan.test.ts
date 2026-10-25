import {describe,expect,it} from 'vitest';
import {SEYEON_S0_COST_POLICY_DRAFT_V1 as draft,
  parseSeyeonS0CostBudgetV1} from '../scripts/operations/seyeon-security-s0/model-cost-plan.mjs';
import {SEYEON_SECURITY_S0_PRODUCTION_V1 as cfg,
  SEYEON_SECURITY_S0_GOVERNOR_APPROVAL_V1 as approved}
  from '../apps/api/src/seyeon-security-s0-production-policy-v1.js';

describe('S0 Governor model policy staging defaults closed',()=>{
  it('uses exact source-approved model, pricing, limits and only existing purposes',()=>{
    const policies=Object.values(approved.policies);
    expect(draft.modelKey).toBe(cfg.model);
    expect(draft.providerKey).toBe('openai-responses');
    expect(draft.isActive).toBe(false);
    const actual=new Set(draft.allowedPurposes);
    expect(actual.size).toBe(draft.allowedPurposes.length);
    expect([...actual].sort()).toEqual([...new Set(policies.flatMap(p=>[...p.allowedPurposes]))].sort());
    for(const p of policies){
      expect(p.providerKey).toBe(draft.providerKey);
      expect(p.modelKey).toBe(draft.modelKey);
      expect(p.policyVersion).toBe(draft.policyVersion);
      expect(p.priceQuote.priceVersion).toBe(draft.priceVersion);
      expect(p.contextWindowTokens).toBe(draft.contextWindowTokens);
      expect(p.maximumInputTokens).toBe(draft.maximumInputTokens);
      expect(p.maximumOutputTokens).toBe(draft.maximumOutputTokens);
      expect(p.maximumSerializedRequestBytes).toBe(draft.maximumSerializedRequestBytes);
      expect(p.priceQuote.inputMicroUsdPerMillion).toBe(draft.inputMicroUsdPerMillion);
      expect(p.priceQuote.cachedInputMicroUsdPerMillion).toBe(draft.cachedInputMicroUsdPerMillion);
      expect(p.priceQuote.outputMicroUsdPerMillion).toBe(draft.outputMicroUsdPerMillion);
    }
  });
  it('requires one explicit provider emergency ceiling without a member daily USD cap',()=>{
    const valid=parseSeyeonS0CostBudgetV1({utcDate:'2026-10-26',globalMicroUsd:'1000000'});
    expect(valid).toEqual({utcDate:'2026-10-26',
      globalMicroUsd:'1000000',subjectMicroUsd:'1000000'});
    for(const fields of [
      {utcDate:'2026-99-99',globalMicroUsd:'100'},
      {utcDate:'2026-10-26',globalMicroUsd:'0'},
      {utcDate:'2026-10-26',globalMicroUsd:'NaN'},
      {utcDate:'2026-10-26',globalMicroUsd:null},
    ]) expect(()=>parseSeyeonS0CostBudgetV1(fields)).toThrow();
    expect(()=>parseSeyeonS0CostBudgetV1({
      utcDate:'2026-10-26',globalMicroUsd:'100',
      // @ts-expect-error per-member dollar budgets are intentionally forbidden
      subjectMicroUsd:'10',
    })).toThrow();
  });
});
