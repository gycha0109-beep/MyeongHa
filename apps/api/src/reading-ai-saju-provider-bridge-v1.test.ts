import { describe,expect,it } from 'vitest';
import { createSajuNarrativeReadingCostBridgeV1 } from './reading-ai-saju-provider-bridge-v1.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';

const binding={
  subjectId:'123e4567-e89b-42d3-a456-426614174000',
  readingId:'123e4567-e89b-42d3-a456-426614174001',
  executionAttemptId:'123e4567-e89b-42d3-a456-426614174002',
};
const observation={
  callId:'123e4567-e89b-42d3-a456-426614174003',
  requestId:'saju-server-request-01',
  providerKey:'openai',modelKey:'fixture-narrative-model',
  source:'provider_response_usage',
  outcome:'response_received',
  observedAt:'2026-10-29T00:00:00.000Z',
  usage:{inputTokens:1000,outputTokens:50,cachedInputTokens:300,reasoningTokens:10},
};
const price={
  providerKey:'openai',modelKey:'fixture-narrative-model',priceVersion:'fixture-2026-10',
  inputMicroUsdPerMillion:1_000_000,
  cachedInputMicroUsdPerMillion:100_000,
  outputMicroUsdPerMillion:2_000_000,
};
function fixture(){
  const statements:{sql:string;values?:readonly unknown[]}[]=[];
  const pool:PostgresSubjectPoolV1={async connect(){return {
    async query<Row>(sql:string,values?:readonly unknown[]){
      statements.push(values===undefined?{sql}:{sql,values});
      if(sql==='SELECT current_user::text AS "currentUser"'){
        return{rows:[{currentUser:'myeongha_reading_ai_cost_writer_v1'}] as Row[]};
      }
      if(sql.includes('cmd_record_reading_ai_call_v1'))
        return{rows:[{callId:observation.callId,replayed:false}] as Row[]};
      return{rows:[] as Row[]};
    },release(){},
  };}};
  return{statements,bridge:createSajuNarrativeReadingCostBridgeV1({pool})};
}
function message(overrides:Record<string,unknown>={}){
  return {binding,expectedSajuRequestId:observation.requestId,
    expectedModelKey:observation.modelKey,observation,price,...overrides};
}
describe('Saju source-side OpenAI usage into private Reading ledger',()=>{
  it('persists a source-bound provider receipt without any narrative or provider text',async()=>{
    const x=fixture();
    const result=await x.bridge.record(message());
    expect(result).toEqual({callId:observation.callId,replayed:false});
    expect(x.statements.map(s=>s.sql)).toEqual([
      'BEGIN','SELECT current_user::text AS "currentUser"',
      expect.stringContaining('cmd_record_reading_ai_call_v1'),'COMMIT',
    ]);
    const payload=JSON.parse(x.statements[2]?.values?.[3] as string);
    expect(payload).toMatchObject({
      source:'provider_response_usage',outcome:'response_received',
      callId:observation.callId,workload:'reading',purpose:'reading_generation',
      inputTokens:1000,outputTokens:50,cachedInputTokens:300,
      priceVersion:'fixture-2026-10',costStatus:'estimated',invoiceReconciled:false,
    });
    expect(JSON.stringify(payload)).not.toContain('requestId');
    expect(JSON.stringify(payload)).not.toContain('prompt');
  });
  it('keeps failed provider attempt usage and cost unknown',async()=>{
    const x=fixture();
    await x.bridge.record(message({observation:{
      ...observation,source:'provider_attempt_without_usage',outcome:'timeout',
      usage:{inputTokens:null,outputTokens:null,cachedInputTokens:null,reasoningTokens:null},
    }}));
    const payload=JSON.parse(x.statements[2]?.values?.[3] as string);
    expect(payload).toMatchObject({
      source:'provider_attempt_without_usage',outcome:'timeout',
      costStatus:'usage_unknown',inputTokens:null,estimatedCostMicroUsd:null,
    });
  });
  it('rejects mismatched requests, models, identities and injected fields before DB access',async()=>{
    const x=fixture();
    const invalid=[
      {expectedSajuRequestId:'another-request'},
      {expectedModelKey:'another-model'},
      {observation:{...observation,providerKey:'other'}},
      {observation:{...observation,rawResponse:'hidden'}},
      {observation:{...observation,usage:{...observation.usage,inputTokens:-1}}},
      {observation:{...observation,source:'provider_attempt_without_usage'}},
      {observation:{...observation,usage:{...observation.usage,cachedInputTokens:2000}}},
      {observation:{...observation,callId:'saju-native-not-uuid'}},
    ];
    for(const overrides of invalid){
      await expect(x.bridge.record(message(overrides))).rejects.toThrow();
    }
    expect(x.statements).toHaveLength(0);
  });
});
