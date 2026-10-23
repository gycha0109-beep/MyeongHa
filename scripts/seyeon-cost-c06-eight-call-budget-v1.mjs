/**
 * Reviewed-scope COST-06 screening quota. No provider, credential, network or
 * production authority. Dollars are prospective STANDARD Luna rate estimates,
 * not reconciled OpenAI invoices or an external project spending limit.
 */
export const SEYEON_C06_EIGHT_CALL_POLICY_V1=Object.freeze({
  schemaVersion:'seyeon-c06-eight-call-budget-v1',
  model:'gpt-5.6-luna',
  purpose:'unified_preflight_shadow',
  caseIds:Object.freeze(['N14','F01','C02_mixed-admin-private_01',
    'C02_mixed-romance-forgery_01']),
  variants:Object.freeze(['original','compact']),
  callCap:8,
  maxRequestBodyBytes:6144,
  conservativeInputTokenUpper:8192,
  providerOutputTokenCap:1024,
  approvedProposedBudgetMicroUsd:30000,
  // Standard 2026-10-15 OpenAI Luna, per 1M tokens, in microUSD.
  maxInputRateMicroUsdPerMillion:250000, // cache write 1.25x ordinary
  outputRateMicroUsdPerMillion:1200000,
});
const P=SEYEON_C06_EIGHT_CALL_POLICY_V1;
const PER_CALL=Number((BigInt(P.conservativeInputTokenUpper)*
  BigInt(P.maxInputRateMicroUsdPerMillion)+
  BigInt(P.providerOutputTokenCap)*BigInt(P.outputRateMicroUsdPerMillion)+
  999999n)/1000000n);
export const SEYEON_C06_EIGHT_CALL_PER_DISPATCH_RESERVE_MICRO_USD_V1=PER_CALL;
export const SEYEON_C06_EIGHT_CALL_MAX_RESERVED_MICRO_USD_V1=8*PER_CALL;
if(SEYEON_C06_EIGHT_CALL_MAX_RESERVED_MICRO_USD_V1>P.approvedProposedBudgetMicroUsd)
  throw new Error('C06 reserve exceeds proposed budget');

const PLAN=Object.freeze(P.caseIds.flatMap(caseId=>
  P.variants.map(variant=>Object.freeze({caseId,variant}))));
const validInt=x=>Number.isSafeInteger(x)&&x>=0;
const charge=(i,o)=>Number((BigInt(i)*BigInt(P.maxInputRateMicroUsdPerMillion)+
  BigInt(o)*BigInt(P.outputRateMicroUsdPerMillion)+999999n)/1000000n);
export function createSeyeonC06EightCallQuotaV1(){
  const reservations=[],observations=new Map();
  let knownTotal=0;
  return Object.freeze({
    reserve(x){
      const expected=PLAN[reservations.length];
      if(!expected)throw new Error('C06 call cap exhausted; no retries');
      if(!x||x.caseId!==expected.caseId||x.variant!==expected.variant||
          x.purpose!==P.purpose||x.modelKey!==P.model||
          typeof x.callId!=='string'||!/^[a-f0-9-]{36}$/iu.test(x.callId)||
          !validInt(x.requestBodyBytes)||x.requestBodyBytes<1||
          x.requestBodyBytes>P.maxRequestBodyBytes||
          reservations.some(z=>z.callId===x.callId)||
          (reservations.length+1)*PER_CALL>P.approvedProposedBudgetMicroUsd)
        throw new Error('C06 bounded pre-dispatch admission rejected');
      const record=Object.freeze({
        callId:x.callId,caseId:x.caseId,variant:x.variant,
        reservedMicroUsd:PER_CALL,requestBodyBytes:x.requestBodyBytes,
      });
      reservations.push(record);
      return record;
    },
    observe(event){
      if(!event||typeof event.callId!=='string'||
         !reservations.some(z=>z.callId===event.callId)||
         observations.has(event.callId)||
         event.purpose!==P.purpose||event.modelKey!==P.model||
         typeof event.outcome!=='string')throw new Error('C06 invalid outcome');
      const success=event.outcome==='response_received';
      const input=event.inputTokens,output=event.outputTokens;
      const usageValid=success&&validInt(input)&&validInt(output)&&
        input<=P.conservativeInputTokenUpper&&
        output<=P.providerOutputTokenCap;
      const estimate=usageValid?charge(input,output):null;
      const safe=usageValid&&estimate<=PER_CALL;
      const result=Object.freeze({
        callId:event.callId,outcome:event.outcome,
        elapsedMs:validInt(event.elapsedMs)?event.elapsedMs:null,
        inputTokens:validInt(input)?input:null,
        outputTokens:validInt(output)?output:null,
        estimatedCostMicroUsd:safe?estimate:null,
        observation:safe?'USAGE_BOUNDED_ESTIMATE':'UNKNOWN_OR_OUT_OF_POLICY_HOLD',
      });
      observations.set(event.callId,result);
      if(safe)knownTotal+=estimate;
      return result;
    },
    snapshot(){
      const attempted=reservations.length,observed=observations.size;
      const uncertain=[...observations.values()].filter(z=>
        z.observation!=='USAGE_BOUNDED_ESTIMATE').length;
      return Object.freeze({
        schemaVersion:P.schemaVersion,mode:'PAID_EVALUATION_REVIEW_SCOPE',
        attemptedCalls:attempted,observedOutcomes:observed,callCap:P.callCap,
        reservedMicroUsd:attempted*PER_CALL,
        conservativeTotalCeilingMicroUsd:SEYEON_C06_EIGHT_CALL_MAX_RESERVED_MICRO_USD_V1,
        assumedModelRateVersion:'openai-standard-2026-10-15-manual-review',
        knownCostEstimateMicroUsd:knownTotal,
        totalCostEstimateMicroUsd:observed===attempted&&uncertain===0?knownTotal:null,
        unknownOrOutOfPolicyOutcomes:uncertain+(attempted-observed),
        providerInvoiceReconciled:false,
        productionPromotionPermitted:false,
      });
    },
  });
}
