import { describe, expect, it } from 'vitest';
import {
  buildResearchFaceDiagnosis,
  type FaceResearchDiagnosisInput,
} from '../packages/face-reading/src/index.js';
import {
  CharacterFacePresentationError,
  presentResearchFaceDiagnosisForCharacter,
  validateCharacterFacePresentationProfileV1,
  type CharacterFacePresentationModeV1,
} from '../packages/domain/src/index.js';

function diagnosisInput(): FaceResearchDiagnosisInput {
  return {
    readingRef: 'reading:fr10:test',
    engineVersion: 'face-research-engine-fr10-v1',
    sourceSnapshotRef: 'source-snapshot:fr10-v1',
    assertionAuthority: 'research_fixture',
    evidenceRefs: ['fixture:fr10:v1'],
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

function presentation(mode: CharacterFacePresentationModeV1, characterId: string) {
  const diagnosis = buildResearchFaceDiagnosis(diagnosisInput());
  return presentResearchFaceDiagnosisForCharacter({
    diagnosis,
    groundingVersion: 'face-grounding-fr10-v1',
    characterId,
    profile: {
      schemaVersion: 'v1',
      profileVersion: `face-presentation-${mode}-v1`,
      mode,
    },
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
  it('lets three character modes reorder one protected diagnosis without changing semantics', () => {
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
    const diagnosis = buildResearchFaceDiagnosis({
      ...diagnosisInput(),
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
            'criterion.intake.square_broad': 'met',
            'criterion.intake.lips_substantial': 'met',
          },
        },
      ],
    });

    const value = presentResearchFaceDiagnosisForCharacter({
      diagnosis,
      groundingVersion: 'face-grounding-fr10-v1',
      characterId: 'character.beta',
      profile: {
        schemaVersion: 'v1',
        profileVersion: 'face-presentation-contrast-v1',
        mode: 'contrast_first',
      },
    });

    expect(value.requestedMode).toBe('contrast_first');
    expect(value.effectiveMode).toBe('strongest_first');
    expect(value.fallbackReason).toBe('no_tension_block');
    expect(value.focus).toBe('dominant_feature');
    expect(value.orderedBlocks[1]?.key).toMatch(/^face\.research\.verdict\./u);
  });

  it('rejects a structurally forged diagnosis before character presentation', () => {
    const issued = buildResearchFaceDiagnosis(diagnosisInput());
    const forged = { ...issued };

    expect(() =>
      presentResearchFaceDiagnosisForCharacter({
        diagnosis: forged,
        groundingVersion: 'face-grounding-fr10-v1',
        characterId: 'character.fake',
        profile: {
          schemaVersion: 'v1',
          profileVersion: 'face-presentation-fake-v1',
          mode: 'strongest_first',
        },
      }),
    ).toThrow(/was not issued/u);
  });

  it('fails closed on an unsupported presentation mode', () => {
    expect(() =>
      validateCharacterFacePresentationProfileV1({
        schemaVersion: 'v1',
        profileVersion: 'face-presentation-invalid-v1',
        mode: 'fortune_rewrite' as CharacterFacePresentationModeV1,
      }),
    ).toThrow(CharacterFacePresentationError);
  });
});
