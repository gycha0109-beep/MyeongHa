/**
 * COST-06 F01 v2 single two-request pilot. All costs ESTIMATES.
 * Not a remote OpenAI provider hard spending cap.
 */
import {readFileSync} from 'node:fs';
import {SEYEON_C06_EIGHT_CALL_POLICY_V1 as MODEL,
 SEYEON_C06_EIGHT_CALL_PER_DISPATCH_RESERVE_MICRO_USD_V1 as PER}
 from './seyeon-cost-c06-eight-call-budget-v1.mjs';
export const F01_V2_POLICY=Object.freeze({
  model:MODEL.model,purpose:MODEL.purpose,
  variants:Object.freeze(['original','compact']),maxCalls:2,
  previousRunId:38845185681,previousCalls:3,
  previousReserveMicroUsd:3*PER,newReservePerCallMicroUsd:PER,
  maxRequestBytes:MODEL.maxRequestBodyBytes,
  maxOutputTokens:MODEL.providerOutputTokenCap,
  budgetKrw:100,stressUsdKrw:2500,
});
const P=F01_V2_POLICY;
const previous=JSON.parse(readFileSync(new URL(
 '../test/fixtures/seyeon-c06-run-38845185681-sanitized-v1.json',
 import.meta.url),'utf8'));
const pinned=[
 ['N14','original',810,130,359],
 ['N14','compact',673,34,210],
 ['F01','original',806,221,467],
];
if(previous.sourceRunId!==P.previousRunId||
 previous.sourceArtifactId!==12023195606||
 previous.sourceSha!=='705857cc42e2b6e0d3bd9d5ecf7e975ed9122e28'||
 previous.actualBilledUsd!==null||
 previous.providerInvoiceReconciled!==false||
 !Array.isArray(previous.attempts)||previous.attempts.length!==3||
 pinned.some((p,i)=>{const x=previous.attempts[i];return !x||
  x.caseId!==p[0]||x.variant!==p[1]||x.inputTokens!==p[2]||
  x.outputTokens!==p[3]||x.estimatedCostMicroUsd!==p[4];}))
 throw Error('C06 original 3-call paid evidence changed or not pinned');
export const F01_V2_HISTORY_ESTIMATE_MICRO_USD=1036;
export const F01_V2_CUMULATIVE_RESERVED_MICRO_USD=
 P.previousReserveMicroUsd+P.maxCalls*PER;
export const F01_V2_CUMULATIVE_STRESS_KRW=
 F01_V2_CUMULATIVE_RESERVED_MICRO_USD*P.stressUsdKrw/1000000;
if(F01_V2_CUMULATIVE_STRESS_KRW>P.budgetKrw)
 throw Error('C06 owner total 100 KRW reserve exceeded');
const uint=x=>Number.isSafeInteger(x)&&x>=0;
export function createF01V2Quota(){
 const calls=[],outcomes=new Map();let freshEstimate=0;
 return Object.freeze({
 reserve(x){
  const variant=P.variants[calls.length];
  if(!variant)throw Error('C06 F01 V2 lifetime two-call quota exhausted');
  if(!x||x.caseId!=='F01'||x.variant!==variant||
   x.purpose!==P.purpose||x.modelKey!==P.model||
   typeof x.callId!=='string'||!/^[a-f0-9-]{36}$/iu.test(x.callId)||
   calls.some(c=>c.callId===x.callId)||!uint(x.requestBodyBytes)||
   !x.requestBodyBytes||x.requestBodyBytes>P.maxRequestBytes||
   (P.previousReserveMicroUsd+(calls.length+1)*PER)*
    P.stressUsdKrw/1000000>P.budgetKrw)
   throw Error('C06 F01 V2 pre-dispatch quota denied');
  const rec=Object.freeze({callId:x.callId,caseId:'F01',variant,
   reservedMicroUsd:PER,requestBodyBytes:x.requestBodyBytes});
  calls.push(rec);return rec;
 },
 observe(event){
  if(!event||!calls.some(x=>x.callId===event.callId)||
   outcomes.has(event.callId)||event.purpose!==P.purpose||
   event.modelKey!==P.model||typeof event.outcome!=='string')
   throw Error('C06 F01 V2 unknown or duplicate outcome');
  const ok=event.outcome==='response_received'&&
   uint(event.inputTokens)&&uint(event.outputTokens)&&
   event.inputTokens<=MODEL.conservativeInputTokenUpper&&
   event.outputTokens<=P.maxOutputTokens;
  const cost=ok?Number((BigInt(event.inputTokens)*
   BigInt(MODEL.maxInputRateMicroUsdPerMillion)+
   BigInt(event.outputTokens)*BigInt(MODEL.outputRateMicroUsdPerMillion)+
   999999n)/1000000n):null;
  const safe=ok&&cost<=PER;
  const out=Object.freeze({callId:event.callId,
   estimatedCostMicroUsd:safe?cost:null,
   inputTokens:uint(event.inputTokens)?event.inputTokens:null,
   outputTokens:uint(event.outputTokens)?event.outputTokens:null,
   observation:safe?'USAGE_BOUNDED_ESTIMATE':'UNKNOWN_USAGE_HOLD'});
  outcomes.set(event.callId,out);
  if(safe)freshEstimate+=cost;
  return out;
 },
 snapshot(){
  const attempted=calls.length,observed=outcomes.size;
  const unknown=attempted-observed+[...outcomes.values()].filter(
   x=>x.observation!=='USAGE_BOUNDED_ESTIMATE').length;
  return Object.freeze({
   priorRunId:P.previousRunId,priorPaidCalls:3,
   priorObservedEstimateMicroUsd:F01_V2_HISTORY_ESTIMATE_MICRO_USD,
   priorConservativeReserveMicroUsd:P.previousReserveMicroUsd,
   newAttemptedCalls:attempted,newObservedCalls:observed,
   newConservativeReserveMicroUsd:attempted*PER,
   conservativeStressTotalKrw:(P.previousReserveMicroUsd+
    attempted*PER)*P.stressUsdKrw/1000000,
   expectedAllCalls:5,maximumNewCalls:P.maxCalls,
   totalProvisionalEstimateMicroUsd:unknown===0?
    F01_V2_HISTORY_ESTIMATE_MICRO_USD+freshEstimate:null,
   unknownOutcomes:unknown,ownerBudgetKrw:P.budgetKrw,
   providerInvoiceReconciled:false,actualBilledKrw:null,
   productionPromotionPermitted:false,
  });
 },
 });
}
