import {describe,expect,it} from 'vitest';
import {observeOpenAiReadingCallCostV1} from './reading-ai-openai-usage-v1.js';

const binding={
  subjectId:'123e4567-e89b-42d3-a456-426614174000',
  readingId:'123e4567-e89b-42d3-a456-426614174001',
  executionAttemptId:'123e4567-e89b-42d3-a456-426614174002',
  callId:'123e4567-e89b-42d3-a456-426614174003',
  observedAt:'2026-10-28T09:00:00Z',
};
const response={
  id:'resp_private_do_not_store',
  model:'fixture-reading-model',
  status:'completed',
  output:[{type:'message',content:[{text:'private reading narrative must not persist'}]}],
  usage:{
    input_tokens:1000,output_tokens:100,total_tokens:1100,
    input_tokens_details:{cached_tokens:200},
    output_tokens_details:{reasoning_tokens:20},
  },
};
const price={
  providerKey:'openai',modelKey:'fixture-reading-model',priceVersion:'quoted-v1',
  inputMicroUsdPerMillion:1_000_000,
  cachedInputMicroUsdPerMillion:100_000,
  outputMicroUsdPerMillion:2_000_000,
};
describe('Saju-owned OpenAI provider usage -> Reading-only cost evidence',()=>{
  const observe=(raw:unknown,withPrice=true)=>observeOpenAiReadingCallCostV1({
    binding,providerResponse:raw,expectedModelKey:'fixture-reading-model',
    ...(withPrice?{price}:{}),
  });
  it('maps exact server-observed provider counters and quote without any response text',()=>{
    const event=observe(response);
    expect(event).toMatchObject({
      workload:'reading',purpose:'reading_generation',callId:binding.callId,
      source:'provider_response_usage',inputTokens:1000,outputTokens:100,
      cachedInputTokens:200,reasoningTokens:20,
      priceVersion:'quoted-v1',estimatedCostMicroUsd:1020,costStatus:'estimated',
      invoiceReconciled:false,
    });
    const serialized=JSON.stringify(event);
    expect(serialized).not.toContain('resp_private');
    expect(serialized).not.toContain('private reading narrative');
    const withoutPrice=observe(response,false);
    expect(withoutPrice).toMatchObject({costStatus:'price_unknown',estimatedCostMicroUsd:null});
  });
  it('keeps missing provider usage unknown rather than treating it as free',()=>{
    const event=observe({...response,usage:undefined});
    expect(event).toMatchObject({
      source:'provider_attempt_without_usage',costStatus:'usage_unknown',
      inputTokens:null,outputTokens:null,estimatedCostMicroUsd:null,
    });
    const noCache=observe({...response,usage:{...response.usage,input_tokens_details:undefined}});
    expect(noCache).toMatchObject({cachedInputTokens:null,costStatus:'usage_unknown',estimatedCostMicroUsd:null});
  });
  it('refuses model spoofing, invalid counts and inconsistent totals',()=>{
    for(const raw of [
      {...response,model:'another-model'},
      {...response,status:'incomplete'},
      {...response,usage:{...response.usage,input_tokens:-1}},
      {...response,usage:{...response.usage,total_tokens:100}},
      {...response,usage:{...response.usage,output_tokens:null}},
      {...response,usage:{...response.usage,input_tokens_details:{cached_tokens:1001}}},
    ])expect(()=>observe(raw)).toThrow();
  });
});
