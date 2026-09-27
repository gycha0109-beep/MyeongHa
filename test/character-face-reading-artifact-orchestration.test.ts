import {
  describe,
  expect,
  it,
} from 'vitest';

import type {
  CharacterRuntimeContextV1,
} from '../packages/domain/src/character-runtime-context.js';
import {
  CHARACTER_FACE_CAPABILITY_SCHEMA_VERSION_V1,
  CHARACTER_FACE_CAPABILITY_SOURCE_SCHEMA_VERSION_V1,
  admitCharacterFaceCapabilityProfileV1,
} from '../packages/domain/src/character-face-capability.js';
import {
  CHARACTER_FACE_DELIVERY_PROFILE_SCHEMA_VERSION_V1,
  CHARACTER_FACE_DELIVERY_SOURCE_SCHEMA_VERSION_V1,
  admitCharacterFaceDeliveryProfileV1,
} from '../packages/domain/src/character-face-delivery-profile.js';
import {
  CHARACTER_FACE_REALIZATION_MODE_V1,
  CHARACTER_FACE_SOURCE_BINDING_SCHEMA_VERSION_V1,
  FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
  FACE_CHARACTER_GROUNDING_REF_SCHEMA_VERSION_V1,
  admitCharacterRuntimeFaceGroundingV1,
} from '../packages/domain/src/character-face-grounding-admission.js';
import {
  FACE_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
  FACE_CHARACTER_NEUTRAL_REALIZATION_POLICY_V1,
  FACE_CHARACTER_REALIZATION_POLICY_REGISTRY_VERSION_V1,
  hashCharacterFaceGroundingBundleMaterialV1,
} from '../packages/domain/src/character-face-grounding-bundle.js';
import {
  CHARACTER_FACE_ATTENTION_REGISTRY_VERSION_V1,
  CHARACTER_FACE_PERSPECTIVE_SCHEMA_VERSION_V1,
  CHARACTER_FACE_PERSPECTIVE_SOURCE_SCHEMA_VERSION_V1,
  admitCharacterFacePerspectiveProfileV1,
} from '../packages/domain/src/character-face-perspective.js';
import {
  renderCharacterFaceBoundedNeutralV1,
} from '../packages/domain/src/character-face-bounded-renderer.js';
import {
  buildCharacterFaceReadingArtifactCandidateV1,
  type CharacterFaceReadingArtifactBuildDecisionV1,
} from '../packages/domain/src/character-face-reading-artifact.js';
import {
  InMemoryCharacterFaceReadingCommitPortV1,
  type CharacterFaceReadingCommitPortV1,
} from '../apps/api/src/character-face-reading-artifact-commit.js';
import {
  CHARACTER_FACE_CONTROLLED_REVEAL_VERSION_V1,
  CharacterFaceControlledRevealErrorV1,
  commitAndRevealCharacterFaceReadingV1,
} from '../apps/api/src/character-face-reading-artifact-orchestration.js';

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
      'face-engine-controlled-reveal-v1',
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
      'character-content-bundle-controlled-reveal-v1',
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
        'relationship-policy-controlled-reveal-v1',
      projectionPolicyVersion:
        'relationship-projection-controlled-reveal-v1',
      behaviorVersion:
        'relationship-behavior-controlled-reveal-v1',
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
      'face-capability-alpha-controlled-reveal-v1',
    characterId:
      'character.alpha',
    contentVersion:
      'character-content-alpha-v1',
    faceProfileVersion:
      'face-profile-alpha-controlled-reveal-v1',
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
      'face-perspective-alpha-controlled-reveal-v1',
    characterId:
      'character.alpha',
    contentVersion:
      'character-content-alpha-v1',
    faceProfileVersion:
      'face-profile-alpha-controlled-reveal-v1',
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
      'face-delivery-alpha-controlled-reveal-v1',
    characterId:
      'character.alpha',
    contentVersion:
      'character-content-alpha-v1',
    faceProfileVersion:
      'face-profile-alpha-controlled-reveal-v1',
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
      locale:
        source.locale,
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

function artifactDecision(
  input?: Readonly<{
    qualifiers?:
      readonly string[];
    actionKey?:
      'open_face_detail'
      | 'open_face_history';
  }>,
): CharacterFaceReadingArtifactBuildDecisionV1 {
  const grounding =
    groundingBundle(
      input?.qualifiers ??
      [],
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

  return buildCharacterFaceReadingArtifactCandidateV1({
    candidateFaceUtterance:
      rendererDecision.mode ===
      'bounded_neutral'
        ? rendererDecision
            .utterance
        : {
            forged:
              'must never reveal',
          },
    rawRendererOutput: {
      schemaVersion: 'v1',
      emotion: 'neutral',
      animationCue: 'idle',
      suggestedActions:
        input?.actionKey ===
        undefined
          ? []
          : [
              {
                actionKey:
                  input.actionKey,
              },
            ],
    },
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
    allowedSuggestedActionKeys: [
      'open_face_detail',
      'open_face_history',
    ],
  });
}

describe(
  'TOPIC-FACE-005H-C controlled Face artifact reveal',
  () => {
    it('closes the production-neutral Face path through atomic commit before reveal', () => {
      const decision =
        artifactDecision({
          actionKey:
            'open_face_detail',
        });
      expect(decision.mode).toBe(
        'artifact_candidate',
      );

      const port =
        new InMemoryCharacterFaceReadingCommitPortV1();
      const result =
        commitAndRevealCharacterFaceReadingV1({
          turnId:
            'face-turn-1',
          attemptId:
            'face-attempt-1',
          artifactDecision:
            decision,
          commitPort: port,
        });

      expect(result).toMatchObject({
        status: 'delivered',
        controlledRevealVersion:
          CHARACTER_FACE_CONTROLLED_REVEAL_VERSION_V1,
        replayedCommittedTurn:
          false,
        stateTrace: [
          'received',
          'planned',
          'artifact_validated',
          'committed',
          'delivered',
        ],
        revealState:
          'controlled_reveal_after_atomic_commit',
      });

      if (
        result.status !==
        'delivered' ||
        decision.mode !==
        'artifact_candidate'
      ) {
        throw new Error(
          'expected delivered artifact',
        );
      }

      expect(
        result.artifactId,
      ).toBe(
        decision.artifact
          .artifactId,
      );
      expect(
        result.finalOutput,
      ).toEqual(
        decision.artifact
          .finalOutput,
      );
      expect(
        result.commitReceipt
          .artifactId,
      ).toBe(
        decision.artifact
          .artifactId,
      );
      expect(
        port.committedCount,
      ).toBe(1);
    });

    it('replays the same committed turn idempotently and reveals the stored committed output', () => {
      const decision =
        artifactDecision();
      const port =
        new InMemoryCharacterFaceReadingCommitPortV1();

      const first =
        commitAndRevealCharacterFaceReadingV1({
          turnId:
            'face-turn-2',
          attemptId:
            'face-attempt-1',
          artifactDecision:
            decision,
          commitPort: port,
        });
      const replay =
        commitAndRevealCharacterFaceReadingV1({
          turnId:
            'face-turn-2',
          attemptId:
            'face-attempt-2',
          artifactDecision:
            decision,
          commitPort: port,
        });

      expect(
        replay.status,
      ).toBe('delivered');
      if (
        first.status !==
          'delivered' ||
        replay.status !==
          'delivered'
      ) {
        throw new Error(
          'expected delivered replay',
        );
      }

      expect(
        replay
          .replayedCommittedTurn,
      ).toBe(true);
      expect(
        replay.commitReceipt,
      ).toEqual(
        first.commitReceipt,
      );
      expect(
        replay.finalOutput,
      ).toEqual(
        first.finalOutput,
      );
      expect(
        port.committedCount,
      ).toBe(1);
    });

    it('keeps artifact-builder fallback reveal-forbidden and performs no commit', () => {
      const decision =
        artifactDecision({
          qualifiers: [
            'measurement_only',
          ],
        });
      expect(decision.mode).toBe(
        'protected_fallback',
      );

      const port =
        new InMemoryCharacterFaceReadingCommitPortV1();
      const result =
        commitAndRevealCharacterFaceReadingV1({
          turnId:
            'face-turn-fallback',
          attemptId:
            'face-attempt-1',
          artifactDecision:
            decision,
          commitPort: port,
        });

      expect(result).toEqual({
        status:
          'protected_fallback_required',
        publicReason:
          'face_output_unavailable',
        stateTrace: [
          'received',
          'planned',
          'fallback_required',
        ],
        revealState:
          'forbidden',
      });
      expect(
        port.committedCount,
      ).toBe(0);

      const serialized =
        JSON.stringify(result);
      expect(
        serialized,
      ).not.toContain(
        'measurement_only',
      );
      expect(
        serialized,
      ).not.toContain(
        'artifactId',
      );
      expect(
        serialized,
      ).not.toContain(
        'finalOutput',
      );
    });

    it('rejects replacement of a committed turn with a different artifact before reveal', () => {
      const port =
        new InMemoryCharacterFaceReadingCommitPortV1();

      commitAndRevealCharacterFaceReadingV1({
        turnId:
          'face-turn-3',
        attemptId:
          'face-attempt-1',
        artifactDecision:
          artifactDecision({
            actionKey:
              'open_face_detail',
          }),
        commitPort: port,
      });

      expect(() =>
        commitAndRevealCharacterFaceReadingV1({
          turnId:
            'face-turn-3',
          attemptId:
            'face-attempt-2',
          artifactDecision:
            artifactDecision({
              actionKey:
                'open_face_history',
            }),
          commitPort: port,
        }),
      ).toThrow(
        CharacterFaceControlledRevealErrorV1,
      );
      expect(
        port.committedCount,
      ).toBe(1);
    });

    it('does not reveal when the commit port fails', () => {
      let commitCalls = 0;
      const port:
        CharacterFaceReadingCommitPortV1 = {
          findCommitted: () =>
            null,
          commit: () => {
            commitCalls += 1;
            throw new Error(
              'database unavailable',
            );
          },
        };

      expect(() =>
        commitAndRevealCharacterFaceReadingV1({
          turnId:
            'face-turn-4',
          attemptId:
            'face-attempt-1',
          artifactDecision:
            artifactDecision(),
          commitPort: port,
        }),
      ).toThrow(
        CharacterFaceControlledRevealErrorV1,
      );
      expect(commitCalls).toBe(1);
    });

    it('rejects an artifact whose pre-commit lifecycle was forged', () => {
      const decision =
        artifactDecision();
      if (
        decision.mode !==
        'artifact_candidate'
      ) {
        throw new Error(
          'expected artifact candidate',
        );
      }

      const forged =
        Object.freeze({
          ...decision,
          artifact:
            Object.freeze({
              ...decision.artifact,
              revealState:
                'revealed',
            }),
        }) as unknown as CharacterFaceReadingArtifactBuildDecisionV1;

      expect(() =>
        commitAndRevealCharacterFaceReadingV1({
          turnId:
            'face-turn-5',
          attemptId:
            'face-attempt-1',
          artifactDecision:
            forged,
          commitPort:
            new InMemoryCharacterFaceReadingCommitPortV1(),
        }),
      ).toThrow(
        CharacterFaceControlledRevealErrorV1,
      );
    });

    it('reveals only final output and receipt material, without raw biometrics, Commerce, provider metadata, or internal failure details', () => {
      const result =
        commitAndRevealCharacterFaceReadingV1({
          turnId:
            'face-turn-6',
          attemptId:
            'face-attempt-1',
          artifactDecision:
            artifactDecision(),
          commitPort:
            new InMemoryCharacterFaceReadingCommitPortV1(),
        });

      expect(result.status).toBe(
        'delivered',
      );
      const serialized =
        JSON.stringify(result);

      for (const forbidden of [
        'rawImage',
        'photo',
        'rawLandmarks',
        'MediaPipe',
        'poseMatrix',
        'faceEmbedding',
        'identityTemplate',
        'canonicalAssetDigest',
        'price',
        'payment',
        'entitlement',
        'providerKey',
        'modelKey',
        'requestId',
        'failures',
        'semantic_guard_failed',
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
