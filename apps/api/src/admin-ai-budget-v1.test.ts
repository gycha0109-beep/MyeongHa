import{describe,it,expect}from'vitest';
import{adminAiBudgetWindowV1,evaluateAdminAiBudgetV1,type AdminAiBudgetBucketV1}from'./admin-ai-budget-v1.js';
import{createAdminAiBudgetHttpV1,createAdminAiBudgetReadV1}from'./admin-ai-budget-read-v1.js';
const now=new Date('2026-11-01T00:00:00Z'),window=adminAiBudgetWindowV1('2026-10',now);
const bucket:AdminAiBudgetBucketV1={workload:'character_chat',feature:'chat',provider:'fixture',model:'fixture',calls:1,unknownCostCalls:0,estimateMicroUsd:'80000000'};
const fx={currency:'USD/KRW' as const,rateNumerator:1000,rateDenominator:1,effectiveFrom:window.from,effectiveTo:window.toExclusive,sourceSha256:'a'.repeat(64)};
describe('approved Seoul monthly budget policy',()=>{
 it('uses Seoul month boundaries rather than UTC months and handles December rollover',()=>{
  expect(window.from).toBe('2026-09-30T15:00:00.000Z');expect(window.toExclusive).toBe('2026-10-31T15:00:00.000Z');
  expect(adminAiBudgetWindowV1(undefined,new Date('2026-10-31T15:00:00Z')).month).toBe('2026-11');
  expect(adminAiBudgetWindowV1('2026-12',now).toExclusive).toBe('2026-12-31T15:00:00.000Z');
 });
 it('keeps USD amounts and leaves KRW and warnings unmeasured without billing and FX',()=>{
  const r=evaluateAdminAiBudgetV1({window,buckets:[bucket],workloadCoverage:['character_chat']});
  expect(r.knownEstimateMicroUsd).toBe('80000000');expect(r.confirmedMicroKrw).toBeNull();expect(r.knownEstimateMicroKrw).toBeNull();expect(r.warnings).toEqual([]);expect(r.missingWorkloads).toEqual(['reading']);
 });
 it('emits stable separate 80/100 cards without substituting estimates for confirmed cost or stopping service',()=>{
  const args={window,buckets:[{...bucket,estimateMicroUsd:'100000000'}],workloadCoverage:['character_chat'] as const,fx};
  const a=evaluateAdminAiBudgetV1(args),b=evaluateAdminAiBudgetV1(args);
  expect(a.warnings.map(w=>w.thresholdPercent)).toEqual([80,100]);expect(a.warnings).toEqual(b.warnings);expect(a.warnings.every(w=>w.basis==='usage_price_estimate'&&w.coverage==='partial')).toBe(true);
  expect(a.confirmedMicroKrw).toBeNull();expect(a.automaticShutdown).toBe(false);
  const c=evaluateAdminAiBudgetV1({...args,billing:{source:'provider_billing_export',evidenceSha256:'b'.repeat(64),from:window.from,toExclusive:window.toExclusive,coverage:'complete',amountMicroUsd:'80000000'}});
  expect(c.warnings.filter(w=>w.basis==='provider_confirmed').map(w=>w.thresholdPercent)).toEqual([80]);
 });
 it('keeps incomplete provider billing as a known lower bound instead of falsely confirming the full month',()=>{
  const billing={source:'provider_billing_export' as const,evidenceSha256:'c'.repeat(64),from:window.from,toExclusive:window.toExclusive,coverage:'partial' as const,amountMicroUsd:'90000000'};
  const result=evaluateAdminAiBudgetV1({window,buckets:[],workloadCoverage:[],billing,fx});
  expect(result.knownConfirmedMicroUsd).toBe('90000000');
  expect(result.knownConfirmedMicroKrw).toBe('90000000000');
  expect(result.confirmedMicroUsd).toBeNull();
  expect(result.confirmedMicroKrw).toBeNull();
  expect(result.budgetStatus).toBe('confirmed_budget_unmeasured');
  expect(result.billingStatus).toBe('partial');
  expect(result.warnings.filter(w=>w.basis==='provider_confirmed')).toMatchObject([
   {thresholdPercent:80,coverage:'partial',notificationOnly:true,automaticShutdown:false},
  ]);
  const complete=evaluateAdminAiBudgetV1({window,buckets:[],workloadCoverage:[],billing:{...billing,coverage:'complete'},fx});
  expect(complete.confirmedMicroUsd).toBe('90000000');
  expect(complete.confirmedMicroKrw).toBe(complete.knownConfirmedMicroKrw);
  expect(complete.budgetStatus).toBe('confirmed_observed');
 });
 it('never marks the current unfinished Seoul month as fully provider-confirmed',()=>{
  const current=adminAiBudgetWindowV1('2026-10',new Date('2026-10-28T06:00:00Z'));
  const billed={source:'provider_billing_export' as const,evidenceSha256:'d'.repeat(64),
    from:current.from,toExclusive:current.toExclusive,coverage:'complete' as const,amountMicroUsd:'80000000'};
  const actual=evaluateAdminAiBudgetV1({window:current,buckets:[],workloadCoverage:[],billing:billed,fx:{
    ...fx,effectiveFrom:current.from,effectiveTo:current.toExclusive,
  }});
  expect(actual.knownConfirmedMicroUsd).toBe('80000000');
  expect(actual.confirmedMicroUsd).toBeNull();
  expect(actual.confirmedMicroKrw).toBeNull();
  expect(actual.billingStatus).toBe('partial');
  expect(actual.warnings.filter(w=>w.basis==='provider_confirmed')).toMatchObject([
    {thresholdPercent:80,coverage:'partial',notificationOnly:true,automaticShutdown:false},
  ]);
  const closed=adminAiBudgetWindowV1('2026-10',new Date('2026-11-01T00:00:00Z'));
  expect(evaluateAdminAiBudgetV1({window:closed,buckets:[],workloadCoverage:[],billing:billed,fx}).billingStatus).toBe('complete');
 });
 it('rejects an invoice from a different period and does not warn one fractional won early or use an out-of-period FX',()=>{
  const r=evaluateAdminAiBudgetV1({window,buckets:[{...bucket,estimateMicroUsd:'79999999'}],workloadCoverage:['character_chat'],fx});expect(r.warnings).toHaveLength(0);
  expect(evaluateAdminAiBudgetV1({window,buckets:[bucket],workloadCoverage:[],fx:{...fx,effectiveFrom:'2026-10-02T00:00:00Z'}}).knownEstimateMicroKrw).toBeNull();
  expect(()=>evaluateAdminAiBudgetV1({window,buckets:[],workloadCoverage:[],billing:{source:'provider_billing_export',evidenceSha256:'b'.repeat(64),from:'2026-01-01',toExclusive:window.toExclusive,coverage:'complete',amountMicroUsd:'1'}})).toThrow('Unbound');
 });
 it('keeps official project costs separately observed, never treating them as final invoice or confirmed warnings',async()=>{
  const observed={
    version:'openai-organization-costs-observation-v1' as const,provider:'openai' as const,
    scope:'project_all_line_items' as const,projectId:'proj_fixture',
    queriedFrom:window.from,queriedToExclusive:window.toExclusive,observedMicroUsd:'90000000',
    sourceSha256:'f'.repeat(64),pageCount:1,
    billingStatus:'provider_reported_not_final_invoice' as const,invoiceConfirmed:false as const,
  };
  const sql:string[]=[];
  const read=createAdminAiBudgetReadV1({pool:{async connect(){return{
    async query<Row>(s:string){sql.push(s);return {rows:(s.startsWith('SELECT current_user')?
      [{currentUser:'myeongha_admin_reader'}]:[]) as Row[]};},release(){}};
  }},openAiCosts:async()=>observed});
  const result=await read(window);
  expect(result.openAiCosts).toEqual(observed);
  expect(result.confirmedMicroUsd).toBeNull();
  expect(result.confirmedMicroKrw).toBeNull();
  expect(result.warnings).toEqual([]);
  expect(sql.at(-1)).toBe('COMMIT');
 });
 it('denies non-Owner/unaudited responses and uses a fixed bounded read-only RPC',async()=>{
  const sql:string[]=[];const read=createAdminAiBudgetReadV1({pool:{async connect(){return{async query<Row>(s:string){sql.push(s);return{rows:(s.startsWith('SELECT current_user')?[{currentUser:'myeongha_admin_reader'}]:[])as Row[]};},release(){}};}}});
  await read(window);expect(sql[2]).toContain('qry_ai_monthly_budget_v1($1::timestamptz,$2::timestamptz)');expect(sql.at(-1)).toBe('COMMIT');
  for(const owner of [false,true]){const handler=createAdminAiBudgetHttpV1({auth:{async verifyOwner(){return owner?{authUserId:'123e4567-e89b-42d3-a456-426614174000'}:null;}},audit:{async append(){if(owner)throw Error('Audit down');}},read});
   expect((await handler(new Request('https://admin.test/api/admin/ai-budget?month=2026-10'))).status).toBe(owner?503:403);}
 });
});
