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
  CHARACTER_FACE_ARTIFACT_BUILDER_VERSION_V1,
  CHARACTER_FACE_READING_ARTIFACT_SCHEMA_VERSION_V1,
  buildCharacterFaceReadingArtifactCandidateV1,
  hashCharacterFaceFinalOutputV1,
  hashCharacterFaceReadingArtifactV1,
} from './character-face-reading-artifact.js';

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
      'face-engine-artifact-v1',
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
      'character-content-bundle-artifact-v1',
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
        'relationship-policy-artifact-v1',
      projectionPolicyVersion:
        'relationship-projection-artifact-v1',
      behaviorVersion:
        'relationship-behavior-artifact-v1',
    },
    rendererPolicy: {
      allowedEmotionIds: [
        'neutral',
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
      'face-capability-alpha-artifact-v1',
    characterId:
      'character.alpha',
    contentVersion:
      'character-content-alpha-v1',
    faceProfileVersion:
      'face-profile-alpha-artifact-v1',
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
      allowPartial: false,
      canInitiate: false,
    },
  });
}

function perspective() {
  const source = {
    schemaVersion:
      CHARACTER_FACE_PERSPECTIVE_SOURCE_SCHEMA_VERSION_V1,
    perspectiveVersion:
      'face-perspective-alpha-artifact-v1',
    characterId:
      'character.alpha',
    contentVersion:
      'character-content-alpha-v1',
    faceProfileVersion:
      'face-profile-alpha-artifact-v1',
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
      'face-delivery-alpha-artifact-v1',
    characterId:
      'character.alpha',
    contentVersion:
      'character-content-alpha-v1',
    faceProfileVersion:
      'face-profile-alpha-artifact-v1',
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

function fixture(
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

function buildInput(
  active = fixture(),
  suggestedActions:
    readonly unknown[] = [
      {
        actionKey:
          'open_face_detail',
      },
    ],
) {
  const candidateFaceUtterance =
    active.rendererDecision
      .mode ===
      'bounded_neutral'
      ? active.rendererDecision
          .utterance
      : {
          forged:
            'must never become an artifact',
        };

  return {
    candidateFaceUtterance,
    rawRendererOutput: {
      schemaVersion: 'v1',
      emotion: 'neutral',
      animationCue: 'idle',
      suggestedActions,
    },
    context:
      active.context,
    grounding:
      active.grounding,
    characterContentVersion:
      'character-content-alpha-v1',
    capability:
      active.faceCapability,
    perspective:
      active.facePerspective,
    deliveryProfile:
      active.faceDelivery,
    allowedSuggestedActionKeys: [
      'open_face_detail',
      'open_face_history',
    ],
  } as const;
}

describe(
  'TOPIC-FACE-005H-A immutable Face reading artifact',
  () => {
    it('builds a content-addressed reveal-forbidden artifact only from recomputed accepted final output', () => {
      const decision =
        buildCharacterFaceReadingArtifactCandidateV1(
          buildInput(),
        );

      expect(decision.mode).toBe(
        'artifact_candidate',
      );
      if (
        decision.mode !==
        'artifact_candidate'
      ) {
        throw new Error(
          'expected artifact_candidate',
        );
      }

      const artifact =
        decision.artifact;

      expect(artifact).toMatchObject({
        schemaVersion:
          CHARACTER_FACE_READING_ARTIFACT_SCHEMA_VERSION_V1,
        artifactBuilderVersion:
          CHARACTER_FACE_ARTIFACT_BUILDER_VERSION_V1,
        characterId:
          'character.alpha',
        characterContentVersion:
          'character-content-alpha-v1',
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
        validationState:
          'semantic_validated',
        commitState:
          'requires_atomic_commit',
        revealState:
          'forbidden_before_commit',
      });

      expect(
        artifact.artifactId,
      ).toMatch(
        /^character_face_reading_artifact_[0-9a-f]{24}$/u,
      );
      expect(
        artifact.finalOutputHash,
      ).toBe(
        hashCharacterFaceFinalOutputV1(
          artifact.finalOutput,
        ),
      );
      expect(
        hashCharacterFaceReadingArtifactV1(
          artifact,
        ),
      ).toMatch(
        /^sha256:v1:[0-9a-f]{64}$/u,
      );
      expect(
        artifact.readingPlanRef,
      ).toBe(
        artifact.finalOutput.face
          .state === 'accepted'
          ? artifact.finalOutput.face
              .utterance
              .readingPlanRef
          : '',
      );
    });

    it('pins capability, Perspective, delivery and all downstream runtime versions', () => {
      const decision =
        buildCharacterFaceReadingArtifactCandidateV1(
          buildInput(),
        );
      if (
        decision.mode !==
        'artifact_candidate'
      ) {
        throw new Error(
          'expected artifact_candidate',
        );
      }

      const artifact =
        decision.artifact;

      expect(
        artifact
          .capabilityProfileRef
          .capabilityVersion,
      ).toBe(
        'face-capability-alpha-artifact-v1',
      );
      expect(
        artifact
          .perspectiveProfileRef
          .perspectiveVersion,
      ).toBe(
        'face-perspective-alpha-artifact-v1',
      );
      expect(
        artifact
          .deliveryProfileRef
          .deliveryVersion,
      ).toBe(
        'face-delivery-alpha-artifact-v1',
      );
      expect(
        artifact.rendererVersion,
      ).toBe(
        'myeongha-character-face-bounded-renderer-v1',
      );
      expect(
        artifact.semanticGuardVersion,
      ).toBe(
        'myeongha-character-face-semantic-guard-v1',
      );
      expect(
        artifact.outputGuardVersion,
      ).toBe(
        'myeongha-character-output-guard-v1',
      );
      expect(
        artifact.finalizerVersion,
      ).toBe(
        'myeongha-character-face-finalizer-v1',
      );
    });

    it('is deterministic for identical governed inputs', () => {
      const input =
        buildInput();
      expect(
        buildCharacterFaceReadingArtifactCandidateV1(
          input,
        ),
      ).toEqual(
        buildCharacterFaceReadingArtifactCandidateV1(
          input,
        ),
      );
    });

    it('changes artifact identity when accepted final output changes', () => {
      const first =
        buildCharacterFaceReadingArtifactCandidateV1(
          buildInput(),
        );
      const second =
        buildCharacterFaceReadingArtifactCandidateV1(
          buildInput(
            fixture(),
            [
              {
                actionKey:
                  'open_face_history',
              },
            ],
          ),
        );

      if (
        first.mode !==
          'artifact_candidate' ||
        second.mode !==
          'artifact_candidate'
      ) {
        throw new Error(
          'expected artifact candidates',
        );
      }

      expect(
        second.artifact
          .artifactId,
      ).not.toBe(
        first.artifact
          .artifactId,
      );
      expect(
        second.artifact
          .finalOutputHash,
      ).not.toBe(
        first.artifact
          .finalOutputHash,
      );
    });

    it('returns public protected fallback and never creates an artifact when finalization is not accepted', () => {
      const active =
        fixture([
          'measurement_only',
        ]);

      const decision =
        buildCharacterFaceReadingArtifactCandidateV1(
          buildInput(
            active,
            [],
          ),
        );

      expect(decision).toEqual({
        mode:
          'protected_fallback',
        validationState:
          'fallback_used',
        publicReason:
          'face_output_unavailable',
        revealState:
          'forbidden',
      });
      expect(
        JSON.stringify(
          decision,
        ),
      ).not.toContain(
        'qualifier_realization_not_authorized',
      );
    });

    it('does not trust a malicious candidate Face utterance as an artifact source', () => {
      const active =
        fixture();
      if (
        active.rendererDecision
          .mode !==
        'bounded_neutral'
      ) {
        throw new Error(
          'expected bounded neutral',
        );
      }

      const original =
        active.rendererDecision
          .utterance;
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

      const decision =
        buildCharacterFaceReadingArtifactCandidateV1({
          ...buildInput(active),
          candidateFaceUtterance: {
            ...original,
            segments: [
              {
                ...first,
                text:
                  '이 입은 재물운이 좋고 사교적인 성격을 뜻해요.',
              },
              ...original.segments.slice(
                1,
              ),
            ],
          },
        });

      expect(decision).toEqual({
        mode:
          'protected_fallback',
        validationState:
          'fallback_used',
        publicReason:
          'face_output_unavailable',
        revealState:
          'forbidden',
      });
    });

    it('keeps raw biometric, relationship-state, Commerce, provider and request metadata outside the artifact', () => {
      const decision =
        buildCharacterFaceReadingArtifactCandidateV1(
          buildInput(),
        );
      if (
        decision.mode !==
        'artifact_candidate'
      ) {
        throw new Error(
          'expected artifact_candidate',
        );
      }

      const serialized =
        JSON.stringify(
          decision.artifact,
        );
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
        'providerKey',
        'modelKey',
        'requestId',
        'attemptId',
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
