import {describe,expect,it} from 'vitest';
import {buildReadingAiCallCostV1,recordReadingAiCallCostV1} from './reading-ai-call-cost-v1.js';

const SUBJECT='123e4567-e89b-42d3-a456-426614174000';
const READING='123e4567-e89b-42d3-a456-426614174001';
const ATTEMPT='123e4567-e89b-42d3-a456-426614174002';
const CALL='123e4567-e89b-42d3-a456-426614174003';
const known={
  source:'provider_response_usage' as const,subjectId:SUBJECT,readingId:READING,
  executionAttemptId:ATTEMPT,callId:CALL,observedAt:'2026-10-28T09:00:00Z',
  providerKey:'fixture-provider',modelKey:'fixture-model',outcome:'response_received' as const,
  usage:{inputTokens:1000,outputTokens:100,cachedInputTokens:200,reasoningTokens:20},
  price:{providerKey:'fixture-provider',modelKey:'fixture-model',priceVersion:'fixture-rate-v1',
    inputMicroUsdPerMillion:1_000_000,cachedInputMicroUsdPerMillion:100_000,
    outputMicroUsdPerMillion:2_000_000},
};
describe('authoritative server-only Reading AI provider call costs',()=>{
  it('estimates only versioned provider usage without adding cached/reasoning tokens twice',()=>{
    expect(buildReadingAiCallCostV1(known)).toMatchObject({
      workload:'reading',purpose:'reading_generation',priceVersion:'fixture-rate-v1',
      estimatedCostMicroUsd:1020,costStatus:'estimated',invoiceReconciled:false,
      inputTokens:1000,outputTokens:100,cachedInputTokens:200,reasoningTokens:20,
    });
    const noPrice=buildReadingAiCallCostV1({...known,price:undefined});
    expect(noPrice.estimatedCostMicroUsd).toBeNull();
    expect(noPrice.costStatus).toBe('price_unknown');
    const missingCache=buildReadingAiCallCostV1({...known,usage:{...known.usage,cachedInputTokens:null}});
    expect(missingCache.estimatedCostMicroUsd).toBeNull();
    expect(missingCache.costStatus).toBe('usage_unknown');
  });
  it('records failed provider attempts with unknown usage, never fabricated zero cost',()=>{
    const failed=buildReadingAiCallCostV1({
      ...known,source:'provider_attempt_without_usage',outcome:'timeout',
      usage:{inputTokens:null,outputTokens:null,cachedInputTokens:null,reasoningTokens:null},
    });
    expect(failed).toMatchObject({outcome:'timeout',estimatedCostMicroUsd:null,costStatus:'usage_unknown'});
    expect(()=>buildReadingAiCallCostV1({...known,source:'provider_attempt_without_usage'})).toThrow('Unbound');
    expect(()=>buildReadingAiCallCostV1({...known,usage:{...known.usage,inputTokens:null}})).toThrow('Unbound');
    expect(()=>buildReadingAiCallCostV1({...known,usage:{...known.usage,cachedInputTokens:1001}})).toThrow('Cached input');
    expect(()=>buildReadingAiCallCostV1({...known,price:{...known.price,modelKey:'another-model'}})).toThrow('does not match');
    expect(()=>buildReadingAiCallCostV1({...known,readingId:'not-uuid'})).toThrow('Reading AI');
  });
  it('writes a narrow parameterized record and requires an exact durable DB receipt',async()=>{
    let sql='',args:readonly unknown[]=[];
    const client={async query<Row>(query:string,params?:readonly unknown[]){
      sql=query;args=params??[];return{rows:[{callId:CALL,replayed:false}] as Row[]};
    }};
    expect(await recordReadingAiCallCostV1(client,known)).toEqual({callId:CALL,replayed:false});
    expect(sql).toContain('myeongha_admin_ops.cmd_record_reading_ai_call_v1(');
    expect(sql).not.toContain(CALL);
    expect(args.slice(0,3)).toEqual([SUBJECT,READING,ATTEMPT]);
    const event=JSON.parse(args[3] as string) as Record<string,unknown>;
    expect(event).toMatchObject({callId:CALL,workload:'reading',estimatedCostMicroUsd:1020});
    expect(event).not.toHaveProperty('prompt');
    expect(event).not.toHaveProperty('response');
    const wrong={async query<Row>(){return{rows:[{callId:READING,replayed:false}] as Row[]};}};
    await expect(recordReadingAiCallCostV1(wrong,known)).rejects.toThrow('recording receipt');
    const replay={async query<Row>(){return{rows:[{callId:CALL,replayed:true}] as Row[]};}};
    expect((await recordReadingAiCallCostV1(replay,known)).replayed).toBe(true);
  });
});
