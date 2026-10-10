import { describe, expect, it } from 'vitest';

import type { CharacterPerspectiveSourceV1 } from './character-saju-perspective.js';
import {
  CHARACTER_PERSPECTIVE_SCHEMA_VERSION_V1,
  SAJU_GROUNDING_AXIS_KEYS_V1,
  admitCharacterPerspectiveProfileV1,
} from './character-saju-perspective.js';
import { resolveCharacterSajuCommonPerspectiveV1 } from './character-saju-common-perspective.js';
import { SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1 } from './character-saju-grounding-admission.js';

function makeSource(
  attentionAxes: readonly string[] = ['responsibility', 'boundary'],
): CharacterPerspectiveSourceV1 {
  return {
    characterId: 'fixture-character',
    contentVersion: 'fixture-content-v1',
    sajuProfile: {
      profileVersion: 'character-saju-profile-v1',
      attentionAxes,
      followUpQuestionStrategies: ['clarify_boundary'],
      framingStyle: 'fixture',
      uncertaintyResponseStyle: 'fixture',
      insufficientEvidenceResponseStyle: 'fixture',
      referralBehavior: {
        maySuggestAnotherCharacter: false,
        conditions: [],
      },
    },
  };
}

function makeCandidate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: CHARACTER_PERSPECTIVE_SCHEMA_VERSION_V1,
    perspectiveVersion: 'fixture-perspective-v1',
    characterId: 'fixture-character',
    sourceContentVersion: 'fixture-content-v1',
    sourceSajuProfileVersion: 'character-saju-profile-v1',
    groundingAxisRegistryVersion: SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
    attentionBindings: [
      { authoredAttentionAxis: 'responsibility', groundingAxis: 'responsibility' },
      { authoredAttentionAxis: 'boundary', groundingAxis: 'boundary' },
    ],
    attentionOrder: ['responsibility', 'boundary'],
    preferredNarrativeRoles: ['primary', 'tension', 'limitation'],
    selection: {
      maxPrimaryUnits: 2,
      maxSupportingUnits: 1,
      maxTensionUnits: 1,
      maxLimitationUnits: 1,
      avoidSameAxisRepetition: true,
    },
    interpretationBehavior: {
      contradictionHandling: 'lead_with_it',
      uncertaintyHandling: 'state_directly',
      adviceStyle: 'action_first',
    },
    deliveryAuthority: {
      speech: 'published_character_speech',
      communication: 'published_character_persona_communication',
      relationship: 'active_relationship_projection',
    },
    ...overrides,
  };
}

describe('CharacterPerspectiveProfileV1 admission', () => {
  it('admits an explicitly bound profile using only Saju-owned grounding axes', () => {
    const admitted = admitCharacterPerspectiveProfileV1({
      candidate: makeCandidate(),
      source: makeSource(),
    });

    expect(admitted.attentionOrder).toEqual(['responsibility', 'boundary']);
    expect(admitted.attentionBindings).toEqual([
      { authoredAttentionAxis: 'responsibility', groundingAxis: 'responsibility' },
      { authoredAttentionAxis: 'boundary', groundingAxis: 'boundary' },
    ]);
    expect(Object.isFrozen(admitted)).toBe(true);
  });

  it('pins the exact Saju grounding axis registry', () => {
    expect(SAJU_GROUNDING_AXIS_KEYS_V1).toContain('responsibility');
    expect(SAJU_GROUNDING_AXIS_KEYS_V1).toContain('boundary');
    expect(SAJU_GROUNDING_AXIS_KEYS_V1).not.toContain('consequence');

    expect(() =>
      admitCharacterPerspectiveProfileV1({
        candidate: makeCandidate({
          attentionBindings: [
            { authoredAttentionAxis: 'responsibility', groundingAxis: 'responsibility' },
            { authoredAttentionAxis: 'boundary', groundingAxis: 'consequence' },
          ],
          attentionOrder: ['responsibility', 'consequence'],
        }),
        source: makeSource(),
      }),
    ).toThrow('groundingAxis contains an unsupported value');
  });

  it('does not silently reinterpret or drop a legacy authored attention axis', () => {
    const source = makeSource(['responsibility', 'boundary', 'consequence']);

    expect(() =>
      admitCharacterPerspectiveProfileV1({
        candidate: makeCandidate(),
        source,
      }),
    ).toThrow('must explicitly bind every published Saju attention axis exactly once');
  });

  it('rejects a binding that was not authored in the source Character Saju profile', () => {
    expect(() =>
      admitCharacterPerspectiveProfileV1({
        candidate: makeCandidate({
          attentionBindings: [
            { authoredAttentionAxis: 'responsibility', groundingAxis: 'responsibility' },
            { authoredAttentionAxis: 'invented_axis', groundingAxis: 'boundary' },
          ],
        }),
        source: makeSource(),
      }),
    ).toThrow('is not present in the published Character Saju profile');
  });

  it('rejects duplicate source or grounding axis bindings', () => {
    expect(() =>
      admitCharacterPerspectiveProfileV1({
        candidate: makeCandidate({
          attentionBindings: [
            { authoredAttentionAxis: 'responsibility', groundingAxis: 'responsibility' },
            { authoredAttentionAxis: 'responsibility', groundingAxis: 'boundary' },
          ],
        }),
        source: makeSource(),
      }),
    ).toThrow('authoredAttentionAxis must not contain duplicates');

    expect(() =>
      admitCharacterPerspectiveProfileV1({
        candidate: makeCandidate({
          attentionBindings: [
            { authoredAttentionAxis: 'responsibility', groundingAxis: 'boundary' },
            { authoredAttentionAxis: 'boundary', groundingAxis: 'boundary' },
          ],
          attentionOrder: ['boundary'],
        }),
        source: makeSource(),
      }),
    ).toThrow('groundingAxis must not contain duplicates');
  });

  it('rejects stale Character content and Saju profile bindings', () => {
    expect(() =>
      admitCharacterPerspectiveProfileV1({
        candidate: makeCandidate({ sourceContentVersion: 'fixture-content-v0' }),
        source: makeSource(),
      }),
    ).toThrow('sourceContentVersion is stale');

    expect(() =>
      admitCharacterPerspectiveProfileV1({
        candidate: makeCandidate({ sourceSajuProfileVersion: 'character-saju-profile-v0' }),
        source: makeSource(),
      }),
    ).toThrow('sourceSajuProfileVersion is stale');
  });

  it('rejects unsupported registry versions and semantic weight fields', () => {
    expect(() =>
      admitCharacterPerspectiveProfileV1({
        candidate: makeCandidate({ groundingAxisRegistryVersion: 'myeonghwa-grounding-axis-v2' }),
        source: makeSource(),
      }),
    ).toThrow('grounding axis registry version is not supported');

    expect(() =>
      admitCharacterPerspectiveProfileV1({
        candidate: makeCandidate({ semanticWeights: { responsibility: 0.9 } }),
        source: makeSource(),
      }),
    ).toThrow('contains unexpected field: semanticWeights');
  });

  it('requires delivery to remain anchored to published Character authorities', () => {
    expect(() =>
      admitCharacterPerspectiveProfileV1({
        candidate: makeCandidate({
          deliveryAuthority: {
            speech: 'generated_speech',
            communication: 'published_character_persona_communication',
            relationship: 'active_relationship_projection',
          },
        }),
        source: makeSource(),
      }),
    ).toThrow('must use published Character speech authority');
  });

  it('enforces deterministic bounded selection policy', () => {
    expect(() =>
      admitCharacterPerspectiveProfileV1({
        candidate: makeCandidate({
          selection: {
            maxPrimaryUnits: 16,
            maxSupportingUnits: 16,
            maxTensionUnits: 16,
            maxLimitationUnits: 16,
            avoidSameAxisRepetition: true,
          },
        }),
        source: makeSource(),
      }),
    ).toThrow('selection total must be between 1 and 16 units');
  });
});

/**
 * Offline contract matrix for the four-profile extension seam.
 * The source objects are synthetic *published-source-shaped* inputs:
 * they are NOT actual released Bibles, approved Oaths, real Saju Claims,
 * or grant/production authority. Character Owner must source all real bindings.
 *
 * Fixed acceptance:
 * - 3 named profiles plus one test-only fourth without a character switch;
 * - different explicit authored-axis -> Saju-grounding-axis bindings;
 * - default common policy NEVER silently infers those mappings;
 * - identity and source version remain exact;
 * - mandate/Oath payload cannot masquerade as an extra Perspective schema field.
 */
describe('3+1 Reader perspective admission boundary (offline; no Canon publication)', () => {
  const profiles = [
    { characterId: 'seyeon', authoredAxis: 'fixture_first_action', groundingAxis: 'action_style' },
    { characterId: 'rahyeon', authoredAxis: 'fixture_visible_structure', groundingAxis: 'structure' },
    { characterId: 'yeoul', authoredAxis: 'fixture_choice_ownership', groundingAxis: 'decision_style' },
    { characterId: 'fixture-fourth-not-canon', authoredAxis: 'fixture_responsibility', groundingAxis: 'responsibility' },
  ] as const;

  it('admits four source-bound profiles using the unchanged common Character contract', () => {
    const admitted = profiles.map(({ characterId, authoredAxis, groundingAxis }) => {
      const source = {
        ...makeSource([authoredAxis]),
        characterId,
      };
      const candidate = makeCandidate({
        characterId,
        attentionBindings: [{ authoredAttentionAxis: authoredAxis, groundingAxis }],
        attentionOrder: [groundingAxis],
      });

      const common = resolveCharacterSajuCommonPerspectiveV1(source);
      expect(common.characterId).toBe(characterId);
      expect(common.attentionBindings).toEqual([]);
      expect(common.attentionOrder).toEqual([]);

      const reviewedShape = admitCharacterPerspectiveProfileV1({ source, candidate });
      expect(reviewedShape.characterId).toBe(characterId);
      expect(reviewedShape.sourceContentVersion).toBe(source.contentVersion);
      expect(reviewedShape.sourceSajuProfileVersion).toBe(source.sajuProfile.profileVersion);
      expect(reviewedShape.attentionBindings).toEqual([
        { authoredAttentionAxis: authoredAxis, groundingAxis },
      ]);
      expect(reviewedShape.attentionOrder).toEqual([groundingAxis]);
      return reviewedShape;
    });

    expect(admitted).toHaveLength(4);
    expect(new Set(admitted.map(profile => profile.characterId)).size).toBe(4);
    expect(new Set(admitted.map(profile => profile.attentionOrder[0])).size).toBe(4);
  });

  it('rejects another Reader identity and unknown oath/mandate authority fields', () => {
    const source = { ...makeSource(['fixture_first_action']), characterId: 'seyeon' };
    const validCandidate = makeCandidate({
      characterId: 'seyeon',
      attentionBindings: [{ authoredAttentionAxis: 'fixture_first_action', groundingAxis: 'action_style' }],
      attentionOrder: ['action_style'],
    });

    expect(() => admitCharacterPerspectiveProfileV1({
      source,
      candidate: { ...validCandidate, characterId: 'rahyeon' },
    })).toThrow('characterId does not match published Character content');

    expect(() => admitCharacterPerspectiveProfileV1({
      source,
      candidate: { ...validCandidate, oath: { principle: 'synthetic-not-authorized' } },
    })).toThrow('unexpected field: oath');

    expect(() => admitCharacterPerspectiveProfileV1({
      source,
      candidate: { ...validCandidate, mandate: 'synthetic-not-authorized' },
    })).toThrow('unexpected field: mandate');
  });
});
