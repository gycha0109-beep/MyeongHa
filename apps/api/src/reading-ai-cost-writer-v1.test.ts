import {describe,expect,it} from 'vitest';
import {createReadingAiCostWriterV1,READING_AI_COST_WRITER_PRINCIPAL_V1} from './reading-ai-cost-writer-v1.js';
import type {PostgresSubjectPoolV1} from './postgres-subject-execution.js';

const binding={
  subjectId:'123e4567-e89b-42d3-a456-426614174000',
  readingId:'123e4567-e89b-42d3-a456-426614174001',
  executionAttemptId:'123e4567-e89b-42d3-a456-426614174002',
  callId:'123e4567-e89b-42d3-a456-426614174003',
  observedAt:'2026-10-28T09:00:00Z',
};
const providerResponse={
  id:'resp_secret',
  status:'completed',model:'fixture-model',
  output:[{content:[{text:'private result'}]}],
  usage:{input_tokens:1000,output_tokens:100,total_tokens:1100,
    input_tokens_details:{cached_tokens:200},
    output_tokens_details:{reasoning_tokens:20}},
};
const price={
  providerKey:'openai',modelKey:'fixture-model',priceVersion:'fixture-v1',
  inputMicroUsdPerMillion:1_000_000,
  cachedInputMicroUsdPerMillion:100_000,
  outputMicroUsdPerMillion:2_000_000,
};
function pg(role:string=READING_AI_COST_WRITER_PRINCIPAL_V1,conflict=false){
  const statements:{sql:string;values:readonly unknown[]|undefined}[]=[];
  let released=0;
  const pool:PostgresSubjectPoolV1={
    async connect(){return{
      async query<Row>(sql:string,values?:readonly unknown[]){
        statements.push({sql,values});
        if(sql.includes('cmd_record_reading_ai_call_v1')){
          if(conflict)throw Error('Conflicting Reading AI call replay');
          return {rows:[{callId:binding.callId,replayed:false}] as Row[]};
        }
        if(sql==='SELECT current_user::text AS "currentUser"')
          return {rows:[{currentUser:role}] as Row[]};
        return {rows:[] as Row[]};
      },
      release(){released++;},
    };},
  };
  return{pool,statements,get released(){return released;}};
}
describe('dedicated Reading provider usage writer',()=>{
  it('persists only a genuine server-observed OpenAI token receipt in one committed transaction',async()=>{
    const h=pg();
    const result=await createReadingAiCostWriterV1({pool:h.pool}).recordOpenAi({
      binding,providerResponse,expectedModelKey:'fixture-model',price,
    });
    expect(result).toEqual({callId:binding.callId,replayed:false});
    expect(h.statements.map(x=>x.sql)).toEqual([
      'BEGIN','SELECT current_user::text AS "currentUser"',
      expect.stringContaining('cmd_record_reading_ai_call_v1'),'COMMIT',
    ]);
    const args=h.statements[2]?.values;
    expect(args?.slice(0,3)).toEqual([binding.subjectId,binding.readingId,binding.executionAttemptId]);
    const payload=JSON.parse(args?.[3] as string) as Record<string,unknown>;
    expect(payload).toMatchObject({
      workload:'reading',providerKey:'openai',modelKey:'fixture-model',
      inputTokens:1000,outputTokens:100,estimatedCostMicroUsd:1020,
      invoiceReconciled:false,
    });
    expect(JSON.stringify(payload)).not.toContain('resp_secret');
    expect(JSON.stringify(payload)).not.toContain('private result');
    expect(h.released).toBe(1);
  });
  it('fails closed for a wrong writer principal and rolls back without writing',async()=>{
    const h=pg('myeongha_api_executor');
    await expect(createReadingAiCostWriterV1({pool:h.pool}).recordOpenAi({
      binding,providerResponse,expectedModelKey:'fixture-model',
    })).rejects.toThrow('Dedicated Reading AI cost writer required');
    expect(h.statements.map(x=>x.sql)).toEqual([
      'BEGIN','SELECT current_user::text AS "currentUser"','ROLLBACK',
    ]);
    expect(h.released).toBe(1);
  });
  it('preserves unknown token cost and rejects provider identity mismatch before DB access',async()=>{
    const h=pg();
    const writer=createReadingAiCostWriterV1({pool:h.pool});
    await writer.recordOpenAi({
      binding,providerResponse:{...providerResponse,usage:undefined},
      expectedModelKey:'fixture-model',price,
    });
    const payload=JSON.parse(h.statements[2]?.values?.[3] as string) as Record<string,unknown>;
    expect(payload).toMatchObject({
      costStatus:'usage_unknown',estimatedCostMicroUsd:null,inputTokens:null,
    });
    const before=h.statements.length;
    await expect(writer.recordOpenAi({
      binding,providerResponse,expectedModelKey:'different-model',
    })).rejects.toThrow('Unbound OpenAI Reading provider response');
    expect(h.statements).toHaveLength(before);
  });
  it('does not commit a conflicting same-call replay',async()=>{
    const h=pg(READING_AI_COST_WRITER_PRINCIPAL_V1,true);
    await expect(createReadingAiCostWriterV1({pool:h.pool}).recordOpenAi({
      binding,providerResponse,expectedModelKey:'fixture-model',price,
    })).rejects.toThrow('Conflicting Reading AI call replay');
    expect(h.statements.map(x=>x.sql)).toContain('ROLLBACK');
    expect(h.statements.map(x=>x.sql)).not.toContain('COMMIT');
  });
});
