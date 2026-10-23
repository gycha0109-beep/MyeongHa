import {describe,it,expect} from 'vitest';
import {
  quoteSeyeonC08N06FromReadbackOfflineV1 as quote,
  SEYEON_C08_N06_WIRE_CAPTURE_V1 as WIRE,
} from '../scripts/seyeon-c08-n06-provider-readback-offline-quote-v1.mjs';
const model=WIRE.model,tag=WIRE.providerTag;
const report=()=>({
  schema:'seyeon-c08-provider-metadata-once-v1',
  scope:'PUBLIC_PROVIDER_METADATA_ONLY_NOT_INFERENCE',
  commitSha:'a'.repeat(40),workflowRunId:'42',
  completeMetadataRead:true,metadataGetCount:4,inferencePostCount:0,
  zdrStatus:200,
  modelStatuses:[
    {model,status:200},
    {model:'qwen/qwen3.5-flash-02-23',status:200},
    {model:'google/gemini-3.1-flash-lite',status:200},
  ],
  models:[
    {model,matchedEndpointCount:1,providers:[{
      providerTag:tag,inputUsdPerMillion:0.03,outputUsdPerMillion:0.17,
      reservedScenarioMicroUsd:1751,
      disposition:'METADATA_MATH_ONLY_HOLD',
      paidInferenceAuthorized:false,
      productionRouteAuthorized:false,
      secret:'NEVER_PRINT', // reporter must NOT copy upstream data
    }]},
    {model:'qwen/qwen3.5-flash-02-23',matchedEndpointCount:0,providers:[]},
    {model:'google/gemini-3.1-flash-lite',matchedEndpointCount:0,providers:[]},
  ],
  secret:'NEVER_PRINT',
});
const neverPaid=r=>{
  expect(r.permittedPaidCalls).toBe(0);
  expect(r.paidDispatchAuthorized).toBe(false);
  expect(r.productionPromotionAuthorized).toBe(false);
  expect(r.requestZdrRuntimeVerified).toBe(false);
  expect(r.strictJsonRuntimeVerified).toBe(false);
  expect(r.metadataProvesProviderHardCap).toBe(false);
  expect(r.invoiceReconciled).toBe(false);
};

describe('C08 exact-route GET replay + actual adapter N06 wire from PR #2525',()=>{
  it('uses only the measured model/tag wire and re-quotes two 3-call arms',()=>{
    expect(WIRE).toMatchObject({
      model:'openai/gpt-oss-120b',providerTag:'openai',
      baselineRequestBytes:[5414,18683,14465],
      compactRequestBytes:[5414,14030,12726],
      stageCompletionCaps:[1536,1536,1536],
      inferenceCallsInCapture:0,modelTokenizerVerified:false,
    });
    const r=quote({readback:report()});
    expect(r.disposition).toBe('MATH_SCENARIO_UNDER_BUDGET_NOT_AUTHORIZED');
    expect(r.reservedMicroUsdPerArm).toEqual([1942,1750]);
    expect(r.totalReservedMicroUsd).toBe(3692);
    expect(r.totalReservedKrw).toBe(9.23);
    expect(r.baselineRequestBytes).toEqual([5414,18683,14465]);
    expect(r.compactRequestBytes).toEqual([5414,14030,12726]);
    expect(r.scenarioOnlyUnderAdvertisedEndpointMetadata).toBe(true);
    expect(r.actualProviderResponseObserved).toBe(false);
    expect(JSON.stringify(r)).not.toContain('NEVER_PRINT');
    neverPaid(r);
  });

  it('a returned provider at an adverse listed price cannot meet budget',()=>{
    const r=report();
    r.models[0].providers[0].inputUsdPerMillion=0.15;
    r.models[0].providers[0].outputUsdPerMillion=0.40;
    const q=quote({readback:r});
    expect(q.disposition).toBe('TEN_KRW_PER_TURN_STRESS_OVER_BUDGET_HOLD');
    expect(q.reservedMicroUsdPerArm[0]).toBeGreaterThan(4000);
    expect(q.reservedMicroUsdPerArm[1]).toBeGreaterThan(4000);
    neverPaid(q);
  });

  it('refuses missing/malformed/duplicated exact-provider metadata',()=>{
    for(const mutate of [
      x=>{x.completeMetadataRead=false;},
      x=>{x.inferencePostCount=1;},
      x=>{x.metadataGetCount=3;},
      x=>{x.zdrStatus=500;},
      x=>{x.commitSha='not-sha';},
      x=>{x.modelStatuses[0].status=503;},
      x=>{x.models[0].providers=[];},
      x=>{x.models[0].providers[0].providerTag='other-tag';},
      x=>{x.models[0].providers[0].inputUsdPerMillion=0;},
      x=>{x.models[0].providers[0].disposition='OUTSIDE_LEGACY_RATE_CEILING_HOLD';},
      x=>{x.models[0].providers.push({...x.models[0].providers[0]});},
      x=>{x.models[0].providers[0].paidInferenceAuthorized=true;},
    ]){
      const x=report();mutate(x);
      const r=quote({readback:x});
      expect(r.disposition).toMatch(/_HOLD$/);
      neverPaid(r);
    }
  });
  it('does not reuse source wire lengths for a changed provider, model, stage or cap',()=>{
    for(const changed of [
      {...WIRE,model:'qwen/qwen3.5-flash-02-23'},
      {...WIRE,providerTag:'open-inference/fp4'},
      {...WIRE,baselineRequestBytes:[5414,18682,14465]},
      {...WIRE,compactRequestBytes:[5414,14030,12727]},
      {...WIRE,stageCompletionCaps:[128,512,128]},
      {...WIRE,provenance:'INVENTED'},
    ]){
      const r=quote({readback:report(),capture:changed});
      expect(r.disposition).toBe('WIRE_CAPTURE_DRIFT_OR_UNKNOWN_PROVIDER_HOLD');
      neverPaid(r);
    }
  });
  it('empty or no readback is a zero-spend HOLD',()=>{
    neverPaid(quote());
    expect(quote({readback:report()}).permittedPaidCalls).toBe(0);
  });
});
