import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {SEYEON_C07_SIX_CALL_RUNTIME_POLICY_V1 as P,
 createSeyeonC07SixCallQuotaV1 as createQuota}
 from '../scripts/seyeon-cost-c07-six-call-budget-v1.mjs';
import {assertSeyeonC07UniqueDispatchV1 as admit}
 from '../scripts/seyeon-cost-c07-six-call-once-admission-v1.mjs';
import {SEYEON_C07_BOUNDARY_MATRIX_V1 as CASES}
 from '../scripts/seyeon-cost-c07-cross-topic-boundary-v1.mjs';

const uuid=i=>'10000000-0000-4000-8000-'+String(i).padStart(12,'0');
const make=i=>({
 caseId:P.caseIds[Math.floor(i/2)],variant:P.variants[i%2],
 callId:uuid(i),modelKey:P.model,purpose:P.purpose,
 requestBodyBytes:5000,
});
const observed=i=>({
 callId:uuid(i),modelKey:P.model,purpose:P.purpose,
 outcome:'response_received',inputTokens:3000,outputTokens:200,
});

describe('C07 synthetic 3-case × 2-variant single-use paid pilot boundary',()=>{
 it('pins cumulative 5 paid calls / next 6, reserved 90.1175 of OWNER 100 KRW',()=>{
  expect(P).toMatchObject({
   model:'gpt-5.6-luna',
   historicPaidCalls:5,
   historicReserveMicroUsd:16385,
   historicUsageEstimateMicroUsd:1622,
   perRequestReserveMicroUsd:3277,
   maxNewCalls:6,userTotalBudgetKrw:100,
   stressFxKrwPerUsd:2500,
   directInvocationAllowed:false,
   productionPromotionPermitted:false,
  });
  expect(P.caseIds).toEqual(['F02','R01','H02']);
  expect(P.variants).toEqual(['original','compact']);
  const cases=P.caseIds.map(id=>CASES.find(x=>x.id===id));
  expect(cases).not.toContain(undefined);
  expect(cases.map(x=>x.expectedKinds)).toEqual([
   [],[],['SHARED_EVENT_CLAIM'],
  ]);
  const q=createQuota();
  expect(q.snapshot()).toMatchObject({
   historicPaidCalls:5,newAttemptedCalls:0,
   cumulativeReserveMicroUsd:16385,
   stressReservedKrw:40.9625,
   actualProviderBilledKrw:null,
   providerHardLimitVerified:false,
   productionPromotionPermitted:false,
  });
 });
 it('admits exactly six in fixed order, never seventh or retry',()=>{
  const q=createQuota();
  expect(()=>q.reserve(make(1))).toThrow(/admission denied/u);
  for(let i=0;i<6;i++){
   expect(q.reserve(make(i)).reservedMicroUsd).toBe(3277);
   expect(q.observe(observed(i))).toMatchObject({
    observation:'USAGE_BOUNDED_ESTIMATE',
    estimatedCostMicroUsd:990,
   });
  }
  expect(q.snapshot()).toMatchObject({
   historicPaidCalls:5,newAttemptedCalls:6,newObservedCalls:6,
   ownerLifetimeMaxTotalCalls:11,newReservedMicroUsd:19662,
   cumulativeReserveMicroUsd:36047,stressReservedKrw:90.1175,
   estimatedTotalMicroUsd:7562,unknownOutcomeCount:0,
   actualProviderBilledKrw:null,
  });
  expect(()=>q.reserve(make(6))).toThrow(/cap exhausted/u);
 });
 it('rejects request-body violations, forged purpose/model and duplicate calls',()=>{
  const changes=[
   x=>x.requestBodyBytes=0,
   x=>x.requestBodyBytes=6145,
   x=>x.modelKey='gpt-5.6-terra',
   x=>x.purpose='turn_interpretation',
   x=>x.caseId='R01',
   x=>x.variant='compact',
  ];
  for(const update of changes){
   const q=createQuota(),arg=make(0);update(arg);
   expect(()=>q.reserve(arg)).toThrow(/admission denied/u);
   expect(q.snapshot().newAttemptedCalls).toBe(0);
  }
  const q=createQuota();q.reserve(make(0));
  expect(()=>q.reserve(make(0))).toThrow();
 });
 it('treats timeout/unknown or oversized usage as HOLD and forbids double callback',()=>{
  const faulty=[
   {...observed(0),outcome:'timeout'},
   {...observed(0),inputTokens:null},
   {...observed(0),inputTokens:8193},
   {...observed(0),outputTokens:1025},
  ];
  for(const event of faulty){
   const q=createQuota();q.reserve(make(0));
   const result=q.observe(event);
   expect(result.observation).toBe('UNKNOWN_OR_OUT_OF_POLICY_HOLD');
   expect(q.snapshot().estimatedTotalMicroUsd).toBeNull();
   expect(()=>q.observe(event)).toThrow(/duplicate/u);
  }
 });
 it('allows only one history entry and first run attempt, including GitHub re-run denial',()=>{
  const good={total_count:1,workflow_runs:[{
   id:1024,event:'workflow_dispatch',head_branch:'main',
   run_attempt:1,
  }]};
  expect(admit(good,'1024','1')).toMatchObject({
   approvedFirstRunId:'1024',runAttempt:1,
   providerCallsAuthorizedByThisFunction:0,
  });
  expect(()=>admit(good,'1024','2')).toThrow(/HOLD/u);
  expect(()=>admit({...good,total_count:2},'1024','1')).toThrow(/HOLD/u);
  expect(()=>admit(good,'1025','1')).toThrow(/HOLD/u);
  expect(()=>admit({...good,workflow_runs:[{...good.workflow_runs[0],
   run_attempt:2}]},'1024','1')).toThrow(/HOLD/u);
 });
 it('workflow is manual/main-only dedicated KEY2, and legacy 8-call remains locked',()=>{
  const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
  const w=read('.github/workflows/seyeon-c07-six-call-model-eval-v1.yml');
  const legacy=read('.github/workflows/seyeon-model-eval-v1.yml');
  const run=read('scripts/run-seyeon-cost-c07-six-call-v1.mjs');
  expect(w).toContain('workflow_dispatch:');
  expect(w).not.toMatch(/^  push:/mu);
  expect(w).toContain("github.ref == 'refs/heads/main'");
  expect(w).toContain('confirm_total_100_krw_budget == true');
  expect(w).toContain('secrets.OPENAI_API_KEY2');
  expect(w).not.toContain('secrets.OPENAI_API_KEY }}');
  expect(w).toContain('once-admission-v1.mjs');
  expect(legacy).toContain('if: $'+'{{ false }}');
  expect(run).toContain('process.env.OPENAI_API_KEY2?.trim()');
  expect(run).not.toContain('process.env.OPENAI_API_KEY?.');
  for(const path of [
   'scripts/run-seyeon-cost-c07-six-call-v1.mjs',
   'scripts/seyeon-cost-c07-six-call-once-admission-v1.mjs',
  ])expect(()=>execFileSync(process.execPath,['--check',path],
   {stdio:'pipe'})).not.toThrow();
 });
});
