import {describe,it,expect} from 'vitest';
import {
  C08_N06_CANARY_MODEL,
  chooseSeyeonC08N06ModelEndpointRouteV2,
  preflightSeyeonC08N06ModelEndpointV2,
  runSeyeonC08N06ActualCanaryV1,
} from '../scripts/seyeon-c08-n06-actual-paid-canary-once-v1.mjs';

const key={limit_remaining:null,is_management_key:false};
const row={tag:'openai',status:0,max_completion_tokens:4096,
  supported_parameters:['response_format'],
  pricing:{request:'0',prompt:'0.00000008',completion:'0.0000003'}};
const model={id:C08_N06_CANARY_MODEL,endpoints:[row]};
const secret='test-key-'+'a'.repeat(40);
function fake(){
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/key'))return Response.json({data:key});
    if(url.endsWith('/models/openai/gpt-oss-120b/endpoints'))
      return Response.json({data:model});
    if(url.endsWith('/chat/completions'))return Response.json({
      choices:[{finish_reason:'stop',
        message:{content:'{"utterance":"안녕! 먼저 이야기해볼게."}'}}],
      usage:{prompt_tokens:430,completion_tokens:35},
    });
    throw Error('unexpected external request');
  };
  return {calls,fetchImpl};
}
describe('C08 actual N06 research: model endpoint with ZDR enforced on POST',()=>{
  it('admits 200 model data and one under-10-KRW pinned request without ZDR catalog',async()=>{
    const {calls,fetchImpl}=fake();
    const route=await preflightSeyeonC08N06ModelEndpointV2(secret,fetchImpl);
    expect(route).toMatchObject({tag:'openai',inputRate:0.08,
      outputRate:0.3,notCatalogZdrAttested:true,
      accountBalanceUnverified:true});
    expect(calls).toHaveLength(2);
    expect(calls.every(c=>c.options.method==='GET')).toBe(true);
    const ledger=[];
    const r=await runSeyeonC08N06ActualCanaryV1({
      apiKey:secret,fetchImpl,
      routePreflight:preflightSeyeonC08N06ModelEndpointV2,
      journal:async record=>ledger.push(record),
    });
    expect(calls.map(c=>c.options.method)).toEqual(['GET','GET','GET','GET','POST']);
    expect(JSON.parse(calls[4].options.body).provider).toMatchObject({
      only:['openai'],zdr:true,data_collection:'deny',
      allow_fallbacks:false,require_parameters:true,
      max_price:{prompt:0.08,completion:0.3},
    });
    expect(ledger[0].kind).toBe('reserved_before_post');
    expect(ledger[0].reservedKrw).toBeLessThanOrEqual(10);
    expect(r).toMatchObject({
      attemptedPaidCalls:1,verdict:'OBSERVED_VALID_JSON',
      hardBillingCapVerified:false,productionPromotionAuthorized:false,
    });
    expect(r.reservedMicroUsd).toBeLessThanOrEqual(4000);
    expect(JSON.stringify(r)).not.toContain('먼저 이야기해볼게');
  });
  it('accepts OpenRouter official token-only endpoint shape with omitted request field',()=>{
    const priceOnly={...row,pricing:{
      prompt:'0.00000003',completion:'0.00000017',
    }};
    const chosen=chooseSeyeonC08N06ModelEndpointRouteV2({
      id:C08_N06_CANARY_MODEL,endpoints:[priceOnly],
    },key);
    expect(chosen).toMatchObject({tag:'openai',inputRate:0.03,outputRate:0.17});
    expect(chooseSeyeonC08N06ModelEndpointRouteV2({
      id:C08_N06_CANARY_MODEL,endpoints:[{
        ...priceOnly,pricing:{...priceOnly.pricing,request:'0.01'},
      }],
    },key)).toBe(null);
  });

  it('cannot elevate an invalid, duplicate or expensive endpoint',()=>{
    for(const bad of [
      {status:1},{supported_parameters:[]},{pricing:{...row.pricing,request:'0.1'}},
      {pricing:{...row.pricing,prompt:'0.0000003'}},
      {max_completion_tokens:128},
    ]){
      expect(chooseSeyeonC08N06ModelEndpointRouteV2({
        id:C08_N06_CANARY_MODEL,endpoints:[{...row,...bad}],
      },key)).toBe(null);
    }
    expect(chooseSeyeonC08N06ModelEndpointRouteV2({
      id:C08_N06_CANARY_MODEL,endpoints:[row,row],
    },key)).toBe(null);
    expect(chooseSeyeonC08N06ModelEndpointRouteV2(model,{
      ...key,limit_remaining:0,
    })).toBe(null);
  });
  it('no suitable model endpoint means exactly zero paid attempts',async()=>{
    const calls=[];
    const fetchImpl=async(url,init)=>{
      calls.push(init.method);
      if(url.endsWith('/key'))return Response.json({data:key});
      return Response.json({data:{id:C08_N06_CANARY_MODEL,endpoints:[]}});
    };
    const r=await runSeyeonC08N06ActualCanaryV1({
      apiKey:secret,fetchImpl,
      routePreflight:preflightSeyeonC08N06ModelEndpointV2,
      journal:async()=>{throw Error('must not reserve');},
    });
    expect(r.attemptedPaidCalls).toBe(0);
    expect(calls).toEqual(['GET','GET']);
  });
});
