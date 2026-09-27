import {
  describe,
  expect,
  it,
} from 'vitest';

import type {
  CharacterRuntimeContextV1,
} from './character-runtime-context.js';
import {
  CHARACTER_FACE_CAPABILITY_SCHEMA_VERSION_V1,
  CHARACTER_FACE_CAPABILITY_SOURCE_SCHEMA_VERSION_V1,
  admitCharacterFaceCapabilityProfileV1,
  type CharacterFaceCapabilityProfileV1,
} from './character-face-capability.js';
import {
  CHARACTER_FACE_CONTEXT_SCHEMA_VERSION_V1,
  CHARACTER_FACE_REALIZATION_MODE_V1,
  CHARACTER_FACE_SOURCE_BINDING_SCHEMA_VERSION_V1,
  FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
  FACE_CHARACTER_GROUNDING_REF_SCHEMA_VERSION_V1,
  admitCharacterRuntimeFaceGroundingV1,
  type CharacterRuntimeContextWithFaceGroundingV1,
} from './character-face-grounding-admission.js';
import {
  FACE_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
  FACE_CHARACTER_NEUTRAL_REALIZATION_POLICY_V1,
  FACE_CHARACTER_REALIZATION_POLICY_REGISTRY_VERSION_V1,
  hashCharacterFaceGroundingBundleMaterialV1,
} from './character-face-grounding-bundle.js';
import {
  CHARACTER_FACE_ATTENTION_REGISTRY_VERSION_V1,
  CHARACTER_FACE_PERSPECTIVE_SCHEMA_VERSION_V1,
  CHARACTER_FACE_PERSPECTIVE_SOURCE_SCHEMA_VERSION_V1,
  admitCharacterFacePerspectiveProfileV1,
  type CharacterFacePerspectiveProfileV1,
} from './character-face-perspective.js';
import {
  CHARACTER_FACE_INSIGHT_SELECTION_SCHEMA_VERSION_V1,
  selectCharacterFaceInsightsV1,
} from './character-face-insight-selector.js';

const SOURCE_RESULT_HASH =
  `face-topic-source-result:${'a'.repeat(64)}`;
const PROJECTION_HASH =
  `face-product-projection:${'b'.repeat(64)}`;
const GROUNDING_HASH =
  `face-grounding:${'c'.repeat(64)}`;
const DISPLAY_FACTS_HASH =
  `face-display-facts:${'d'.repeat(64)}`;

const REQUIRED_PROHIBITION =
  'traditional_semantic_promotion_without_governed_claim';

function unit(
  ordinal: number,
  capabilityKey: string,
) {
  const digit = String(ordinal);
  return {
    unitId:
      `face-grounding-unit:${digit.repeat(64)}`,
    kind:
      'neutral_observation' as const,
    capabilityKey,
    observationRef:
      `face-neutral-observation:v1:${ordinal}`,
    displayFactRef:
      `face-display-fact:v1:${ordinal}`,
    displayValue: {
      kind: 'scalar' as const,
      value: 0.1 + ordinal / 10,
      unit: 'ratio' as const,
    },
    qualifiers: [],
    prohibitedExtensions: [
      REQUIRED_PROHIBITION,
    ],
    realizationPolicyRef:
      FACE_CHARACTER_NEUTRAL_REALIZATION_POLICY_V1,
  };
}

function bundleCandidate(input?: {
  readonly topicKey?: string;
  readonly readinessState?:
    | 'available'
    | 'partial';
  readonly unavailableSections?:
    readonly string[];
  readonly units?: readonly ReturnType<typeof unit>[];
}) {
  const withoutHash = {
    schemaVersion:
      FACE_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
    projectionVersion:
      FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
    realizationPolicyRegistryVersion:
      FACE_CHARACTER_REALIZATION_POLICY_REGISTRY_VERSION_V1,
    topicKey:
      input?.topicKey ??
      'face.discover.structure',
    readinessState:
      input?.readinessState ??
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
    units:
      input?.units ?? [
        unit(
          1,
          'eye.width_height_ratio',
        ),
        unit(
          2,
          'nose.alar_width_and_nostril_geometry',
        ),
        unit(
          3,
          'mouth.width_and_relative_size',
        ),
        unit(
          4,
          'chin_lower_face.visible_width_ratio',
        ),
      ],
    unavailableSections:
      input?.unavailableSections ??
      [],
    prohibitedInferences: [],
  };

  return {
    ...withoutHash,
    bundleHash:
      `face-character-grounding:${hashCharacterFaceGroundingBundleMaterialV1(
        withoutHash,
      )}`,
  };
}

function baseRuntimeContext(
  characterId: string,
  relationshipRevision: number,
): CharacterRuntimeContextV1 {
  return {
    characterId,
    contentVersion:
      characterId === 'character.beta'
        ? 'character-content-beta-v1'
        : 'character-content-alpha-v1',
    relationship: {
      relationshipRevision,
      relationshipPolicyVersion:
        'relationship-policy-test-v1',
      projectionPolicyVersion:
        'projection-policy-test-v1',
      behaviorVersion:
        'behavior-test-v1',
    },
    saju: null,
  } as unknown as CharacterRuntimeContextV1;
}

function runtimeContext(input?: {
  readonly characterId?: string;
  readonly relationshipRevision?: number;
  readonly bundle?: ReturnType<
    typeof bundleCandidate
  >;
}): CharacterRuntimeContextWithFaceGroundingV1 {
  const characterId =
    input?.characterId ??
    'character.alpha';
  const bundle =
    input?.bundle ??
    bundleCandidate();

  return admitCharacterRuntimeFaceGroundingV1({
    context:
      baseRuntimeContext(
        characterId,
        input?.relationshipRevision ??
          1,
      ),
    source: {
      schemaVersion:
        CHARACTER_FACE_SOURCE_BINDING_SCHEMA_VERSION_V1,
      topicKey:
        bundle.topicKey,
      readinessState:
        bundle.readinessState,
      mode:
        CHARACTER_FACE_REALIZATION_MODE_V1,
      sourceResultHash:
        bundle.sourceResultHash,
      projectionHash:
        bundle.projectionHash,
      groundingHash:
        bundle.groundingHash,
      displayFactsHash:
        bundle.displayFactsHash,
      bundleHash:
        bundle.bundleHash,
      projectionVersion:
        FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
      unavailableSections:
        bundle.unavailableSections,
    },
    groundingRef: {
      schemaVersion:
        FACE_CHARACTER_GROUNDING_REF_SCHEMA_VERSION_V1,
      topicKey:
        bundle.topicKey,
      sourceResultHash:
        bundle.sourceResultHash,
      projectionHash:
        bundle.projectionHash,
      groundingHash:
        bundle.groundingHash,
      displayFactsHash:
        bundle.displayFactsHash,
      bundleHash:
        bundle.bundleHash,
      projectionVersion:
        FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
    },
  });
}

function capability(
  input?: {
    readonly characterId?: string;
    readonly contentVersion?: string;
    readonly faceProfileVersion?: string;
    readonly allowedTopicKeys?: readonly (
      | 'face.discover.structure'
      | 'face.discover.extended'
    )[];
    readonly allowPartial?: boolean;
  },
): CharacterFaceCapabilityProfileV1 {
  const characterId =
    input?.characterId ??
    'character.alpha';
  const contentVersion =
    input?.contentVersion ??
    'character-content-alpha-v1';
  const faceProfileVersion =
    input?.faceProfileVersion ??
    'face-profile-alpha-v1';
  const allowedTopicKeys =
    input?.allowedTopicKeys ?? [
      'face.discover.structure',
      'face.discover.extended',
    ];
  const allowPartial =
    input?.allowPartial ?? true;

  const source = {
    schemaVersion:
      CHARACTER_FACE_CAPABILITY_SOURCE_SCHEMA_VERSION_V1,
    capabilityVersion:
      'face-capability-alpha-v1',
    characterId,
    contentVersion,
    faceProfileVersion,
    allowedTopicKeys,
    allowedModes: [
      CHARACTER_FACE_REALIZATION_MODE_V1,
    ],
    allowPartial,
    canInitiate: false,
  };

  return admitCharacterFaceCapabilityProfileV1({
    source,
    candidate: {
      schemaVersion:
        CHARACTER_FACE_CAPABILITY_SCHEMA_VERSION_V1,
      capabilityVersion:
        source.capabilityVersion,
      characterId,
      sourceContentVersion:
        contentVersion,
      sourceFaceProfileVersion:
        faceProfileVersion,
      allowedTopicKeys,
      allowedModes:
        source.allowedModes,
      allowPartial,
      canInitiate: false,
    },
  });
}

function perspective(input?: {
  readonly characterId?: string;
  readonly contentVersion?: string;
  readonly faceProfileVersion?: string;
  readonly perspectiveVersion?: string;
  readonly attentionOrder?: readonly (
    | 'eye.width_height_ratio'
    | 'nose.alar_width_and_nostril_geometry'
    | 'mouth.width_and_relative_size'
    | 'chin_lower_face.visible_width_ratio'
    | 'forehead.visible_width_shape'
  )[];
  readonly maxUnits?: number;
}): CharacterFacePerspectiveProfileV1 {
  const characterId =
    input?.characterId ??
    'character.alpha';
  const contentVersion =
    input?.contentVersion ??
    'character-content-alpha-v1';
  const faceProfileVersion =
    input?.faceProfileVersion ??
    'face-profile-alpha-v1';
  const perspectiveVersion =
    input?.perspectiveVersion ??
    'face-perspective-alpha-v1';
  const attentionOrder =
    input?.attentionOrder ?? [
      'mouth.width_and_relative_size',
      'eye.width_height_ratio',
      'nose.alar_width_and_nostril_geometry',
      'chin_lower_face.visible_width_ratio',
    ];
  const maxUnits =
    input?.maxUnits ?? 4;

  const source = {
    schemaVersion:
      CHARACTER_FACE_PERSPECTIVE_SOURCE_SCHEMA_VERSION_V1,
    perspectiveVersion,
    characterId,
    contentVersion,
    faceProfileVersion,
    attentionOrder,
    maxUnits,
    uncertaintyHandling:
      'state_directly' as const,
  };

  return admitCharacterFacePerspectiveProfileV1({
    source,
    candidate: {
      schemaVersion:
        CHARACTER_FACE_PERSPECTIVE_SCHEMA_VERSION_V1,
      perspectiveVersion,
      characterId,
      sourceContentVersion:
        contentVersion,
      sourceFaceProfileVersion:
        faceProfileVersion,
      groundingProjectionVersion:
        FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
      attentionRegistryVersion:
        CHARACTER_FACE_ATTENTION_REGISTRY_VERSION_V1,
      attentionOrder,
      selection: {
        maxUnits,
        avoidDuplicateCapability:
          true,
        preserveSourceOrderForTies:
          true,
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
    },
  });
}

function select(input?: {
  readonly bundle?: ReturnType<
    typeof bundleCandidate
  >;
  readonly context?: CharacterRuntimeContextWithFaceGroundingV1;
  readonly capability?: CharacterFaceCapabilityProfileV1;
  readonly perspective?: CharacterFacePerspectiveProfileV1;
  readonly characterContentVersion?: string;
}) {
  const bundle =
    input?.bundle ??
    bundleCandidate();
  return selectCharacterFaceInsightsV1({
    context:
      input?.context ??
      runtimeContext({ bundle }),
    grounding: bundle,
    characterContentVersion:
      input?.characterContentVersion ??
      'character-content-alpha-v1',
    capability:
      input?.capability ??
      capability(),
    perspective:
      input?.perspective ??
      perspective(),
  });
}

describe(
  'TOPIC-FACE-005D deterministic production Face insight selector',
  () => {
    it('selects all four structure units while separating source order from Perspective order', () => {
      const result = select();

      expect(result.schemaVersion).toBe(
        CHARACTER_FACE_INSIGHT_SELECTION_SCHEMA_VERSION_V1,
      );
      expect(
        result.selectedUnitIds,
      ).toEqual([
        `face-grounding-unit:${'1'.repeat(64)}`,
        `face-grounding-unit:${'2'.repeat(64)}`,
        `face-grounding-unit:${'3'.repeat(64)}`,
        `face-grounding-unit:${'4'.repeat(64)}`,
      ]);
      expect(
        result.orderedUnitIds,
      ).toEqual([
        `face-grounding-unit:${'3'.repeat(64)}`,
        `face-grounding-unit:${'1'.repeat(64)}`,
        `face-grounding-unit:${'2'.repeat(64)}`,
        `face-grounding-unit:${'4'.repeat(64)}`,
      ]);
      expect(
        result.omittedUnitIds,
      ).toEqual([]);
      expect(result.coverage).toBe('full');
    });

    it('applies maxUnits without letting omitted units disappear from the source partition', () => {
      const result = select({
        perspective:
          perspective({
            maxUnits: 2,
          }),
      });

      expect(
        result.orderedUnitIds,
      ).toEqual([
        `face-grounding-unit:${'3'.repeat(64)}`,
        `face-grounding-unit:${'1'.repeat(64)}`,
      ]);
      expect(
        result.selectedUnitIds,
      ).toEqual([
        `face-grounding-unit:${'1'.repeat(64)}`,
        `face-grounding-unit:${'3'.repeat(64)}`,
      ]);
      expect(
        result.omittedUnitIds,
      ).toEqual([
        `face-grounding-unit:${'2'.repeat(64)}`,
        `face-grounding-unit:${'4'.repeat(64)}`,
      ]);

      const omittedCodes =
        new Map(
          result.selectionReasons.map(
            (reason) => [
              reason.unitId,
              reason.codes,
            ],
          ),
        );
      expect(
        omittedCodes.get(
          `face-grounding-unit:${'2'.repeat(64)}`,
        ),
      ).toEqual([
        'max_units_exhausted',
      ]);
      expect(
        omittedCodes.get(
          `face-grounding-unit:${'4'.repeat(64)}`,
        ),
      ).toEqual([
        'max_units_exhausted',
      ]);
    });

    it('omits source units that the Perspective does not mention', () => {
      const result = select({
        perspective:
          perspective({
            attentionOrder: [
              'mouth.width_and_relative_size',
              'eye.width_height_ratio',
            ],
            maxUnits: 2,
          }),
      });

      const reasons =
        new Map(
          result.selectionReasons.map(
            (reason) => [
              reason.capabilityKey,
              reason.codes,
            ],
          ),
        );

      expect(
        reasons.get(
          'nose.alar_width_and_nostril_geometry',
        ),
      ).toEqual([
        'not_selected_by_perspective',
      ]);
      expect(
        reasons.get(
          'chin_lower_face.visible_width_ratio',
        ),
      ).toEqual([
        'not_selected_by_perspective',
      ]);
    });

    it('resolves unavailable forehead without fabricating a unit or consuming quota', () => {
      const unavailableSections = [
        'observation:forehead.visible_width_shape',
      ];
      const bundle =
        bundleCandidate({
          topicKey:
            'face.discover.extended',
          readinessState:
            'partial',
          unavailableSections,
        });
      const result = select({
        bundle,
        context:
          runtimeContext({ bundle }),
        perspective:
          perspective({
            attentionOrder: [
              'forehead.visible_width_shape',
              'mouth.width_and_relative_size',
              'eye.width_height_ratio',
            ],
            maxUnits: 2,
          }),
      });

      expect(result.coverage).toBe('partial');
      expect(
        result.orderedUnitIds,
      ).toEqual([
        `face-grounding-unit:${'3'.repeat(64)}`,
        `face-grounding-unit:${'1'.repeat(64)}`,
      ]);
      expect(
        result.attentionResolutions[0],
      ).toEqual({
        attentionKey:
          'forehead.visible_width_shape',
        status: 'unavailable',
      });
      expect(
        result.selectedUnitIds,
      ).toHaveLength(2);
    });

    it('distinguishes an authored attention key that is absent but not source-declared unavailable', () => {
      const result = select({
        perspective:
          perspective({
            attentionOrder: [
              'forehead.visible_width_shape',
            ],
            maxUnits: 1,
          }),
      });

      expect(
        result.selectedUnitIds,
      ).toEqual([]);
      expect(
        result.attentionResolutions,
      ).toEqual([
        {
          attentionKey:
            'forehead.visible_width_shape',
          status: 'not_present',
        },
      ]);
      expect(
        result.omittedUnitIds,
      ).toHaveLength(4);
    });

    it('allows an empty-but-explained selection when the only authored attention target is unavailable', () => {
      const unavailableSections = [
        'observation:forehead.visible_width_shape',
      ];
      const bundle =
        bundleCandidate({
          topicKey:
            'face.discover.extended',
          readinessState:
            'partial',
          unavailableSections,
        });

      const result = select({
        bundle,
        context:
          runtimeContext({ bundle }),
        perspective:
          perspective({
            attentionOrder: [
              'forehead.visible_width_shape',
            ],
            maxUnits: 1,
          }),
      });

      expect(
        result.selectedUnitIds,
      ).toEqual([]);
      expect(
        result.orderedUnitIds,
      ).toEqual([]);
      expect(
        result.attentionResolutions,
      ).toEqual([
        {
          attentionKey:
            'forehead.visible_width_shape',
          status: 'unavailable',
        },
      ]);
    });

    it('suppresses duplicate source capability units deterministically', () => {
      const bundle =
        bundleCandidate({
          units: [
            unit(
              1,
              'eye.width_height_ratio',
            ),
            unit(
              2,
              'eye.width_height_ratio',
            ),
            unit(
              3,
              'mouth.width_and_relative_size',
            ),
            unit(
              4,
              'chin_lower_face.visible_width_ratio',
            ),
          ],
        });

      const result = select({
        bundle,
        context:
          runtimeContext({ bundle }),
        perspective:
          perspective({
            attentionOrder: [
              'eye.width_height_ratio',
              'mouth.width_and_relative_size',
              'chin_lower_face.visible_width_ratio',
            ],
            maxUnits: 3,
          }),
      });

      expect(
        result.orderedUnitIds[0],
      ).toBe(
        `face-grounding-unit:${'1'.repeat(64)}`,
      );

      const duplicate =
        result.selectionReasons.find(
          (reason) =>
            reason.unitId ===
            `face-grounding-unit:${'2'.repeat(64)}`,
        );
      expect(duplicate).toEqual({
        unitId:
          `face-grounding-unit:${'2'.repeat(64)}`,
        capabilityKey:
          'eye.width_height_ratio',
        disposition: 'omitted',
        codes: [
          'duplicate_capability_omitted',
        ],
      });
    });

    it('does not auto-select a future source capability that is absent from the Perspective registry', () => {
      const bundle =
        bundleCandidate({
          units: [
            unit(
              1,
              'eye.width_height_ratio',
            ),
            unit(
              2,
              'future.face.capability',
            ),
            unit(
              3,
              'mouth.width_and_relative_size',
            ),
            unit(
              4,
              'chin_lower_face.visible_width_ratio',
            ),
          ],
        });

      const result = select({
        bundle,
        context:
          runtimeContext({ bundle }),
      });

      const future =
        result.selectionReasons.find(
          (reason) =>
            reason.capabilityKey ===
            'future.face.capability',
        );

      expect(future).toEqual({
        unitId:
          `face-grounding-unit:${'2'.repeat(64)}`,
        capabilityKey:
          'future.face.capability',
        disposition: 'omitted',
        codes: [
          'not_selected_by_perspective',
        ],
      });
    });

    it('is deterministic for repeated identical inputs', () => {
      const first = select();
      const second = select();

      expect(second).toEqual(first);
    });

    it('is invariant to relationship revision changes', () => {
      const bundle =
        bundleCandidate();
      const first = select({
        bundle,
        context:
          runtimeContext({
            bundle,
            relationshipRevision: 1,
          }),
      });
      const second = select({
        bundle,
        context:
          runtimeContext({
            bundle,
            relationshipRevision: 999,
          }),
      });

      expect(second).toEqual(first);
    });

    it('lets two Characters order the same source bundle differently without changing source identity', () => {
      const bundle =
        bundleCandidate();

      const alpha = select({
        bundle,
        context:
          runtimeContext({
            bundle,
            characterId:
              'character.alpha',
          }),
        capability:
          capability({
            characterId:
              'character.alpha',
          }),
        perspective:
          perspective({
            characterId:
              'character.alpha',
            perspectiveVersion:
              'face-perspective-alpha-v1',
            attentionOrder: [
              'mouth.width_and_relative_size',
              'eye.width_height_ratio',
              'nose.alar_width_and_nostril_geometry',
              'chin_lower_face.visible_width_ratio',
            ],
          }),
      });

      const beta = select({
        bundle,
        context:
          runtimeContext({
            bundle,
            characterId:
              'character.beta',
          }),
        characterContentVersion:
          'character-content-beta-v1',
        capability:
          capability({
            characterId:
              'character.beta',
            contentVersion:
              'character-content-beta-v1',
            faceProfileVersion:
              'face-profile-beta-v1',
          }),
        perspective:
          perspective({
            characterId:
              'character.beta',
            contentVersion:
              'character-content-beta-v1',
            faceProfileVersion:
              'face-profile-beta-v1',
            perspectiveVersion:
              'face-perspective-beta-v1',
            attentionOrder: [
              'chin_lower_face.visible_width_ratio',
              'nose.alar_width_and_nostril_geometry',
              'eye.width_height_ratio',
              'mouth.width_and_relative_size',
            ],
          }),
      });

      expect(alpha.bundleHash).toBe(
        beta.bundleHash,
      );
      expect(
        alpha.selectedUnitIds,
      ).toEqual(
        beta.selectedUnitIds,
      );
      expect(
        alpha.orderedUnitIds,
      ).not.toEqual(
        beta.orderedUnitIds,
      );
    });

    it('fails closed when Face context is absent', () => {
      const context = {
        ...runtimeContext(),
        face: null,
      };

      expect(() =>
        select({
          context,
        }),
      ).toThrow(
        'requires an admitted Face context',
      );
    });

    it('fails closed when the full grounding does not match the admitted context', () => {
      const first =
        bundleCandidate();
      const second =
        bundleCandidate({
          units: [
            unit(
              1,
              'eye.width_height_ratio',
            ),
            unit(
              2,
              'nose.alar_width_and_nostril_geometry',
            ),
            unit(
              3,
              'mouth.width_and_relative_size',
            ),
          ],
        });

      expect(() =>
        select({
          bundle: second,
          context:
            runtimeContext({
              bundle: first,
            }),
        }),
      ).toThrow();
    });

    it('fails closed when Character Face capability denies the active source', () => {
      expect(() =>
        select({
          capability:
            capability({
              allowedTopicKeys: [
                'face.discover.extended',
              ],
            }),
        }),
      ).toThrow(
        'Character Face capability denied: TOPIC_NOT_ALLOWED',
      );
    });

    it('fails closed on Character/content identity mismatches', () => {
      expect(() =>
        select({
          capability:
            capability({
              characterId:
                'character.other',
            }),
        }),
      ).toThrow(
        'Character Face capability denied: CHARACTER_ID_MISMATCH',
      );

      expect(() =>
        select({
          characterContentVersion:
            'stale-content',
        }),
      ).toThrow(
        'Character Face selection contentVersion does not match the active Character runtime context',
      );
    });

    it('fails closed when Capability and Perspective are authored for different Characters', () => {
      expect(() =>
        select({
          perspective:
            perspective({
              characterId:
                'character.other',
            }),
        }),
      ).toThrow(
        'Capability/Perspective identity mismatch',
      );
    });

    it('rejects forged runtime capability or Perspective scope expansion before selection', () => {
      const forgedCapability = {
        ...capability(),
        allowedTopicKeys: [
          'face.reading.three_divisions',
        ],
      } as unknown as CharacterFaceCapabilityProfileV1;

      expect(() =>
        select({
          capability:
            forgedCapability,
        }),
      ).toThrow(
        'unsupported or duplicate topic keys',
      );

      const forgedPerspective = {
        ...perspective(),
        attentionRegistryVersion:
          'character-face-attention-registry-v2',
      } as unknown as CharacterFacePerspectiveProfileV1;

      expect(() =>
        select({
          perspective:
            forgedPerspective,
        }),
      ).toThrow(
        'attention registry version is not supported',
      );
    });

    it('rejects a selection content version that differs from the active Character runtime context', () => {
      expect(() =>
        select({
          characterContentVersion:
            'character-content-beta-v1',
        }),
      ).toThrow(
        'contentVersion does not match the active Character runtime context',
      );
    });

    it('does not copy display values, semantics, relationship or Commerce metadata into the selection artifact', () => {
      const result = select();
      const keys = new Set(
        JSON.stringify(result)
          .match(
            /"([^"]+)":/gu,
          )
          ?.map((match) =>
            match.slice(1, -2),
          ) ?? [],
      );

      for (const forbidden of [
        'displayValue',
        'qualifiers',
        'prohibitedExtensions',
        'semanticClaims',
        'personality',
        'fortune',
        'relationship',
        'price',
        'entitlement',
        'requestId',
      ]) {
        expect(
          keys.has(forbidden),
        ).toBe(false);
      }
    });
  },
);
