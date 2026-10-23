import { describe, it, expect } from 'vitest';
import { auditSeyeonStageCompletionCapsOfflineV1 } from
  '../scripts/seyeon-c08-stage-cap-feasibility-offline-v1.mjs';

describe('C08 staged completion budget: FREE N06 stress audit', () => {
  it('retains the R3 all-1536 quote as a regression baseline', () => {
    const a = auditSeyeonStageCompletionCapsOfflineV1({caps:[1536,1536,1536]});
    expect(a.quote.reservedMicroUsd).toBe(6675);
    expect(a.inputOnlyTheoreticalMicroUsd).toBe(4832);
    expect(a.inputAlreadyExceedsTarget).toBe(true);
    expect(a.quote.targetMetUnderStressAssumptions).toBe(false);
    expect(a.permittedToDispatch).toBe(false);
  });

  it.each([
    [[256,768,256], 5344],
    [[128,512,128], 5138],
    [[1,1,1], 4833],
  ])('staggered caps %j cannot close 10 KRW with worst-case input rate', (caps,total) => {
    const a = auditSeyeonStageCompletionCapsOfflineV1({caps});
    expect(a.quote.stages.map(s=>s.maxCompletionTokens)).toEqual(caps);
    expect(a.quote.reservedMicroUsd).toBe(total);
    expect(a.quote.targetMetUnderStressAssumptions).toBe(false);
    expect(a.inputAlreadyExceedsTarget).toBe(true);
    expect(a.strictJsonAtTheseCapsVerified).toBe(false);
    expect(a.permittedToPromote).toBe(false);
  });

  it('lower illustrative rates may fit mathematically but cannot authorize dispatch', () => {
    const a = auditSeyeonStageCompletionCapsOfflineV1({
      caps:[256,768,256],
      rates:{inputUsdPerMillion:0.02,outputUsdPerMillion:0.25},
    });
    expect(a.inputAlreadyExceedsTarget).toBe(false);
    expect(a.quote.targetMetUnderStressAssumptions).toBe(true);
    expect(a.exactProviderRateVerified).toBe(false);
    expect(a.perRequestFeeVerified).toBe(false);
    expect(a.actualTokenizerBoundVerified).toBe(false);
    expect(a.strictJsonAtTheseCapsVerified).toBe(false);
    expect(a.independentSemanticQualityVerified).toBe(false);
    expect(a.providerHardCapVerified).toBe(false);
    expect(a.permittedToDispatch).toBe(false);
  });

  it('rejects absent/unknown caps, invalid stage bounds and unsupported prices', () => {
    for(const caps of [undefined, [], [128,512], [128,512,128,1],
      [0,512,128], [128,1537,128], [128,NaN,128],
      [128,Infinity,128], [128,128.1,128], ['128',512,128]]) {
      expect(()=>auditSeyeonStageCompletionCapsOfflineV1({caps}))
        .toThrow('C08_STAGE_CAP_UNVERIFIED_HOLD');
    }
    expect(()=>auditSeyeonStageCompletionCapsOfflineV1({
      caps:[128,512,128],rates:{inputUsdPerMillion:0.16,outputUsdPerMillion:0.1},
    })).toThrow('C08R3_UNVERIFIED_RATE_OR_TOPOLOGY_HOLD');
    expect(()=>auditSeyeonStageCompletionCapsOfflineV1({
      caps:[128,512,128],rates:{inputUsdPerMillion:0.02},
    })).toThrow('C08R3_UNVERIFIED_RATE_OR_TOPOLOGY_HOLD');
  });
});
