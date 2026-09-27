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
  CHARACTER_FACE_FINAL_OUTPUT_SCHEMA_VERSION_V1,
  CHARACTER_FACE_FINALIZER_VERSION_V1,
  CHARACTER_FACE_PUBLIC_FALLBACK_REASON_V1,
  finalizeCharacterFaceOutputV1,
} from './character-face-final-output.js';
import {
  CHARACTER_OUTPUT_GUARD_VERSION_V1,
} from './character-output-guard.js';

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

function sourceUnit(
  qualifiers:
    readonly string[] = [],
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
    qualifiers:
      [...qualifiers].sort(),
    prohibitedExtensions: [
      'traditional_semantic_promotion_without_governed_claim',
    ],
    realizationPolicyRef:
      FACE_CHARACTER_NEUTRAL_REALIZATION_POLICY_V1,
  };
}

function groundingBundle(
  qualifiers:
    readonly string[] = [],
) {
  const withoutHash = {
    schemaVersion:
      FACE_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
    projectionVersion:
      FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
    realizationPolicyRegistryVersion:
      FACE_CHARACTER_REALIZATION_POLICY_REGISTRY_VERSION_V1,
    topicKey:
      'face.discover.structure',
    readinessState:
      'available' as const,
    faceEngineVersion:
      'face-engine-e2e-v1',
    sourceResultHash:
      SOURCE_RESULT_HASH,
    projectionHash:
      PROJECTION_HASH,
    groundingHash:
      GROUNDING_HASH,
    displayFactsHash:
      DISPLAY_FACTS_HASH,
    units: [
      sourceUnit(
        qualifiers,
      ),
    ],
    unavailableSections: [],
    prohibitedInferences: [],
  };

  return Object.freeze({
    ...withoutHash,
    bundleHash:
      `face-character-grounding:${hashCharacterFaceGroundingBundleMaterialV1(
        withoutHash,
      )}`,
  });
}

function runtimeContext(
  bundle:
    ReturnType<
      typeof groundingBundle
    >,
) {
  const speech =
    Object.freeze({});
  const communication =
    Object.freeze({});

  const base = {
    schemaVersion: 'v1',
    characterId:
      'character.alpha',
    contentBundleId:
      'character-content-bundle-e2e-v1',
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
      relationshipRevision: 7,
      relationshipPolicyVersion:
        'relationship-policy-e2e-v1',
      projectionPolicyVersion:
        'relationship-projection-e2e-v1',
      behaviorVersion:
        'relationship-behavior-e2e-v1',
    },
    rendererPolicy: {
      allowedEmotionIds: [
        'neutral',
        'serious',
      ],
      allowedAnimationCueIds: [
        'idle',
      ],
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

function capability() {
  const source = {
    schemaVersion:
      CHARACTER_FACE_CAPABILITY_SOURCE_SCHEMA_VERSION_V1,
    capabilityVersion:
      'face-capability-alpha-e2e-v1',
    characterId:
      'character.alpha',
    contentVersion:
      'character-content-alpha-v1',
    faceProfileVersion:
      'face-profile-alpha-e2e-v1',
    allowedTopicKeys: [
      'face.discover.structure',
    ] as const,
    allowedModes: [
      CHARACTER_FACE_REALIZATION_MODE_V1,
    ],
    allowPartial: false,
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
      allowPartial:
        source.allowPartial,
      canInitiate:
        source.canInitiate,
    },
  });
}

function perspective() {
  const source = {
    schemaVersion:
      CHARACTER_FACE_PERSPECTIVE_SOURCE_SCHEMA_VERSION_V1,
    perspectiveVersion:
      'face-perspective-alpha-e2e-v1',
    characterId:
      'character.alpha',
    contentVersion:
      'character-content-alpha-v1',
    faceProfileVersion:
      'face-profile-alpha-e2e-v1',
    attentionOrder: [
      'mouth.width_and_relative_size',
    ] as const,
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
      attentionOrder:
        source.attentionOrder,
      selection: {
        maxUnits: 1,
        avoidDuplicateCapability:
          true,
        preserveSourceOrderForTies:
          true,
      },
      uncertaintyHandling:
        source.uncertaintyHandling,
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

function deliveryProfile() {
  const source = {
    schemaVersion:
      CHARACTER_FACE_DELIVERY_SOURCE_SCHEMA_VERSION_V1,
    deliveryVersion:
      'face-delivery-alpha-e2e-v1',
    characterId:
      'character.alpha',
    contentVersion:
      'character-content-alpha-v1',
    faceProfileVersion:
      'face-profile-alpha-e2e-v1',
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
      locale: source.locale,
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

function productionNeutralFixture(
  qualifiers:
    readonly string[] = [],
) {
  const grounding =
    groundingBundle(
      qualifiers,
    );
  const context =
    runtimeContext(
      grounding,
    );
  const faceCapability =
    capability();
  const facePerspective =
    perspective();
  const faceDelivery =
    deliveryProfile();
  const rendererDecision =
    renderCharacterFaceBoundedNeutralV1({
      context,
      grounding,
      characterContentVersion:
        'character-content-alpha-v1',
      capability:
        faceCapability,
      perspective:
        facePerspective,
      deliveryProfile:
        faceDelivery,
    });

  return {
    grounding,
    context,
    faceCapability,
    facePerspective,
    faceDelivery,
    rendererDecision,
  };
}

function finalizerInput(
  fixture =
    productionNeutralFixture(),
) {
  if (
    fixture.rendererDecision
      .mode !==
    'bounded_neutral'
  ) {
    throw new Error(
      'expected bounded neutral fixture',
    );
  }

  return {
    candidateFaceUtterance:
      fixture.rendererDecision
        .utterance,
    rawRendererOutput: {
      schemaVersion: 'v1',
      emotion: 'neutral',
      animationCue: 'idle',
      suggestedActions: [
        {
          actionKey:
            'open_face_detail',
        },
      ],
    },
    context:
      fixture.context,
    grounding:
      fixture.grounding,
    characterContentVersion:
      'character-content-alpha-v1',
    capability:
      fixture.faceCapability,
    perspective:
      fixture.facePerspective,
    deliveryProfile:
      fixture.faceDelivery,
    allowedSuggestedActionKeys: [
      'open_face_detail',
    ],
  } as const;
}

describe(
  'TOPIC-FACE-005G production-neutral final output E2E',
  () => {
    it('closes one Character from admitted Face grounding through Semantic Guard and existing Output Guard', () => {
      const fixture =
        productionNeutralFixture();
      const input =
        finalizerInput(
          fixture,
        );

      const output =
        finalizeCharacterFaceOutputV1(
          input,
        );

      expect(output).toMatchObject({
        schemaVersion:
          CHARACTER_FACE_FINAL_OUTPUT_SCHEMA_VERSION_V1,
        finalizerVersion:
          CHARACTER_FACE_FINALIZER_VERSION_V1,
        outputGuardVersion:
          CHARACTER_OUTPUT_GUARD_VERSION_V1,
        characterId:
          'character.alpha',
        topicKey:
          'face.discover.structure',
        bundleHash:
          fixture.grounding
            .bundleHash,
      });

      expect(
        output.dialogue
          .framingBefore,
      ).toBeNull();
      expect(
        output.dialogue
          .framingAfter,
      ).toBeNull();
      expect(
        output.dialogue
          .memoryProposals,
      ).toEqual([]);
      expect(
        output.dialogue
          .relationshipEventProposals,
      ).toEqual([]);
      expect(
        output.dialogue
          .protectedSajuSegments,
      ).toEqual([]);
      expect(
        output.dialogue
          .protectedSajuDisclosures,
      ).toEqual([]);
      expect(
        output.dialogue
          .calculationAmbiguity,
      ).toEqual([]);
      expect(
        output.dialogue
          .suggestedActions,
      ).toEqual([
        {
          actionKey:
            'open_face_detail',
        },
      ]);

      expect(
        output.face.state,
      ).toBe('accepted');
      if (
        output.face.state !==
        'accepted'
      ) {
        throw new Error(
          'expected accepted Face final material',
        );
      }

      expect(
        output.face.utterance,
      ).toEqual(
        fixture.rendererDecision
          .mode ===
          'bounded_neutral'
          ? fixture
              .rendererDecision
              .utterance
          : null,
      );
      expect(
        output.face.evidence
          .validatedUnitIds,
      ).toEqual([
        UNIT_ID,
      ]);
      expect(
        output.face.evidence
          .validatedDisplayFactRefs,
      ).toEqual([
        'face-display-fact:v1:mouth',
      ]);
    });

    it('does not leak a rejected Face candidate into the final envelope', () => {
      const fixture =
        productionNeutralFixture();
      const input =
        finalizerInput(
          fixture,
        );
      const original =
        input
          .candidateFaceUtterance;
      const first =
        original.segments[0];
      if (
        first?.kind !==
        'neutral_fact_realization'
      ) {
        throw new Error(
          'expected neutral fact',
        );
      }

      const maliciousText =
        '입 모양을 보면 재물운이 강하고 사교적인 성격이에요.';
      const candidate = {
        ...original,
        segments: [
          {
            ...first,
            text: maliciousText,
          },
          ...original.segments.slice(
            1,
          ),
        ],
      };

      const output =
        finalizeCharacterFaceOutputV1({
          ...input,
          candidateFaceUtterance:
            candidate,
        });

      expect(output.face).toEqual({
        state:
          'protected_fallback',
        validationState:
          'fallback_used',
        guardVersion:
          'myeongha-character-face-semantic-guard-v1',
        publicReason:
          CHARACTER_FACE_PUBLIC_FALLBACK_REASON_V1,
      });

      const serialized =
        JSON.stringify(output);
      expect(
        serialized.includes(
          maliciousText,
        ),
      ).toBe(false);
      expect(
        serialized.includes(
          'NEUTRAL_FACT_TEXT_MISMATCH',
        ),
      ).toBe(false);
      expect(
        serialized.includes(
          'semantic_guard_failed',
        ),
      ).toBe(false);
    });

    it('rejects provider prose after the Face Semantic Guard boundary', () => {
      const input =
        finalizerInput();

      for (const injected of [
        {
          framingBefore:
            '관상으로 보면 성격이 강해 보여요.',
        },
        {
          framingAfter:
            '재물운도 좋아 보입니다.',
        },
        {
          memoryProposals: [
            {
              proposalKind:
                'memory',
            },
          ],
        },
        {
          relationshipEventProposals: [
            'COMPLETED_READING',
          ],
        },
        {
          guardDecision:
            'accepted',
        },
      ]) {
        expect(() =>
          finalizeCharacterFaceOutputV1({
            ...input,
            rawRendererOutput: {
              ...input
                .rawRendererOutput,
              ...injected,
            },
          }),
        ).toThrow(
          'contains unexpected field',
        );
      }
    });

    it('still uses the existing Output Guard for emotion, animation, and suggested-action allowlists', () => {
      const input =
        finalizerInput();

      expect(() =>
        finalizeCharacterFaceOutputV1({
          ...input,
          rawRendererOutput: {
            ...input
              .rawRendererOutput,
            emotion:
              'not-published',
          },
        }),
      ).toThrow(
        'emotion is not allowed',
      );

      expect(() =>
        finalizeCharacterFaceOutputV1({
          ...input,
          rawRendererOutput: {
            ...input
              .rawRendererOutput,
            animationCue:
              'not-published',
          },
        }),
      ).toThrow(
        'animationCue is not allowed',
      );

      expect(() =>
        finalizeCharacterFaceOutputV1({
          ...input,
          rawRendererOutput: {
            ...input
              .rawRendererOutput,
            suggestedActions: [
              {
                actionKey:
                  'buy_fortune_upgrade',
              },
            ],
          },
        }),
      ).toThrow(
        'actionKey is not allowed',
      );
    });

    it('returns only the public fallback surface when the bounded renderer itself cannot realize a qualifier', () => {
      const fixture =
        productionNeutralFixture([
          'measurement_only',
        ]);

      expect(
        fixture.rendererDecision
          .mode,
      ).toBe(
        'protected_fallback',
      );

      const output =
        finalizeCharacterFaceOutputV1({
          candidateFaceUtterance: {
            forged:
              'must never appear',
          },
          rawRendererOutput: {
            schemaVersion:
              'v1',
            emotion: 'neutral',
            animationCue:
              'idle',
            suggestedActions: [],
          },
          context:
            fixture.context,
          grounding:
            fixture.grounding,
          characterContentVersion:
            'character-content-alpha-v1',
          capability:
            fixture.faceCapability,
          perspective:
            fixture.facePerspective,
          deliveryProfile:
            fixture.faceDelivery,
          allowedSuggestedActionKeys:
            [],
        });

      expect(output.face).toEqual({
        state:
          'protected_fallback',
        validationState:
          'fallback_used',
        guardVersion:
          'myeongha-character-face-semantic-guard-v1',
        publicReason:
          CHARACTER_FACE_PUBLIC_FALLBACK_REASON_V1,
      });

      const serialized =
        JSON.stringify(output);
      expect(
        serialized.includes(
          'qualifier_realization_not_authorized',
        ),
      ).toBe(false);
      expect(
        serialized.includes(
          'must never appear',
        ),
      ).toBe(false);
    });

    it('rejects mixed Saju plus Face product context in this first vertical slice', () => {
      const input =
        finalizerInput();
      const mixedContext = {
        ...input.context,
        saju: {
          readingRef:
            'saju-reading-forbidden',
        },
      } as unknown as typeof input.context;

      expect(() =>
        finalizeCharacterFaceOutputV1({
          ...input,
          context:
            mixedContext,
        }),
      ).toThrow(
        'does not allow mixed Saju and Face',
      );
    });

    it('does not expose raw biometric, relationship-state, Commerce, or guard-failure payloads', () => {
      const output =
        finalizeCharacterFaceOutputV1(
          finalizerInput(),
        );
      const serialized =
        JSON.stringify(output);

      for (const forbidden of [
        'rawImage',
        'photo',
        'rawLandmarks',
        'MediaPipe',
        'poseMatrix',
        'faceEmbedding',
        'identityTemplate',
        'canonicalAssetDigest',
        'relationshipState',
        'price',
        'payment',
        'entitlement',
        'providerPrompt',
        'failures',
      ]) {
        expect(
          serialized.includes(
            forbidden,
          ),
        ).toBe(false);
      }
    });

    it('is deterministic for identical single-Character inputs', () => {
      const input =
        finalizerInput();

      expect(
        finalizeCharacterFaceOutputV1(
          input,
        ),
      ).toEqual(
        finalizeCharacterFaceOutputV1(
          input,
        ),
      );
    });
  },
);
