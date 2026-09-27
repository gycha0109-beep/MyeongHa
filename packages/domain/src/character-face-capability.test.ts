import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  CHARACTER_FACE_CAPABILITY_SCHEMA_VERSION_V1,
  CHARACTER_FACE_CAPABILITY_SOURCE_SCHEMA_VERSION_V1,
  CHARACTER_FACE_SUPPORTED_REALIZATION_MODES_V1,
  CHARACTER_FACE_SUPPORTED_TOPIC_KEYS_V1,
  admitCharacterFaceCapabilityProfileV1,
  admitCharacterFaceCapabilitySourceV1,
  evaluateCharacterFaceCapabilityV1,
  type CharacterFaceCapabilityProfileV1,
} from './character-face-capability.js';
import {
  CHARACTER_FACE_CONTEXT_SCHEMA_VERSION_V1,
  CHARACTER_FACE_REALIZATION_MODE_V1,
  FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
  FACE_CHARACTER_GROUNDING_REF_SCHEMA_VERSION_V1,
  type CharacterFaceRuntimeContextV1,
} from './character-face-grounding-admission.js';
import {
  FACE_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
  FACE_CHARACTER_NEUTRAL_REALIZATION_POLICY_V1,
  FACE_CHARACTER_REALIZATION_POLICY_REGISTRY_VERSION_V1,
  type CharacterFaceGroundingBundleViewV1,
} from './character-face-grounding-bundle.js';

const SOURCE_RESULT_HASH =
  `face-topic-source-result:${'a'.repeat(64)}`;
const PROJECTION_HASH =
  `face-product-projection:${'b'.repeat(64)}`;
const GROUNDING_HASH =
  `face-grounding:${'c'.repeat(64)}`;
const DISPLAY_FACTS_HASH =
  `face-display-facts:${'d'.repeat(64)}`;
const BUNDLE_HASH =
  `face-character-grounding:${'e'.repeat(64)}`;

function capabilitySource(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion:
      CHARACTER_FACE_CAPABILITY_SOURCE_SCHEMA_VERSION_V1,
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
      CHARACTER_FACE_REALIZATION_MODE_V1,
    ],
    allowPartial: true,
    canInitiate: false,
    ...overrides,
  };
}

function capabilityCandidate(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion:
      CHARACTER_FACE_CAPABILITY_SCHEMA_VERSION_V1,
    capabilityVersion:
      'face-capability-fixture-v1',
    characterId:
      'character.fixture',
    sourceContentVersion:
      'character-content-fixture-v1',
    sourceFaceProfileVersion:
      'face-profile-fixture-v1',
    allowedTopicKeys: [
      'face.discover.structure',
      'face.discover.extended',
    ],
    allowedModes: [
      CHARACTER_FACE_REALIZATION_MODE_V1,
    ],
    allowPartial: true,
    canInitiate: false,
    ...overrides,
  };
}

function admittedCapability(
  sourceOverrides: Record<string, unknown> = {},
  profileOverrides: Record<string, unknown> = {},
): CharacterFaceCapabilityProfileV1 {
  return admitCharacterFaceCapabilityProfileV1({
    source:
      capabilitySource(sourceOverrides),
    candidate:
      capabilityCandidate(profileOverrides),
  });
}

function faceContext(
  overrides: Partial<CharacterFaceRuntimeContextV1> = {},
): CharacterFaceRuntimeContextV1 {
  return {
    schemaVersion:
      CHARACTER_FACE_CONTEXT_SCHEMA_VERSION_V1,
    topicKey:
      'face.discover.structure',
    readinessState:
      'available',
    mode:
      CHARACTER_FACE_REALIZATION_MODE_V1,
    unavailableSections: [],
    groundingRef: {
      schemaVersion:
        FACE_CHARACTER_GROUNDING_REF_SCHEMA_VERSION_V1,
      topicKey:
        'face.discover.structure',
      sourceResultHash:
        SOURCE_RESULT_HASH,
      projectionHash:
        PROJECTION_HASH,
      groundingHash:
        GROUNDING_HASH,
      displayFactsHash:
        DISPLAY_FACTS_HASH,
      bundleHash:
        BUNDLE_HASH,
      projectionVersion:
        FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
    },
    ...overrides,
  };
}

function grounding(
  overrides: Partial<CharacterFaceGroundingBundleViewV1> = {},
): CharacterFaceGroundingBundleViewV1 {
  return {
    schemaVersion:
      FACE_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
    projectionVersion:
      FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
    realizationPolicyRegistryVersion:
      FACE_CHARACTER_REALIZATION_POLICY_REGISTRY_VERSION_V1,
    topicKey:
      'face.discover.structure',
    readinessState:
      'available',
    faceEngineVersion:
      'face-engine-fixture-v1',
    sourceResultHash:
      SOURCE_RESULT_HASH,
    projectionHash:
      PROJECTION_HASH,
    groundingHash:
      GROUNDING_HASH,
    displayFactsHash:
      DISPLAY_FACTS_HASH,
    units: [
      {
        unitId:
          `face-grounding-unit:${'1'.repeat(64)}`,
        kind:
          'neutral_observation',
        capabilityKey:
          'eye.width_height_ratio',
        observationRef:
          'face-observation:eye',
        displayFactRef:
          'face-display:eye',
        displayValue: {
          kind: 'scalar',
          value: 0.42,
          unit: 'ratio',
        },
        qualifiers: [],
        prohibitedExtensions: [
          'traditional_semantic_promotion_without_governed_claim',
        ],
        realizationPolicyRef:
          FACE_CHARACTER_NEUTRAL_REALIZATION_POLICY_V1,
      },
    ],
    unavailableSections: [],
    prohibitedInferences: [],
    bundleHash:
      BUNDLE_HASH,
    ...overrides,
  };
}

describe(
  'TOPIC-FACE-005C-B Character Face capability',
  () => {
    it('admits an exact generic authored Face capability profile', () => {
      const profile =
        admittedCapability();

      expect(profile).toEqual(
        capabilityCandidate(),
      );
      expect(
        Object.isFrozen(profile),
      ).toBe(true);
      expect(
        CHARACTER_FACE_SUPPORTED_TOPIC_KEYS_V1,
      ).toEqual([
        'face.discover.structure',
        'face.discover.extended',
      ]);
      expect(
        CHARACTER_FACE_SUPPORTED_REALIZATION_MODES_V1,
      ).toEqual([
        'neutral_fact_realization',
      ]);
    });

    it('allows an admitted structure source with full coverage', () => {
      expect(
        evaluateCharacterFaceCapabilityV1({
          characterId:
            'character.fixture',
          characterContentVersion:
            'character-content-fixture-v1',
          faceContext:
            faceContext(),
          grounding:
            grounding(),
          capability:
            admittedCapability(),
        }),
      ).toEqual({
        allowed: true,
        coverage: 'full',
      });
    });

    it('allows partial extended grounding only when the authored capability allows partial results', () => {
      const unavailableSections = [
        'observation:forehead.visible_width_shape',
      ];
      const context =
        faceContext({
          topicKey:
            'face.discover.extended',
          readinessState:
            'partial',
          unavailableSections,
          groundingRef: {
            ...faceContext()
              .groundingRef,
            topicKey:
              'face.discover.extended',
          },
        });
      const bundle =
        grounding({
          topicKey:
            'face.discover.extended',
          readinessState:
            'partial',
          unavailableSections,
        });

      expect(
        evaluateCharacterFaceCapabilityV1({
          characterId:
            'character.fixture',
          characterContentVersion:
            'character-content-fixture-v1',
          faceContext: context,
          grounding: bundle,
          capability:
            admittedCapability(),
        }),
      ).toEqual({
        allowed: true,
        coverage: 'partial',
      });

      const deniedCapability =
        admittedCapability(
          { allowPartial: false },
          { allowPartial: false },
        );

      expect(
        evaluateCharacterFaceCapabilityV1({
          characterId:
            'character.fixture',
          characterContentVersion:
            'character-content-fixture-v1',
          faceContext: context,
          grounding: bundle,
          capability:
            deniedCapability,
        }),
      ).toEqual({
        allowed: false,
        reason:
          'PARTIAL_NOT_ALLOWED',
      });
    });

    it('fails closed when admitted Face context or grounding is absent or inconsistent', () => {
      const capability =
        admittedCapability();

      expect(
        evaluateCharacterFaceCapabilityV1({
          characterId:
            'character.fixture',
          characterContentVersion:
            'character-content-fixture-v1',
          faceContext: null,
          grounding:
            grounding(),
          capability,
        }),
      ).toEqual({
        allowed: false,
        reason:
          'NO_ADMITTED_FACE_CONTEXT',
      });

      expect(
        evaluateCharacterFaceCapabilityV1({
          characterId:
            'character.fixture',
          characterContentVersion:
            'character-content-fixture-v1',
          faceContext:
            faceContext(),
          grounding: null,
          capability,
        }),
      ).toEqual({
        allowed: false,
        reason:
          'NO_ADMITTED_FACE_GROUNDING',
      });

      expect(
        evaluateCharacterFaceCapabilityV1({
          characterId:
            'character.fixture',
          characterContentVersion:
            'character-content-fixture-v1',
          faceContext:
            faceContext(),
          grounding:
            grounding({
              bundleHash:
                `face-character-grounding:${'f'.repeat(64)}`,
            }),
          capability,
        }),
      ).toEqual({
        allowed: false,
        reason:
          'GROUNDING_CONTEXT_MISMATCH',
      });
    });

    it('denies wrong Character, stale content, unsupported topic, unsupported mode and disallowed partial coverage', () => {
      const capability =
        admittedCapability(
          {
            allowedTopicKeys: [
              'face.discover.structure',
            ],
          },
          {
            allowedTopicKeys: [
              'face.discover.structure',
            ],
          },
        );

      expect(
        evaluateCharacterFaceCapabilityV1({
          characterId:
            'character.other',
          characterContentVersion:
            'character-content-fixture-v1',
          faceContext:
            faceContext(),
          grounding:
            grounding(),
          capability,
        }),
      ).toEqual({
        allowed: false,
        reason:
          'CHARACTER_ID_MISMATCH',
      });

      expect(
        evaluateCharacterFaceCapabilityV1({
          characterId:
            'character.fixture',
          characterContentVersion:
            'stale-content',
          faceContext:
            faceContext(),
          grounding:
            grounding(),
          capability,
        }),
      ).toEqual({
        allowed: false,
        reason:
          'CONTENT_VERSION_MISMATCH',
      });

      const extendedContext =
        faceContext({
          topicKey:
            'face.discover.extended',
          groundingRef: {
            ...faceContext()
              .groundingRef,
            topicKey:
              'face.discover.extended',
          },
        });
      const extendedBundle =
        grounding({
          topicKey:
            'face.discover.extended',
        });

      expect(
        evaluateCharacterFaceCapabilityV1({
          characterId:
            'character.fixture',
          characterContentVersion:
            'character-content-fixture-v1',
          faceContext:
            extendedContext,
          grounding:
            extendedBundle,
          capability,
        }),
      ).toEqual({
        allowed: false,
        reason:
          'TOPIC_NOT_ALLOWED',
      });

      const unsupportedModeContext = {
        ...faceContext(),
        mode:
          'bounded_semantic_paraphrase_v1',
      } as unknown as CharacterFaceRuntimeContextV1;

      expect(
        evaluateCharacterFaceCapabilityV1({
          characterId:
            'character.fixture',
          characterContentVersion:
            'character-content-fixture-v1',
          faceContext:
            unsupportedModeContext,
          grounding:
            grounding(),
          capability,
        }),
      ).toEqual({
        allowed: false,
        reason:
          'MODE_NOT_ALLOWED',
      });
    });

    it('rejects blocked traditional topics, duplicate topics and unknown modes at capability admission', () => {
      for (const allowedTopicKeys of [
        [
          'face.reading.three_divisions',
        ],
        [
          'face.discover.structure',
          'face.discover.structure',
        ],
      ]) {
        expect(() =>
          admitCharacterFaceCapabilitySourceV1(
            capabilitySource({
              allowedTopicKeys,
            }),
          ),
        ).toThrow();
      }

      expect(() =>
        admitCharacterFaceCapabilitySourceV1(
          capabilitySource({
            allowedModes: [
              'bounded_semantic_paraphrase_v1',
            ],
          }),
        ),
      ).toThrow(
        'not a supported Face realization mode',
      );
    });

    it('rejects stale authored identity and semantic, relationship or Commerce widening', () => {
      expect(() =>
        admitCharacterFaceCapabilityProfileV1({
          source:
            capabilitySource(),
          candidate:
            capabilityCandidate({
              sourceContentVersion:
                'stale',
            }),
        }),
      ).toThrow(
        'contentVersion is stale',
      );

      expect(() =>
        admitCharacterFaceCapabilityProfileV1({
          source:
            capabilitySource(),
          candidate:
            capabilityCandidate({
              sourceFaceProfileVersion:
                'stale',
            }),
        }),
      ).toThrow(
        'faceProfileVersion is stale',
      );

      for (const injected of [
        {
          threshold: 0.5,
        },
        {
          personalityMapping:
            'forbidden',
        },
        {
          relationshipState:
            'forbidden',
        },
        {
          price: 9900,
        },
        {
          entitlement: true,
        },
      ]) {
        expect(() =>
          admitCharacterFaceCapabilityProfileV1({
            source:
              capabilitySource(),
            candidate: {
              ...capabilityCandidate(),
              ...injected,
            },
          }),
        ).toThrow(
          'contains unexpected field',
        );
      }
    });
  },
);
