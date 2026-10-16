import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {describe,it,expect} from 'vitest';
import {F01_V2_POLICY as P,createF01V2Quota,
 F01_V2_HISTORY_ESTIMATE_MICRO_USD as HISTORY,
 F01_V2_CUMULATIVE_RESERVED_MICRO_USD as RESERVED,
 F01_V2_CUMULATIVE_STRESS_KRW as STRESS}
 from '../scripts/seyeon-cost-c06-f01-v2-budget-v1.mjs';
import {assertF01V2SingleDispatch as admit}
 from '../scripts/seyeon-cost-c06-f01-v2-once-admission-v1.mjs';

const id=i=>'10000000-0000-4000-8000-'+String(i).padStart(12,'0');
const req=(i=0)=>({caseId:'F01',variant:P.variants[i],callId:id(i),
 modelKey:P.model,purpose:P.purpose,requestBodyBytes:5000});
const outcome=(i=0)=>({callId:id(i),modelKey:P.model,purpose:P.purpose,
 outcome:'response_received',inputTokens:3000,outputTokens:200});

describe('C06 F01 V2 two-call cumulative 100 KRW owner-budget estimate',()=>{
 it('pins immutable historical 3 calls and reserves two NEW calls conservatively',()=>{
  expect(P).toMatchObject({
   previousRunId:38845185681,previousCalls:3,maxCalls:2,
   model:'gpt-5.6-luna',budgetKrw:100,stressUsdKrw:2500,
  });
  expect(HISTORY).toBe(1036);
  expect(P.previousReserveMicroUsd).toBe(9831);
  expect(RESERVED).toBe(16385);
  expect(STRESS).toBe(40.9625);
  expect(STRESS).toBeLessThan(P.budgetKrw);
  expect(P.variants).toEqual(['original','compact']);
 });
 it('only admits the two F01 variants in sequence; no retry or third dispatch',()=>{
  const q=createF01V2Quota();
  expect(()=>q.reserve(req(1))).toThrow(/quota denied/u);
  expect(q.reserve(req(0)).reservedMicroUsd).toBe(3277);
  expect(()=>q.reserve(req(0))).toThrow(/quota denied/u);
  expect(q.reserve(req(1)).reservedMicroUsd).toBe(3277);
  expect(()=>q.reserve(req(2))).toThrow(/quota exhausted/u);
  expect(q.observe(outcome(0)).estimatedCostMicroUsd).toBe(990);
  expect(q.observe(outcome(1)).estimatedCostMicroUsd).toBe(990);
  expect(q.snapshot()).toMatchObject({
   priorPaidCalls:3,newAttemptedCalls:2,newObservedCalls:2,
   totalProvisionalEstimateMicroUsd:3016,
   unknownOutcomes:0,providerInvoiceReconciled:false,
   actualBilledKrw:null,productionPromotionPermitted:false,
  });
 });
 it('holds missing usage, out-of-policy response and duplicate outcomes',()=>{
  for(const event of [
   {...outcome(0),inputTokens:null},
   {...outcome(0),outputTokens:1025},
   {...outcome(0),outcome:'timeout'},
  ]){
   const q=createF01V2Quota();q.reserve(req(0));
   expect(q.observe(event).observation).toBe('UNKNOWN_USAGE_HOLD');
   expect(q.snapshot().totalProvisionalEstimateMicroUsd).toBeNull();
   expect(()=>q.observe(event)).toThrow(/duplicate outcome/u);
  }
  const q=createF01V2Quota();
  expect(()=>q.reserve({...req(0),requestBodyBytes:7000})).toThrow();
  expect(()=>q.reserve({...req(0),modelKey:'gpt-5.6-terra'})).toThrow();
 });
 it('requires the current run to be the sole dispatch in GitHub history',()=>{
  const one={total_count:1,workflow_runs:[{
   id:100,event:'workflow_dispatch',head_branch:'main',
  }]};
  expect(admit(one,'100')).toMatchObject({runId:'100',approved:true});
  expect(()=>admit({...one,total_count:2},'100')).toThrow();
  expect(()=>admit({...one,workflow_runs:[one.workflow_runs[0],
   {...one.workflow_runs[0],id:99}]},'100')).toThrow();
  expect(()=>admit(one,'101')).toThrow();
  expect(()=>admit({...one,workflow_runs:[{...one.workflow_runs[0],
   head_branch:'feature'}]},'100')).toThrow();
 });
 it('preserves V1 locks, KEY2-only V2, manual main, and parses without paid calls',()=>{
  const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
  const old=read('.github/workflows/seyeon-model-eval-v1.yml');
  const w=read('.github/workflows/seyeon-c06-f01-v2-manual-eval.yml');
  const run=read('scripts/run-seyeon-cost-c06-f01-v2-eval-v1.mjs');
  expect(old).toContain('if: $'+'{{ false }}');
  expect(w).toContain('workflow_dispatch:');
  expect(w).not.toMatch(/^  push:/mu);
  expect(w).toContain('inputs.confirm_cost_limit == true');
  expect(w).toContain("github.ref == 'refs/heads/main'");
  expect(w).toContain('secrets.OPENAI_API_KEY2');
  expect(w).not.toContain('secrets.OPENAI_API_KEY }}');
  expect(w).toContain('once-admission-v1.mjs');
  expect(run).toContain('process.env.OPENAI_API_KEY2?.trim()');
  expect(run).not.toContain('process.env.OPENAI_API_KEY?.');
  for(const path of [
   'scripts/run-seyeon-cost-c06-f01-v2-eval-v1.mjs',
   'scripts/seyeon-cost-c06-f01-v2-once-admission-v1.mjs',
  ])expect(()=>execFileSync(process.execPath,['--check',path],
   {stdio:'pipe'})).not.toThrow();
 });
});
