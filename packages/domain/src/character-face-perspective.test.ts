import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  CHARACTER_FACE_CAPABILITY_SCHEMA_VERSION_V1,
  admitCharacterFaceCapabilityProfileV1,
} from './character-face-capability.js';
import {
  FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
} from './character-face-grounding-admission.js';
import {
  CHARACTER_FACE_ATTENTION_KEYS_V1,
  CHARACTER_FACE_ATTENTION_REGISTRY_VERSION_V1,
  CHARACTER_FACE_PERSPECTIVE_SCHEMA_VERSION_V1,
  CHARACTER_FACE_PERSPECTIVE_SOURCE_SCHEMA_VERSION_V1,
  admitCharacterFacePerspectiveProfileV1,
  admitCharacterFacePerspectiveSourceV1,
  assertCharacterFacePerspectiveCapabilityCompatibilityV1,
} from './character-face-perspective.js';
import {
  type CharacterFacePresentationProfileV1,
} from './character-face-presentation.js';

function perspectiveSource(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion:
      CHARACTER_FACE_PERSPECTIVE_SOURCE_SCHEMA_VERSION_V1,
    perspectiveVersion:
      'face-perspective-fixture-v1',
    characterId:
      'character.fixture',
    contentVersion:
      'character-content-fixture-v1',
    faceProfileVersion:
      'face-profile-fixture-v1',
    attentionOrder: [
      'mouth.width_and_relative_size',
      'eye.width_height_ratio',
      'nose.alar_width_and_nostril_geometry',
      'chin_lower_face.visible_width_ratio',
      'forehead.visible_width_shape',
    ],
    maxUnits: 4,
    uncertaintyHandling:
      'state_directly',
    ...overrides,
  };
}

function perspectiveCandidate(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion:
      CHARACTER_FACE_PERSPECTIVE_SCHEMA_VERSION_V1,
    perspectiveVersion:
      'face-perspective-fixture-v1',
    characterId:
      'character.fixture',
    sourceContentVersion:
      'character-content-fixture-v1',
    sourceFaceProfileVersion:
      'face-profile-fixture-v1',
    groundingProjectionVersion:
      FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
    attentionRegistryVersion:
      CHARACTER_FACE_ATTENTION_REGISTRY_VERSION_V1,
    attentionOrder: [
      'mouth.width_and_relative_size',
      'eye.width_height_ratio',
      'nose.alar_width_and_nostril_geometry',
      'chin_lower_face.visible_width_ratio',
      'forehead.visible_width_shape',
    ],
    selection: {
      maxUnits: 4,
      avoidDuplicateCapability: true,
      preserveSourceOrderForTies: true,
    },
    uncertaintyHandling:
      'state_directly',
    deliveryAuthority: {
      speech:
        'published_character_speech',
      communication:
        'published_character_persona_communication',
      relationship:
        'active_relationship_projection',
    },
    ...overrides,
  };
}

function capabilityFixture(
  overrides: Record<string, unknown> = {},
) {
  const source = {
    schemaVersion:
      'character-face-capability-source-v1',
    capabilityVersion:
      'face-capability-fixture-v1',
    characterId:
      'character.fixture',
    contentVersion:
      'character-content-fixture-v1',
    faceProfileVersion:
      'face-profile-fixture-v1',
    allowedTopicKeys: [
      'face.discover.structure',
      'face.discover.extended',
    ],
    allowedModes: [
      'neutral_fact_realization',
    ],
    allowPartial: true,
    canInitiate: false,
    ...overrides,
  };

  return admitCharacterFaceCapabilityProfileV1({
    source,
    candidate: {
      schemaVersion:
        CHARACTER_FACE_CAPABILITY_SCHEMA_VERSION_V1,
      capabilityVersion:
        source.capabilityVersion,
      characterId:
        source.characterId,
      sourceContentVersion:
        source.contentVersion,
      sourceFaceProfileVersion:
        source.faceProfileVersion,
      allowedTopicKeys:
        source.allowedTopicKeys,
      allowedModes:
        source.allowedModes,
      allowPartial:
        source.allowPartial,
      canInitiate:
        source.canInitiate,
    },
  });
}

describe(
  'TOPIC-FACE-005C-B Character Face Perspective',
  () => {
    it('admits a source-backed non-semantic Face Perspective profile', () => {
      const profile =
        admitCharacterFacePerspectiveProfileV1({
          source:
            perspectiveSource(),
          candidate:
            perspectiveCandidate(),
        });

      expect(profile).toEqual(
        perspectiveCandidate(),
      );
      expect(
        Object.isFrozen(profile),
      ).toBe(true);
      expect(
        Object.isFrozen(
          profile.attentionOrder,
        ),
      ).toBe(true);
      expect(
        Object.isFrozen(
          profile.selection,
        ),
      ).toBe(true);
      expect(
        CHARACTER_FACE_ATTENTION_KEYS_V1,
      ).toEqual([
        'eye.width_height_ratio',
        'nose.alar_width_and_nostril_geometry',
        'mouth.width_and_relative_size',
        'chin_lower_face.visible_width_ratio',
        'forehead.visible_width_shape',
      ]);
    });

    it('allows different source-backed attention orders without creating semantic mappings', () => {
      const first =
        admitCharacterFacePerspectiveProfileV1({
          source:
            perspectiveSource(),
          candidate:
            perspectiveCandidate(),
        });

      const alternateOrder = [
        'chin_lower_face.visible_width_ratio',
        'nose.alar_width_and_nostril_geometry',
        'eye.width_height_ratio',
        'mouth.width_and_relative_size',
      ];

      const second =
        admitCharacterFacePerspectiveProfileV1({
          source:
            perspectiveSource({
              attentionOrder:
                alternateOrder,
              perspectiveVersion:
                'face-perspective-fixture-v2',
            }),
          candidate:
            perspectiveCandidate({
              attentionOrder:
                alternateOrder,
              perspectiveVersion:
                'face-perspective-fixture-v2',
            }),
        });

      expect(
        first.attentionOrder,
      ).not.toEqual(
        second.attentionOrder,
      );
      expect(
        Object.keys(first),
      ).not.toContain(
        'personalityMapping',
      );
      expect(
        Object.keys(first),
      ).not.toContain(
        'threshold',
      );
      expect(
        Object.keys(first),
      ).not.toContain(
        'adviceStyle',
      );
    });

    it('allows unavailable-capability attention as authored preference without fabricating source availability', () => {
      const profile =
        admitCharacterFacePerspectiveProfileV1({
          source:
            perspectiveSource({
              attentionOrder: [
                'forehead.visible_width_shape',
                'mouth.width_and_relative_size',
              ],
              maxUnits: 2,
            }),
          candidate:
            perspectiveCandidate({
              attentionOrder: [
                'forehead.visible_width_shape',
                'mouth.width_and_relative_size',
              ],
              selection: {
                maxUnits: 2,
                avoidDuplicateCapability:
                  true,
                preserveSourceOrderForTies:
                  true,
              },
            }),
        });

      expect(
        profile.attentionOrder[0],
      ).toBe(
        'forehead.visible_width_shape',
      );
      expect(profile.selection.maxUnits).toBe(2);
    });

    it('rejects empty, duplicate and unknown attention keys', () => {
      for (const attentionOrder of [
        [],
        [
          'eye.width_height_ratio',
          'eye.width_height_ratio',
        ],
        [
          'face.reading.three_divisions',
        ],
      ]) {
        expect(() =>
          admitCharacterFacePerspectiveSourceV1(
            perspectiveSource({
              attentionOrder,
            }),
          ),
        ).toThrow();
      }
    });

    it('rejects maxUnits outside the first-slice 1..4 contract', () => {
      for (const maxUnits of [
        0,
        5,
        1.5,
      ]) {
        expect(() =>
          admitCharacterFacePerspectiveSourceV1(
            perspectiveSource({
              maxUnits,
            }),
          ),
        ).toThrow(
          'integer between 1 and 4',
        );
      }
    });

    it('rejects stale authored identity and unsupported registry/projection versions', () => {
      expect(() =>
        admitCharacterFacePerspectiveProfileV1({
          source:
            perspectiveSource(),
          candidate:
            perspectiveCandidate({
              characterId:
                'character.other',
            }),
        }),
      ).toThrow(
        'characterId does not match',
      );

      expect(() =>
        admitCharacterFacePerspectiveProfileV1({
          source:
            perspectiveSource(),
          candidate:
            perspectiveCandidate({
              sourceContentVersion:
                'stale',
            }),
        }),
      ).toThrow(
        'contentVersion is stale',
      );

      expect(() =>
        admitCharacterFacePerspectiveProfileV1({
          source:
            perspectiveSource(),
          candidate:
            perspectiveCandidate({
              sourceFaceProfileVersion:
                'stale',
            }),
        }),
      ).toThrow(
        'faceProfileVersion is stale',
      );

      expect(() =>
        admitCharacterFacePerspectiveProfileV1({
          source:
            perspectiveSource(),
          candidate:
            perspectiveCandidate({
              groundingProjectionVersion:
                'face-character-grounding-projection-v2',
            }),
        }),
      ).toThrow(
        'grounding projection version is not supported',
      );

      expect(() =>
        admitCharacterFacePerspectiveProfileV1({
          source:
            perspectiveSource(),
          candidate:
            perspectiveCandidate({
              attentionRegistryVersion:
                'character-face-attention-registry-v2',
            }),
        }),
      ).toThrow(
        'attention registry version is not supported',
      );
    });

    it('requires deterministic selector safeguards and fixed delivery authority', () => {
      expect(() =>
        admitCharacterFacePerspectiveProfileV1({
          source:
            perspectiveSource(),
          candidate:
            perspectiveCandidate({
              selection: {
                maxUnits: 4,
                avoidDuplicateCapability:
                  false,
                preserveSourceOrderForTies:
                  true,
              },
            }),
        }),
      ).toThrow(
        'selection safeguards must remain enabled',
      );

      expect(() =>
        admitCharacterFacePerspectiveProfileV1({
          source:
            perspectiveSource(),
          candidate:
            perspectiveCandidate({
              deliveryAuthority: {
                speech:
                  'free_form_llm',
                communication:
                  'published_character_persona_communication',
                relationship:
                  'active_relationship_projection',
              },
            }),
        }),
      ).toThrow(
        'delivery authority is not supported',
      );
    });

    it('rejects semantic, threshold, research presentation, relationship and Commerce widening', () => {
      for (const injected of [
        {
          threshold:
            0.5,
        },
        {
          personalityMapping:
            'forbidden',
        },
        {
          fortuneMapping:
            'forbidden',
        },
        {
          adviceStyle:
            'action_first',
        },
        {
          mode:
            'strongest_first',
        },
        {
          relationshipState:
            'forbidden',
        },
        {
          price:
            9900,
        },
        {
          entitlement:
            true,
        },
      ]) {
        expect(() =>
          admitCharacterFacePerspectiveProfileV1({
            source:
              perspectiveSource(),
            candidate: {
              ...perspectiveCandidate(),
              ...injected,
            },
          }),
        ).toThrow(
          'contains unexpected field',
        );
      }
    });

    it('rejects the legacy research Face presentation profile as a production-neutral Perspective', () => {
      const researchProfile:
        CharacterFacePresentationProfileV1 = {
          schemaVersion: 'v1',
          profileVersion:
            'research-presentation-v1',
          characterId:
            'character.fixture',
          characterContentVersion:
            'character-content-fixture-v1',
          mode:
            'strongest_first',
        };

      expect(() =>
        admitCharacterFacePerspectiveProfileV1({
          source:
            perspectiveSource(),
          candidate:
            researchProfile,
        }),
      ).toThrow();
    });

    it('requires Capability and Perspective to share the same authored Character identity', () => {
      const perspective =
        admitCharacterFacePerspectiveProfileV1({
          source:
            perspectiveSource(),
          candidate:
            perspectiveCandidate(),
        });
      const capability =
        capabilityFixture();

      expect(() =>
        assertCharacterFacePerspectiveCapabilityCompatibilityV1({
          capability,
          perspective,
        }),
      ).not.toThrow();

      const otherCapability =
        capabilityFixture({
          characterId:
            'character.other',
        });

      expect(() =>
        assertCharacterFacePerspectiveCapabilityCompatibilityV1({
          capability:
            otherCapability,
          perspective,
        }),
      ).toThrow(
        'characterId must match',
      );
    });
  },
);
