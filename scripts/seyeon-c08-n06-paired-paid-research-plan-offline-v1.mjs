/**
 * C08 §7.3 #5: precisely scoped N06 paired paid-research PLAN (offline).
 * Does not send model requests, create spend authorizations, or override
 * historical per-call billing/invoice HOLD. All route and privacy flags fail
 * closed until independently verified live evidence exists.
 */
import {
  SEYEON_C08R3_STAGES_V1 as STAGES,
  SEYEON_C08R3_TURN_MAX_MICRO_USD_V1 as PER_TURN,
  SEYEON_C08R3_FX_MAX_V1 as FX,
  quoteSeyeonThreeCallTenKrwShadowV1 as quote,
} from './seyeon-c08r3-10krw-reserve-scenario-v1.mjs';
export const SEYEON_C08_N06_EXACT_TEXT_V1='오늘은 네가 먼저 이야기해 줘.';
export const SEYEON_C08_N06_PAIR_PROFILES_V1=Object.freeze([
  'baseline','compact_v1',
]);
export const SEYEON_C08_N06_PAIRED_MAX_CALLS_V1=6;
export const SEYEON_C08_N06_PAIRED_MAX_RESERVE_MICRO_USD_V1=8000;
const record=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const positiveInt=x=>Number.isSafeInteger(x)&&x>=1;
const positiveMoney=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
function stageRows(bytes,caps){
  if(!Array.isArray(bytes)||bytes.length!==3||
     !bytes.every(x=>positiveInt(x)&&x<=19200)||
     !Array.isArray(caps)||caps.length!==3||
     !caps.every(x=>positiveInt(x)&&x<=1536))
    throw new TypeError('C08_N06_PAIR_STAGE_BOUNDS_HOLD');
  return STAGES.map((name,i)=>Object.freeze({
    name,requestBodyBytes:bytes[i],maxCompletionTokens:caps[i],
  }));
}
/**
 * Uses a sanitized one-shot metadata report; it is NOT a proof of request-
 * level ZDR, strict JSON, provider routing, invoice reconciliation or cap.
 * Baseline and compact byte counts must be independently captured from the
 * actual serialized adapter requests before the experiment is proposed.
 */
export function planSeyeonC08N06PairedOfflineV1({
  text,
  model,
  providerTag,
  readback,
  baselineRequestBytes,
  compactRequestBytes,
  stageCompletionCaps=[1536,1536,1536],
}={}){
  if(text!==SEYEON_C08_N06_EXACT_TEXT_V1||
     !record(readback)||readback.schema!=='seyeon-c08-provider-metadata-once-v1'||
     readback.completeMetadataRead!==true||
     readback.metadataGetCount!==4||readback.inferencePostCount!==0||
     !/^[a-f0-9]{40}$/u.test(readback.commitSha??'')||
     !Array.isArray(readback.models)||readback.models.length!==3||
     !Array.isArray(readback.modelStatuses)||
     readback.modelStatuses.length!==3||
     typeof model!=='string'||!model||
     typeof providerTag!=='string'||!providerTag||
     !/^[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_-]*)?$/u.test(providerTag)||
     readback.models.filter(m=>m?.model===model).length!==1||
     readback.modelStatuses.filter(m=>m?.model===model&&m?.status===200).length!==1)
    throw new TypeError('C08_N06_PAIR_NO_VERIFIED_METADATA_HOLD');
  const matched=readback.models.find(m=>m.model===model);
  const providers=matched.providers;
  if(!Array.isArray(providers)||
     providers.filter(p=>p?.providerTag===providerTag).length!==1)
    throw new TypeError('C08_N06_PAIR_PROVIDER_UNPINNED_HOLD');
  const provider=providers.find(p=>p.providerTag===providerTag);
  if(!record(provider)||!positiveMoney(provider.inputUsdPerMillion)||
     !positiveMoney(provider.outputUsdPerMillion)||
     provider.paidInferenceAuthorized!==false||
     provider.productionRouteAuthorized!==false||
     provider.disposition!=='METADATA_MATH_ONLY_HOLD')
    throw new TypeError('C08_N06_PAIR_PROVIDER_HOLD');
  const rates=Object.freeze({
    inputUsdPerMillion:provider.inputUsdPerMillion,
    outputUsdPerMillion:provider.outputUsdPerMillion,
  });
  const arms=Object.freeze([
    {profile:'baseline',bytes:baselineRequestBytes},
    {profile:'compact_v1',bytes:compactRequestBytes},
  ].map(a=>{
    const stages=stageRows(a.bytes,stageCompletionCaps);
    const budget=quote({stages,rates,extraPaidCalls:0,perRequestFeeMicroUsd:0});
    return Object.freeze({
      profile:a.profile,
      stages:Object.freeze(stages),
      maximumPaidCalls:stages.length,
      reservedMicroUsd:budget.reservedMicroUsd,
      reservedKrw:budget.reserveUpperKrw,
      belowTenKrwUnderMetadataScenario:budget.targetMetUnderStressAssumptions,
      providerInvoiceReconciled:false,
      hardBillCapVerified:false,
    });
  }));
  const plannedCalls=arms.reduce((n,a)=>n+a.maximumPaidCalls,0);
  const totalReserve=arms.reduce((n,a)=>n+a.reservedMicroUsd,0);
  if(plannedCalls!==SEYEON_C08_N06_PAIRED_MAX_CALLS_V1||
     !Number.isSafeInteger(totalReserve))
    throw new TypeError('C08_N06_PAIR_TOPOLOGY_HOLD');
  return Object.freeze({
    version:'seyeon-c08-n06-paired-paid-research-plan-offline-v1',
    scope:'PUBLIC_SYNTHETIC_N06_OFFLINE_PLAN_NOT_PAID_ADMISSION',
    model,providerTag,
    profiles:SEYEON_C08_N06_PAIR_PROFILES_V1,
    arms,plannedCalls,maxPossibleCalls:6,
    totalReservedMicroUsd:totalReserve,
    totalReservedKrw:totalReserve*FX/1e6,
    tenKrwPerTurnUnderMetadataScenario:arms.every(a=>a.reservedMicroUsd<=PER_TURN),
    twentyKrwTwoTurnEnvelopeUnderMetadataScenario:
      totalReserve<=SEYEON_C08_N06_PAIRED_MAX_RESERVE_MICRO_USD_V1,
    zeroFallbackCalls:true,
    zeroRetries:true,
    keepIndependentSemanticReview:true,
    authoritativeCensusReadsPerArm:4,
    historicalBilledCostReconciled:false,
    strictJsonSchemaRuntimeVerified:false,
    actualEndpointZdrEnforced:false,
    accountRouteAndCreditsVerified:false,
    providerHardTurnBillCapVerified:false,
    unseenGoldRecallVerified:false,
    latencyP50P95Verified:false,
    humanBlindPersonaReviewVerified:false,
    paidDispatchAuthorized:false,
    productionPromotionAuthorized:false,
  });
}
