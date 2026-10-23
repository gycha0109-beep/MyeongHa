/**
 * C08 roadmap 7.3 #6: FREE alternative-model, listed-rate snapshot filter.
 * Snapshot only. Model-level advertised prices do NOT pin an eligible ZDR
 * provider, strict JSON support, invoice cap, quality, or guarded latency.
 * Do not use for dispatch, production routing, or paid admission.
 */
import {
  SEYEON_C08R3_STAGES_V1,
  SEYEON_C08R3_MAX_RATES_V1,
  quoteSeyeonThreeCallTenKrwShadowV1,
} from './seyeon-c08r3-10krw-reserve-scenario-v1.mjs';

export const SEYEON_C08_ALT_PRICE_SNAPSHOT_DATE_V1='2026-10-23';
export const SEYEON_C08_ALT_N06_GLM_REQUEST_BYTES_V1=Object.freeze([5425,14041,12737]);
export const SEYEON_C08_ALT_MODEL_SNAPSHOT_V1=Object.freeze([
  Object.freeze({
    model:'openai/gpt-oss-120b',
    listedInputUsdPerMillion:0.03,listedOutputUsdPerMillion:0.17,
    source:'https://openrouter.ai/openai/gpt-oss-120b/',
  }),
  Object.freeze({
    model:'qwen/qwen3.5-flash-02-23',
    listedInputUsdPerMillion:0.065,listedOutputUsdPerMillion:0.26,
    source:'https://openrouter.ai/qwen/qwen3.5-flash-20260224/api',
  }),
  Object.freeze({
    model:'google/gemini-3.1-flash-lite',
    listedInputUsdPerMillion:0.25,listedOutputUsdPerMillion:1.50,
    source:'https://openrouter.ai/google/gemini-3.1-flash-lite/api',
  }),
]);
const validRate=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
export function screenSeyeonC08AlternativePriceSnapshotOfflineV1({
  models=SEYEON_C08_ALT_MODEL_SNAPSHOT_V1,
  completionCaps=[1536,1536,1536],
}={}){
  if(!Array.isArray(models)||models.length===0||
    !Array.isArray(completionCaps)||completionCaps.length!==3||
    !completionCaps.every(n=>Number.isSafeInteger(n)&&n>=1&&n<=1536)||
    models.some(x=>!x||typeof x.model!=='string'||!x.model||
      !validRate(x.listedInputUsdPerMillion)||
      !validRate(x.listedOutputUsdPerMillion)||
      typeof x.source!=='string'||!x.source.startsWith('https://'))||
    new Set(models.map(x=>x.model)).size!==models.length){
    throw new TypeError('C08_ALT_MODEL_UNVERIFIED_SNAPSHOT_HOLD');
  }
  return Object.freeze(models.map(m=>{
    const insideLegacyCeiling=m.listedInputUsdPerMillion<=
       SEYEON_C08R3_MAX_RATES_V1.inputUsdPerMillion&&
      m.listedOutputUsdPerMillion<=
       SEYEON_C08R3_MAX_RATES_V1.outputUsdPerMillion;
    const quote=insideLegacyCeiling?
      quoteSeyeonThreeCallTenKrwShadowV1({
        stages:SEYEON_C08R3_STAGES_V1.map((name,i)=>({
          name,requestBodyBytes:SEYEON_C08_ALT_N06_GLM_REQUEST_BYTES_V1[i],
          maxCompletionTokens:completionCaps[i],
        })),
        rates:{inputUsdPerMillion:m.listedInputUsdPerMillion,
          outputUsdPerMillion:m.listedOutputUsdPerMillion},
      }):null;
    return Object.freeze({
      model:m.model,source:m.source,
      quotedListedRateOnlyMicroUsd:quote?.reservedMicroUsd??null,
      quotedListedRateOnlyKrw:quote?.reserveUpperKrw??null,
      modelListedRateScenarioFitsTenKrw:quote?.targetMetUnderStressAssumptions??false,
      disposition:insideLegacyCeiling?'MATH_ONLY_HOLD':'OUTSIDE_LEGACY_RATE_CEILINGS_HOLD',
      requestBytesSpecificToOtherModelVerified:false,
      providerEndpointPinned:false,
      providerZdrVerified:false,
      strictJsonSchemaVerified:false,
      hardPerTurnInvoiceCapVerified:false,
      measuredGuardedLatencyVerified:false,
      safetyAndPersonaParityVerified:false,
      alternativeModelAuthorized:false,
      productionRoutingAuthorized:false,
      paidTestAuthorized:false,
    });
  }));
}
