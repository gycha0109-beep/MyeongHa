// Watchtower-Track: security
// Deterministic, inactive S0 provider-cost policy. A single explicit global
// emergency ceiling protects provider spend; consumer eligibility uses credits.
// The legacy DB subject ceiling is set equal to global: no extra per-user cap.
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
  if(subjectMicroUsd!==undefined){
    throw Error('A customer daily USD cap is not part of the credit-based policy.');
  }
  if(typeof globalMicroUsd!=='string'||!/^[1-9][0-9]{0,10}$/.test(globalMicroUsd) ||
     !Number.isSafeInteger(Number(globalMicroUsd))){
    throw Error('An explicit finite global provider-safety ceiling is required.');
  }
  // Preserve the existing DB Governor schema without a second member-specific
  // cutoff: no one Subject can exceed global spend even without this check.
  return Object.freeze({utcDate,globalMicroUsd,subjectMicroUsd:globalMicroUsd});
}
