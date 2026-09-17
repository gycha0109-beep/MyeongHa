import { describe, expect, it } from 'vitest';

import type { CharacterPerspectiveSourceV1 } from './character-saju-perspective.js';
import {
  CHARACTER_PERSPECTIVE_SCHEMA_VERSION_V1,
  SAJU_GROUNDING_AXIS_KEYS_V1,
  admitCharacterPerspectiveProfileV1,
} from './character-saju-perspective.js';
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
