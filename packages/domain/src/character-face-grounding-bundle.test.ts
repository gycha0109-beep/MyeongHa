import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  CHARACTER_FACE_REALIZATION_MODE_V1,
  CHARACTER_FACE_SOURCE_BINDING_SCHEMA_VERSION_V1,
  FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
  FACE_CHARACTER_GROUNDING_REF_SCHEMA_VERSION_V1,
  admitCharacterRuntimeFaceGroundingV1,
  type CharacterFaceRuntimeContextV1,
} from './character-face-grounding-admission.js';
import {
  FACE_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
  FACE_CHARACTER_NEUTRAL_REALIZATION_POLICY_V1,
  FACE_CHARACTER_REALIZATION_POLICY_REGISTRY_VERSION_V1,
  admitCharacterFaceGroundingBundleViewV1,
  hashCharacterFaceGroundingBundleMaterialV1,
  type CharacterFaceGroundingBundleViewV1,
} from './character-face-grounding-bundle.js';
import type {
  CharacterRuntimeContextV1,
} from './character-runtime-context.js';
import type {
  ResearchCharacterFaceGroundingV1,
} from './character-face-presentation.js';

const SOURCE_RESULT_HASH =
  `face-topic-source-result:${'a'.repeat(64)}`;
const PROJECTION_HASH =
  `face-product-projection:${'b'.repeat(64)}`;
const GROUNDING_HASH =
  `face-grounding:${'c'.repeat(64)}`;
const DISPLAY_FACTS_HASH =
  `face-display-facts:${'d'.repeat(64)}`;
const STRUCTURE_BUNDLE_HASH =
  'face-character-grounding:c9810b42d942c1ae655cd8db0e28583f169a761adf07c478885cddba2e74f6ba';

function runtimeContext():
  CharacterRuntimeContextV1 {
  return {
    characterId: 'character.alpha',
    saju: null,
  } as unknown as CharacterRuntimeContextV1;
}

function makeSource(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion:
      CHARACTER_FACE_SOURCE_BINDING_SCHEMA_VERSION_V1,
    topicKey:
      'face.discover.structure',
    readinessState: 'available',
    mode:
      CHARACTER_FACE_REALIZATION_MODE_V1,
    sourceResultHash:
      SOURCE_RESULT_HASH,
    projectionHash:
      PROJECTION_HASH,
    groundingHash:
      GROUNDING_HASH,
    displayFactsHash:
      DISPLAY_FACTS_HASH,
    bundleHash:
      STRUCTURE_BUNDLE_HASH,
    projectionVersion:
      FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
    unavailableSections: [],
    ...overrides,
  };
}

function makeRef(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
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
      STRUCTURE_BUNDLE_HASH,
    projectionVersion:
      FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
    ...overrides,
  };
}

function structureBundleWithoutHash() {
  const prohibitedInferences = [
    'medical_diagnosis',
    'personality_inference',
  ] as const;
  const prohibitedExtensions = [
    'medical_diagnosis',
    'personality_inference',
    'traditional_semantic_promotion_without_governed_claim',
  ] as const;

  return {
    schemaVersion:
      FACE_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
    projectionVersion:
      FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
    realizationPolicyRegistryVersion:
      FACE_CHARACTER_REALIZATION_POLICY_REGISTRY_VERSION_V1,
    topicKey:
      'face.discover.structure',
    readinessState: 'available' as const,
    faceEngineVersion:
      'face-observation-engine-fr293-v1',
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
          'neutral_observation' as const,
        capabilityKey:
          'eye.width_height_ratio',
        observationRef:
          'face-neutral-observation:v1:eye',
        displayFactRef:
          'face-display-fact:v1:eye',
        displayValue: {
          kind: 'scalar' as const,
          value: 0.42,
          unit: 'ratio' as const,
        },
        qualifiers: [
          'measurement_only',
        ],
        prohibitedExtensions: [
          ...prohibitedExtensions,
        ],
        realizationPolicyRef:
          FACE_CHARACTER_NEUTRAL_REALIZATION_POLICY_V1,
      },
      {
        unitId:
          `face-grounding-unit:${'2'.repeat(64)}`,
        kind:
          'neutral_observation' as const,
        capabilityKey:
          'nose.alar_width_and_nostril_geometry',
        observationRef:
          'face-neutral-observation:v1:nose',
        displayFactRef:
          'face-display-fact:v1:nose',
        displayValue: {
          kind:
            'composite_visible_nasal_geometry' as const,
          axes: [
            {
              axisKey:
                'alar_width_ratio',
              value: 0.31,
              unit: 'ratio' as const,
              sourceMetricRef:
                'metric:nose:alar_width_ratio',
            },
            {
              axisKey:
                'nostril_visibility_ratio',
              value: 0.18,
              unit: 'ratio' as const,
              sourceMetricRef:
                'metric:nose:nostril_visibility_ratio',
            },
          ],
        },
        qualifiers: [
          'measurement_only',
        ],
        prohibitedExtensions: [
          ...prohibitedExtensions,
        ],
        realizationPolicyRef:
          FACE_CHARACTER_NEUTRAL_REALIZATION_POLICY_V1,
      },
      {
        unitId:
          `face-grounding-unit:${'3'.repeat(64)}`,
        kind:
          'neutral_observation' as const,
        capabilityKey:
          'mouth.width_and_relative_size',
        observationRef:
          'face-neutral-observation:v1:mouth',
        displayFactRef:
          'face-display-fact:v1:mouth',
        displayValue: {
          kind:
            'continuous_axes' as const,
          axes: [
            {
              axisKey:
                'relative_size_ratio',
              value: 0.47,
              unit: 'ratio' as const,
              sourceMetricRef:
                'metric:mouth:relative_size_ratio',
            },
            {
              axisKey:
                'width_ratio',
              value: 0.55,
              unit: 'ratio' as const,
              sourceMetricRef:
                'metric:mouth:width_ratio',
            },
          ],
        },
        qualifiers: [
          'measurement_only',
        ],
        prohibitedExtensions: [
          ...prohibitedExtensions,
        ],
        realizationPolicyRef:
          FACE_CHARACTER_NEUTRAL_REALIZATION_POLICY_V1,
      },
      {
        unitId:
          `face-grounding-unit:${'4'.repeat(64)}`,
        kind:
          'neutral_observation' as const,
        capabilityKey:
          'chin_lower_face.visible_width_ratio',
        observationRef:
          'face-neutral-observation:v1:chin',
        displayFactRef:
          'face-display-fact:v1:chin',
        displayValue: {
          kind: 'scalar' as const,
          value: 0.51,
          unit: 'ratio' as const,
        },
        qualifiers: [
          'measurement_only',
        ],
        prohibitedExtensions: [
          ...prohibitedExtensions,
        ],
        realizationPolicyRef:
          FACE_CHARACTER_NEUTRAL_REALIZATION_POLICY_V1,
      },
    ],
    unavailableSections: [],
    prohibitedInferences: [
      ...prohibitedInferences,
    ],
  };
}

function makeStructureBundle(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...structureBundleWithoutHash(),
    bundleHash:
      STRUCTURE_BUNDLE_HASH,
    ...overrides,
  };
}

function rehashBundle(
  candidate: Record<string, unknown>,
): Record<string, unknown> {
  const {
    bundleHash: ignored,
    ...withoutHash
  } = candidate;
  void ignored;

  return {
    ...withoutHash,
    bundleHash:
      `face-character-grounding:${hashCharacterFaceGroundingBundleMaterialV1(
        withoutHash,
      )}`,
  };
}

function admittedContext(input?: {
  readonly topicKey?: string;
  readonly readinessState?:
    | 'available'
    | 'partial';
  readonly unavailableSections?:
    readonly string[];
  readonly bundleHash?: string;
}): CharacterFaceRuntimeContextV1 {
  const topicKey =
    input?.topicKey ??
    'face.discover.structure';
  const readinessState =
    input?.readinessState ??
    'available';
  const unavailableSections =
    input?.unavailableSections ??
    [];
  const bundleHash =
    input?.bundleHash ??
    STRUCTURE_BUNDLE_HASH;

  const result =
    admitCharacterRuntimeFaceGroundingV1(
      {
        context: runtimeContext(),
        source: makeSource({
          topicKey,
          readinessState,
          unavailableSections,
          bundleHash,
        }),
        groundingRef: makeRef({
          topicKey,
          bundleHash,
        }),
      },
    );

  if (result.face === null) {
    throw new Error(
      'expected admitted Face context',
    );
  }
  return result.face;
}

function makeResearchGrounding():
  ResearchCharacterFaceGroundingV1 {
  return {
    groundingVersion:
      'face-grounding-research-test-v1',
    faceReadingRef:
      'reading:research:test',
    faceEngineVersion:
      'face-research-engine-v1',
    methodologyPackRef:
      'face-fr3-research-pack-v0@0.1.0',
    semanticClaims: [
      {
        key:
          'face.five_officers.test',
        claimRef:
          'claim.research.test',
      },
    ],
    approvedNarrativeBlocks: [
      {
        key:
          'face.research.framing',
        text:
          '연구 단계 판독입니다.',
      },
    ],
    unavailableSections: [],
    prohibitedInferences: [
      'biometric_identity',
    ],
    authorityState:
      'research_only',
    assertionAuthority:
      'research_fixture',
    evidenceRefs: [
      'fixture:research:test',
    ],
    semanticSignature:
      'face-research@test',
  };
}

describe(
  'TOPIC-FACE-005C-A full production Face grounding bundle admission',
  () => {
    it('matches the fixed Saju source canonical hash golden vector', () => {
      expect(
        hashCharacterFaceGroundingBundleMaterialV1(
          structureBundleWithoutHash(),
        ),
      ).toBe(
        'c9810b42d942c1ae655cd8db0e28583f169a761adf07c478885cddba2e74f6ba',
      );
    });

    it('admits the exact four-unit structure bundle against the admitted 005B context', () => {
      const admitted =
        admitCharacterFaceGroundingBundleViewV1(
          {
            candidate:
              makeStructureBundle(),
            context:
              admittedContext(),
          },
        );

      expect(admitted.units).toHaveLength(4);
      expect(
        admitted.units.map(
          (unit) =>
            unit.capabilityKey,
        ),
      ).toEqual([
        'eye.width_height_ratio',
        'nose.alar_width_and_nostril_geometry',
        'mouth.width_and_relative_size',
        'chin_lower_face.visible_width_ratio',
      ]);
      expect(
        admitted.bundleHash,
      ).toBe(
        STRUCTURE_BUNDLE_HASH,
      );
      expect(
        Object.isFrozen(admitted),
      ).toBe(true);
      expect(
        Object.isFrozen(admitted.units),
      ).toBe(true);
      expect(
        Object.isFrozen(
          admitted.units[1]
            ?.displayValue,
        ),
      ).toBe(true);
    });

    it('preserves source display values without classifying them', () => {
      const admitted =
        admitCharacterFaceGroundingBundleViewV1(
          {
            candidate:
              makeStructureBundle(),
            context:
              admittedContext(),
          },
        );

      const eye =
        admitted.units.find(
          (unit) =>
            unit.capabilityKey ===
            'eye.width_height_ratio',
        );
      expect(eye?.displayValue).toEqual({
        kind: 'scalar',
        value: 0.42,
        unit: 'ratio',
      });
      expect(
        Object.keys(eye ?? {}),
      ).not.toContain(
        'classification',
      );
      expect(
        Object.keys(eye ?? {}),
      ).not.toContain(
        'personality',
      );
    });

    it('admits partial extended grounding only when topic, readiness and unavailable sections match the admitted context', () => {
      const unavailableSections = [
        'observation:forehead.visible_width_shape',
      ];
      const candidate = rehashBundle({
        ...makeStructureBundle(),
        topicKey:
          'face.discover.extended',
        readinessState: 'partial',
        unavailableSections,
      });
      const bundleHash =
        candidate.bundleHash as string;

      const admitted =
        admitCharacterFaceGroundingBundleViewV1(
          {
            candidate,
            context:
              admittedContext({
                topicKey:
                  'face.discover.extended',
                readinessState:
                  'partial',
                unavailableSections,
                bundleHash,
              }),
          },
        );

      expect(
        admitted.readinessState,
      ).toBe('partial');
      expect(
        admitted.unavailableSections,
      ).toEqual(unavailableSections);
      expect(admitted.units).toHaveLength(4);
    });

    it('rejects a valid self-hashed bundle when its semantic identity belongs to another admitted ref', () => {
      const forged = rehashBundle({
        ...makeStructureBundle(),
        sourceResultHash:
          `face-topic-source-result:${'f'.repeat(
            64,
          )}`,
      });

      expect(() =>
        admitCharacterFaceGroundingBundleViewV1(
          {
            candidate: forged,
            context:
              admittedContext({
                bundleHash:
                  forged.bundleHash as string,
              }),
          },
        ),
      ).toThrow(
        'sourceResultHash does not match the admitted grounding ref',
      );
    });

    it('rejects a wrong bundle hash even when every other field is well formed', () => {
      expect(() =>
        admitCharacterFaceGroundingBundleViewV1(
          {
            candidate:
              makeStructureBundle({
                bundleHash:
                  `face-character-grounding:${'0'.repeat(
                    64,
                  )}`,
              }),
            context:
              admittedContext({
                bundleHash:
                  `face-character-grounding:${'0'.repeat(
                    64,
                  )}`,
              }),
          },
        ),
      ).toThrow(
        'hash does not match source-compatible bundle material',
      );
    });

    it('rejects readiness and unavailable-section drift against the admitted context', () => {
      expect(() =>
        admitCharacterFaceGroundingBundleViewV1(
          {
            candidate:
              makeStructureBundle(),
            context: {
              ...admittedContext(),
              readinessState:
                'partial',
            },
          },
        ),
      ).toThrow(
        'readinessState does not match the admitted Face context',
      );

      expect(() =>
        admitCharacterFaceGroundingBundleViewV1(
          {
            candidate:
              makeStructureBundle(),
            context: {
              ...admittedContext(),
              unavailableSections: [
                'observation:forged',
              ],
            },
          },
        ),
      ).toThrow(
        'unavailableSections does not match the admitted Face context',
      );
    });

    it('rejects duplicate source identities and non-deterministic unit order', () => {
      const source =
        structureBundleWithoutHash();

      expect(() =>
        admitCharacterFaceGroundingBundleViewV1(
          {
            candidate:
              rehashBundle({
                ...makeStructureBundle(),
                units: [
                  source.units[0],
                  source.units[0],
                  ...source.units.slice(2),
                ],
              }),
            context:
              admittedContext(),
          },
        ),
      ).toThrow(
        'duplicate unitId',
      );

      expect(() =>
        admitCharacterFaceGroundingBundleViewV1(
          {
            candidate:
              rehashBundle({
                ...makeStructureBundle(),
                units: [
                  source.units[1],
                  source.units[0],
                  ...source.units.slice(2),
                ],
              }),
            context:
              admittedContext(),
          },
        ),
      ).toThrow(
        'source deterministic order',
      );
    });

    it('rejects unsupported display kinds, non-finite values and non-deterministic axes', () => {
      const source =
        structureBundleWithoutHash();
      const first = source.units[0]!;
      const nose = source.units[1]!;

      for (const badDisplayValue of [
        {
          kind:
            'classified_size',
          value: 'large',
        },
        {
          kind: 'scalar',
          value:
            Number.POSITIVE_INFINITY,
          unit: 'ratio',
        },
      ]) {
        expect(() =>
          admitCharacterFaceGroundingBundleViewV1(
            {
              candidate:
                rehashBundle({
                  ...makeStructureBundle(),
                  units: [
                    {
                      ...first,
                      displayValue:
                        badDisplayValue,
                    },
                    ...source.units.slice(1),
                  ],
                }),
              context:
                admittedContext(),
            },
          ),
        ).toThrow();
      }

      const noseAxes =
        nose.displayValue.kind ===
          'composite_visible_nasal_geometry'
          ? nose.displayValue.axes
          : [];

      expect(() =>
        admitCharacterFaceGroundingBundleViewV1(
          {
            candidate:
              rehashBundle({
                ...makeStructureBundle(),
                units: [
                  first,
                  {
                    ...nose,
                    displayValue: {
                      ...nose.displayValue,
                      axes: [
                        noseAxes[1],
                        noseAxes[0],
                      ],
                    },
                  },
                  ...source.units.slice(2),
                ],
              }),
            context:
              admittedContext(),
          },
        ),
      ).toThrow(
        'source deterministic sort order',
      );
    });

    it('rejects policy widening and removal of source prohibitions', () => {
      const source =
        structureBundleWithoutHash();
      const first = source.units[0]!;

      expect(() =>
        admitCharacterFaceGroundingBundleViewV1(
          {
            candidate:
              rehashBundle({
                ...makeStructureBundle(),
                units: [
                  {
                    ...first,
                    realizationPolicyRef:
                      'bounded_semantic_paraphrase_v1',
                  },
                  ...source.units.slice(1),
                ],
              }),
            context:
              admittedContext(),
          },
        ),
      ).toThrow(
        'realizationPolicyRef is not source-authorized',
      );

      expect(() =>
        admitCharacterFaceGroundingBundleViewV1(
          {
            candidate:
              rehashBundle({
                ...makeStructureBundle(),
                units: [
                  {
                    ...first,
                    prohibitedExtensions:
                      first.prohibitedExtensions.filter(
                        (value) =>
                          value !==
                          'personality_inference',
                      ),
                  },
                  ...source.units.slice(1),
                ],
              }),
            context:
              admittedContext(),
          },
        ),
      ).toThrow(
        'removed bundle prohibition',
      );

      expect(() =>
        admitCharacterFaceGroundingBundleViewV1(
          {
            candidate:
              rehashBundle({
                ...makeStructureBundle(),
                units: [
                  {
                    ...first,
                    prohibitedExtensions:
                      first.prohibitedExtensions.filter(
                        (value) =>
                          value !==
                          'traditional_semantic_promotion_without_governed_claim',
                      ),
                  },
                  ...source.units.slice(1),
                ],
              }),
            context:
              admittedContext(),
          },
        ),
      ).toThrow(
        'neutral-to-traditional promotion prohibition',
      );
    });

    it('rejects semantic, privacy, Character, Commerce and request widening', () => {
      const source =
        structureBundleWithoutHash();
      const first = source.units[0]!;

      for (const injected of [
        {
          semanticClaims: [
            'forbidden',
          ],
        },
        {
          personality:
            'forbidden',
        },
        {
          rawImage:
            'forbidden',
        },
        {
          rawLandmarks: [
            [0.1, 0.2],
          ],
        },
        {
          characterId:
            'character.forbidden',
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
        {
          requestId:
            'request.forbidden',
        },
      ]) {
        expect(() =>
          admitCharacterFaceGroundingBundleViewV1(
            {
              candidate: {
                ...makeStructureBundle(),
                ...injected,
              },
              context:
                admittedContext(),
            },
          ),
        ).toThrow(
          'contains unexpected field',
        );
      }

      expect(() =>
        admitCharacterFaceGroundingBundleViewV1(
          {
            candidate:
              rehashBundle({
                ...makeStructureBundle(),
                units: [
                  {
                    ...first,
                    personality:
                      'forbidden',
                  },
                  ...source.units.slice(1),
                ],
              }),
            context:
              admittedContext(),
          },
        ),
      ).toThrow(
        'contains unexpected field',
      );
    });

    it('rejects legacy research-only Face grounding as a production-neutral full bundle', () => {
      expect(() =>
        admitCharacterFaceGroundingBundleViewV1(
          {
            candidate:
              makeResearchGrounding(),
            context:
              admittedContext(),
          },
        ),
      ).toThrow();
    });

    it('rejects malformed source contract versions and protected hashes', () => {
      for (const candidate of [
        makeStructureBundle({
          schemaVersion:
            'face-character-grounding-v2',
        }),
        makeStructureBundle({
          projectionVersion:
            'face-character-grounding-projection-v2',
        }),
        makeStructureBundle({
          realizationPolicyRegistryVersion:
            'face-character-realization-policy-v2',
        }),
        makeStructureBundle({
          sourceResultHash:
            'face-topic-source-result:not-a-hash',
        }),
      ]) {
        expect(() =>
          admitCharacterFaceGroundingBundleViewV1(
            {
              candidate,
              context:
                admittedContext(),
            },
          ),
        ).toThrow();
      }
    });
  },
);
