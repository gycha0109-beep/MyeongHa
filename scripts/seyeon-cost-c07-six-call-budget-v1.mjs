/**
 * C07 experimental Luna F02/R01/H02 6-request manual screen quota.
 * This is NOT Production admission and NOT provider hard billing enforcement.
 *
 * Carries prior five paid calls at their conservative reservations rather
 * than crediting unconfirmed actual billing back into the user budget.
 */
import {
 SEYEON_C07_PILOT_PROPOSAL_V1 as PLAN,
} from './seyeon-cost-c07-three-case-pilot-proposal-v1.mjs';
import {
 SEYEON_C06_EIGHT_CALL_POLICY_V1 as MODEL,
} from './seyeon-cost-c06-eight-call-budget-v1.mjs';

const SLOTS=Object.freeze(PLAN.pilotIds.flatMap(caseId=>
 PLAN.variants.map(variant=>Object.freeze({caseId,variant}))));
const uint=x=>Number.isSafeInteger(x)&&x>=0;
const perCall=PLAN.perCallConservativeReserveMicroUsd;
export const SEYEON_C07_SIX_CALL_RUNTIME_POLICY_V1=Object.freeze({
 model:MODEL.model,
 purpose:MODEL.purpose,
 variants:PLAN.variants,
 caseIds:PLAN.pilotIds,
 maxNewCalls:SLOTS.length,
 maxRequestBodyBytes:MODEL.maxRequestBodyBytes,
 conservativeInputTokensUpper:MODEL.conservativeInputTokenUpper,
 maxOutputTokens:MODEL.providerOutputTokenCap,
 historicPaidCalls:PLAN.priorAttemptedCalls,
 historicReserveMicroUsd:PLAN.priorConservativeReservedMicroUsd,
 historicUsageEstimateMicroUsd:PLAN.priorMeasuredEstimateMicroUsd,
 perRequestReserveMicroUsd:perCall,
 userTotalBudgetKrw:PLAN.ownerBudgetKrw,
 stressFxKrwPerUsd:PLAN.conservativeFxKrwPerUsd,
 // Every dispatch needs separate GitHub Actions one-time admission.
 directInvocationAllowed:false,
 productionPromotionPermitted:false,
});
const P=SEYEON_C07_SIX_CALL_RUNTIME_POLICY_V1;
if(P.maxNewCalls!==6||P.historicPaidCalls!==5||
  P.historicReserveMicroUsd!==16385||
  P.historicUsageEstimateMicroUsd!==1622||
  P.historicReserveMicroUsd+6*perCall!==36047||
  (P.historicReserveMicroUsd+6*perCall)*
   P.stressFxKrwPerUsd/1000000>P.userTotalBudgetKrw)
 throw Error('C07 six-call lifetime owner-budget boundary changed');

export function createSeyeonC07SixCallQuotaV1(){
 const reservations=[],observations=new Map();let newEstimatedMicroUsd=0;
 return Object.freeze({
  reserve(input){
   const target=SLOTS[reservations.length];
   if(!target)throw Error('C07 six-call cap exhausted; retries forbidden');
   if(!input||input.caseId!==target.caseId||
    input.variant!==target.variant||input.modelKey!==P.model||
    input.purpose!==P.purpose||typeof input.callId!=='string'||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(input.callId)||
    reservations.some(x=>x.callId===input.callId)||
    !uint(input.requestBodyBytes)||input.requestBodyBytes===0||
    input.requestBodyBytes>P.maxRequestBodyBytes||
    (P.historicReserveMicroUsd+(reservations.length+1)*perCall)*
     P.stressFxKrwPerUsd/1000000>P.userTotalBudgetKrw)
    throw Error('C07 six-call pre-dispatch admission denied');
   const record=Object.freeze({
    caseId:input.caseId,variant:input.variant,
    callId:input.callId,reservedMicroUsd:perCall,
    requestBodyBytes:input.requestBodyBytes,
   });
   reservations.push(record);return record;
  },
  observe(event){
   if(!event||typeof event.callId!=='string'||
    !reservations.some(x=>x.callId===event.callId)||
    observations.has(event.callId)||event.purpose!==P.purpose||
    event.modelKey!==P.model||typeof event.outcome!=='string')
    throw Error('C07 invalid/duplicate provider outcome');
   const good=event.outcome==='response_received'&&
    uint(event.inputTokens)&&uint(event.outputTokens)&&
    event.inputTokens<=P.conservativeInputTokensUpper&&
    event.outputTokens<=P.maxOutputTokens;
   const estimated=good?Number((BigInt(event.inputTokens)*
    BigInt(MODEL.maxInputRateMicroUsdPerMillion)+
    BigInt(event.outputTokens)*BigInt(MODEL.outputRateMicroUsdPerMillion)+
    999999n)/1000000n):null;
   const safe=good&&estimated<=perCall;
   const record=Object.freeze({
    callId:event.callId,outcome:event.outcome,
    inputTokens:uint(event.inputTokens)?event.inputTokens:null,
    outputTokens:uint(event.outputTokens)?event.outputTokens:null,
    estimatedCostMicroUsd:safe?estimated:null,
    observation:safe?'USAGE_BOUNDED_ESTIMATE':'UNKNOWN_OR_OUT_OF_POLICY_HOLD',
   });
   observations.set(event.callId,record);
   if(safe)newEstimatedMicroUsd+=estimated;
   return record;
  },
  snapshot(){
   const attempted=reservations.length,observed=observations.size;
   const uncertainty=attempted-observed+
    [...observations.values()].filter(
     x=>x.observation!=='USAGE_BOUNDED_ESTIMATE').length;
   const reserved=P.historicReserveMicroUsd+attempted*perCall;
   return Object.freeze({
    schemaVersion:'seyeon-c07-six-call-cumulative-budget-v1',
    previousRunIds:PLAN.sourceRuns,
    historicPaidCalls:P.historicPaidCalls,
    newAttemptedCalls:attempted,newObservedCalls:observed,
    ownerLifetimeMaxTotalCalls:P.historicPaidCalls+P.maxNewCalls,
    maxNewCalls:P.maxNewCalls,
    historicReserveMicroUsd:P.historicReserveMicroUsd,
    newReservedMicroUsd:attempted*perCall,
    cumulativeReserveMicroUsd:reserved,
    stressReservedKrw:reserved*P.stressFxKrwPerUsd/1000000,
    estimatedTotalMicroUsd:uncertainty===0?
     P.historicUsageEstimateMicroUsd+newEstimatedMicroUsd:null,
    unknownOutcomeCount:uncertainty,
    ownerBudgetKrw:P.userTotalBudgetKrw,
    actualProviderBilledKrw:null,invoiceReconciled:false,
    providerHardLimitVerified:false,productionPromotionPermitted:false,
   });
  },
 });
}
