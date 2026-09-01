import { describe, expect, it } from 'vitest';
import {
  validateCharacterFaceSafeFollowUpCatalogV1,
  type CharacterFaceSafeFollowUpCatalogV1,
} from '../packages/character-content/src/index.js';
import {
  renderResearchFaceCharacterRuntimeTurn,
  type CharacterFaceRuntimeProjectionV1,
  type CharacterFacePresentationModeV1,
  type ResearchCharacterFaceGroundingV1,
} from '../packages/domain/src/index.js';

function grounding(): ResearchCharacterFaceGroundingV1 {
  return {
    groundingVersion: 'face-grounding-fr11-v1',
    faceReadingRef: 'reading:fr11:test',
    faceEngineVersion: 'face-research-engine-fr11-v1',
    methodologyPackRef: 'face-fr3-research-pack-v0@0.1.0',
    semanticClaims: [
      {
        key: 'face.five_officers.discernment.static_support.complete',
        axis: 'five_officers',
        pattern: 'complete',
        claimRef: 'claim.research.five_officers.discernment.static_support.complete',
      },
      {
        key: 'face.five_officers.intake.static_support.contradicted',
        axis: 'five_officers',
        pattern: 'contradicted',
        claimRef: 'claim.research.five_officers.intake.static_support.contradicted',
      },
    ],
    approvedNarrativeBlocks: [
      {
        key: 'face.research.framing',
        text: '이 결과는 연구 단계 관상 판독의 보호된 설명입니다.',
      },
      {
        key: 'face.research.verdict.discernment_complete',
        text: '심변관이 중심을 잡는 관상입니다.',
      },
      {
        key: 'face.research.feature.discernment_bridge_straight',
        text: '심변관에서 코의 정적 조건이 선명하게 잡힙니다.',
      },
      {
        key: 'face.research.feature.intake_square_broad',
        text: '출납관에서 입의 정적 조건에는 분명한 깨짐이 있습니다.',
      },
      {
        key: 'face.five_officers.tension.discernment_complete__intake_contradicted',
        text: '심변관은 서고 출납관은 꺾이는 대비가 이번 판독의 핵심입니다.',
      },
    ],
    unavailableSections: [],
    prohibitedInferences: ['medical_diagnosis', 'biometric_identity'],
    authorityState: 'research_only',
    assertionAuthority: 'research_fixture',
    evidenceRefs: ['fixture:fr11:v1'],
    semanticSignature: 'face-research-diagnosis@0.1.0|fr11:tension',
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
  return renderResearchFaceCharacterRuntimeTurn({
    grounding: grounding(),
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

  it('relationship revision changes do not alter the protected grounding digest', () => {
    const common = {
      grounding: grounding(),
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
    expect(() =>
      renderResearchFaceCharacterRuntimeTurn({
        grounding: grounding(),
        context: runtimeContext('character.alpha', 'medium'),
        presentationProfile: presentationProfile('strongest_first', 'character.alpha'),
        followUpCatalog: followUpCatalog('character.beta'),
      }),
    ).toThrow(/catalog characterId mismatch/u);

    expect(() =>
      renderResearchFaceCharacterRuntimeTurn({
        grounding: grounding(),
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

  it('fails closed on malformed Face grounding before Character Runtime projection', () => {
    const malformed: ResearchCharacterFaceGroundingV1 = {
      ...grounding(),
      semanticClaims: [],
    };

    expect(() =>
      renderResearchFaceCharacterRuntimeTurn({
        grounding: malformed,
        context: runtimeContext('character.alpha', 'medium'),
        presentationProfile: presentationProfile('strongest_first', 'character.alpha'),
        followUpCatalog: followUpCatalog('character.alpha'),
      }),
    ).toThrow(/semanticClaims must be non-empty/u);
  });
});
