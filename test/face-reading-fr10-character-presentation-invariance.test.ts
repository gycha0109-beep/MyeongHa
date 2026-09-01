import { describe, expect, it } from 'vitest';
import {
  presentResearchFaceGroundingForCharacter,
  validateCharacterFacePresentationProfileV1,
  type CharacterFacePresentationModeV1,
  type ResearchCharacterFaceGroundingV1,
} from '../packages/domain/src/index.js';

function grounding(options: { readonly tension?: boolean } = {}): ResearchCharacterFaceGroundingV1 {
  const tension = options.tension ?? true;
  return {
    groundingVersion: 'face-grounding-fr10-v1',
    faceReadingRef: 'reading:fr10:test',
    faceEngineVersion: 'face-research-engine-fr10-v1',
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
      ...(tension
        ? [
            {
              key: 'face.five_officers.tension.discernment_complete__intake_contradicted',
              text: '심변관은 서고 출납관은 꺾이는 대비가 이번 판독의 핵심입니다.',
            },
          ]
        : []),
    ],
    unavailableSections: [],
    prohibitedInferences: ['medical_diagnosis', 'biometric_identity'],
    authorityState: 'research_only',
    assertionAuthority: 'research_fixture',
    evidenceRefs: ['fixture:fr10:v1'],
    semanticSignature: tension
      ? 'face-research-diagnosis@0.1.0|fr10:tension'
      : 'face-research-diagnosis@0.1.0|fr10:no-tension',
  };
}

function character(characterId: string, contentVersion = 'character-content-fr10-v1') {
  return { characterId, contentVersion };
}

function profile(mode: CharacterFacePresentationModeV1, characterId: string) {
  return {
    schemaVersion: 'v1' as const,
    profileVersion: `face-presentation-${mode}-v1`,
    characterId,
    characterContentVersion: 'character-content-fr10-v1',
    mode,
  };
}

function presentation(mode: CharacterFacePresentationModeV1, characterId: string) {
  return presentResearchFaceGroundingForCharacter({
    grounding: grounding(),
    character: character(characterId),
    profile: profile(mode, characterId),
  });
}

function protectedClaimRefs(value: ReturnType<typeof presentation>): readonly string[] {
  return [...value.protectedGrounding.semanticClaims]
    .map((claim) => claim.claimRef)
    .sort();
}

function blockTextMap(value: ReturnType<typeof presentation>): Map<string, string> {
  return new Map(value.orderedBlocks.map((block) => [block.key, block.text] as const));
}

describe('FR-10 character Face presentation invariance', () => {
  it('lets three character modes reorder one protected grounding without changing semantics', () => {
    const strongest = presentation('strongest_first', 'character.alpha');
    const contrast = presentation('contrast_first', 'character.beta');
    const detail = presentation('detail_first', 'character.gamma');

    expect(strongest.protectedDiagnosisDigest).toBe(contrast.protectedDiagnosisDigest);
    expect(strongest.protectedDiagnosisDigest).toBe(detail.protectedDiagnosisDigest);
    expect(strongest.protectedGrounding.semanticSignature).toBe(contrast.protectedGrounding.semanticSignature);
    expect(strongest.protectedGrounding.semanticSignature).toBe(detail.protectedGrounding.semanticSignature);
    expect(protectedClaimRefs(strongest)).toEqual(protectedClaimRefs(contrast));
    expect(protectedClaimRefs(strongest)).toEqual(protectedClaimRefs(detail));
    expect(blockTextMap(strongest)).toEqual(blockTextMap(contrast));
    expect(blockTextMap(strongest)).toEqual(blockTextMap(detail));

    expect(strongest.orderedBlocks.map((block) => block.key)).not.toEqual(
      contrast.orderedBlocks.map((block) => block.key),
    );
    expect(strongest.orderedBlocks.map((block) => block.key)).not.toEqual(
      detail.orderedBlocks.map((block) => block.key),
    );
  });

  it('keeps session framing first while changing the first diagnostic emphasis', () => {
    const strongest = presentation('strongest_first', 'character.alpha');
    const contrast = presentation('contrast_first', 'character.beta');
    const detail = presentation('detail_first', 'character.gamma');

    expect(strongest.orderedBlocks[0]?.key).toBe('face.research.framing');
    expect(contrast.orderedBlocks[0]?.key).toBe('face.research.framing');
    expect(detail.orderedBlocks[0]?.key).toBe('face.research.framing');

    expect(strongest.orderedBlocks[1]?.key).toMatch(/^face\.research\.verdict\./u);
    expect(contrast.orderedBlocks[1]?.key).toMatch(/^face\.five_officers\.tension\./u);
    expect(detail.orderedBlocks[1]?.key).toMatch(/^face\.research\.feature\./u);

    expect(strongest.focus).toBe('dominant_feature');
    expect(contrast.focus).toBe('contrast_axis');
    expect(detail.focus).toBe('local_detail');
    expect(strongest.followUpStrategy).toBe('inspect_dominant_feature');
    expect(contrast.followUpStrategy).toBe('explore_contrast_axis');
    expect(detail.followUpStrategy).toBe('inspect_local_detail');
  });

  it('pins each presentation to active character identity and content version without changing grounding digest', () => {
    const alpha = presentation('strongest_first', 'character.alpha');
    const beta = presentation('strongest_first', 'character.beta');

    expect(alpha.characterId).toBe('character.alpha');
    expect(beta.characterId).toBe('character.beta');
    expect(alpha.characterContentVersion).toBe('character-content-fr10-v1');
    expect(beta.characterContentVersion).toBe('character-content-fr10-v1');
    expect(alpha.protectedDiagnosisDigest).toBe(beta.protectedDiagnosisDigest);
  });

  it('rejects a profile whose character or content version does not match the active character', () => {
    expect(() =>
      presentResearchFaceGroundingForCharacter({
        grounding: grounding(),
        character: character('character.alpha'),
        profile: profile('strongest_first', 'character.beta'),
      }),
    ).toThrow(/characterId mismatch/u);

    expect(() =>
      presentResearchFaceGroundingForCharacter({
        grounding: grounding(),
        character: character('character.alpha', 'character-content-other-v1'),
        profile: profile('strongest_first', 'character.alpha'),
      }),
    ).toThrow(/contentVersion mismatch/u);
  });

  it('preserves research authority and evidence provenance in every mode', () => {
    for (const mode of ['strongest_first', 'contrast_first', 'detail_first'] as const) {
      const value = presentation(mode, `character.${mode}`);
      expect(value.protectedGrounding.authorityState).toBe('research_only');
      expect(value.protectedGrounding.assertionAuthority).toBe('research_fixture');
      expect(value.protectedGrounding.evidenceRefs).toEqual(['fixture:fr10:v1']);
      expect(value.protectedGrounding.prohibitedInferences).toContain('biometric_identity');
      expect(Object.isFrozen(value)).toBe(true);
      expect(Object.isFrozen(value.orderedBlocks)).toBe(true);
    }
  });

  it('never introduces character-authored Face prose', () => {
    const value = presentation('contrast_first', 'character.beta');
    const approved = new Map(
      (value.protectedGrounding.approvedNarrativeBlocks ?? []).map((block) => [block.key, block.text] as const),
    );

    expect(value.orderedBlocks).toHaveLength(approved.size);
    for (const block of value.orderedBlocks) {
      expect(approved.get(block.key)).toBe(block.text);
    }
  });

  it('falls back deterministically when contrast-first has no tension block', () => {
    const value = presentResearchFaceGroundingForCharacter({
      grounding: grounding({ tension: false }),
      character: character('character.beta'),
      profile: profile('contrast_first', 'character.beta'),
    });

    expect(value.requestedMode).toBe('contrast_first');
    expect(value.effectiveMode).toBe('strongest_first');
    expect(value.fallbackReason).toBe('no_tension_block');
    expect(value.focus).toBe('dominant_feature');
    expect(value.orderedBlocks[1]?.key).toMatch(/^face\.research\.verdict\./u);
  });

  it('fails closed on malformed grounding before character presentation', () => {
    const malformed: ResearchCharacterFaceGroundingV1 = {
      ...grounding(),
      evidenceRefs: [],
    };

    expect(() =>
      presentResearchFaceGroundingForCharacter({
        grounding: malformed,
        character: character('character.fake'),
        profile: profile('strongest_first', 'character.fake'),
      }),
    ).toThrow(/evidenceRefs must be non-empty/u);
  });

  it('fails closed on an unsupported presentation mode', () => {
    expect(() =>
      validateCharacterFacePresentationProfileV1({
        schemaVersion: 'v1',
        profileVersion: 'face-presentation-invalid-v1',
        characterId: 'character.invalid',
        characterContentVersion: 'character-content-fr10-v1',
        mode: 'fortune_rewrite' as CharacterFacePresentationModeV1,
      }),
    ).toThrow(/Unsupported face presentation mode/u);
  });
});
