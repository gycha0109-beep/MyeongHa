/**
 * C08-T OWNER APPROVAL: 5,000 KRW applies only to additional paid evaluation,
 * not historical C06/F01/C07 charges, not Production, and not blanket approval.
 * Planning/accounting functions are deterministic and offline. No API/network.
 * Actual provider/billing admission is ALWAYS HOLD until a later reviewed PR
 * records an independently verified hard limit and reconciled prior invoices.
 */
import {
 SEYEON_C07_BOUNDARY_MATRIX_V1 as GOLD,
 SEYEON_C07_BOUNDARY_VARIANTS_V1 as VARIANTS,
} from './seyeon-cost-c07-cross-topic-boundary-v1.mjs';
import {SEYEON_C06_EIGHT_CALL_POLICY_V1 as RATES,
 SEYEON_C06_EIGHT_CALL_PER_DISPATCH_RESERVE_MICRO_USD_V1 as RESERVE}
 from './seyeon-cost-c06-eight-call-budget-v1.mjs';
import {readFileSync} from 'node:fs';

const historical=JSON.parse(readFileSync(new URL(
 '../test/fixtures/seyeon-c07-real-six-call-run-38859692050-sanitized-v1.json',
 import.meta.url),'utf8'));
if(historical?.source?.runId!==38859692050||
   historical?.source?.model!==RATES.model||
   historical?.historical?.attemptedCalls!==5||
   historical?.results?.length!==6||
   historical?.budget?.cumulativeEstimatedCostMicroUsd!==3770||
   historical?.budget?.actualBilledKrw!==null||
   historical?.budget?.invoiceReconciled!==false||
   historical?.budget?.providerHardLimitVerified!==false)
 throw Error('C08-T historic 11-call evidence changed: re-review required');

const ids=Object.freeze(['A01','H01','C02_mixed-admin-private_01']);
const byId=new Map(GOLD.map(g=>[g.id,g]));
if(GOLD.length!==36||VARIANTS.join(',')!=='original,compact'||
   ids.some(id=>!byId.has(id)||!byId.get(id).hasExplicitClaim)||
   ids.some(id=>historical.results.some(row=>row.caseId===id))||
   RESERVE!==3277)
 throw Error('C08-T immutable high-risk first-batch Gold / budget changed');

const slots=Object.freeze(ids.flatMap(caseId=>VARIANTS.map(variant=>
 Object.freeze({caseId,variant}))));
const uint=x=>Number.isSafeInteger(x)&&x>=0;
const quoteCost=(input,output)=>Number((BigInt(input)*
 BigInt(RATES.maxInputRateMicroUsdPerMillion)+BigInt(output)*
 BigInt(RATES.outputRateMicroUsdPerMillion)+999999n)/1000000n);
export const SEYEON_C08T_FIRST_PAID_PILOT_POLICY_V1=Object.freeze({
 schemaVersion:'seyeon-c08t-owner-5000krw-paid-pilot-v1',
 kind:'OWNER_BUDGET_APPROVED_PAID_DISPATCH_HOLD',
 model:RATES.model,purpose:RATES.purpose,
 caseIds:ids,variants:VARIANTS,
 maxFirstBatchCalls:slots.length,priorPaidCalls:11,
 priorUsageEstimateMicroUsd:3770,priorInvoiceReconciled:false,
 priorActualBilledKrw:null,
 additionalBudgetKrw:5000,
 conservativeFxKrwPerUsd:2500,
 maxOutputTokens:RATES.providerOutputTokenCap,
 maxInputTokens:RATES.conservativeInputTokenUpper,
 maxBodyBytes:RATES.maxRequestBodyBytes,
 perCallReservedMicroUsd:RESERVE,
 firstBatchReservedMicroUsd:RESERVE*slots.length,
 firstBatchReservedKrw:RESERVE*slots.length*2500/1000000,
 providerHardLimitVerified:false,
 // This can be changed ONLY in a separately reviewed, independently attested
 // paid-execution workflow. A boolean supplied by a caller cannot unlock it.
 paidDispatchEnabled:false,
 productionPromotionPermitted:false,
});

const P=SEYEON_C08T_FIRST_PAID_PILOT_POLICY_V1;
if(P.maxFirstBatchCalls!==6||P.firstBatchReservedKrw>50||
   P.firstBatchReservedKrw>P.additionalBudgetKrw)
 throw Error('C08-T conservative paid batch exceeds Owner allowance');

/**
 * Advisory, does not grant dispatch. Reconciled invoice, isolated project,
 * actual hard-enforce toggle, current month spend and matching credential
 * MUST be independently witnessed. Truthy strings are not accepted.
 */
export function assessSeyeonC08TExecutionPrerequisitesV1(input={}){
 const blockers=[];
 if(input.invoiceReconciled!==true||!uint(input.priorActualBilledKrw))
  blockers.push('PRIOR_INVOICE_UNRECONCILED');
 if(input.dedicatedProjectCredentialVerified!==true)
  blockers.push('EVAL_PROJECT_CREDENTIAL_UNVERIFIED');
 if(input.hardSpendLimitEnforced!==true)
  blockers.push('PROVIDER_HARD_LIMIT_UNVERIFIED');
 if(input.existingMonthlySpendChecked!==true)
  blockers.push('MONTH_TO_DATE_SPEND_UNVERIFIED');
 if(input.ownerAdditionalBudgetKrw!==P.additionalBudgetKrw)
  blockers.push('OWNER_BUDGET_SCOPE_MISMATCH');
 // Even a self-attested object cannot authorize a paid execution.
 blockers.push('PAID_WORKFLOW_REVIEW_AND_ENFORCEMENT_REQUIRED');
 return Object.freeze({
  scope:'OFFLINE_READINESS_ONLY',
  blockers:Object.freeze(blockers),
  readiness:blockers.length===1?'EVIDENCE_NOT_INDEPENDENTLY_VERIFIED':'HOLD',
  paidDispatchEnabled:false,
  remainingAdditionalBudgetKrw:P.additionalBudgetKrw,
 });
}

/** Simulation only: unverified, unknown or failed outcomes permanently HOLD. */
export function createSeyeonC08TOfflineQuotaSimulationV1(){
 const attempted=[],outcomes=new Map();
 let estimated=0,halted=false;
 return Object.freeze({
  reserve(request){
   const next=slots[attempted.length];
   if(halted||!next||!request||request.caseId!==next.caseId||
      request.variant!==next.variant||
      request.model!==P.model||request.purpose!==P.purpose||
      typeof request.callId!=='string'||!/^[-a-f0-9]{36}$/iu.test(request.callId)||
      attempted.some(x=>x.callId===request.callId)||
      !uint(request.bodyBytes)||request.bodyBytes<1||
      request.bodyBytes>P.maxBodyBytes||
      (attempted.length+1)*P.perCallReservedMicroUsd*
      P.conservativeFxKrwPerUsd/1000000>P.additionalBudgetKrw)
    throw Error('C08-T simulated pre-dispatch HOLD');
   const r=Object.freeze({...next,callId:request.callId,
    reservedMicroUsd:P.perCallReservedMicroUsd});
   attempted.push(r);
   return r;
  },
  observe(e){
   if(halted||!e||!attempted.some(x=>x.callId===e.callId)||
      outcomes.has(e.callId))throw Error('C08-T simulated outcome HOLD');
   const valid=e.outcome==='response_received'&&
    uint(e.inputTokens)&&e.inputTokens<=P.maxInputTokens&&
    uint(e.outputTokens)&&e.outputTokens<=P.maxOutputTokens;
   const cost=valid?quoteCost(e.inputTokens,e.outputTokens):null;
   const safe=cost!==null&&cost<=P.perCallReservedMicroUsd;
   const o=Object.freeze({
    callId:e.callId,observation:safe?'BOUNDED_ESTIMATE':'UNKNOWN_OUTCOME_HOLD',
    estimatedMicroUsd:safe?cost:null,
   });
   outcomes.set(e.callId,o);
   if(safe)estimated+=cost;
   else halted=true;
   return o;
  },
  snapshot(){
   const pending=attempted.length-outcomes.size;
   return Object.freeze({
    attempted:attempted.length,observed:outcomes.size,
    unknownOrInFlight:pending+[...outcomes.values()].filter(
     x=>x.observation!=='BOUNDED_ESTIMATE').length,
    firstBatchReservedMicroUsd:attempted.length*P.perCallReservedMicroUsd,
    reservedKrw:attempted.length*P.perCallReservedMicroUsd*
      P.conservativeFxKrwPerUsd/1000000,
    estimatedMicroUsd:!halted&&pending===0?estimated:null,
    admissionStatus:'OFFLINE_SIMULATION_ONLY',
    paidDispatchEnabled:false,
  });
  },
 });
}
