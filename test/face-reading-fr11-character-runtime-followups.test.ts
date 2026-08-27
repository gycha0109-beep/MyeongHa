import { describe, expect, it } from 'vitest';
import {
  buildResearchFaceDiagnosis,
  type FaceResearchDiagnosisInput,
} from '../packages/face-reading/src/index.js';
import {
  validateCharacterFaceSafeFollowUpCatalogV1,
  type CharacterFaceSafeFollowUpCatalogV1,
} from '../packages/character-content/src/index.js';
import {
  renderResearchFaceCharacterRuntimeTurn,
  type CharacterFaceRuntimeProjectionV1,
  type CharacterFacePresentationModeV1,
} from '../packages/domain/src/index.js';

function diagnosisInput(): FaceResearchDiagnosisInput {
  return {
    readingRef: 'reading:fr11:test',
    engineVersion: 'face-research-engine-fr11-v1',
    sourceSnapshotRef: 'source-snapshot:fr11-v1',
    assertionAuthority: 'research_fixture',
    evidenceRefs: ['fixture:fr11:v1'],
    fiveOfficers: [
      {
        officerKey: 'discernment',
        criterionStates: {
          'criterion.discernment.bridge_straight': 'met',
          'criterion.discernment.tip_round_full': 'met',
        },
      },
      {
        officerKey: 'intake',
        criterionStates: {
          'criterion.intake.square_broad': 'not_met',
          'criterion.intake.lips_substantial': 'met',
        },
      },
    ],
  };
}

function runtimeContext(
  characterId: string,
  trustBand: 'low' | 'medium' | 'high',
  options: { readonly revision?: number; readonly contentVersion?: string } = {},
): CharacterFaceRuntimeProjectionV1 {
  return {
    characterId,
    contentVersion: options.contentVersion ?? 'character-content-fr11-v1',
    relationship: {
      relationshipRevision: options.revision ?? 7,
      relationshipPolicyVersion: 'relationship-policy-fr11-v1',
      trustBand,
      behaviorVersion: 'relationship-behavior-fr11-v1',
    },
  };
}

function presentationProfile(mode: CharacterFacePresentationModeV1, characterId: string) {
  return {
    schemaVersion: 'v1' as const,
    profileVersion: `face-presentation-${mode}-fr11-v1`,
    characterId,
    characterContentVersion: 'character-content-fr11-v1',
    mode,
  };
}

function followUpCatalog(characterId: string): CharacterFaceSafeFollowUpCatalogV1 {
  return {
    schemaVersion: 'v1',
    catalogVersion: 'face-followup-fr11-v1',
    characterId,
    characterContentVersion: 'character-content-fr11-v1',
    byStrategy: {
      inspect_dominant_feature: {
        low: '가장 선명한 부분부터 조금 더 볼까요?',
        medium: '가장 강하게 잡힌 부분부터 더 들어가 볼까요?',
        high: '제일 강한 부분, 더 깊게 뜯어볼까요?',
      },
      explore_contrast_axis: {
        low: '서로 엇갈린 두 부분을 조금 더 살펴볼까요?',
        medium: '이번에 갈린 두 축을 더 이어서 볼까요?',
        high: '서로 부딪힌 두 축, 어디서 갈리는지 끝까지 볼까요?',
      },
      inspect_local_detail: {
        low: '부위 하나를 골라 조금 더 자세히 볼까요?',
        medium: '눈에 잡힌 부위부터 하나씩 더 볼까요?',
        high: '부위별로 하나씩 제대로 뜯어볼까요?',
      },
    },
  };
}

function runtimeTurn(
  mode: CharacterFacePresentationModeV1,
  characterId: string,
  trustBand: 'low' | 'medium' | 'high',
) {
  const diagnosis = buildResearchFaceDiagnosis(diagnosisInput());
  return renderResearchFaceCharacterRuntimeTurn({
    diagnosis,
    groundingVersion: 'face-grounding-fr11-v1',
    context: runtimeContext(characterId, trustBand),
    presentationProfile: presentationProfile(mode, characterId),
    followUpCatalog: followUpCatalog(characterId),
  });
}

describe('FR-11 Character Runtime Face follow-up projection', () => {
  it('changes relationship-aware follow-up text without changing protected Face semantics', () => {
    const low = runtimeTurn('strongest_first', 'character.alpha', 'low');
    const high = runtimeTurn('strongest_first', 'character.alpha', 'high');

    expect(low.followUp.text).not.toBe(high.followUp.text);
    expect(low.followUp.trustBand).toBe('low');
    expect(high.followUp.trustBand).toBe('high');
    expect(low.presentation.protectedDiagnosisDigest).toBe(high.presentation.protectedDiagnosisDigest);
    expect(low.presentation.protectedGrounding.semanticSignature).toBe(
      high.presentation.protectedGrounding.semanticSignature,
    );
    expect(low.presentation.protectedGrounding.semanticClaims).toEqual(
      high.presentation.protectedGrounding.semanticClaims,
    );
  });

  it('maps the three presentation modes to three content-approved follow-up strategies', () => {
    const strongest = runtimeTurn('strongest_first', 'character.alpha', 'medium');
    const contrast = runtimeTurn('contrast_first', 'character.beta', 'medium');
    const detail = runtimeTurn('detail_first', 'character.gamma', 'medium');

    expect(strongest.followUp.strategy).toBe('inspect_dominant_feature');
    expect(contrast.followUp.strategy).toBe('explore_contrast_axis');
    expect(detail.followUp.strategy).toBe('inspect_local_detail');
    expect(strongest.followUp.text).toBe(
      followUpCatalog('character.alpha').byStrategy.inspect_dominant_feature.medium,
    );
    expect(contrast.followUp.text).toBe(
      followUpCatalog('character.beta').byStrategy.explore_contrast_axis.medium,
    );
    expect(detail.followUp.text).toBe(
      followUpCatalog('character.gamma').byStrategy.inspect_local_detail.medium,
    );
    expect(strongest.presentation.protectedDiagnosisDigest).toBe(
      contrast.presentation.protectedDiagnosisDigest,
    );
    expect(strongest.presentation.protectedDiagnosisDigest).toBe(
      detail.presentation.protectedDiagnosisDigest,
    );
  });

  it('keeps the follow-up question outside protected Face narrative blocks', () => {
    const value = runtimeTurn('contrast_first', 'character.beta', 'high');
    const protectedTexts = new Set(
      (value.presentation.protectedGrounding.approvedNarrativeBlocks ?? []).map((block) => block.text),
    );

    expect(protectedTexts.has(value.followUp.text)).toBe(false);
    expect(value.presentation.orderedBlocks.every((block) => protectedTexts.has(block.text))).toBe(true);
  });

  it('relationship revision changes do not alter the protected diagnosis digest', () => {
    const diagnosis = buildResearchFaceDiagnosis(diagnosisInput());
    const common = {
      diagnosis,
      groundingVersion: 'face-grounding-fr11-v1',
      presentationProfile: presentationProfile('detail_first', 'character.gamma'),
      followUpCatalog: followUpCatalog('character.gamma'),
    };
    const earlier = renderResearchFaceCharacterRuntimeTurn({
      ...common,
      context: runtimeContext('character.gamma', 'medium', { revision: 3 }),
    });
    const later = renderResearchFaceCharacterRuntimeTurn({
      ...common,
      context: runtimeContext('character.gamma', 'medium', { revision: 11 }),
    });

    expect(earlier.relationshipRevision).toBe(3);
    expect(later.relationshipRevision).toBe(11);
    expect(earlier.presentation.protectedDiagnosisDigest).toBe(later.presentation.protectedDiagnosisDigest);
  });

  it('rejects follow-up catalogs that do not belong to the active character content', () => {
    const diagnosis = buildResearchFaceDiagnosis(diagnosisInput());

    expect(() =>
      renderResearchFaceCharacterRuntimeTurn({
        diagnosis,
        groundingVersion: 'face-grounding-fr11-v1',
        context: runtimeContext('character.alpha', 'medium'),
        presentationProfile: presentationProfile('strongest_first', 'character.alpha'),
        followUpCatalog: followUpCatalog('character.beta'),
      }),
    ).toThrow(/catalog characterId mismatch/u);

    expect(() =>
      renderResearchFaceCharacterRuntimeTurn({
        diagnosis,
        groundingVersion: 'face-grounding-fr11-v1',
        context: runtimeContext('character.alpha', 'medium', { contentVersion: 'character-content-other-v1' }),
        presentationProfile: presentationProfile('strongest_first', 'character.alpha'),
        followUpCatalog: followUpCatalog('character.alpha'),
      }),
    ).toThrow(/contentVersion mismatch/u);
  });

  it('rejects interpolation and declarative text in the safe follow-up catalog', () => {
    const base = followUpCatalog('character.alpha');
    const interpolated: CharacterFaceSafeFollowUpCatalogV1 = {
      ...base,
      byStrategy: {
        ...base.byStrategy,
        inspect_dominant_feature: {
          ...base.byStrategy.inspect_dominant_feature,
          low: '{claim}부터 더 볼까요?',
        },
      },
    };
    expect(() => validateCharacterFaceSafeFollowUpCatalogV1(interpolated)).toThrow(/interpolation/u);

    const declarative: CharacterFaceSafeFollowUpCatalogV1 = {
      ...base,
      byStrategy: {
        ...base.byStrategy,
        inspect_dominant_feature: {
          ...base.byStrategy.inspect_dominant_feature,
          low: '가장 강한 부분부터 더 봅니다.',
        },
      },
    };
    expect(() => validateCharacterFaceSafeFollowUpCatalogV1(declarative)).toThrow(/must end as a question/u);
  });

  it('rejects a forged FR-9 diagnosis before Character Runtime projection', () => {
    const issued = buildResearchFaceDiagnosis(diagnosisInput());
    const forged = { ...issued };

    expect(() =>
      renderResearchFaceCharacterRuntimeTurn({
        diagnosis: forged,
        groundingVersion: 'face-grounding-fr11-v1',
        context: runtimeContext('character.alpha', 'medium'),
        presentationProfile: presentationProfile('strongest_first', 'character.alpha'),
        followUpCatalog: followUpCatalog('character.alpha'),
      }),
    ).toThrow(/was not issued/u);
  });
});
