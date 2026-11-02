import { describe, expect, it } from 'vitest';
import { compareAdminAiRevenueV1, reconcileAdminAiCallV1, selectAdminAiPriceV1, summarizeAdminAiFinanceV1, type AdminAiBillingEvidenceV1, type AdminAiFinanceCallV1 } from './admin-ai-cost-finance-v1.js';
import { createAdminAiFinanceHttpHandlerV1, parseAdminAiFinanceFiltersV1 } from './admin-ai-cost-http-v1.js';
import { createAdminAiFinanceReadPortV1 } from './admin-ai-cost-read-v1.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';

const OWNER='123e4567-e89b-42d3-a456-426614174000';
const call:AdminAiFinanceCallV1={callId:OWNER,subjectId:OWNER,attemptId:OWNER,turnId:OWNER,createdAt:'2026-10-27T00:00:00Z',workload:'character_chat',
  feature:'chat',provider:'testprovider',model:'test-model',outcome:'response_received',priceVersion:'price-v1',inputTokens:1000,outputTokens:100,
  cachedInputTokens:500,reasoningTokens:50,recordedEstimateMicroUsd:null,
  appliedPrice:{providerKey:'testprovider',modelKey:'test-model',priceVersion:'price-v1',inputMicroUsdPerMillion:1_000_000,cachedInputMicroUsdPerMillion:100_000,outputMicroUsdPerMillion:2_000_000}};
const bill:AdminAiBillingEvidenceV1={callId:OWNER,provider:'testprovider',model:'test-model',currency:'USD',amountMicroUsd:900,match:'exact_call',source:'provider_billing_export',evidenceSha256:'a'.repeat(64),billedFrom:'2026-10-01T00:00:00Z',billedTo:'2026-11-01T00:00:00Z'};
const now=new Date('2026-10-27T12:00:00Z');
function unpriced(source:AdminAiFinanceCallV1):AdminAiFinanceCallV1 { const {appliedPrice,...row}=source;return {...row,priceVersion:null,recordedEstimateMicroUsd:null}; }

describe('AI cost finance source boundaries',()=>{
  it('reuses cache-aware pricing, does not double-charge reasoning and keeps invoice/FX absent',()=>{
    const row=reconcileAdminAiCallV1(call);
    expect(row).toMatchObject({estimatedMicroUsd:'750',confirmedMicroUsd:null,costClass:'usage_price_estimate',confirmedMicroKrw:null,estimatedMicroKrw:null,otherChargesStatus:'not_in_token_estimate'});
    expect(reconcileAdminAiCallV1({...call,reasoningTokens:0}).estimatedMicroUsd).toBe('750');
    expect(()=>reconcileAdminAiCallV1({...call,cachedInputTokens:1001})).toThrow('Cached input');
    expect(reconcileAdminAiCallV1(unpriced(call)).costClass).toBe('unknown');
  });
  it('confirms only exact provider evidence and converts only using a valid dated FX source',()=>{
    const row=reconcileAdminAiCallV1(call,{billing:[bill],fx:{currency:'USD/KRW',rateNumerator:1400,rateDenominator:1,effectiveFrom:'2026-10-27T00:00:00Z',effectiveTo:'2026-10-28T00:00:00Z',sourceSha256:'b'.repeat(64)}});
    expect(row).toMatchObject({confirmedMicroUsd:'900',estimateDeltaMicroUsd:'150',costClass:'provider_confirmed',confirmedMicroKrw:'1260000'});
    expect(()=>reconcileAdminAiCallV1(call,{billing:[{...bill,provider:'different'}]})).toThrow('exact call');
    expect(()=>reconcileAdminAiCallV1(call,{billing:[bill,bill]})).toThrow('Duplicate');
    expect(reconcileAdminAiCallV1(call,{billing:[bill],fx:{currency:'USD/KRW',rateNumerator:1400,rateDenominator:1,effectiveFrom:'2026-09-01T00:00:00Z',effectiveTo:'2026-10-01T00:00:00Z',sourceSha256:'b'.repeat(64)}}).confirmedMicroKrw).toBeNull();
  });
  it('does not retroactively apply the current or ambiguously dated price to a historic call',()=>{
    const {appliedPrice,...historic}=call;
    const schedule={...appliedPrice!,effectiveFrom:'2026-10-01T00:00:00Z',effectiveTo:'2026-11-01T00:00:00Z',sourceSha256:'c'.repeat(64)};
    expect(selectAdminAiPriceV1(historic,[schedule])).toBe(schedule);
    expect(selectAdminAiPriceV1(historic,[{...schedule,priceVersion:'price-v2'}])).toBeUndefined();
    expect(()=>selectAdminAiPriceV1(historic,[schedule,schedule])).toThrow('Ambiguous');
  });
  it('separates workloads, missing cost and failures without presenting partial cohorts as totals',()=>{
    const unknown={...unpriced(call),callId:'other',workload:'reading' as const};
    const rows=summarizeAdminAiFinanceV1([call,{...call,callId:'retry',outcome:'timeout',attemptId:'retry-attempt'},unknown],{completeCohort:true,granularity:'month',groupBy:'subject'});
    expect(rows).toHaveLength(2);
    expect(rows.find(row=>row.workload==='character_chat')).toMatchObject({period:'2026-10',calls:2,failedCalls:1,observedAttempts:2,estimatedMicroUsd:'1500',confirmedMicroUsd:null,failedEstimateMicroUsd:'750'});
    expect(rows.find(row=>row.workload==='reading')).toMatchObject({unknownCalls:1,estimatedMicroUsd:null,confirmedMicroUsd:null});
    expect(()=>summarizeAdminAiFinanceV1([call,call],{completeCohort:true,granularity:'day',groupBy:'feature'})).toThrow('Duplicate');
    expect(compareAdminAiRevenueV1({verifiedRevenueMicroKrw:10000,confirmedCostMicroKrw:1000,samePeriodAndCohort:true})).toBe('1000');
    expect(compareAdminAiRevenueV1({verifiedRevenueMicroKrw:10000,confirmedCostMicroKrw:1000,samePeriodAndCohort:false})).toBeNull();
  });
  it('validates every filter and denies mutation and unaudited finance responses',async()=>{
    const read=(path:string)=>parseAdminAiFinanceFiltersV1(new URL('https://admin.test'+path),now);
    expect(read('/api/admin/ai-finance/summary?granularity=month&groupBy=subject').granularity).toBe('month');
    for(const path of ['/api/admin/ai-finance/summary?from=2026-01-01&to=2026-10-27','/api/admin/ai-finance/calls?subjectId=bad','/api/admin/ai-finance/prices?from=2026-10-01&to=2026-10-27','/api/admin/ai-finance/calls?model=%27OR%201=1','/different/prefix/calls']) expect(()=>read(path)).toThrow();
    let reads=0;
    const make=(owner:boolean,audit:boolean)=>createAdminAiFinanceHttpHandlerV1({auth:{async verifyOwner(){return owner?{authUserId:OWNER}:null;}},audit:{async append(){if(!audit)throw new Error('audit');}},reads:{async read(){reads++;return {rows:[],nextCursor:null};}},now:()=>now});
    expect((await make(false,true)(new Request('https://admin.test/api/admin/ai-finance/calls'))).status).toBe(403);expect(reads).toBe(0);
    expect((await make(true,true)(new Request('https://admin.test/api/admin/ai-finance/calls',{method:'POST'}))).status).toBe(405);expect(reads).toBe(0);
    expect((await make(true,false)(new Request('https://admin.test/api/admin/ai-finance/calls'))).status).toBe(503);
  });
  it('rejects foreign and duplicate authenticated billing lines before any cost page is returned',async()=>{
    const stored={callId:OWNER,subjectId:OWNER,attemptId:OWNER,turnId:OWNER,createdAt:call.createdAt,
      priceAppliedAt:call.createdAt,feature:'chat',provider:call.provider,model:call.model,
      outcome:call.outcome,priceVersion:null,recordedEstimateMicroUsd:null,
      inputTokens:null,outputTokens:null,cachedInputTokens:null,reasoningTokens:null,
      appliedInputRate:null,appliedCachedInputRate:null,appliedOutputRate:null};
    const pool:PostgresSubjectPoolV1={async connect(){return{
      async query<Row>(sql:string){return{rows:(sql.startsWith('SELECT current_user')?
        [{currentUser:'myeongha_admin_reader'}]:sql.includes('qry_ai_finance_calls_v1')?[stored]:[]) as Row[]};},
      release(){},
    };}};
    const filters=parseAdminAiFinanceFiltersV1(new URL('https://admin.test/api/admin/ai-finance/calls'),now);
    const reader=(bills:readonly AdminAiBillingEvidenceV1[])=>createAdminAiFinanceReadPortV1({
      pool,billing:{async lookup(ids){expect(ids).toEqual([OWNER]);return bills;}},
    }).read(filters);
    await expect(reader([{...bill,callId:'123e4567-e89b-42d3-a456-426614174001'}])).rejects.toThrow('Unbound');
    await expect(reader([bill,bill])).rejects.toThrow('Unbound');
    const matched=await reader([bill]);
    expect(matched.rows).toHaveLength(1);
    expect(matched.rows[0]?.confirmedMicroUsd).toBe('900');
  });
  it('uses only bounded read RPCs and refuses ordinary DB identities before reading cost sources',async()=>{
    const seen:{sql:string;args:readonly unknown[]|undefined}[]=[];
    const pool=(role:string):PostgresSubjectPoolV1=>({async connect(){return {async query<Row>(sql:string,args?:readonly unknown[]){seen.push({sql,args});return {rows:(sql.startsWith('SELECT current_user')?[{currentUser:role}]:[]) as Row[]};},release(){}};}});
    const filters=parseAdminAiFinanceFiltersV1(new URL('https://admin.test/api/admin/ai-finance/summary?granularity=month&groupBy=subject&model=provider/model'),now);
    await expect(createAdminAiFinanceReadPortV1({pool:pool('myeongha_api_executor')}).read(filters)).rejects.toThrow('Dedicated');
    expect(seen.some(row=>row.sql.includes('qry_ai_finance'))).toBe(false);seen.length=0;
    await createAdminAiFinanceReadPortV1({pool:pool('myeongha_admin_reader')}).read(filters);
    expect(seen[2]?.sql).toContain('myeongha_admin_ops.qry_ai_finance_summary_v1');
    expect(seen[2]?.sql).not.toContain('provider/model');expect(seen[2]?.args?.slice(-2)).toEqual(['month','subject']);
  });
});
