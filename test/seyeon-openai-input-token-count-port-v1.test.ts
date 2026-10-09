import { describe, expect, it, vi } from 'vitest';
import { createSeyeonOpenAiInputTokenCountAdmissionV1 } from
  '../apps/api/src/seyeon-openai-input-token-count-port-v1.js';
import { createPersistingSeyeonAiProviderV1 } from
  '../apps/api/src/postgres-seyeon-ai-cost-ledger-v1.js';
import type { OpenAiSeyeonStructuredProviderFetchV1 } from
  '../apps/api/src/openai-seyeon-structured-provider-v1.js';
import type { SeyeonCostGovernorModelPolicyV1 } from
  '../apps/api/src/seyeon-cost-governor-server-policy-v1.js';
import type { PostgresTransactionQueryV1 } from
  '../apps/api/src/postgres-subject-execution.js';
import type { SeyeonProductionSubjectTransactionRunnerV1 } from
  '../apps/api/src/seyeon-production-subject-transaction-v1.js';

const subjectId='11111111-1111-4111-8111-111111111111';
const policy:SeyeonCostGovernorModelPolicyV1={
  policyVersion:'offline-policy-v1',
  providerKey:'openai-responses',modelKey:'synthetic-model',
  allowedPurposes:['dialogue_render'],
  priceQuote:{
    priceVersion:'offline-rate-v1',providerKey:'openai-responses',
    modelKey:'synthetic-model',
    inputMicroUsdPerMillion:1000000,
    cachedInputMicroUsdPerMillion:250000,
    outputMicroUsdPerMillion:4000000,
  },
  contextWindowTokens:2000,maximumInputTokens:1200,
  maximumOutputTokens:800,maximumSerializedRequestBytes:20000,
};
const request={
  contractVersion:'seyeon-structured-provider-v2' as const,
  purpose:'dialogue_render' as const,
  instructions:'Synthetic instructions',
  input:{name:'Synthetic 한글'},
  responseSchema:{
    type:'object',additionalProperties:false,required:['ok'],
    properties:{ok:{type:'boolean'}},
  },
};
const modelReply=()=>Response.json({
  status:'completed',
  output:[{type:'message',content:[{type:'output_text',text:'{"ok":true}'}]}],
  usage:{
    input_tokens:50,output_tokens:20,
    input_tokens_details:{cached_tokens:0},
    output_tokens_details:{reasoning_tokens:0},
  },
});
const serverKey='sk-synthetic-count-only-no-network';
const makeConfig=(countFetch:OpenAiSeyeonStructuredProviderFetchV1)=>({
  apiKey:serverKey,model:policy.modelKey,policy,
  reservedHeadroomTokens:64,fetchImpl:countFetch,
});
const binding={
  subjectId,
  turnId:'22222222-2222-4222-8222-222222222222',
  attemptId:'33333333-3333-4333-8333-333333333333',
  phase:'chat' as const,
};
function runner(query:ReturnType<typeof vi.fn>):SeyeonProductionSubjectTransactionRunnerV1{
  const client={query} as unknown as PostgresTransactionQueryV1;
  return {
    resolveSubject:async()=>({subjectId,subjectKind:'member'}),
    run:async(_id,fn)=>fn(client,{subjectId,subjectKind:'member'}),
  };
}
describe('PR-04D2 OpenAI exact input-token counter (offline, no API calls)',()=>{
  it('counts exactly the provider input structure before a governed DB admit or model call',async()=>{
    const steps:string[]=[];
    let callId='';
    let authorizedBody='';
    const countFetch=vi.fn(async(url:string,init:RequestInit)=>{
      steps.push('count');
      expect(url).toBe('https://api.openai.com/v1/responses/input_tokens');
      const parsed=JSON.parse(String(init.body));
      expect(parsed.model).toBe('synthetic-model');
      expect(parsed.instructions).toContain('Synthetic instructions');
      expect(JSON.stringify(parsed.input)).toContain('Synthetic 한글');
      expect(parsed.text.format.schema).toEqual(request.responseSchema);
      expect(Object.keys(parsed).sort()).toEqual(['input','instructions','model','text']);
      authorizedBody=JSON.stringify(parsed);
      return Response.json({object:'response.input_tokens',input_tokens:600});
    });
    const generator=vi.fn(async(_url:string,init:RequestInit)=>{
      steps.push('generate');
      const body=JSON.parse(String(init.body));
      const {model,instructions,input,text}=body;
      expect(JSON.stringify({model,instructions,input,text})).toBe(authorizedBody);
      expect(body.max_output_tokens).toBe(800);
      expect(new Headers(init.headers).get('x-client-request-id')).toBe(callId);
      return modelReply();
    });
    const query=vi.fn(async(sql:string,values:unknown[])=>{
      if(sql.includes('cmd_governed_start_seyeon_ai_call_v1')){
        steps.push('admit');
        callId=String(values[4]);
        expect(values.slice(10,12)).toEqual([664,800]);
        expect(Number(values[12])).toBeGreaterThan(100);
        return {rows:[{callId,ceilingMicroUsd:'3864',bucketUtcDate:'2026-10-10'}]};
      }
      if(sql.includes('cmd_governed_settle_seyeon_ai_call_v1')){
        steps.push('settle');
        return {rows:[{callId,replayed:false,occupiedMicroUsd:'130',overCeiling:false}]};
      }
      throw Error('unexpected SQL');
    });
    const governor=createSeyeonOpenAiInputTokenCountAdmissionV1(
      makeConfig(countFetch),
    );
    const provider=createPersistingSeyeonAiProviderV1({
      config:{apiKey:serverKey,model:policy.modelKey,maxOutputTokens:800,
        priceQuote:policy.priceQuote,fetchImpl:generator},
      runner:runner(query),getBinding:()=>binding,governor,
    });
    const logger=vi.spyOn(console,'info').mockImplementation(()=>undefined);
    try{
      await expect(provider.generate(request)).resolves.toEqual({ok:true});
      expect(steps).toEqual(['count','admit','generate','settle']);
      expect(JSON.stringify(query.mock.calls)).not.toContain('Synthetic 한글');
    }finally{logger.mockRestore();}
  });

  it('fails before DB admission and generation if the count endpoint fails',async()=>{
    for(const reply of [
      Response.json({object:'response.input_tokens',input_tokens:0}),
      Response.json({object:'response.input_tokens',input_tokens:1200}),
      Response.json({object:'other',input_tokens:400}),
      Response.json({error:'unavailable'},{status:429}),
      new Response('not json',{status:200,headers:{'content-type':'text/plain'}}),
    ]){
      const count=vi.fn(async()=>reply.clone());
      const generator=vi.fn(async()=>modelReply());
      const query=vi.fn();
      const provider=createPersistingSeyeonAiProviderV1({
        config:{apiKey:serverKey,model:policy.modelKey,maxOutputTokens:800,
          priceQuote:policy.priceQuote,fetchImpl:generator},
        runner:runner(query),getBinding:()=>binding,
        governor:createSeyeonOpenAiInputTokenCountAdmissionV1(makeConfig(count)),
      });
      await expect(provider.generate(request)).rejects.toMatchObject({
        code:'PRE_DISPATCH_REJECTED',
      });
      expect(count).toHaveBeenCalledOnce();
      expect(query).not.toHaveBeenCalled();
      expect(generator).not.toHaveBeenCalled();
    }
  });

  it('rejects forbidden framing, divergent body bytes, invalid policy, and network errors',async()=>{
    const count=vi.fn(async()=>Response.json({
      object:'response.input_tokens',input_tokens:100,
    }));
    const governor=createSeyeonOpenAiInputTokenCountAdmissionV1(makeConfig(count));
    const body=JSON.stringify({
      model:policy.modelKey,store:false,max_output_tokens:800,
      instructions:'hello',input:[{role:'user',content:[{type:'input_text',text:'x'}]}],
      text:{format:{type:'json_schema',schema:request.responseSchema}},
    });
    const byteLen=new TextEncoder().encode(body).byteLength;
    await expect(governor.certifiedInputTokenUpperBound(
      request,byteLen-1,body,
    )).rejects.toThrow('final body bytes');
    await expect(governor.certifiedInputTokenUpperBound(
      request,byteLen+1,body,
    )).rejects.toThrow('final body bytes');
    for(const variant of [
      {...JSON.parse(body),providerOptions:{gateway:{only:['openai']}}},
      {...JSON.parse(body),model:'unapproved'},
      {...JSON.parse(body),max_output_tokens:700},
    ]){
      const serialized=JSON.stringify(variant);
      await expect(governor.certifiedInputTokenUpperBound(
        request,new TextEncoder().encode(serialized).byteLength,serialized,
      )).rejects.toThrow('unsupported request framing');
    }
    expect(count).not.toHaveBeenCalled();
    expect(()=>createSeyeonOpenAiInputTokenCountAdmissionV1({
      ...makeConfig(count),reservedHeadroomTokens:0,
    })).toThrow('server-owned');
    const networkDown=createSeyeonOpenAiInputTokenCountAdmissionV1(
      makeConfig(vi.fn(async()=>{throw Error('private network error');})),
    );
    await expect(networkDown.certifiedInputTokenUpperBound(
      request,byteLen,body,
    )).rejects.toThrow('private network error');
  });
});
