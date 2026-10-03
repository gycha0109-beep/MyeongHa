import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  resolveCharacterRuntimeAuthorityLaneV1,
} from '../packages/character-content/src/runtime-authority-lane-v1.js';
import type {
  CharacterRuntimeContextV1,
} from '../packages/domain/src/character-runtime-context.js';
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
  resolveCharacterFaceNamedProfileBundleV1,
} from '../packages/domain/src/character-face-named-profile-registry.js';
import {
  renderCharacterFaceBoundedNeutralV1,
} from '../packages/domain/src/character-face-bounded-renderer.js';
import {
  buildCharacterFaceReadingArtifactCandidateV1,
  type CharacterFaceReadingArtifactBuildDecisionV1,
} from '../packages/domain/src/character-face-reading-artifact.js';
import {
  InMemoryCharacterFaceReadingCommitPortV1,
} from '../apps/api/src/character-face-reading-artifact-commit.js';
import {
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

const REQUIRED_PROHIBITION =
  'traditional_semantic_promotion_without_governed_claim';

function scalarUnit(
  digit: string,
  capabilityKey: string,
  value: number,
  qualifiers: readonly string[] = [],
) {
  return Object.freeze({
    unitId:
      `face-grounding-unit:${digit.repeat(64)}`,
    kind:
      'neutral_observation' as const,
    capabilityKey,
    observationRef:
      `face-neutral-observation:v1:${capabilityKey}`,
    displayFactRef:
      `face-display-fact:v1:${capabilityKey}`,
    displayValue: Object.freeze({
      kind: 'scalar' as const,
      value,
      unit: 'ratio' as const,
    }),
    qualifiers:
      Object.freeze([...qualifiers].sort()),
    prohibitedExtensions:
      Object.freeze([
        REQUIRED_PROHIBITION,
      ]),
    realizationPolicyRef:
      FACE_CHARACTER_NEUTRAL_REALIZATION_POLICY_V1,
  });
}

function noseUnit() {
  return Object.freeze({
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
    displayValue: Object.freeze({
      kind:
        'composite_visible_nasal_geometry' as const,
      axes: Object.freeze([
        Object.freeze({
          axisKey: 'alar_width_ratio',
          value: 0.31001,
          unit: 'ratio' as const,
          sourceMetricRef:
            'metric:nose:alar',
        }),
        Object.freeze({
          axisKey:
            'nostril_visibility_angle',
          value: 12.3456,
          unit: 'degree' as const,
          sourceMetricRef:
            'metric:nose:nostril',
        }),
      ]),
    }),
    qualifiers: Object.freeze([]),
    prohibitedExtensions:
      Object.freeze([
        REQUIRED_PROHIBITION,
      ]),
    realizationPolicyRef:
      FACE_CHARACTER_NEUTRAL_REALIZATION_POLICY_V1,
  });
}

function groundingBundle(
  mouthQualifiers: readonly string[] = [],
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
      'face-engine-seyeon-named-e2e-v1',
    sourceResultHash:
      SOURCE_RESULT_HASH,
    projectionHash:
      PROJECTION_HASH,
    groundingHash:
      GROUNDING_HASH,
    displayFactsHash:
      DISPLAY_FACTS_HASH,
    units: Object.freeze([
      scalarUnit(
        '1',
        'eye.width_height_ratio',
        2.14,
      ),
      noseUnit(),
      scalarUnit(
        '3',
        'mouth.width_and_relative_size',
        0.61,
        mouthQualifiers,
      ),
    ]),
    unavailableSections:
      Object.freeze([]),
    prohibitedInferences:
      Object.freeze([]),
  };

  return Object.freeze({
    ...withoutHash,
    bundleHash:
      `face-character-grounding:${hashCharacterFaceGroundingBundleMaterialV1(
        withoutHash,
      )}`,
  });
}

function seyeonRuntimeContext(
  bundle:
    ReturnType<typeof groundingBundle>,
) {
  const lane =
    resolveCharacterRuntimeAuthorityLaneV1(
      'seyeon',
    );
  const profiles =
    resolveCharacterFaceNamedProfileBundleV1(
      'seyeon',
    );

  if (
    lane === null ||
    profiles === null
  ) {
    throw new Error(
      'Seyeon named authority and Face profiles are required.',
    );
  }

  const source =
    profiles.authoringSource;

  const base = {
    schemaVersion: 'v1',
    characterId:
      source.characterId,
    contentBundleId:
      'character-runtime-authority-lane-seyeon-v1',
    contentVersion:
      source.contentVersion,
    speech:
      source.speech,
    voiceAuthority: {
      characterId:
        source.characterId,
      surface:
        'general_chat',
      source:
        'published_character_content',
      contentVersion:
        source.contentVersion,
      speech:
        source.speech,
      communication:
        source.communication,
    },
    persona:
      lane.runtime.persona,
    behavior:
      lane.runtime.behavior,
    sajuProfile:
      lane.runtime.sajuProfile,
    relationship: {
      schemaVersion:
        'v1',
      relationshipRevision: 1,
      relationshipPolicyVersion:
        'relationship-policy-seyeon-face-e2e-v1',
      projectionPolicyVersion:
        'relationship-projection-seyeon-face-e2e-v1',
      stageKey:
        'public',
      closenessBand:
        'low',
      trustBand:
        'low',
      frictionBand:
        'low',
      recentEventKeys: [],
      behaviorVersion:
        lane.runtime
          .relationshipBehavior
          .behaviorVersion,
      matchedBehaviorRuleKey:
        null,
      mode:
        lane.runtime
          .relationshipBehavior
          .defaultMode,
    },
    rendererPolicy: {
      allowedEmotionIds: [
        'neutral',
      ],
      allowedAnimationCueIds: [
        'idle',
      ],
    },
    worldRelations: [],
    lifeFacts: [],
    memories: [],
    recentMessages: [],
    saju: null,
  } as unknown as CharacterRuntimeContextV1;

  const context =
    admitCharacterRuntimeFaceGroundingV1({
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

  return {
    lane,
    profiles,
    source,
    context,
  } as const;
}

function artifactDecision(
  input: Readonly<{
    mouthQualifiers?:
      readonly string[];
    actionKey?:
      'open_face_detail'
      | 'open_face_history';
    forgedMouthText?: string;
  }> = {},
): CharacterFaceReadingArtifactBuildDecisionV1 {
  const grounding =
    groundingBundle(
      input.mouthQualifiers ?? [],
    );
  const {
    profiles,
    source,
    context,
  } = seyeonRuntimeContext(
    grounding,
  );

  const rendererDecision =
    renderCharacterFaceBoundedNeutralV1({
      context,
      grounding,
      characterContentVersion:
        source.contentVersion,
      capability:
        profiles.capability,
      perspective:
        profiles.perspective,
      deliveryProfile:
        profiles.delivery,
    });

  let candidateFaceUtterance:
    unknown =
      rendererDecision.mode ===
        'bounded_neutral'
        ? rendererDecision.utterance
        : {
            forged:
              'renderer fallback must not reveal',
          };

  if (
    input.forgedMouthText !==
      undefined &&
    rendererDecision.mode ===
      'bounded_neutral'
  ) {
    candidateFaceUtterance = {
      ...rendererDecision.utterance,
      segments:
        rendererDecision
          .utterance
          .segments
          .map((segment) =>
            segment.kind ===
              'neutral_fact_realization' &&
            segment.capabilityKey ===
              'mouth.width_and_relative_size'
              ? {
                  ...segment,
                  text:
                    input
                      .forgedMouthText,
                }
              : segment,
          ),
    };
  }

  return buildCharacterFaceReadingArtifactCandidateV1({
    candidateFaceUtterance,
    rawRendererOutput: {
      schemaVersion: 'v1',
      emotion: 'neutral',
      animationCue: 'idle',
      suggestedActions:
        input.actionKey ===
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
      source.contentVersion,
    capability:
      profiles.capability,
    perspective:
      profiles.perspective,
    deliveryProfile:
      profiles.delivery,
    allowedSuggestedActionKeys: [
      'open_face_detail',
      'open_face_history',
    ],
  });
}

describe(
  'TOPIC-FACE-005I-C Seyeon named Character Face E2E',
  () => {
    it('runs the real Seyeon authority/profile path through atomic commit before controlled reveal', () => {
      const grounding =
        groundingBundle();
      const {
        lane,
        profiles,
        source,
        context,
      } =
        seyeonRuntimeContext(
          grounding,
        );

      expect(
        source.characterId,
      ).toBe('seyeon');
      expect(
        source.contentVersion,
      ).toBe(
        lane.authorityVersion,
      );
      expect(
        context.voiceAuthority
          .surface,
      ).toBe('face_product');
      expect(
        context.voiceAuthority
          .speech,
      ).toBe(source.speech);
      expect(
        context.voiceAuthority
          .communication,
      ).toBe(
        source.communication,
      );
      expect(
        context.persona
          .questioning
          .preferredStrategies,
      ).toEqual(
        source.questioning
          .preferredStrategies,
      );

      expect(
        profiles.capability
          .sourceContentVersion,
      ).toBe(
        source.contentVersion,
      );
      expect(
        profiles.perspective
          .sourceContentVersion,
      ).toBe(
        source.contentVersion,
      );
      expect(
        profiles.delivery
          .sourceContentVersion,
      ).toBe(
        source.contentVersion,
      );

      const rendererDecision =
        renderCharacterFaceBoundedNeutralV1({
          context,
          grounding,
          characterContentVersion:
            source.contentVersion,
          capability:
            profiles.capability,
          perspective:
            profiles.perspective,
          deliveryProfile:
            profiles.delivery,
        });

      expect(
        rendererDecision.mode,
      ).toBe(
        'bounded_neutral',
      );
      if (
        rendererDecision.mode !==
        'bounded_neutral'
      ) {
        throw new Error(
          'expected bounded Seyeon Face render',
        );
      }

      const renderedText =
        rendererDecision
          .utterance
          .segments
          .map((segment) =>
            segment.text,
          )
          .join('\n');

      for (const exact of [
        '2.14 ratio',
        '0.31001 ratio',
        '12.3456 degree',
        '0.61 ratio',
      ]) {
        expect(
          renderedText,
        ).toContain(exact);
      }

      for (const forbidden of [
        '61%',
        '입이 넓',
        '성격',
        '재물',
        '운명',
        '연애운',
      ]) {
        expect(
          renderedText,
        ).not.toContain(forbidden);
      }

      const decision =
        artifactDecision({
          actionKey:
            'open_face_detail',
        });
      expect(
        decision.mode,
      ).toBe(
        'artifact_candidate',
      );
      if (
        decision.mode !==
        'artifact_candidate'
      ) {
        throw new Error(
          'expected Seyeon artifact candidate',
        );
      }

      expect(
        decision.artifact
          .characterId,
      ).toBe('seyeon');
      expect(
        decision.artifact
          .characterContentVersion,
      ).toBe(
        source.contentVersion,
      );
      expect(
        decision.artifact
          .sourceResultHash,
      ).toBe(
        grounding.sourceResultHash,
      );
      expect(
        decision.artifact
          .projectionHash,
      ).toBe(
        grounding.projectionHash,
      );
      expect(
        decision.artifact
          .groundingHash,
      ).toBe(
        grounding.groundingHash,
      );
      expect(
        decision.artifact
          .displayFactsHash,
      ).toBe(
        grounding.displayFactsHash,
      );
      expect(
        decision.artifact
          .bundleHash,
      ).toBe(
        grounding.bundleHash,
      );
      expect(
        decision.artifact
          .validationState,
      ).toBe(
        'semantic_validated',
      );
      expect(
        decision.artifact
          .commitState,
      ).toBe(
        'requires_atomic_commit',
      );
      expect(
        decision.artifact
          .revealState,
      ).toBe(
        'forbidden_before_commit',
      );

      const port =
        new InMemoryCharacterFaceReadingCommitPortV1();
      const result =
        commitAndRevealCharacterFaceReadingV1({
          turnId:
            'seyeon-face-turn-1',
          attemptId:
            'seyeon-face-attempt-1',
          artifactDecision:
            decision,
          commitPort: port,
        });

      expect(result).toMatchObject({
        status:
          'delivered',
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
      expect(
        port.committedCount,
      ).toBe(1);

      const serialized =
        JSON.stringify(result);
      for (const forbidden of [
        '61%',
        '입이 넓',
        '성격',
        '재물운',
        '연애운',
        'personalityMapping',
        'fortuneMapping',
        'providerPrompt',
        'rawLandmarks',
        'faceEmbedding',
      ]) {
        expect(
          serialized,
        ).not.toContain(
          forbidden,
        );
      }
    });

    it('replays the same Seyeon turn idempotently and rejects replacement with a different artifact', () => {
      const port =
        new InMemoryCharacterFaceReadingCommitPortV1();
      const detail =
        artifactDecision({
          actionKey:
            'open_face_detail',
        });

      const first =
        commitAndRevealCharacterFaceReadingV1({
          turnId:
            'seyeon-face-turn-replay',
          attemptId:
            'attempt-1',
          artifactDecision:
            detail,
          commitPort: port,
        });
      const replay =
        commitAndRevealCharacterFaceReadingV1({
          turnId:
            'seyeon-face-turn-replay',
          attemptId:
            'attempt-2',
          artifactDecision:
            detail,
          commitPort: port,
        });

      expect(
        first.status,
      ).toBe('delivered');
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
        port.committedCount,
      ).toBe(1);

      expect(() =>
        commitAndRevealCharacterFaceReadingV1({
          turnId:
            'seyeon-face-turn-replay',
          attemptId:
            'attempt-3',
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

    it('blocks semantic widening of 0.61 ratio before commit and reveal', () => {
      const decision =
        artifactDecision({
          forgedMouthText:
            '입 너비·상대 크기는 61%라서 입이 넓고 사교적인 성격입니다.',
        });

      expect(
        decision,
      ).toEqual({
        mode:
          'protected_fallback',
        validationState:
          'fallback_used',
        publicReason:
          'face_output_unavailable',
        revealState:
          'forbidden',
      });

      const port =
        new InMemoryCharacterFaceReadingCommitPortV1();
      const result =
        commitAndRevealCharacterFaceReadingV1({
          turnId:
            'seyeon-face-turn-forged',
          attemptId:
            'attempt-1',
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
    });

    it('keeps source qualifier fallback reveal-forbidden with no commit', () => {
      const decision =
        artifactDecision({
          mouthQualifiers: [
            'measurement_only',
          ],
        });

      expect(
        decision.mode,
      ).toBe(
        'protected_fallback',
      );

      const port =
        new InMemoryCharacterFaceReadingCommitPortV1();
      const result =
        commitAndRevealCharacterFaceReadingV1({
          turnId:
            'seyeon-face-turn-qualifier',
          attemptId:
            'attempt-1',
          artifactDecision:
            decision,
          commitPort: port,
        });

      expect(
        result.status,
      ).toBe(
        'protected_fallback_required',
      );
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
        'finalOutput',
      );
    });
  },
);
