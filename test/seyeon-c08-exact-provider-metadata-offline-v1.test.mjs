import {describe,it,expect} from 'vitest';
import {
  SEYEON_C08_PROVIDER_MODELS_V1 as MODELS,
  screenSeyeonC08ExactProviderEvidenceOfflineV1 as screen,
  inspectSeyeonC08ProviderMetadataReadOnlyV1 as inspect,
} from '../scripts/seyeon-c08-exact-provider-metadata-offline-v1.mjs';

const row=(model,tag,prompt,completion,source='zdr',overrides={})=>({
  ...(source==='zdr'?{model_id:model}:{}),
  tag,status:0,max_completion_tokens:1536,
  supported_parameters:['response_format','max_tokens'],
  pricing:{prompt:String(prompt),completion:String(completion),request:'0'},
  ...overrides,
});
const detail=(model,endpoints)=>({id:model,endpoints});
const cases=()=>({
  zdrEndpoints:[
    row(MODELS[0],'fast/strict','0.00000003','0.00000017'),
    row(MODELS[1],'qwen/secure','0.000000065','0.00000026'),
    row(MODELS[2],'gemini/secure','0.00000025','0.0000015'),
  ],
  modelDetails:[
    detail(MODELS[0],[row(MODELS[0],'fast/strict','0.00000003','0.00000017','model')]),
    detail(MODELS[1],[row(MODELS[1],'qwen/secure','0.000000065','0.00000026','model')]),
    detail(MODELS[2],[row(MODELS[2],'gemini/secure','0.00000025','0.0000015','model')]),
  ],
});
const base=c=>screen(c).models[0];

describe('C08 alternative exact-provider metadata, no paid inference',()=>{
  it('intersects full provider tags from BOTH ZDR and model lists; only models within ceilings quote',()=>{
    const r=screen(cases());
    expect(r.models.map(x=>x.model)).toEqual(MODELS);
    expect(r.models.map(x=>x.matchedEndpointCount)).toEqual([1,1,1]);
    expect(r.models[0].providers[0]).toMatchObject({
      providerTag:'fast/strict',inputUsdPerMillion:0.03,
      outputUsdPerMillion:0.17,
      reservedScenarioMicroUsd:1751,
      tenKrwListedPriceScenario:true,
      disposition:'METADATA_MATH_ONLY_HOLD',
    });
    expect(r.models[1].providers[0]).toMatchObject({
      inputUsdPerMillion:0.065,outputUsdPerMillion:0.26,
      reservedScenarioMicroUsd:3293,disposition:'METADATA_MATH_ONLY_HOLD',
    });
    expect(r.models[2].providers[0]).toMatchObject({
      reservedScenarioMicroUsd:null,
      disposition:'OUTSIDE_LEGACY_RATE_CEILING_HOLD',
    });
    for(const m of r.models){
      expect(m.paidInferenceAuthorized).toBe(false);
      expect(m.productionRouteAuthorized).toBe(false);
      expect(m.strictJsonSchemaRuntimeVerified).toBe(false);
      expect(m.requestLevelZdrAndDenyRuntimeVerified).toBe(false);
      expect(m.c07GoldAndCanonParityVerified).toBe(false);
    }
  });

  it('missing matched tag, absent ZDR, duplicated endpoint, and duplicated ZDR rows all HOLD',()=>{
    const a=cases();
    expect(base({...a,zdrEndpoints:[]}).matchedEndpointCount).toBe(0);
    expect(base({...a,modelDetails:[]}).matchedEndpointCount).toBe(0);
    const b=cases();
    b.modelDetails[0].endpoints[0].tag='fast/other';
    expect(base(b).matchedEndpointCount).toBe(0);
    const c=cases();
    c.zdrEndpoints.push({...c.zdrEndpoints[0]});
    expect(base(c).matchedEndpointCount).toBe(0);
    const d=cases();
    d.modelDetails[0].endpoints.push({...d.modelDetails[0].endpoints[0]});
    expect(base(d).matchedEndpointCount).toBe(0);
    const e=cases();
    e.modelDetails.push({...e.modelDetails[0]});
    expect(base(e).matchedEndpointCount).toBe(0);
  });

  it('rejects inactive, unsupported, truncated outputs and ambiguous/invalid pricing',()=>{
    for(const mutation of [
      x=>{x.zdrEndpoints[0].status=1;},
      x=>{x.modelDetails[0].endpoints[0].status=2;},
      x=>{x.zdrEndpoints[0].supported_parameters=['max_tokens'];},
      x=>{x.modelDetails[0].endpoints[0].supported_parameters=[];},
      x=>{x.modelDetails[0].endpoints[0].max_completion_tokens=128;},
      x=>{x.zdrEndpoints[0].max_completion_tokens=null;},
      x=>{x.zdrEndpoints[0].pricing.request='0.01';},
      x=>{delete x.modelDetails[0].endpoints[0].pricing.request;},
      x=>{x.zdrEndpoints[0].pricing.prompt='Infinity';},
      x=>{x.modelDetails[0].endpoints[0].pricing.completion='';},
      x=>{x.zdrEndpoints[0].tag='invalid provider tag!';},
    ]){
      const c=cases();mutation(c);
      expect(base(c).matchedEndpointCount).toBe(0);
      expect(base(c).disposition).toBe('NO_EXACT_ACTIVE_ZDR_RESPONSE_FORMAT_PRICE_MATCH_HOLD');
    }
  });

  it('takes the upper price from either catalog; extra upper rates cannot silently pass',()=>{
    const c=cases();
    c.modelDetails[0].endpoints[0].pricing.prompt='0.00000015';
    c.modelDetails[0].endpoints[0].pricing.completion='0.0000004';
    const m=base(c).providers[0];
    expect(m.inputUsdPerMillion).toBe(0.15);
    expect(m.outputUsdPerMillion).toBe(0.4);
    expect(m.tenKrwListedPriceScenario).toBe(false);
    expect(m.disposition).toBe('OVER_TURN_BUDGET_HOLD');
    expect(m.paidInferenceAuthorized).toBe(false);
  });

  it.each([
    {},
    {zdrEndpoints:null,modelDetails:[]},
    {zdrEndpoints:[],modelDetails:[],completionCaps:[0,1536,1536]},
    {zdrEndpoints:[],modelDetails:[],completionCaps:[1537,1536,1536]},
    {zdrEndpoints:[],modelDetails:[],completionCaps:[1536]},
  ])('fails closed for missing catalog/invalid cap %j',arg=>{
    expect(()=>screen(arg)).toThrow('C08_PROVIDER_METADATA_INPUT_HOLD');
  });

  it('allows ONLY metadata GETs and withholds runtime strict JSON and route attestation',async()=>{
    const sample=cases(),calls=[];
    const fakeFetch=async(url,init)=>{
      calls.push({url,init});
      const prefix='https://openrouter.ai/api/v1/models/';
      if(url==='https://openrouter.ai/api/v1/endpoints/zdr')
        return Response.json({data:sample.zdrEndpoints});
      if(url.startsWith(prefix)){
        const model=url.slice(prefix.length).replace(/\/endpoints$/,'');
        const m=sample.modelDetails.find(x=>x.id===model);
        return Response.json({data:m??null});
      }
      throw Error('unexpected GET path');
    };
    const report=await inspect({apiKey:'test-only-'+'x'.repeat(28),fetchImpl:fakeFetch});
    expect(report.metadataGetCount).toBe(4);
    expect(report.inferencePostCount).toBe(0);
    expect(report.completeMetadataRead).toBe(true);
    expect(report.models[0].providers[0].providerTag).toBe('fast/strict');
    expect(report.paidInferenceAuthorized).toBe(false);
    expect(report.hardTurnBillingCapVerified).toBe(false);
    expect(calls).toHaveLength(4);
    expect(new Set(calls.map(x=>x.url)).size).toBe(4);
    for(const call of calls){
      expect(call.init.method).toBe('GET');
      expect(call.init.redirect).toBe('error');
      expect(call.init.body).toBeUndefined();
      expect(call.init.headers.authorization).toMatch(/^Bearer test-only-/);
      expect(call.url).not.toContain('chat/completions');
    }
  });

  it('HTTP 200 with invalid model metadata never counts as a complete provider read',async()=>{
    const sample=cases();
    const fakeFetch=async url=>{
      if(url.endsWith('/endpoints/zdr'))return Response.json({data:sample.zdrEndpoints});
      return Response.json({data:{id:'unexpected/model',endpoints:[]}});
    };
    const r=await inspect({apiKey:'test-only-'+'x'.repeat(28),fetchImpl:fakeFetch});
    expect(r.completeMetadataRead).toBe(false);
    expect(r.models.every(m=>m.matchedEndpointCount===0)).toBe(true);
    expect(r.paidInferenceAuthorized).toBe(false);
  });

  it('missing key and partial GET errors remain HOLD without any inference attempt',async()=>{
    let count=0;
    const fakeFetch=async()=>{count++;return new Response('unavailable',{status:503});};
    await expect(inspect({apiKey:'short',fetchImpl:fakeFetch}))
      .rejects.toThrow('C08_PROVIDER_READONLY_ADMISSION_HOLD');
    expect(count).toBe(0);
    const r=await inspect({apiKey:'test-only-'+'x'.repeat(28),fetchImpl:fakeFetch});
    expect(count).toBe(4);
    expect(r.completeMetadataRead).toBe(false);
    expect(r.zdrStatus).toBe(503);
    expect(r.models.every(x=>x.matchedEndpointCount===0)).toBe(true);
    expect(r.inferencePostCount).toBe(0);
  });
});
