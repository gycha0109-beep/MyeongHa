import {describe,expect,it} from 'vitest';
import {createAdminReadingGenerationMonthReadV1,createAdminReadingGenerationMonthHttpV1} from './admin-reading-generation-month-v1.js';
import {adminAiBudgetWindowV1} from './admin-ai-budget-v1.js';
import type {PostgresSubjectPoolV1} from './postgres-subject-execution.js';

const clock=new Date('2026-10-28T12:00:00Z');
const month=adminAiBudgetWindowV1('2026-10',clock);
const SOURCE={
  observedCalls:'3',observedReadings:'2',unknownCostCalls:'1',
  missingUsageCalls:'1',knownEstimateMicroUsd:'750',
};
const principal='myeongha_admin_reader';
const OWNER='123e4567-e89b-42d3-a456-426614174000';

function pg(role=principal,row:Record<string,unknown>=SOURCE){
  const sql:string[]=[];let released=false;
  const pool:PostgresSubjectPoolV1={
    async connect(){return{
      async query<T>(query:string){
        sql.push(query);
        const rows=query.startsWith('SELECT current_user')?[{currentUser:role}]:
          query.includes('qry_reading_ai_cost_month_v1')?[row]:[];
        return{rows:rows as T[]};
      },release(){released=true;},
    };},
  };
  return{pool,sql,get released(){return released;}};
}
describe('Reading AI generation monthly observation, not complete budget',()=>{
  it('returns only persisted month-bounded provider observations with partial-coverage marker',async()=>{
    const fixture=pg();
    const result=await createAdminReadingGenerationMonthReadV1(fixture.pool)(month);
    expect(result).toMatchObject({
      version:'admin-reading-generation-month-v1',window:month,
      ...SOURCE,coverage:'provider_events_only_unverified',
      totalEstimateMicroUsd:null,confirmedCostMicroUsd:null,estimatedMicroKrw:null,
    });
    expect(fixture.sql).toHaveLength(4);
    expect(fixture.sql[2]).toContain('myeongha_admin_ops.qry_reading_ai_cost_month_v1');
    expect(fixture.released).toBe(true);
  });
  it('rejects wrong reader and impossible or extra result rows',async()=>{
    const wrong=pg('myeongha_api_executor');
    await expect(createAdminReadingGenerationMonthReadV1(wrong.pool)(month))
      .rejects.toThrow('Dedicated Reading generation cost reader');
    expect(wrong.sql.some(s=>s.includes('qry_reading_ai_cost_month_v1'))).toBe(false);
    for(const row of [
      {...SOURCE,observedReadings:'5'},
      {...SOURCE,knownEstimateMicroUsd:'-1'},
      {...SOURCE,unknownCostCalls:'4'},
    ]){
      const fixture=pg(principal,row);
      await expect(createAdminReadingGenerationMonthReadV1(fixture.pool)(month)).rejects.toThrow();
      expect(fixture.sql).toContain('ROLLBACK');
    }
    const zero=pg(principal,{
      observedCalls:'0',observedReadings:'0',unknownCostCalls:'0',
      missingUsageCalls:'0',knownEstimateMicroUsd:'0',
    });
    const empty=await createAdminReadingGenerationMonthReadV1(zero.pool)(month);
    expect(empty.totalEstimateMicroUsd).toBeNull();
    expect(empty.coverage).toBe('provider_events_only_unverified');
  });
  it('requires authenticated Owner and successful audit; rejects duplicate month input',async()=>{
    const audits:string[]=[];let reads=0;
    const handler=(owner:boolean,auditOK=true)=>createAdminReadingGenerationMonthHttpV1({
      auth:{async verifyOwner(){return owner?{authUserId:OWNER}:null;}},
      audit:{async append(event){audits.push(event.outcome);if(!auditOK)throw Error('audit failed');}},
      read:async window=>{reads++;return{
        version:'admin-reading-generation-month-v1' as const,window,...SOURCE,
        coverage:'provider_events_only_unverified' as const,
        totalEstimateMicroUsd:null,confirmedCostMicroUsd:null,estimatedMicroKrw:null,
      };},
      now:()=>clock,
    });
    const url='https://admin.test/api/admin/reading-generation-cost/monthly?month=2026-10';
    expect((await handler(false)(new Request(url))).status).toBe(403);
    expect((await handler(true)(new Request(url+'&month=2026-09'))).status).toBe(400);
    expect((await handler(true)(new Request(url,{method:'POST'}))).status).toBe(405);
    expect(reads).toBe(0);
    const accepted=await handler(true)(new Request(url));
    expect(accepted.status).toBe(200);
    expect((await accepted.json()).totalEstimateMicroUsd).toBeNull();
    expect(accepted.headers.get('Cache-Control')).toBe('no-store');
    expect(reads).toBe(1);
    expect((await handler(true,false)(new Request(url))).status).toBe(503);
    expect(audits).toContain('allowed');
  });
});
