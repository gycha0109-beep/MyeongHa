import {describe,it,expect} from 'vitest';
import {
  planSeyeonC08N06PairedOfflineV1 as plan,
  SEYEON_C08_N06_EXACT_TEXT_V1 as N06,
} from '../scripts/seyeon-c08-n06-paired-paid-research-plan-offline-v1.mjs';

const MODEL='openai/gpt-oss-120b';
const provider={
  providerTag:'openai',inputUsdPerMillion:0.03,
  outputUsdPerMillion:0.17,disposition:'METADATA_MATH_ONLY_HOLD',
  paidInferenceAuthorized:false,productionRouteAuthorized:false,
};
const meta=()=>({
  schema:'seyeon-c08-provider-metadata-once-v1',
  scope:'PUBLIC_PROVIDER_METADATA_ONLY_NOT_INFERENCE',
  completeMetadataRead:true,metadataGetCount:4,inferencePostCount:0,
  commitSha:'a'.repeat(40),workflowRunId:'42',
  modelStatuses:[
    {model:MODEL,status:200},
    {model:'qwen/qwen3.5-flash-02-23',status:200},
    {model:'google/gemini-3.1-flash-lite',status:200},
  ],
  models:[
    {model:MODEL,matchedEndpointCount:1,providers:[{...provider}]},
    {model:'qwen/qwen3.5-flash-02-23',matchedEndpointCount:0,providers:[]},
    {model:'google/gemini-3.1-flash-lite',matchedEndpointCount:0,providers:[]},
  ],
});
const fakeOnly=()=>{
  // ILLUSTRATIVE mock serializations: not actual measured baseline bytes.
  return {text:N06,model:MODEL,providerTag:'openai',readback:meta(),
    baselineRequestBytes:[5425,15000,14000],
    compactRequestBytes:[5425,14041,12737]};
};

describe('C08 N06 paired experiment: offline plan only',()=>{
  it('pins 2 arms, 3 guarded model stages each and 4 Census per arm',()=>{
    const p=plan(fakeOnly());
    expect(p.profiles).toEqual(['baseline','compact_v1']);
    expect(p.plannedCalls).toBe(6);
    expect(p.maxPossibleCalls).toBe(6);
    expect(p.arms.map(x=>x.maximumPaidCalls)).toEqual([3,3]);
    for(const arm of p.arms){
      expect(arm.stages.map(s=>s.name)).toEqual([
        'unified_preflight_shadow','turn_interpret_render_shadow','semantic_review']);
      expect(arm.belowTenKrwUnderMetadataScenario).toBe(true);
      expect(arm.providerInvoiceReconciled).toBe(false);
    }
    expect(p.authoritativeCensusReadsPerArm).toBe(4);
    expect(p.keepIndependentSemanticReview).toBe(true);
    expect(p.zeroRetries).toBe(true);
    expect(p.zeroFallbackCalls).toBe(true);
    expect(p.arms[0].reservedMicroUsd).toBe(1818);
    expect(p.arms[1].reservedMicroUsd).toBe(1751);
    expect(p.totalReservedMicroUsd).toBe(3569);
    expect(p.totalReservedKrw).toBe(8.9225);
    expect(p.tenKrwPerTurnUnderMetadataScenario).toBe(true);
    expect(p.twentyKrwTwoTurnEnvelopeUnderMetadataScenario).toBe(true);
    expect(Object.isFrozen(p)).toBe(true);
  });

  it('an arithmetic pass NEVER authorizes actual paid model inference',()=>{
    const p=plan(fakeOnly());
    for(const k of [
      'historicalBilledCostReconciled','strictJsonSchemaRuntimeVerified',
      'actualEndpointZdrEnforced','accountRouteAndCreditsVerified',
      'providerHardTurnBillCapVerified','unseenGoldRecallVerified',
      'latencyP50P95Verified','humanBlindPersonaReviewVerified',
      'paidDispatchAuthorized','productionPromotionAuthorized',
    ])expect(p[k]).toBe(false);
  });

  it('refuses a documented upper-rate scenario that exceeds 10 KRW/turn',()=>{
    const args=fakeOnly();
    args.readback.models[0].providers[0].inputUsdPerMillion=0.15;
    args.readback.models[0].providers[0].outputUsdPerMillion=0.4;
    const p=plan(args);
    expect(p.tenKrwPerTurnUnderMetadataScenario).toBe(false);
    expect(p.twentyKrwTwoTurnEnvelopeUnderMetadataScenario).toBe(false);
    expect(p.paidDispatchAuthorized).toBe(false);
  });

  it.each([
    a=>{a.text='어제 우리 데이트했잖아.';},
    a=>{a.readback.completeMetadataRead=false;},
    a=>{a.readback.inferencePostCount=1;},
    a=>{a.readback.commitSha='malformed';},
    a=>{a.readback.models[0].providers=[];},
    a=>{a.readback.models[0].providers.push({...provider});},
    a=>{a.readback.modelStatuses[0].status=404;},
    a=>{a.providerTag='fallback';},
    a=>{a.readback.models[0].providers[0].paidInferenceAuthorized=true;},
  ])('missing evidence or unexpected participant fails closed %#',mutate=>{
    const args=fakeOnly();mutate(args);
    expect(()=>plan(args)).toThrow(/C08_N06_PAIR_.*_HOLD/);
  });

  it.each([
    a=>{a.baselineRequestBytes=[0,15000,14000];},
    a=>{a.compactRequestBytes=[5425,14041];},
    a=>{a.compactRequestBytes=[5425,14041,19201];},
    a=>{a.stageCompletionCaps=[128,512,0];},
    a=>{a.stageCompletionCaps=[128,512,1537];},
  ])('invalid request/cap bounds never pass %#',mutate=>{
    const args=fakeOnly();mutate(args);
    expect(()=>plan(args)).toThrow(/C08_N06_PAIR_.*_HOLD/);
  });
});
