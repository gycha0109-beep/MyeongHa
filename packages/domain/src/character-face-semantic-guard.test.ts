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
} from './character-face-capability.js';
import {
  CHARACTER_FACE_DELIVERY_PROFILE_SCHEMA_VERSION_V1,
  CHARACTER_FACE_DELIVERY_SOURCE_SCHEMA_VERSION_V1,
  admitCharacterFaceDeliveryProfileV1,
} from './character-face-delivery-profile.js';
import {
  CHARACTER_FACE_REALIZATION_MODE_V1,
  CHARACTER_FACE_SOURCE_BINDING_SCHEMA_VERSION_V1,
  FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
  FACE_CHARACTER_GROUNDING_REF_SCHEMA_VERSION_V1,
  admitCharacterRuntimeFaceGroundingV1,
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
} from './character-face-perspective.js';
import {
  renderCharacterFaceBoundedNeutralV1,
} from './character-face-bounded-renderer.js';
import {
  CHARACTER_FACE_SEMANTIC_GUARD_VERSION_V1,
  guardCharacterFaceSemanticPreservationV1,
} from './character-face-semantic-guard.js';

const SOURCE_RESULT_HASH =
  `face-topic-source-result:${'a'.repeat(64)}`;
const PROJECTION_HASH =
  `face-product-projection:${'b'.repeat(64)}`;
const GROUNDING_HASH =
  `face-grounding:${'c'.repeat(64)}`;
const DISPLAY_FACTS_HASH =
  `face-display-facts:${'d'.repeat(64)}`;
const UNIT_ID =
  `face-grounding-unit:${'1'.repeat(64)}`;

function unit(
  qualifiers: readonly string[] = [],
) {
  return {
    unitId: UNIT_ID,
    kind:
      'neutral_observation' as const,
    capabilityKey:
      'mouth.width_and_relative_size',
    observationRef:
      'face-neutral-observation:v1:mouth',
    displayFactRef:
      'face-display-fact:v1:mouth',
    displayValue: {
      kind: 'scalar' as const,
      value: 0.61,
      unit: 'ratio' as const,
    },
    qualifiers: [...qualifiers].sort(),
    prohibitedExtensions: [
      'traditional_semantic_promotion_without_governed_claim',
    ],
    realizationPolicyRef:
      FACE_CHARACTER_NEUTRAL_REALIZATION_POLICY_V1,
  };
}

function bundle(input?: {
  readonly topicKey?: string;
  readonly readinessState?:
    | 'available'
    | 'partial';
  readonly unavailableSections?:
    readonly string[];
  readonly units?: readonly ReturnType<
    typeof unit
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
        unit(),
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

function context(
  activeBundle:
    ReturnType<typeof bundle>,
) {
  const speech = Object.freeze({});
  const communication =
    Object.freeze({});

  const base = {
    schemaVersion: 'v1',
    characterId:
      'character.alpha',
    contentBundleId:
      'character-content-bundle-test-v1',
    contentVersion:
      'character-content-alpha-v1',
    speech,
    voiceAuthority: {
      characterId:
        'character.alpha',
      surface:
        'general_chat',
      source:
        'published_character_content',
      contentVersion:
        'character-content-alpha-v1',
      speech,
      communication,
    },
    persona: {
      communication,
      questioning: {
        preferredStrategies: [
          'ask_current_context',
        ],
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
        activeBundle.topicKey,
      readinessState:
        activeBundle.readinessState,
      mode:
        CHARACTER_FACE_REALIZATION_MODE_V1,
      sourceResultHash:
        activeBundle.sourceResultHash,
      projectionHash:
        activeBundle.projectionHash,
      groundingHash:
        activeBundle.groundingHash,
      displayFactsHash:
        activeBundle.displayFactsHash,
      bundleHash:
        activeBundle.bundleHash,
      projectionVersion:
        FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
      unavailableSections:
        activeBundle.unavailableSections,
    },
    groundingRef: {
      schemaVersion:
        FACE_CHARACTER_GROUNDING_REF_SCHEMA_VERSION_V1,
      topicKey:
        activeBundle.topicKey,
      sourceResultHash:
        activeBundle.sourceResultHash,
      projectionHash:
        activeBundle.projectionHash,
      groundingHash:
        activeBundle.groundingHash,
      displayFactsHash:
        activeBundle.displayFactsHash,
      bundleHash:
        activeBundle.bundleHash,
      projectionVersion:
        FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
    },
  });
}

function capability() {
  const source = {
    schemaVersion:
      CHARACTER_FACE_CAPABILITY_SOURCE_SCHEMA_VERSION_V1,
    capabilityVersion:
      'face-capability-alpha-v1',
    characterId:
      'character.alpha',
    contentVersion:
      'character-content-alpha-v1',
    faceProfileVersion:
      'face-profile-alpha-v1',
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
      allowPartial: true,
      canInitiate: false,
    },
  });
}

function perspective(
  attentionOrder:
    readonly (
      | 'mouth.width_and_relative_size'
      | 'forehead.visible_width_shape'
    )[] = [
      'mouth.width_and_relative_size',
    ],
) {
  const source = {
    schemaVersion:
      CHARACTER_FACE_PERSPECTIVE_SOURCE_SCHEMA_VERSION_V1,
    perspectiveVersion:
      'face-perspective-alpha-v1',
    characterId:
      'character.alpha',
    contentVersion:
      'character-content-alpha-v1',
    faceProfileVersion:
      'face-profile-alpha-v1',
    attentionOrder,
    maxUnits: 1,
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
      characterId:
        source.characterId,
      sourceContentVersion:
        source.contentVersion,
      sourceFaceProfileVersion:
        source.faceProfileVersion,
      groundingProjectionVersion:
        FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
      attentionRegistryVersion:
        CHARACTER_FACE_ATTENTION_REGISTRY_VERSION_V1,
      attentionOrder,
      selection: {
        maxUnits: 1,
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

function delivery() {
  const source = {
    schemaVersion:
      CHARACTER_FACE_DELIVERY_SOURCE_SCHEMA_VERSION_V1,
    deliveryVersion:
      'face-delivery-alpha-v1',
    characterId:
      'character.alpha',
    contentVersion:
      'character-content-alpha-v1',
    faceProfileVersion:
      'face-profile-alpha-v1',
    locale: 'ko-KR',
    neutralFactStyle:
      'soft_observation' as const,
    unavailableStyle:
      'soft' as const,
    reactionFramingKey:
      'face_neutral_boundary_soft_v1' as const,
    followUpFraming: [
      {
        questionStrategy:
          'ask_current_context',
        framingKey:
          'face_question_detail_plain_v1' as const,
      },
    ],
  };

  return admitCharacterFaceDeliveryProfileV1({
    source,
    candidate: {
      schemaVersion:
        CHARACTER_FACE_DELIVERY_PROFILE_SCHEMA_VERSION_V1,
      deliveryVersion:
        source.deliveryVersion,
      characterId:
        source.characterId,
      sourceContentVersion:
        source.contentVersion,
      sourceFaceProfileVersion:
        source.faceProfileVersion,
      locale: 'ko-KR',
      neutralFactStyle:
        source.neutralFactStyle,
      unavailableStyle:
        source.unavailableStyle,
      reactionFramingKey:
        source.reactionFramingKey,
      followUpFraming:
        source.followUpFraming,
    },
  });
}

function fixture(input?: {
  readonly activeBundle?:
    ReturnType<typeof bundle>;
  readonly activePerspective?:
    ReturnType<typeof perspective>;
}) {
  const activeBundle =
    input?.activeBundle ??
    bundle();
  const activeContext =
    context(activeBundle);
  const activeCapability =
    capability();
  const activePerspective =
    input?.activePerspective ??
    perspective();
  const activeDelivery =
    delivery();

  const renderer =
    renderCharacterFaceBoundedNeutralV1({
      context: activeContext,
      grounding:
        activeBundle,
      characterContentVersion:
        'character-content-alpha-v1',
      capability:
        activeCapability,
      perspective:
        activePerspective,
      deliveryProfile:
        activeDelivery,
    });

  return {
    activeBundle,
    activeContext,
    activeCapability,
    activePerspective,
    activeDelivery,
    renderer,
  };
}

function guard(
  candidate: unknown,
  input = fixture(),
) {
  return guardCharacterFaceSemanticPreservationV1({
    candidate,
    context:
      input.activeContext,
    grounding:
      input.activeBundle,
    characterContentVersion:
      'character-content-alpha-v1',
    capability:
      input.activeCapability,
    perspective:
      input.activePerspective,
    deliveryProfile:
      input.activeDelivery,
  });
}

function acceptedUtterance() {
  const input = fixture();
  if (
    input.renderer.mode !==
    'bounded_neutral'
  ) {
    throw new Error(
      'expected bounded renderer fixture',
    );
  }

  return {
    input,
    utterance:
      input.renderer.utterance,
  };
}

function failureCodes(
  decision:
    ReturnType<typeof guard>,
) {
  return decision.mode ===
    'protected_fallback'
    ? decision.failures.map(
        (item) => item.code,
      )
    : [];
}

describe(
  'TOPIC-FACE-005F-C Face Semantic Preservation Guard',
  () => {
    it('accepts the exact deterministic bounded Face utterance and emits validation evidence', () => {
      const {
        input,
        utterance,
      } = acceptedUtterance();
      const decision =
        guard(
          utterance,
          input,
        );

      expect(decision.mode).toBe(
        'accepted',
      );
      if (
        decision.mode !==
        'accepted'
      ) {
        throw new Error(
          'expected accepted',
        );
      }

      expect(
        decision.guardVersion,
      ).toBe(
        CHARACTER_FACE_SEMANTIC_GUARD_VERSION_V1,
      );
      expect(
        decision.utterance,
      ).toEqual(
        utterance,
      );
      expect(decision.evidence).toEqual({
        exactNeutralFacts: true,
        characterId:
          'character.alpha',
        topicKey:
          'face.discover.structure',
        bundleHash:
          utterance.bundleHash,
        readingPlanRef:
          utterance.readingPlanRef,
        deliveryProfileHash:
          utterance
            .deliveryProfileRef
            .profileHash,
        validatedUnitIds: [
          UNIT_ID,
        ],
        validatedDisplayFactRefs: [
          'face-display-fact:v1:mouth',
        ],
        validatedUnavailableAttentionKeys:
          [],
      });
    });

    it('rejects any numeric/text mutation instead of reinterpreting or repairing it', () => {
      const {
        input,
        utterance,
      } = acceptedUtterance();
      const segments =
        utterance.segments.map(
          (segment, index) =>
            index === 0
              ? {
                  ...segment,
                  text:
                    '입 너비·상대 크기는 61%로 확인돼요.',
                }
              : segment,
        );

      const decision =
        guard(
          {
            ...utterance,
            segments,
          },
          input,
        );

      expect(
        failureCodes(decision),
      ).toContain(
        'NEUTRAL_FACT_TEXT_MISMATCH',
      );
    });

    it('rejects display fact and capability substitution', () => {
      const {
        input,
        utterance,
      } = acceptedUtterance();
      const first =
        utterance.segments[0];
      if (
        first?.kind !==
        'neutral_fact_realization'
      ) {
        throw new Error(
          'expected neutral fact',
        );
      }

      const changedRef =
        guard(
          {
            ...utterance,
            segments: [
              {
                ...first,
                displayFactRef:
                  'face-display-fact:v1:forged',
              },
              ...utterance.segments.slice(
                1,
              ),
            ],
          },
          input,
        );
      expect(
        failureCodes(
          changedRef,
        ),
      ).toContain(
        'DISPLAY_FACT_REF_MISMATCH',
      );

      const changedCapability =
        guard(
          {
            ...utterance,
            segments: [
              {
                ...first,
                capabilityKey:
                  'eye.width_height_ratio',
              },
              ...utterance.segments.slice(
                1,
              ),
            ],
          },
          input,
        );
      expect(
        failureCodes(
          changedCapability,
        ),
      ).toContain(
        'CAPABILITY_MISMATCH',
      );
    });

    it('rejects added personality, fortune, wealth, or traditional claims structurally as added output', () => {
      const {
        input,
        utterance,
      } = acceptedUtterance();

      for (const text of [
        '이 비율은 사교적인 성격을 뜻해요.',
        '재물운이 좋은 얼굴이에요.',
        '말년운이 안정적이에요.',
        '연애운이 강한 입이에요.',
      ]) {
        const decision =
          guard(
            {
              ...utterance,
              segments: [
                ...utterance.segments,
                {
                  kind:
                    'character_reaction',
                  text,
                  sourceUnitRefs: [
                    UNIT_ID,
                  ],
                  framingKey:
                    'forged',
                },
              ],
            },
            input,
          );

        expect(
          failureCodes(
            decision,
          ),
        ).toContain(
          'ADDED_CLAIM',
        );
      }
    });

    it('rejects missing selected units and unselected renderedUnitIds', () => {
      const {
        input,
        utterance,
      } = acceptedUtterance();

      const missing =
        guard(
          {
            ...utterance,
            renderedUnitIds: [],
          },
          input,
        );
      expect(
        failureCodes(missing),
      ).toContain(
        'MISSING_SELECTED_UNIT',
      );

      const forgedUnit =
        `face-grounding-unit:${'9'.repeat(64)}`;
      const extra =
        guard(
          {
            ...utterance,
            renderedUnitIds: [
              ...utterance.renderedUnitIds,
              forgedUnit,
            ],
          },
          input,
        );
      expect(
        failureCodes(extra),
      ).toContain(
        'UNSELECTED_SOURCE_UNIT',
      );
    });

    it('rejects segment reordering and unauthored Character framing', () => {
      const {
        input,
        utterance,
      } = acceptedUtterance();

      const reordered =
        guard(
          {
            ...utterance,
            segments: [
              ...utterance.segments,
            ].reverse(),
          },
          input,
        );
      expect(
        failureCodes(reordered),
      ).toContain(
        'STRUCTURE_MISMATCH',
      );

      const reactionIndex =
        utterance.segments.findIndex(
          (segment) =>
            segment.kind ===
            'character_reaction',
        );
      const reaction =
        utterance.segments[
          reactionIndex
        ];
      if (
        reaction?.kind !==
        'character_reaction'
      ) {
        throw new Error(
          'expected reaction',
        );
      }

      const mutated =
        [...utterance.segments];
      mutated[reactionIndex] = {
        ...reaction,
        text:
          '내가 보기엔 성격도 좀 보이는 것 같아.',
      };

      const framing =
        guard(
          {
            ...utterance,
            segments: mutated,
          },
          input,
        );
      expect(
        failureCodes(framing),
      ).toContain(
        'UNAUTHORED_CHARACTER_FRAMING',
      );
    });

    it('rejects source, plan, and delivery identity mutation', () => {
      const {
        input,
        utterance,
      } = acceptedUtterance();

      for (const candidate of [
        {
          ...utterance,
          bundleHash:
            `face-character-grounding:${'9'.repeat(64)}`,
        },
        {
          ...utterance,
          readingPlanRef:
            'character_face_reading_plan_forged',
        },
        {
          ...utterance,
          deliveryProfileRef: {
            ...utterance
              .deliveryProfileRef,
            profileHash:
              '0'.repeat(64),
          },
        },
      ]) {
        const decision =
          guard(
            candidate,
            input,
          );
        expect(
          failureCodes(
            decision,
          ),
        ).toContain(
          'SOURCE_IDENTITY_MISMATCH',
        );
      }
    });

    it('rejects unavailable promotion and validates an untouched unavailable notice', () => {
      const unavailableSections = [
        'observation:forehead.visible_width_shape',
      ];
      const activeBundle =
        bundle({
          topicKey:
            'face.discover.extended',
          readinessState:
            'partial',
          unavailableSections,
          units: [
            unit(),
          ],
        });
      const input =
        fixture({
          activeBundle,
          activePerspective:
            perspective([
              'forehead.visible_width_shape',
            ]),
        });

      if (
        input.renderer.mode !==
        'bounded_neutral'
      ) {
        throw new Error(
          'expected unavailable bounded renderer',
        );
      }

      const accepted =
        guard(
          input.renderer.utterance,
          input,
        );
      expect(
        accepted.mode,
      ).toBe('accepted');
      if (
        accepted.mode ===
        'accepted'
      ) {
        expect(
          accepted.evidence
            .validatedUnavailableAttentionKeys,
        ).toEqual([
          'forehead.visible_width_shape',
        ]);
      }

      const expectedNotice =
        input.renderer
          .utterance.segments[0];
      if (
        expectedNotice?.kind !==
        'unavailable_notice'
      ) {
        throw new Error(
          'expected unavailable notice',
        );
      }

      const promoted =
        guard(
          {
            ...input.renderer
              .utterance,
            segments: [
              {
                kind:
                  'neutral_fact_realization',
                text:
                  '이마가 넓은 편이에요.',
                sourceUnitRefs: [
                  UNIT_ID,
                ],
                displayFactRef:
                  'face-display-fact:v1:mouth',
                capabilityKey:
                  'forehead.visible_width_shape',
                purpose:
                  'lead',
              },
            ],
          },
          input,
        );

      expect(
        failureCodes(
          promoted,
        ),
      ).toContain(
        'UNAVAILABLE_PROMOTED',
      );
    });

    it('propagates renderer protected fallback and never accepts a candidate when qualifier realization is not authorized', () => {
      const activeBundle =
        bundle({
          units: [
            unit([
              'measurement_only',
            ]),
          ],
        });
      const input =
        fixture({
          activeBundle,
        });

      expect(
        input.renderer.mode,
      ).toBe(
        'protected_fallback',
      );

      const decision =
        guard(
          {
            forged:
              'candidate must not be accepted',
          },
          input,
        );

      expect(decision).toMatchObject({
        mode:
          'protected_fallback',
        reason:
          'renderer_protected_fallback',
        failures: [],
      });
    });

    it('rejects unexpected top-level output widening without parsing its prose semantically', () => {
      const {
        input,
        utterance,
      } = acceptedUtterance();
      const decision =
        guard(
          {
            ...utterance,
            personality:
              'forbidden',
          },
          input,
        );

      expect(
        failureCodes(
          decision,
        ),
      ).toContain(
        'ADDED_CLAIM',
      );
    });
  },
);
