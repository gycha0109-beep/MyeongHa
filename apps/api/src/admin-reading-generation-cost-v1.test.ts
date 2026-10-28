import {describe,expect,it} from 'vitest';
import {createAdminReadingGenerationCostReadV1,createAdminReadingGenerationCostHttpV1} from './admin-reading-generation-cost-v1.js';
import type {PostgresSubjectPoolV1} from './postgres-subject-execution.js';

const READING='123e4567-e89b-42d3-a456-426614174001';
const CALL='123e4567-e89b-42d3-a456-426614174003';
const ATTEMPT='123e4567-e89b-42d3-a456-426614174002';
const OWNER='123e4567-e89b-42d3-a456-426614174000';
const event={
  callId:CALL,readingId:READING,executionAttemptId:ATTEMPT,
  observedAt:'2026-10-28T09:00:00+00',provider:'provider-fixture',model:'model-v1',
  outcome:'response_received',source:'provider_response_usage',
  inputTokens:'1000',outputTokens:'100',cachedInputTokens:'200',reasoningTokens:'20',
  priceVersion:'rate-v1',estimatedMicroUsd:'1020',costStatus:'estimated',
};
function fixture(role='myeongha_admin_reader',row:Record<string,unknown>=event){
  const statements:{sql:string;args:readonly unknown[]|undefined}[]=[];
  const pool:PostgresSubjectPoolV1={async connect(){return{
    async query<T>(sql:string,args?:readonly unknown[]){
      statements.push({sql,args});
      return {rows:(sql.startsWith('SELECT current_user')?[{currentUser:role}]:
        sql.includes('qry_reading_ai_cost_calls_v1')?[row]:[]) as T[]};
    },release(){},
  };}};
  return{pool,statements};
}
const request=(suffix='')=>new Request('https://admin.test/api/admin/readings/'+READING+'/generation-cost'+suffix);
describe('private Reading generation cost read',()=>{
  it('separates actual provider call estimates from Character grounding usage and validates bounded reads',async()=>{
    const f=fixture();
    const output=await createAdminReadingGenerationCostReadV1(f.pool)(READING,20,0);
    expect(output).toMatchObject({rows:[event],nextCursor:null,coverage:'provider_events_only'});
    expect(f.statements.map(x=>x.sql)).toEqual([
      'BEGIN READ ONLY','SELECT current_user::text AS "currentUser"',
      expect.stringContaining('myeongha_admin_ops.qry_reading_ai_cost_calls_v1'),'COMMIT',
    ]);
    expect(f.statements[2]?.args).toEqual([READING,21,0]);
    const untrusted=fixture('myeongha_api_executor');
    await expect(createAdminReadingGenerationCostReadV1(untrusted.pool)(READING,20,0)).rejects.toThrow('Dedicated');
    expect(untrusted.statements.some(x=>x.sql.includes('qry_reading_ai_cost_calls'))).toBe(false);
    const different=fixture('myeongha_admin_reader',{...event,readingId:CALL});
    await expect(createAdminReadingGenerationCostReadV1(different.pool)(READING,20,0)).rejects.toThrow('Unbound');
  });
  it('requires Owner, valid route and audit to return a generation-only cost projection',async()=>{
    const audit:string[]=[];
    let called=0;
    const make=(owner:boolean,allowAudit:boolean)=>createAdminReadingGenerationCostHttpV1({
      auth:{async verifyOwner(){return owner?{authUserId:OWNER}:null;}},
      audit:{async append(entry){audit.push(entry.outcome);if(!allowAudit)throw Error('audit unavailable');}},
      read:async()=>{called++;return{rows:[event],nextCursor:null,coverage:'provider_events_only' as const};},
      now:()=>new Date('2026-10-28T12:00:00Z'),
    });
    expect((await make(false,true)(request())).status).toBe(403);expect(called).toBe(0);
    expect((await make(true,true)(request('?cursor=-1'))).status).toBe(400);expect(called).toBe(0);
    expect((await make(true,true)(new Request(request().url,{method:'POST'}))).status).toBe(405);
    const success=await make(true,true)(request());
    expect(success.status).toBe(200);
    expect(await success.json()).toMatchObject({kind:'reading-generation-ai-cost',readingId:READING,coverage:'provider_events_only'});
    expect(success.headers.get('Cache-Control')).toBe('no-store');
    expect((await make(true,false)(request())).status).toBe(503);
    expect(audit).toContain('allowed');
  });
});
