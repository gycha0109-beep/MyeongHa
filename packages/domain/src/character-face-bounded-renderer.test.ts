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
  CHARACTER_FACE_DELIVERY_PROFILE_SCHEMA_VERSION_V1,
  CHARACTER_FACE_DELIVERY_SOURCE_SCHEMA_VERSION_V1,
  admitCharacterFaceDeliveryProfileV1,
  type CharacterFaceDeliveryProfileV1,
} from './character-face-delivery-profile.js';
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
  CHARACTER_FACE_BOUNDED_RENDERER_VERSION_V1,
  CHARACTER_FACE_UTTERANCE_SCHEMA_VERSION_V1,
  formatCharacterFaceDisplayValueV1,
  renderCharacterFaceBoundedNeutralV1,
} from './character-face-bounded-renderer.js';

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

function scalarUnit(
  ordinal: number,
  capabilityKey: string,
  value: number,
  qualifiers: readonly string[] = [],
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
      value,
      unit: 'ratio' as const,
    },
    qualifiers: [...qualifiers].sort(),
    prohibitedExtensions: [
      REQUIRED_PROHIBITION,
    ],
    realizationPolicyRef:
      FACE_CHARACTER_NEUTRAL_REALIZATION_POLICY_V1,
  };
}

function axesUnit() {
  return {
    unitId:
      `face-grounding-unit:${'3'.repeat(64)}`,
    kind:
      'neutral_observation' as const,
    capabilityKey:
      'nose.alar_width_and_nostril_geometry',
    observationRef:
      'face-neutral-observation:v1:3',
    displayFactRef:
      'face-display-fact:v1:3',
    displayValue: {
      kind:
        'composite_visible_nasal_geometry' as const,
      axes: [
        {
          axisKey:
            'alar_width_ratio',
          value: 0.31001,
          unit: 'ratio' as const,
          sourceMetricRef:
            'metric:nose:alar',
        },
        {
          axisKey:
            'nostril_visibility_angle',
          value: 12.3456,
          unit: 'degree' as const,
          sourceMetricRef:
            'metric:nose:nostril',
        },
      ],
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
  readonly units?: readonly ReturnType<
    typeof scalarUnit
  >[];
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
        scalarUnit(
          1,
          'eye.width_height_ratio',
          2.14,
        ),
        scalarUnit(
          2,
          'mouth.width_and_relative_size',
          0.61,
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

function context(input?: {
  readonly characterId?: string;
  readonly contentVersion?: string;
  readonly questionStrategies?:
    readonly string[];
  readonly bundle?: ReturnType<
    typeof bundleCandidate
  >;
}): CharacterRuntimeContextWithFaceGroundingV1 {
  const characterId =
    input?.characterId ??
    'character.alpha';
  const contentVersion =
    input?.contentVersion ??
    'character-content-alpha-v1';
  const bundle =
    input?.bundle ??
    bundleCandidate();
  const speech = Object.freeze({});
  const communication =
    Object.freeze({});

  const base = {
    schemaVersion: 'v1',
    characterId,
    contentBundleId:
      'character-content-bundle-test-v1',
    contentVersion,
    speech,
    voiceAuthority: {
      characterId,
      surface:
        'general_chat',
      source:
        'published_character_content',
      contentVersion,
      speech,
      communication,
    },
    persona: {
      communication,
      questioning: {
        preferredStrategies:
          input?.questionStrategies ??
          ['ask_current_context'],
      },
    },
    relationship: {
      relationshipRevision: 1,
      relationshipPolicyVersion:
        'relationship-policy-test-v1',
      projectionPolicyVersion:
        'projection-policy-test-v1',
      behaviorVersion:
        'relationship-behavior-test-v1',
    },
    saju: null,
  } as unknown as CharacterRuntimeContextV1;

  return admitCharacterRuntimeFaceGroundingV1({
    context: base,
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
  const source = {
    schemaVersion:
      CHARACTER_FACE_CAPABILITY_SOURCE_SCHEMA_VERSION_V1,
    capabilityVersion:
      `face-capability-${characterId}-v1`,
    characterId,
    contentVersion,
    faceProfileVersion,
    allowedTopicKeys: [
      'face.discover.structure',
      'face.discover.extended',
    ] as const,
    allowedModes: [
      CHARACTER_FACE_REALIZATION_MODE_V1,
    ],
    allowPartial: true,
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
      allowedTopicKeys:
        source.allowedTopicKeys,
      allowedModes:
        source.allowedModes,
      allowPartial: true,
      canInitiate: false,
    },
  });
}

function perspective(input?: {
  readonly characterId?: string;
  readonly contentVersion?: string;
  readonly faceProfileVersion?: string;
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
  const attentionOrder =
    input?.attentionOrder ?? [
      'mouth.width_and_relative_size',
      'eye.width_height_ratio',
    ];
  const maxUnits =
    input?.maxUnits ?? 2;
  const source = {
    schemaVersion:
      CHARACTER_FACE_PERSPECTIVE_SOURCE_SCHEMA_VERSION_V1,
    perspectiveVersion:
      `face-perspective-${characterId}-v1`,
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
      perspectiveVersion:
        source.perspectiveVersion,
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

function delivery(input?: {
  readonly characterId?: string;
  readonly contentVersion?: string;
  readonly faceProfileVersion?: string;
  readonly neutralFactStyle?:
    | 'plain'
    | 'soft_observation'
    | 'compact';
  readonly unavailableStyle?:
    | 'direct'
    | 'soft';
  readonly followUpFraming?:
    readonly {
      readonly questionStrategy: string;
      readonly framingKey:
        | 'face_question_detail_plain_v1'
        | 'face_question_detail_compact_v1';
    }[];
}): CharacterFaceDeliveryProfileV1 {
  const characterId =
    input?.characterId ??
    'character.alpha';
  const contentVersion =
    input?.contentVersion ??
    'character-content-alpha-v1';
  const faceProfileVersion =
    input?.faceProfileVersion ??
    'face-profile-alpha-v1';
  const neutralFactStyle =
    input?.neutralFactStyle ??
    'soft_observation';
  const unavailableStyle =
    input?.unavailableStyle ??
    'soft';
  const followUpFraming =
    input?.followUpFraming ?? [
      {
        questionStrategy:
          'ask_current_context',
        framingKey:
          'face_question_detail_plain_v1' as const,
      },
    ];

  const source = {
    schemaVersion:
      CHARACTER_FACE_DELIVERY_SOURCE_SCHEMA_VERSION_V1,
    deliveryVersion:
      `face-delivery-${characterId}-v1`,
    characterId,
    contentVersion,
    faceProfileVersion,
    locale: 'ko-KR',
    neutralFactStyle,
    unavailableStyle,
    reactionFramingKey:
      'face_neutral_boundary_soft_v1',
    followUpFraming,
  };

  return admitCharacterFaceDeliveryProfileV1({
    source,
    candidate: {
      schemaVersion:
        CHARACTER_FACE_DELIVERY_PROFILE_SCHEMA_VERSION_V1,
      deliveryVersion:
        source.deliveryVersion,
      characterId,
      sourceContentVersion:
        contentVersion,
      sourceFaceProfileVersion:
        faceProfileVersion,
      locale: 'ko-KR',
      neutralFactStyle,
      unavailableStyle,
      reactionFramingKey:
        'face_neutral_boundary_soft_v1',
      followUpFraming,
    },
  });
}

function render(input?: {
  readonly bundle?: ReturnType<
    typeof bundleCandidate
  >;
  readonly context?:
    CharacterRuntimeContextWithFaceGroundingV1;
  readonly capability?:
    CharacterFaceCapabilityProfileV1;
  readonly perspective?:
    CharacterFacePerspectiveProfileV1;
  readonly deliveryProfile?:
    CharacterFaceDeliveryProfileV1;
}) {
  const bundle =
    input?.bundle ??
    bundleCandidate();

  return renderCharacterFaceBoundedNeutralV1({
    context:
      input?.context ??
      context({ bundle }),
    grounding: bundle,
    characterContentVersion:
      'character-content-alpha-v1',
    capability:
      input?.capability ??
      capability(),
    perspective:
      input?.perspective ??
      perspective(),
    deliveryProfile:
      input?.deliveryProfile ??
      delivery(),
  });
}

describe(
  'TOPIC-FACE-005F-B bounded Face renderer',
  () => {
    it('renders selected neutral facts in Character order with exact source numbers and units', () => {
      const decision =
        render();

      expect(decision.mode).toBe(
        'bounded_neutral',
      );
      if (
        decision.mode !==
        'bounded_neutral'
      ) {
        throw new Error(
          'expected bounded_neutral',
        );
      }

      expect(
        decision.rendererVersion,
      ).toBe(
        CHARACTER_FACE_BOUNDED_RENDERER_VERSION_V1,
      );
      expect(
        decision.utterance.schemaVersion,
      ).toBe(
        CHARACTER_FACE_UTTERANCE_SCHEMA_VERSION_V1,
      );
      expect(
        decision.utterance.renderedUnitIds,
      ).toEqual([
        `face-grounding-unit:${'2'.repeat(64)}`,
        `face-grounding-unit:${'1'.repeat(64)}`,
      ]);

      const facts =
        decision.utterance.segments.filter(
          (segment) =>
            segment.kind ===
            'neutral_fact_realization',
        );

      expect(facts).toEqual([
        expect.objectContaining({
          text:
            '입 너비·상대 크기는 0.61 ratio로 확인돼요.',
          capabilityKey:
            'mouth.width_and_relative_size',
          displayFactRef:
            'face-display-fact:v1:2',
          purpose: 'lead',
        }),
        expect.objectContaining({
          text:
            '눈 가로·세로 비율은 2.14 ratio로 확인돼요.',
          capabilityKey:
            'eye.width_height_ratio',
          displayFactRef:
            'face-display-fact:v1:1',
          purpose: 'expand',
        }),
      ]);
    });

    it('formats composite axes without rounding, percentage conversion, or classification', () => {
      expect(
        formatCharacterFaceDisplayValueV1(
          axesUnit().displayValue,
        ),
      ).toBe(
        'alar_width_ratio=0.31001 ratio; nostril_visibility_angle=12.3456 degree',
      );
    });

    it('allows bounded Character style differences without changing source identity', () => {
      const soft =
        render();
      const plain =
        render({
          deliveryProfile:
            delivery({
              neutralFactStyle:
                'plain',
            }),
        });

      if (
        soft.mode !==
          'bounded_neutral' ||
        plain.mode !==
          'bounded_neutral'
      ) {
        throw new Error(
          'expected bounded render',
        );
      }

      expect(
        soft.utterance.bundleHash,
      ).toBe(
        plain.utterance.bundleHash,
      );
      expect(
        soft.utterance.renderedUnitIds,
      ).toEqual(
        plain.utterance.renderedUnitIds,
      );
      expect(
        soft.utterance.segments[0]
          ?.text,
      ).not.toBe(
        plain.utterance.segments[0]
          ?.text,
      );
      expect(
        plain.utterance.segments[0]
          ?.text,
      ).toBe(
        '입 너비·상대 크기: 0.61 ratio.',
      );
    });

    it('renders unavailable-only Perspective as a neutral notice without fabricating a Face fact', () => {
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
      const decision =
        render({
          bundle,
          context:
            context({ bundle }),
          perspective:
            perspective({
              attentionOrder: [
                'forehead.visible_width_shape',
              ],
              maxUnits: 1,
            }),
        });

      expect(decision.mode).toBe(
        'bounded_neutral',
      );
      if (
        decision.mode !==
        'bounded_neutral'
      ) {
        throw new Error(
          'expected bounded_neutral',
        );
      }

      expect(
        decision.utterance.renderedUnitIds,
      ).toEqual([]);
      expect(
        decision.utterance.segments,
      ).toEqual([
        {
          kind:
            'unavailable_notice',
          text:
            '이마 가시 너비·형상은 지금 확인 가능한 범위에 포함되지 않아요.',
          attentionKey:
            'forehead.visible_width_shape',
          status: 'unavailable',
        },
      ]);
    });

    it('falls back instead of inventing visible wording for source qualifiers', () => {
      const bundle =
        bundleCandidate({
          units: [
            scalarUnit(
              1,
              'eye.width_height_ratio',
              2.14,
            ),
            scalarUnit(
              2,
              'mouth.width_and_relative_size',
              0.61,
              ['measurement_only'],
            ),
          ],
        });

      const decision =
        render({
          bundle,
          context:
            context({ bundle }),
        });

      expect(decision).toMatchObject({
        mode:
          'protected_fallback',
        reason:
          'qualifier_realization_not_authorized',
      });
    });

    it('falls back when the planned follow-up strategy has no admitted safe framing', () => {
      const decision =
        render({
          deliveryProfile:
            delivery({
              followUpFraming: [],
            }),
        });

      expect(decision).toMatchObject({
        mode:
          'protected_fallback',
        reason:
          'safe_framing_unavailable',
      });
    });

    it('fails closed when Face voice authority is not the active face_product authority', () => {
      const valid =
        context();

      expect(() =>
        render({
          context: {
            ...valid,
            voiceAuthority: {
              ...valid.voiceAuthority,
              surface:
                'general_chat',
            },
          },
        }),
      ).toThrow(
        'surface must be face_product',
      );
    });

    it('fails closed when delivery identity is stale or cross-Character', () => {
      expect(() =>
        render({
          deliveryProfile:
            delivery({
              characterId:
                'character.beta',
            }),
        }),
      ).toThrow(
        'Character identity',
      );

      expect(() =>
        render({
          deliveryProfile:
            delivery({
              contentVersion:
                'stale-content',
            }),
        }),
      ).toThrow(
        'contentVersion',
      );
    });

    it('is deterministic for identical inputs', () => {
      const first =
        render();
      const second =
        render();

      expect(second).toEqual(
        first,
      );
    });

    it('does not emit semantic, privacy, relationship, or Commerce payload fields', () => {
      const decision =
        render();
      expect(decision.mode).toBe(
        'bounded_neutral',
      );
      if (
        decision.mode !==
        'bounded_neutral'
      ) {
        throw new Error(
          'expected bounded_neutral',
        );
      }

      const serialized =
        JSON.stringify(
          decision.utterance,
        );
      for (const forbidden of [
        'personality',
        'fortune',
        'wealth',
        'rawImage',
        'rawLandmarks',
        'faceEmbedding',
        'relationshipState',
        'price',
        'entitlement',
        'providerPrompt',
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
