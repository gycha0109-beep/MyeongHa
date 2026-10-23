import {describe,it,expect} from 'vitest';
import {
  SEYEON_C08_N06_RECORDED_LATENCY_V1 as N06,
  replaySeyeonC08RecordedLatencyEnvelopeOfflineV1 as replay,
} from '../scripts/seyeon-c08-recorded-latency-envelope-offline-v1.mjs';

describe('C08 N06 5s E2E latency: FREE historical replay only',()=>{
  it('reproduces the three serial GLM stages and recorded non-model gap',()=>{
    const a=replay({candidate:'preserved_three_call'});
    expect(N06).toEqual({
      unifiedPreflightMs:4417,
      interpretationAndDraftMs:9282,
      independentSemanticReviewMs:8697,
      recordedThreeCallPathMs:23893,
    });
    expect(a.recordedStageSumMs).toBe(22396);
    expect(a.recordedUnattributedGapMs).toBe(1497);
    expect(a.hypotheticalPathMs).toBe(23893);
    expect(a.historicalReplayOverTargetMs).toBe(18893);
    expect(a.hypotheticalReplayMeetsFiveSeconds).toBe(false);
  });

  it('subtracting unified preflight alone still cannot replay a 5s guarded turn',()=>{
    const a=replay({candidate:'hypothetical_skip_unified_preflight'});
    expect(a.preservedGenerationMs).toBe(9282);
    expect(a.preservedIndependentReviewMs).toBe(8697);
    expect(a.retainedReview).toBe(true);
    expect(a.hypotheticalPathMs).toBe(19476);
    expect(a.historicalReplayOverTargetMs).toBe(14476);
    expect(a.hypotheticalReplayMeetsFiveSeconds).toBe(false);
    expect(a.measuredAlternativeLatency).toBe(false);
    expect(a.repeatLatencyP50P95Verified).toBe(false);
    expect(a.preflightParityVerified).toBe(false);
    expect(a.twoCallExecutionAuthorized).toBe(false);
    expect(a.productionRoutingAuthorized).toBe(false);
  });

  it('a numerically fast hypothetical remains NOT a measured or authorized path',()=>{
    const a=replay({candidate:'hypothetical_skip_unified_preflight',timings:{
      unifiedPreflightMs:50,
      interpretationAndDraftMs:1000,
      independentSemanticReviewMs:1000,
      recordedThreeCallPathMs:2500,
    }});
    expect(a.hypotheticalReplayMeetsFiveSeconds).toBe(true);
    expect(a.measuredAlternativeLatency).toBe(false);
    expect(a.modelQualityVerified).toBe(false);
    expect(a.twoCallExecutionAuthorized).toBe(false);
    expect(a.canRunNewPaidModelCalls).toBe(false);
  });

  it.each([
    {candidate:'one_call'},
    {candidate:'hypothetical_skip_semantic_review'},
    {candidate:'hypothetical_skip_unified_preflight',timings:{}},
    {candidate:'preserved_three_call',timings:{...N06,independentSemanticReviewMs:-1}},
    {candidate:'preserved_three_call',timings:{...N06,interpretationAndDraftMs:NaN}},
    {candidate:'preserved_three_call',timings:{...N06,recordedThreeCallPathMs:1}},
  ])('rejects invalid topology or inconsistent latency evidence: %j',input=>{
    expect(()=>replay(input)).toThrow(/C08_LATENCY_.*_HOLD/);
  });
});
