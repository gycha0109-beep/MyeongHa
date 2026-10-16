import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {SEYEON_COST_REFERENCE_PLANS_V1} from '../scripts/seyeon-cost-architecture-offline-v1.mjs';
import {
  auditSeyeonC04SyntheticRouteV1,
  SEYEON_COST_C04_PRICE_SCOPE_V1,
} from '../scripts/seyeon-cost-c04-offline-stage-ledger-v1.mjs';

function calls(route,overrides={}){
  return SEYEON_COST_REFERENCE_PLANS_V1[route].map((p,index)=>({
    callId:route+'-'+index,stageIndex:index,attempt:1,
    purpose:p.purpose,model:p.model,outcome:'response_received',
    usage:{inputTokens:1600,cachedInputTokens:400,
      outputTokens:200,reasoningTokens:60},
    verifiedInputTokenUpperBound:2000,
    enforcedOutputTokenLimit:500,
    requestBodyBytes:4100,
    ...(overrides[index]||{}),
  }));
}
function audit(route,rows=calls(route),settings={}){
  return auditSeyeonC04SyntheticRouteV1({
    route,scope:'SYNTHETIC_OFFLINE_ONLY',completion:'COMPLETE',
    postTurnState:'NOT_APPLICABLE',tokenCounterState:'NOT_APPLICABLE',
    calls:rows,...settings,
  });
}
describe('COST-04 historical synthetic stage ledger / NOT a live model cost',()=>{
  it('prices each 5-stage vs 3-stage scenario by input uncached, input cached, output including reasoning',()=>{
    const old=audit('legacy_5'),fast=audit('fixed_3');
    expect(old.status).toBe('CONDITIONAL_REPO_PRICE_ESTIMATE');
    expect(fast.status).toBe('CONDITIONAL_REPO_PRICE_ESTIMATE');
    expect(old.stageCount).toBe(5);
    expect(fast.stageCount).toBe(3);
    expect(old.callAttempts).toBe(5);
    expect(fast.callAttempts).toBe(3);
    expect(old.partialKnownTokens).toEqual({
      input:8000,cachedInput:2000,output:1000,reasoningOutput:300,
    });
    expect(old.totalConditionalMicroUsd).toBeGreaterThan(fast.totalConditionalMicroUsd);
    expect(fast.totalAdmissionCeilingMicroUsd).toBeGreaterThanOrEqual(fast.totalConditionalMicroUsd);
    expect(old.rateScope).toBe(SEYEON_COST_C04_PRICE_SCOPE_V1);
    expect(old.liveRateVerified).toBe(false);
    expect(old.providerInvoiceReconciled).toBe(false);
    expect(old.cacheSavingsProven).toBe(false);
    expect(old.personaQualityVerified).toBe(false);
    expect(old.productionPromotionAllowed).toBe(false);
  });
  it('reasoning is a subset of output and not priced twice',()=>{
    const regular=audit('fixed_3');
    const changed=calls('fixed_3').map(r=>({
      ...r,usage:{...r.usage,reasoningTokens:120},
    }));
    expect(audit('fixed_3',changed).totalConditionalMicroUsd)
      .toBe(regular.totalConditionalMicroUsd);
    const excessive=calls('fixed_3');
    excessive[1].usage.reasoningTokens=201;
    expect(()=>audit('fixed_3',excessive)).toThrow();
  });
  it('uncertain usage on a completed or failed attempt is not silently free',()=>{
    const rows=calls('fixed_3');
    rows[1].outcome='timeout';
    rows[1].usage={inputTokens:null,cachedInputTokens:null,
      outputTokens:null,reasoningTokens:null};
    const result=audit('fixed_3',rows,{completion:'ABORTED'});
    expect(result.status).toBe('UNKNOWN_TOTAL_COST');
    expect(result.unknownUsageAttempts).toBe(1);
    expect(result.failedCallAttempts).toBe(1);
    expect(result.totalConditionalMicroUsd).toBeNull();
    expect(result.knownPortionMicroUsd).toBeGreaterThan(0);
  });
  it('separately prices all explicit retry attempts and never assumes the original failure cost zero',()=>{
    const rows=calls('fixed_3');
    rows[1].outcome='timeout'; // retry follows a failed attempt
    const retried={...rows[1],callId:'retry-of-stage-1',
      attempt:2,outcome:'response_received',usage:{...rows[1].usage}};
    rows.splice(2,0,retried);
    const result=audit('fixed_3',rows);
    expect(result.callAttempts).toBe(4);
    expect(result.retryAttempts).toBe(1);
    expect(result.totalConditionalMicroUsd).toBeGreaterThan(
      audit('fixed_3').totalConditionalMicroUsd);
    rows[2].attempt=3;
    expect(()=>audit('fixed_3',rows)).toThrow(/retry/u);
    rows[2].attempt=2;
    rows[2].callId=rows[1].callId;
    expect(()=>audit('fixed_3',rows)).toThrow();
  });
  it('unknown post-turn extraction / extra token counting prevents a false total-cost claim',()=>{
    for(const field of ['postTurnState','tokenCounterState']){
      const result=audit('fixed_3',calls('fixed_3'),{[field]:'UNKNOWN'});
      expect(result.totalConditionalMicroUsd).toBeNull();
      expect(result.totalAdmissionCeilingMicroUsd).toBeNull();
      expect(result.status).toBe('UNKNOWN_TOTAL_COST');
    }
  });
  it('a CAPTURED flag without actual priced post-turn/token-counter rows also holds session total',()=>{
    for(const field of ['postTurnState','tokenCounterState']){
      const result=audit('fixed_3',calls('fixed_3'),{[field]:'CAPTURED'});
      expect(result.status).toBe('UNKNOWN_TOTAL_COST');
      expect(result.totalConditionalMicroUsd).toBeNull();
      expect(result.totalAdmissionCeilingMicroUsd).toBeNull();
    }
    const rows=calls('fixed_3');
    rows[1].usage.reasoningTokens=null;
    const unmeasured=audit('fixed_3',rows);
    expect(unmeasured.tokenUnknownAttemptCounts.reasoningOutput).toBe(1);
    // The charged output remains known, while the reasoning-token breakout does not.
    expect(unmeasured.totalConditionalMicroUsd).not.toBeNull();
  });
  it('cache is not an admission credit: ceiling is insensitive to speculative cache hits',()=>{
    const allMiss=calls('fixed_3').map(r=>({
      ...r,usage:{...r.usage,cachedInputTokens:0},
    }));
    const allHit=calls('fixed_3').map(r=>({
      ...r,usage:{...r.usage,cachedInputTokens:r.usage.inputTokens},
    }));
    const miss=audit('fixed_3',allMiss),hit=audit('fixed_3',allHit);
    expect(hit.totalConditionalMicroUsd).toBeLessThan(miss.totalConditionalMicroUsd);
    expect(hit.totalAdmissionCeilingMicroUsd).toBe(miss.totalAdmissionCeilingMicroUsd);
    expect(hit.cacheSavingsProven).toBe(false);
  });
  it('absent trusted token bound or provider-enforced output cap makes upper ceiling UNKNOWN',()=>{
    const rows=calls('fixed_3');
    rows[0].verifiedInputTokenUpperBound=null;
    let r=audit('fixed_3',rows);
    expect(r.totalAdmissionCeilingMicroUsd).toBeNull();
    expect(r.unknownAdmissionCeilings).toBe(1);
    rows[0].verifiedInputTokenUpperBound=2000;
    rows[0].enforcedOutputTokenLimit=null;
    r=audit('fixed_3',rows);
    expect(r.totalAdmissionCeilingMicroUsd).toBeNull();
    expect(r.unknownAdmissionCeilings).toBe(1);
    rows[0].enforcedOutputTokenLimit=100;
    expect(()=>audit('fixed_3',rows)).toThrow(/output exceeds/u);
  });
  it('rejects wrong purpose, unrecognized model, cached overcount and malformed retry/limit/usage',()=>{
    const mutate=(fn)=>{
      const rows=calls('fixed_3');fn(rows);
      expect(()=>audit('fixed_3',rows)).toThrow();
    };
    mutate(r=>r[0].purpose='event_extraction');
    mutate(r=>r[1].model='unknown-model');
    mutate(r=>r[0].usage.cachedInputTokens=1601);
    mutate(r=>r[0].usage.inputTokens=-1);
    mutate(r=>r[0].usage.outputTokens=1.2);
    mutate(r=>r[0].verifiedInputTokenUpperBound=-5);
    mutate(r=>r[0].requestBodyBytes=0);
    mutate(r=>r[1].stageIndex=0);
    mutate(r=>r.splice(1,1));
    mutate(r=>r[0].callId='invalid id');
  });
  it('provider request structure confirms the true input must include schema, static instruction and payload',()=>{
    const source=readFileSync(new URL('../apps/api/src/openai-seyeon-structured-provider-v1.ts',import.meta.url),'utf8');
    const governance=readFileSync(new URL('../apps/api/src/seyeon-cost-governor-server-policy-v1.ts',import.meta.url),'utf8');
    expect(source).toContain('request.instructions');
    expect(source).toContain('SEYEON_PROVIDER_UNTRUSTED_DATA_BOUNDARY_V1');
    expect(source).toContain('JSON.stringify(request.input)');
    expect(source).toContain('schema: request.responseSchema');
    expect(source).toContain('requestBodyBytes');
    expect(source).toContain('max_output_tokens');
    expect(source).toContain('No implicit ceiling: active Production requests remain unchanged.');
    expect(governance).toContain('verifiedInputTokenUpperBound');
    expect(governance).toContain('maximumOutputTokens');
    expect(governance).toContain('no speculative cache discount');
    expect(governance).toContain('contextWindowTokens');
  });

  it('requires terminal success on every stage before claiming COMPLETE',()=>{
    const rows=calls('fixed_3');
    rows[2].outcome='invalid_response';
    expect(()=>audit('fixed_3',rows)).toThrow(/terminal success/u);
    const partial=audit('fixed_3',rows,{completion:'ABORTED'});
    expect(partial.status).toBe('UNKNOWN_TOTAL_COST');
    expect(partial.totalConditionalMicroUsd).toBeNull();
    expect(partial.knownPortionMicroUsd).toBeGreaterThan(0);
    expect(partial.totalAdmissionCeilingMicroUsd).toBeNull();
  });
  it('rejects a retry following an already successful stage',()=>{
    const rows=calls('fixed_3');
    rows.splice(1,0,{...rows[0],callId:'retry-after-success',attempt:2});
    expect(()=>audit('fixed_3',rows)).toThrow(/retry after successful/u);
  });
  it('rejects observed input usage above the verified pre-dispatch ceiling',()=>{
    const rows=calls('fixed_3');rows[0].usage.inputTokens=2001;
    expect(()=>audit('fixed_3',rows)).toThrow(/input exceeds claimed verified ceiling/u);
  });
  it('does not price the two-call design hypothesis as executed',()=>{
    expect(()=>audit('proposed_2',calls('proposed_2'))).toThrow(/envelope invalid/u);
  });
  it('rejects unsafe aggregate token precision',()=>{
    const rows=calls('fixed_3');
    for(const row of rows){
      row.usage={inputTokens:Number.MAX_SAFE_INTEGER,cachedInputTokens:Number.MAX_SAFE_INTEGER,
        outputTokens:0,reasoningTokens:0};
      row.verifiedInputTokenUpperBound=Number.MAX_SAFE_INTEGER;
    }
    expect(()=>audit('fixed_3',rows)).toThrow(/safe integer/u);
  });
});
