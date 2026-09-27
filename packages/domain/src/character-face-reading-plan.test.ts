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
  CHARACTER_FACE_READING_PLAN_DECISION_SCHEMA_VERSION_V1,
  CHARACTER_FACE_READING_PLAN_SCHEMA_VERSION_V1,
  buildCharacterFaceReadingPlanDecisionV1,
} from './character-face-reading-plan.js';

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

function baseRuntimeContext(input?: {
  readonly characterId?: string;
  readonly contentVersion?: string;
  readonly relationshipRevision?: number;
  readonly preferredQuestionStrategies?:
    readonly string[];
}): CharacterRuntimeContextV1 {
  const characterId =
    input?.characterId ??
    'character.alpha';
  const contentVersion =
    input?.contentVersion ??
    'character-content-alpha-v1';

  return {
    schemaVersion: 'v1',
    characterId,
    contentVersion,
    persona: {
      questioning: {
        preferredStrategies:
          input?.preferredQuestionStrategies ??
          [
            'ask_current_context',
            'ask_recent_change',
          ],
      },
    },
    relationship: {
      relationshipRevision:
        input?.relationshipRevision ??
        1,
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
  readonly contentVersion?: string;
  readonly relationshipRevision?: number;
  readonly preferredQuestionStrategies?:
    readonly string[];
  readonly bundle?: ReturnType<
    typeof bundleCandidate
  >;
}): CharacterRuntimeContextWithFaceGroundingV1 {
  const bundle =
    input?.bundle ??
    bundleCandidate();

  return admitCharacterRuntimeFaceGroundingV1({
    context:
      baseRuntimeContext({
        characterId:
          input?.characterId ??
          'character.alpha',
        contentVersion:
          input?.contentVersion ??
          'character-content-alpha-v1',
        relationshipRevision:
          input?.relationshipRevision ??
          1,
        preferredQuestionStrategies:
          input?.preferredQuestionStrategies ??
          [
            'ask_current_context',
            'ask_recent_change',
          ],
      }),
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

function capability(input?: {
  readonly characterId?: string;
  readonly contentVersion?: string;
  readonly faceProfileVersion?: string;
  readonly allowedTopicKeys?: readonly (
    | 'face.discover.structure'
    | 'face.discover.extended'
  )[];
  readonly allowPartial?: boolean;
}): CharacterFaceCapabilityProfileV1 {
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
      `face-capability-${characterId}-v1`,
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

function plan(input?: {
  readonly bundle?: ReturnType<
    typeof bundleCandidate
  >;
  readonly context?:
    CharacterRuntimeContextWithFaceGroundingV1;
  readonly capability?:
    CharacterFaceCapabilityProfileV1;
  readonly perspective?:
    CharacterFacePerspectiveProfileV1;
  readonly characterContentVersion?: string;
}) {
  const bundle =
    input?.bundle ??
    bundleCandidate();

  return buildCharacterFaceReadingPlanDecisionV1({
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
  'TOPIC-FACE-005E production Face Reading Plan',
  () => {
    it('mirrors the Saju plan architecture with deterministic Face beats and no final prose', () => {
      const decision = plan();

      expect(
        decision.schemaVersion,
      ).toBe(
        CHARACTER_FACE_READING_PLAN_DECISION_SCHEMA_VERSION_V1,
      );
      expect(decision.mode).toBe(
        'character_plan',
      );
      expect(
        decision.plan.schemaVersion,
      ).toBe(
        CHARACTER_FACE_READING_PLAN_SCHEMA_VERSION_V1,
      );
      expect(
        decision.plan.planId,
      ).toMatch(
        /^character_face_reading_plan_[0-9a-f]{24}$/u,
      );

      const semantic =
        decision.plan.beats.filter(
          (beat) =>
            beat.kind ===
            'neutral_fact_realization',
        );
      expect(semantic).toEqual([
        {
          kind:
            'neutral_fact_realization',
          unitRefs: [
            `face-grounding-unit:${'3'.repeat(64)}`,
          ],
          purpose: 'lead',
        },
        {
          kind:
            'neutral_fact_realization',
          unitRefs: [
            `face-grounding-unit:${'1'.repeat(64)}`,
          ],
          purpose: 'expand',
        },
        {
          kind:
            'neutral_fact_realization',
          unitRefs: [
            `face-grounding-unit:${'2'.repeat(64)}`,
          ],
          purpose: 'expand',
        },
        {
          kind:
            'neutral_fact_realization',
          unitRefs: [
            `face-grounding-unit:${'4'.repeat(64)}`,
          ],
          purpose: 'expand',
        },
      ]);

      expect(
        decision.plan.beats.at(-2),
      ).toEqual({
        kind:
          'character_reaction',
        allowedSourceUnitRefs:
          decision.selection
            .orderedUnitIds,
      });
      expect(
        decision.plan.beats.at(-1),
      ).toEqual({
        kind:
          'follow_up_question',
        sourceUnitRefs:
          decision.selection
            .orderedUnitIds,
        questionStrategy:
          'ask_current_context',
      });

      expect(
        JSON.stringify(
          decision.plan,
        ),
      ).not.toMatch(
        /displayValue|canonicalMeaning|personality|fortune|wealth/u,
      );
    });

    it('pins bundle, capability, Perspective and relationship identities into the plan', () => {
      const decision = plan();

      expect(
        decision.plan.bundleHash,
      ).toBe(
        decision.selection.bundleHash,
      );
      expect(
        decision.plan
          .capabilityProfileRef,
      ).toMatchObject({
        characterId:
          'character.alpha',
        capabilityVersion:
          'face-capability-character.alpha-v1',
        sourceContentVersion:
          'character-content-alpha-v1',
        sourceFaceProfileVersion:
          'face-profile-alpha-v1',
      });
      expect(
        decision.plan
          .perspectiveProfileRef,
      ).toMatchObject({
        characterId:
          'character.alpha',
        perspectiveVersion:
          'face-perspective-alpha-v1',
        sourceContentVersion:
          'character-content-alpha-v1',
        sourceFaceProfileVersion:
          'face-profile-alpha-v1',
      });
      expect(
        decision.plan
          .capabilityProfileRef
          .profileHash,
      ).toMatch(
        /^[0-9a-f]{64}$/u,
      );
      expect(
        decision.plan
          .perspectiveProfileRef
          .profileHash,
      ).toMatch(
        /^[0-9a-f]{64}$/u,
      );
      expect(
        decision.plan
          .relationshipProjectionRef,
      ).toMatchObject({
        schemaVersion: 'v1',
        relationshipRevision: 1,
        relationshipPolicyVersion:
          'relationship-policy-test-v1',
        projectionPolicyVersion:
          'projection-policy-test-v1',
        behaviorVersion:
          'behavior-test-v1',
      });
    });

    it('preserves partial forehead unavailability as a notice without fabricating a semantic unit', () => {
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
      const decision = plan({
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

      expect(
        decision.selection.coverage,
      ).toBe('partial');
      expect(
        decision.plan.beats,
      ).toContainEqual({
        kind:
          'unavailable_notice',
        attentionKey:
          'forehead.visible_width_shape',
        status: 'unavailable',
      });

      const semanticRefs =
        decision.plan.beats
          .filter(
            (beat) =>
              beat.kind ===
              'neutral_fact_realization',
          )
          .flatMap(
            (beat) =>
              beat.kind ===
              'neutral_fact_realization'
                ? [...beat.unitRefs]
                : [],
          );

      expect(semanticRefs).toEqual(
        decision.selection
          .orderedUnitIds,
      );
      expect(semanticRefs).toHaveLength(2);
    });

    it('builds an unavailable-only plan without reaction or follow-up beats', () => {
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

      const decision = plan({
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
        decision.selection
          .selectedUnitIds,
      ).toEqual([]);
      expect(
        decision.plan.beats,
      ).toEqual([
        {
          kind:
            'unavailable_notice',
          attentionKey:
            'forehead.visible_width_shape',
          status: 'unavailable',
        },
      ]);
    });

    it('preserves not-present attention as an explicit notice', () => {
      const decision = plan({
        perspective:
          perspective({
            attentionOrder: [
              'forehead.visible_width_shape',
            ],
            maxUnits: 1,
          }),
      });

      expect(
        decision.plan.beats,
      ).toEqual([
        {
          kind:
            'unavailable_notice',
          attentionKey:
            'forehead.visible_width_shape',
          status: 'not_present',
        },
      ]);
    });

    it('omits follow-up beat when the active Character has no authored question strategy', () => {
      const bundle =
        bundleCandidate();
      const decision = plan({
        bundle,
        context:
          runtimeContext({
            bundle,
            preferredQuestionStrategies:
              [],
          }),
      });

      expect(
        decision.plan.beats.some(
          (beat) =>
            beat.kind ===
            'follow_up_question',
        ),
      ).toBe(false);
      expect(
        decision.plan.beats.some(
          (beat) =>
            beat.kind ===
            'character_reaction',
        ),
      ).toBe(true);
    });

    it('keeps selection invariant while relationship revision changes only the plan identity', () => {
      const bundle =
        bundleCandidate();
      const first = plan({
        bundle,
        context:
          runtimeContext({
            bundle,
            relationshipRevision: 1,
          }),
      });
      const second = plan({
        bundle,
        context:
          runtimeContext({
            bundle,
            relationshipRevision: 99,
          }),
      });

      expect(
        second.selection,
      ).toEqual(
        first.selection,
      );
      expect(
        second.plan.beats,
      ).toEqual(
        first.plan.beats,
      );
      expect(
        second.plan.planId,
      ).not.toBe(
        first.plan.planId,
      );
      expect(
        second.plan
          .relationshipProjectionRef
          .relationshipRevision,
      ).toBe(99);
    });

    it('is deterministic for repeated identical plan inputs', () => {
      expect(plan()).toEqual(
        plan(),
      );
    });

    it('lets two Character Perspectives change beat order while preserving the same source bundle', () => {
      const bundle =
        bundleCandidate();

      const alpha = plan({
        bundle,
        context:
          runtimeContext({
            bundle,
            characterId:
              'character.alpha',
            contentVersion:
              'character-content-alpha-v1',
          }),
        capability:
          capability({
            characterId:
              'character.alpha',
            contentVersion:
              'character-content-alpha-v1',
            faceProfileVersion:
              'face-profile-alpha-v1',
          }),
        perspective:
          perspective({
            characterId:
              'character.alpha',
            contentVersion:
              'character-content-alpha-v1',
            faceProfileVersion:
              'face-profile-alpha-v1',
            attentionOrder: [
              'mouth.width_and_relative_size',
              'eye.width_height_ratio',
              'nose.alar_width_and_nostril_geometry',
              'chin_lower_face.visible_width_ratio',
            ],
          }),
      });

      const beta = plan({
        bundle,
        context:
          runtimeContext({
            bundle,
            characterId:
              'character.beta',
            contentVersion:
              'character-content-beta-v1',
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

      expect(
        alpha.plan.bundleHash,
      ).toBe(
        beta.plan.bundleHash,
      );
      expect(
        alpha.selection
          .selectedUnitIds,
      ).toEqual(
        beta.selection
          .selectedUnitIds,
      );
      expect(
        alpha.selection
          .orderedUnitIds,
      ).not.toEqual(
        beta.selection
          .orderedUnitIds,
      );
    });

    it('fails closed when capability denies, runtime content is stale, or grounding identity mismatches', () => {
      expect(() =>
        plan({
          capability:
            capability({
              allowedTopicKeys: [
                'face.discover.extended',
              ],
            }),
        }),
      ).toThrow(
        'TOPIC_NOT_ALLOWED',
      );

      expect(() =>
        plan({
          characterContentVersion:
            'stale-content',
        }),
      ).toThrow(
        'contentVersion does not match the active Character runtime context',
      );

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
        plan({
          bundle: second,
          context:
            runtimeContext({
              bundle: first,
            }),
        }),
      ).toThrow();
    });

    it('fails closed without admitted Face context', () => {
      const context = {
        ...runtimeContext(),
        face: null,
      };

      expect(() =>
        plan({
          context,
        }),
      ).toThrow(
        'requires an admitted Face context',
      );
    });

    it('keeps plan payload structural and free of Face values, final prose, raw biometrics, and Commerce metadata', () => {
      const decision = plan();
      const serialized =
        JSON.stringify(
          decision.plan,
        );

      for (const forbidden of [
        'displayValue',
        'qualifiers',
        'prohibitedExtensions',
        'semanticClaims',
        'canonicalMeaning',
        'rawImage',
        'rawLandmarks',
        'faceEmbedding',
        'price',
        'entitlement',
        '"text"',
      ]) {
        expect(
          serialized.includes(
            forbidden,
          ),
        ).toBe(false);
      }
    });
  },
);
