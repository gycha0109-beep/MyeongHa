import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {
 SEYEON_C08T_FIRST_PAID_PILOT_POLICY_V1 as P,
 SEYEON_C08T_REMAINING_C07_SLOTS_V1 as REMAINING,
 assessSeyeonC08TExecutionPrerequisitesV1 as assess,
 createSeyeonC08TOfflineQuotaSimulationV1 as quota,
} from '../scripts/seyeon-cost-c08t-owner-budget-pilot-v1.mjs';
import {
 SEYEON_C07_BOUNDARY_MATRIX_V1 as GOLD,
 SEYEON_C07_BOUNDARY_VARIANTS_V1 as VARIANTS,
} from '../scripts/seyeon-cost-c07-cross-topic-boundary-v1.mjs';

const uuid=i=>'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0');
const first=()=>{
 const g=quota();
 const slots=P.caseIds.flatMap(caseId=>VARIANTS.map(variant=>({caseId,variant})));
 return {g,slots};
};
const req=(s,i)=>({...s,callId:uuid(i),model:P.model,
 purpose:P.purpose,bodyBytes:1200});
const event=(i,extra={})=>({callId:uuid(i),outcome:'response_received',
 inputTokens:1040,outputTokens:100,...extra});

describe('C08-T 5,000 KRW separate Owner allocation; unpaid gate remains CLOSED',()=>{
 it('pins previous 6 real C07 cases and exactly 66 unobserved original/compact slots',()=>{
  const historic=JSON.parse(readFileSync(new URL(
   './fixtures/seyeon-c07-real-six-call-run-38859692050-sanitized-v1.json',
   import.meta.url),'utf8'));
  const previous=new Set(historic.results.map(x=>x.caseId+':'+x.variant));
  expect(GOLD).toHaveLength(36);
  expect(REMAINING).toHaveLength(66);
  expect(new Set(REMAINING.map(x=>x.caseId+':'+x.variant)).size).toBe(66);
  expect(REMAINING.every(x=>!previous.has(x.caseId+':'+x.variant))).toBe(true);
  expect(REMAINING.map(x=>x.caseId+':'+x.variant)).toEqual(
   GOLD.flatMap(g=>VARIANTS.map(v=>g.id+':'+v)).filter(x=>!previous.has(x)));
  expect(P.caseIds).toEqual(['A01','H01','C02_mixed-admin-private_01']);
  for(const id of P.caseIds)
   expect(GOLD.find(g=>g.id===id)?.hasExplicitClaim).toBe(true);
 });
 it('separates new Owner 5,000 KRW budget from the 11 already attempted calls',()=>{
  expect(P.additionalBudgetKrw).toBe(5000);
  expect(P.priorPaidCalls).toBe(11);
  expect(P.priorUsageEstimateMicroUsd).toBe(3770);
  expect(P.priorActualBilledKrw).toBeNull();
  expect(P.priorInvoiceReconciled).toBe(false);
  expect(P.maxFirstBatchCalls).toBe(6);
  expect(P.perCallReservedMicroUsd).toBe(3277);
  expect(P.firstBatchReservedMicroUsd).toBe(19662);
  expect(P.firstBatchReservedKrw).toBeCloseTo(49.155);
  expect(P.allRemainingSlots).toBe(66);
  expect(P.allRemainingConservativeReserveKrw).toBeCloseTo(540.705);
  expect(P.paidDispatchEnabled).toBe(false);
  expect(P.providerHardLimitVerified).toBe(false);
  expect(P.productionPromotionPermitted).toBe(false);
 });
 it('cannot be unlocked by forged self-attested readiness even if every field is true',()=>{
  for(const input of [
   undefined,
   {ownerAdditionalBudgetKrw:5000,invoiceReconciled:'true',
    priorActualBilledKrw:0,dedicatedProjectCredentialVerified:true,
    hardSpendLimitEnforced:true,existingMonthlySpendChecked:true},
   {ownerAdditionalBudgetKrw:5000,invoiceReconciled:true,
    priorActualBilledKrw:0,dedicatedProjectCredentialVerified:true,
    hardSpendLimitEnforced:true,existingMonthlySpendChecked:true},
  ]){
   const result=assess(input);
   expect(result.paidDispatchEnabled).toBe(false);
   expect(result.blockers).toContain('PAID_WORKFLOW_REVIEW_AND_ENFORCEMENT_REQUIRED');
  }
  expect(assess({}).blockers).toEqual(expect.arrayContaining([
   'PRIOR_INVOICE_UNRECONCILED','EVAL_PROJECT_CREDENTIAL_UNVERIFIED',
   'PROVIDER_HARD_LIMIT_UNVERIFIED','MONTH_TO_DATE_SPEND_UNVERIFIED',
   'OWNER_BUDGET_SCOPE_MISMATCH',
  ]));
 });
 it('simulates six strictly sequential bounded calls, then denies seventh and duplicates',()=>{
  const {g,slots}=first();
  for(const [i,slot] of slots.entries()){
   const pre=req(slot,i);
   expect(g.reserve(pre)).toMatchObject({
    caseId:slot.caseId,variant:slot.variant,reservedMicroUsd:3277});
   expect(()=>g.reserve(req(slots[i+1]??slot,i+1))).toThrow();
   expect(g.observe(event(i))).toMatchObject({
    observation:'BOUNDED_ESTIMATE'});
  }
  expect(g.snapshot()).toMatchObject({
   attempted:6,observed:6,unknownOrInFlight:0,
   firstBatchReservedMicroUsd:19662,paidDispatchEnabled:false,
  });
  expect(g.snapshot().reservedKrw).toBeCloseTo(49.155);
  expect(()=>g.reserve(req(slots[0],7))).toThrow();
  expect(()=>g.observe(event(0))).toThrow();
 });
 it('fails closed on wrong case, price, model, output, body and any unknown outcome',()=>{
  const {slots}=first();
  const requests=[
   {...req(slots[0],0),caseId:'N01'},
   {...req(slots[0],0),variant:'rerun'},
   {...req(slots[0],0),model:'gpt-any'},
   {...req(slots[0],0),purpose:'dialogue_render'},
   {...req(slots[0],0),bodyBytes:6145},
   {...req(slots[0],0),bodyBytes:0},
   {...req(slots[0],0),callId:'invalid'},
  ];
  for(const p of requests)expect(()=>quota().reserve(p)).toThrow();
  for(const outcome of [
   {outcome:'network_failure'},
   {outcome:'response_received',inputTokens:8193},
   {outcome:'response_received',outputTokens:1025},
   {outcome:'response_received',inputTokens:null},
  ]){
   const q=quota();
   q.reserve(req(slots[0],0));
   expect(q.observe(event(0,outcome)).observation).toBe('UNKNOWN_OUTCOME_HOLD');
   expect(q.snapshot()).toMatchObject({unknownOrInFlight:1,estimatedMicroUsd:null});
   expect(()=>q.reserve(req(slots[1],1))).toThrow();
  }
 });
 it('never activates old spent workflows or changes provider/production routing',()=>{
  const sources=[
   '../scripts/seyeon-cost-c08t-owner-budget-pilot-v1.mjs',
   '../.github/workflows/seyeon-c07-six-call-model-eval-v1.yml',
  ].map(x=>readFileSync(new URL(x,import.meta.url),'utf8'));
  expect(sources[0]).not.toContain('process.env.'+'OPENAI_API_KEY');
  expect(sources[0]).not.toContain('workflow_'+'dispatch');
  expect(sources[0]).not.toContain('fetch'+'(');
  expect(sources[1]).toContain('seyeon-cost-c07-six-call-once-admission-v1.mjs');
  expect(P.paidDispatchEnabled).toBe(false);
 });
});
