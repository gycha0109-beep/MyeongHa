/**
 * C08 roadmap 7.3 #4: FREE recorded N06 latency-envelope replay.
 *
 * This is arithmetic over one historical GLM observation, NOT a new timing,
 * p50/p95, E2E guarantee, latency bound, model authorization or routing.
 * Provider/DB/network access: none. Production code must never import this.
 */
export const SEYEON_C08_N06_RECORDED_LATENCY_V1=Object.freeze({
  unifiedPreflightMs:4417,
  interpretationAndDraftMs:9282,
  independentSemanticReviewMs:8697,
  recordedThreeCallPathMs:23893,
});
export const SEYEON_C08_TARGET_FINAL_MS_V1=5000;
export const SEYEON_C08_LATENCY_CANDIDATES_V1=Object.freeze([
  'preserved_three_call',
  'hypothetical_skip_unified_preflight',
]);
const positiveMs=x=>Number.isSafeInteger(x)&&x>0;

/**
 * Omission subtracts only the recorded unified-preflight duration, retaining
 * every other stage and the unaccounted remainder of recorded path elapsed time. It does NOT
 * assert the other durations would remain constant in an actual 2-call run.
 */
export function replaySeyeonC08RecordedLatencyEnvelopeOfflineV1({
  candidate,
  timings=SEYEON_C08_N06_RECORDED_LATENCY_V1,
}={}){
  if(!SEYEON_C08_LATENCY_CANDIDATES_V1.includes(candidate)||
     !timings||typeof timings!=='object'||
     !positiveMs(timings.unifiedPreflightMs)||
     !positiveMs(timings.interpretationAndDraftMs)||
     !positiveMs(timings.independentSemanticReviewMs)||
     !positiveMs(timings.recordedThreeCallPathMs)){
    throw new TypeError('C08_LATENCY_INPUT_UNVERIFIED_HOLD');
  }
  const modelStagesMs=timings.unifiedPreflightMs+
    timings.interpretationAndDraftMs+timings.independentSemanticReviewMs;
  if(!Number.isSafeInteger(modelStagesMs)||
     timings.recordedThreeCallPathMs<modelStagesMs){
    throw new TypeError('C08_LATENCY_INCONSISTENT_EVIDENCE_HOLD');
  }
  const observedOtherOverheadMs=timings.recordedThreeCallPathMs-modelStagesMs;
  const skipUnifiedPreflight=candidate==='hypothetical_skip_unified_preflight';
  const hypotheticalPathMs=timings.recordedThreeCallPathMs-
    (skipUnifiedPreflight?timings.unifiedPreflightMs:0);
  return Object.freeze({
    version:'seyeon-c08-recorded-latency-envelope-offline-v1',
    scope:'SINGLE_HISTORICAL_N06_ARITHMETIC_REPLAY_ONLY',
    candidate,
    recordedPathMs:timings.recordedThreeCallPathMs,
    recordedStageSumMs:modelStagesMs,
    recordedUnattributedGapMs:observedOtherOverheadMs,
    preservedGenerationMs:timings.interpretationAndDraftMs,
    preservedIndependentReviewMs:timings.independentSemanticReviewMs,
    retainedReview:true,
    hypotheticalPathMs,
    targetFinalMs:SEYEON_C08_TARGET_FINAL_MS_V1,
    historicalReplayOverTargetMs:Math.max(
      0,hypotheticalPathMs-SEYEON_C08_TARGET_FINAL_MS_V1),
    hypotheticalReplayMeetsFiveSeconds:
      hypotheticalPathMs<=SEYEON_C08_TARGET_FINAL_MS_V1,
    measuredAlternativeLatency:false,
    repeatLatencyP50P95Verified:false,
    modelQualityVerified:false,
    preflightParityVerified:false,
    twoCallExecutionAuthorized:false,
    canRunNewPaidModelCalls:false,
    productionRoutingAuthorized:false,
  });
}
