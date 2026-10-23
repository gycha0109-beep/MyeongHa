/**
 * C08-R3 — FREE scenario calculator for a three-call public Shadow turn.
 *
 * This is NOT a production paid-call admission control or provider hard cap.
 * The request byte -> token bound is the original N06 conservative stress
 * assumption; endpoint billed input token accounting is not independently
 * verified. Never use a passing quote as actual invoice reconciliation.
 */
import {
  MAX_INPUT_USD_PER_M,
  MAX_OUTPUT_USD_PER_M,
} from './seyeon-openrouter-glm53flash-paid-preflight-v1.mjs';

export const SEYEON_C08R3_STAGES_V1=Object.freeze([
  'unified_preflight_shadow','turn_interpret_render_shadow','semantic_review',
]);
export const SEYEON_C08R3_FX_MAX_V1=2500;
export const SEYEON_C08R3_TURN_MAX_KRW_V1=10;
export const SEYEON_C08R3_TURN_MAX_MICRO_USD_V1=4000;
export const SEYEON_C08R3_REQUEST_MAX_BYTES_V1=19200;
export const SEYEON_C08R3_COMPLETION_MAX_TOKENS_V1=1536;
export const SEYEON_C08R3_MAX_RATES_V1=Object.freeze({
  inputUsdPerMillion:MAX_INPUT_USD_PER_M,
  outputUsdPerMillion:MAX_OUTPUT_USD_PER_M,
});
const safeInt=n=>Number.isSafeInteger(n)&&n>=0;
const positiveRate=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;

/**
 * Named stages, request-body byte lengths and completion caps MUST be explicit.
 * Uses existing N06 maximum price ceilings and no-cache/no-discount reserve.
 * A future provider must independently attest its actual current endpoint
 * rates, request fees, extra tokens and hard-cap semantics before dispatch.
 */
export function quoteSeyeonThreeCallTenKrwShadowV1({
  stages,rates=SEYEON_C08R3_MAX_RATES_V1,
  extraPaidCalls=0,perRequestFeeMicroUsd=0,
}={}){
  if(!Array.isArray(stages)||stages.length!==3||
     !rates||typeof rates!=='object'||
     !positiveRate(rates.inputUsdPerMillion)||
     !positiveRate(rates.outputUsdPerMillion)||
     rates.inputUsdPerMillion>MAX_INPUT_USD_PER_M||
     rates.outputUsdPerMillion>MAX_OUTPUT_USD_PER_M||
     !safeInt(extraPaidCalls)||extraPaidCalls!==0||
     !safeInt(perRequestFeeMicroUsd)||perRequestFeeMicroUsd!==0){
    throw new TypeError('C08R3_UNVERIFIED_RATE_OR_TOPOLOGY_HOLD');
  }
  const details=stages.map((stage,index)=>{
    if(!stage||stage.name!==SEYEON_C08R3_STAGES_V1[index]||
       !safeInt(stage.requestBodyBytes)||stage.requestBodyBytes===0||
       stage.requestBodyBytes>SEYEON_C08R3_REQUEST_MAX_BYTES_V1||
       !safeInt(stage.maxCompletionTokens)||stage.maxCompletionTokens===0||
       stage.maxCompletionTokens>SEYEON_C08R3_COMPLETION_MAX_TOKENS_V1){
      throw new TypeError('C08R3_INVALID_STAGE_BOUND_HOLD');
    }
    // Per-stage ceiling: conservative request-body byte proxy for input tokens.
    const microUsd=Math.ceil(
      stage.requestBodyBytes*rates.inputUsdPerMillion+
      stage.maxCompletionTokens*rates.outputUsdPerMillion,
    );
    return Object.freeze({
      stage:stage.name,requestBodyBytes:stage.requestBodyBytes,
      maxCompletionTokens:stage.maxCompletionTokens,
      reserveMicroUsd:microUsd,
    });
  });
  const reservedMicroUsd=details.reduce((sum,row)=>sum+row.reserveMicroUsd,0);
  if(!safeInt(reservedMicroUsd)){
    throw new TypeError('C08R3_INVALID_SUM_HOLD');
  }
  return Object.freeze({
    version:'seyeon-c08r3-offline-three-call-reserve-v1',
    scope:'OFFLINE_SCENARIO_ONLY_NOT_PRODUCTION_ADMISSION',
    stages:Object.freeze(details),
    rates:Object.freeze({
      inputUsdPerMillion:rates.inputUsdPerMillion,
      outputUsdPerMillion:rates.outputUsdPerMillion,
    }),
    reservedMicroUsd,
    reserveUpperKrw:reservedMicroUsd*SEYEON_C08R3_FX_MAX_V1/1_000_000,
    targetKrw:SEYEON_C08R3_TURN_MAX_KRW_V1,
    targetMetUnderStressAssumptions:
      reservedMicroUsd<=SEYEON_C08R3_TURN_MAX_MICRO_USD_V1,
    providerInvoiceReconciled:false,
    providerHardCapVerified:false,
    actualModelLatencyVerified:false,
    modelQualityVerified:false,
  });
}
