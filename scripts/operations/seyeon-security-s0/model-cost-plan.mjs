// Watchtower-Track: security
// Deterministic, inactive S0 ledger policy. Actual caps are operator supplied.
export const SEYEON_S0_COST_POLICY_DRAFT_V1=Object.freeze({
  providerKey:'openai-responses',modelKey:'gpt-5.6-terra',
  policyVersion:'seyeon-s0-receipt-production-20261025',
  priceVersion:'openai-terra-20261025-no-cache',
  allowedPurposes:Object.freeze([
    'integrity_classification','disclosure_classification',
    'turn_interpretation','dialogue_render','semantic_review',
  ]),
  contextWindowTokens:1050000,maximumInputTokens:48000,
  maximumOutputTokens:4096,maximumSerializedRequestBytes:524288,
  inputMicroUsdPerMillion:2000000,cachedInputMicroUsdPerMillion:200000,
  outputMicroUsdPerMillion:12000000,isActive:false,
});

export function parseSeyeonS0CostBudgetV1({utcDate,globalMicroUsd,subjectMicroUsd}){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(utcDate??'') ||
     new Date(utcDate+'T00:00:00Z').toISOString().slice(0,10)!==utcDate){
    throw Error('An exact valid UTC budget date is required.');
  }
  for(const value of [globalMicroUsd,subjectMicroUsd]){
    if(typeof value!=='string'|| !/^[1-9][0-9]{0,10}$/.test(value) ||
       !Number.isSafeInteger(Number(value))) throw Error('Invalid bounded micro-USD limit.');
  }
  if(Number(subjectMicroUsd)>Number(globalMicroUsd))
    throw Error('Subject budget exceeds global budget.');
  return Object.freeze({utcDate,globalMicroUsd,subjectMicroUsd});
}
