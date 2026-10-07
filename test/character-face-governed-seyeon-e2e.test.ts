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
  resolveCharacterFaceNamedProfileBundleV1,
} from '../packages/domain/src/character-face-named-profile-registry.js';
import {
  CHARACTER_FACE_GOVERNED_INTERPRETATION_AUTHORIZATION_SCOPE_V1,
  CHARACTER_FACE_GOVERNED_INTERPRETATION_AUTHORIZATION_STATE_V1,
  CHARACTER_FACE_GOVERNED_INTERPRETATION_HASH_PREFIX_V1,
  CHARACTER_FACE_GOVERNED_INTERPRETATION_REQUIRED_PROHIBITIONS_V1,
  CHARACTER_FACE_GOVERNED_INTERPRETATION_SCHEMA_VERSION_V1,
  hashCharacterFaceGovernedInterpretationMaterialV1,
  type CharacterFaceGovernedInterpretationSourceBindingV1,
} from '../packages/domain/src/character-face-governed-interpretation.js';
import {
  buildCharacterFaceGovernedReadingArtifactCandidateV1,
} from '../packages/domain/src/character-face-governed-reading-artifact.js';
import {
  InMemoryCharacterFaceGovernedReadingCommitPortV1,
} from '../apps/api/src/character-face-governed-reading-artifact-commit.js';
import {
  CharacterFaceGovernedControlledRevealErrorV1,
  commitAndRevealCharacterFaceGovernedReadingV1,
} from '../apps/api/src/character-face-governed-reading-artifact-orchestration.js';

const SOURCE_RESULT_HASH =
  'face-topic-source-result:' + 'a'.repeat(64);
const PROJECTION_HASH =
  'face-product-projection:' + 'b'.repeat(64);
const GROUNDING_HASH =
  'face-grounding:' + 'c'.repeat(64);
const DISPLAY_FACTS_HASH =
  'face-display-facts:' + 'd'.repeat(64);
const BUNDLE_HASH =
  'face-character-grounding:' + 'e'.repeat(64);

const expectedSource:
  CharacterFaceGovernedInterpretationSourceBindingV1 =
    Object.freeze({
      sourceContractVersion:
        'face-product-interpretation-v1',
      sourceAuthorityRef:
        'face-authority:product-reading:test',
      sourceResultHash:
        SOURCE_RESULT_HASH,
      topicKey:
        'face.discover.extended',
    });

const requiredProhibitions =
  Object.freeze([
    ...CHARACTER_FACE_GOVERNED_INTERPRETATION_REQUIRED_PROHIBITIONS_V1,
  ].sort());

function unit(
  input: Readonly<{
    interpretationId: string;
    lensKey: string;
    direction:
      | 'favorable'
      | 'source_conflict'
      | 'mixed_or_conditional';
    evidenceStatus:
      | 'direct_evidence'
      | 'source_conflict'
      | 'parallel_evidence';
    text: string;
    observationRef: string;
    bindingRef: string;
    evidenceRefs: readonly string[];
    sourceRef: string;
    conditions?: readonly string[];
  }>,
) {
  return Object.freeze({
    interpretationId:
      input.interpretationId,
    lensKey:
      input.lensKey,
    direction:
      input.direction,
    evidenceStatus:
      input.evidenceStatus,
    protectedMeaningText:
      input.text,
    observationRefs:
      Object.freeze([
        input.observationRef,
      ]),
    bindingRefs:
      Object.freeze([
        input.bindingRef,
      ]),
    evidenceRefs:
      Object.freeze([
        ...input.evidenceRefs,
      ].sort()),
    sourceRefs:
      Object.freeze([
        input.sourceRef,
      ]),
    conditions:
      Object.freeze([
        ...(input.conditions ?? []),
      ].sort()),
    qualifiers:
      Object.freeze([]),
    prohibitedExtensions:
      requiredProhibitions,
  });
}

function governedCandidate() {
  const units = Object.freeze([
    unit({
      interpretationId:
        'interpretation:wealth:1',
      lensKey:
        'wealth',
      direction:
        'favorable',
      evidenceStatus:
        'direct_evidence',
      text:
        '코 쪽에서는 재물 흐름을 좋게 보는 직접 근거가 잡혀요.',
      observationRef:
        'observation:nose:1',
      bindingRef:
        'binding:nose:wealth:1',
      evidenceRefs: [
        'evidence:traditional:wealth:1',
      ],
      sourceRef:
        'source:scan:1',
    }),
    unit({
      interpretationId:
        'interpretation:relations:1',
      lensKey:
        'interpersonal_relations',
      direction:
        'source_conflict',
      evidenceStatus:
        'source_conflict',
      text:
        '눈 쪽 대인관계는 좋은 근거와 주의해서 볼 근거가 함께 잡혀요.',
      observationRef:
        'observation:eye:1',
      bindingRef:
        'binding:eye:relations:1',
      evidenceRefs: [
        'evidence:traditional:relations:challenging',
        'evidence:traditional:relations:favorable',
      ],
      sourceRef:
        'source:scan:2',
      conditions: [
        'same_lens_opposing_direct_evidence',
      ],
    }),
    unit({
      interpretationId:
        'interpretation:career:1',
      lensKey:
        'career',
      direction:
        'mixed_or_conditional',
      evidenceStatus:
        'parallel_evidence',
      text:
        '직업 쪽은 조건에 따라 함께 볼 수 있는 근거가 있어요.',
      observationRef:
        'observation:brow:1',
      bindingRef:
        'binding:brow:career:1',
      evidenceRefs: [
        'evidence:traditional:career:1',
      ],
      sourceRef:
        'source:scan:3',
      conditions: [
        'source_condition_required',
      ],
    }),
  ]);

  const withoutHash = {
    schemaVersion:
      CHARACTER_FACE_GOVERNED_INTERPRETATION_SCHEMA_VERSION_V1,
    sourceContractVersion:
      expectedSource.sourceContractVersion,
    sourceAuthorityRef:
      expectedSource.sourceAuthorityRef,
    sourceResultHash:
      expectedSource.sourceResultHash,
    topicKey:
      expectedSource.topicKey,
    authorizationState:
      CHARACTER_FACE_GOVERNED_INTERPRETATION_AUTHORIZATION_STATE_V1,
    authorizationScope:
      CHARACTER_FACE_GOVERNED_INTERPRETATION_AUTHORIZATION_SCOPE_V1,
    authorizationReceiptRef:
      'authorization:face-reading:test',
    units,
  };

  return Object.freeze({
    ...withoutHash,
    handoffHash:
      CHARACTER_FACE_GOVERNED_INTERPRETATION_HASH_PREFIX_V1 +
      hashCharacterFaceGovernedInterpretationMaterialV1(
        withoutHash,
      ),
  });
}

function seyeonRuntime() {
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
      'Seyeon runtime authority and Face profiles are required.',
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
        'relationship-policy-seyeon-governed-artifact-e2e-v1',
      projectionPolicyVersion:
        'relationship-projection-seyeon-governed-artifact-e2e-v1',
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
      context:
        base,
      source: {
        schemaVersion:
          CHARACTER_FACE_SOURCE_BINDING_SCHEMA_VERSION_V1,
        topicKey:
          expectedSource.topicKey,
        readinessState:
          'available',
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
          BUNDLE_HASH,
        projectionVersion:
          FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
        unavailableSections: [],
      },
      groundingRef: {
        schemaVersion:
          FACE_CHARACTER_GROUNDING_REF_SCHEMA_VERSION_V1,
        topicKey:
          expectedSource.topicKey,
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
    });

  return {
    lane,
    profiles,
    source,
    context,
  } as const;
}

function artifactDecision(
  actionKey?:
    'open_face_detail'
    | 'open_face_history',
) {
  const {
    profiles,
    source,
    context,
  } =
    seyeonRuntime();

  return buildCharacterFaceGovernedReadingArtifactCandidateV1({
    candidateHandoff:
      governedCandidate(),
    expectedSource,
    rawRendererOutput: {
      schemaVersion:
        'v1',
      emotion:
        'neutral',
      animationCue:
        'idle',
      suggestedActions:
        actionKey === undefined
          ? []
          : [
              {
                actionKey,
              },
            ],
    },
    context,
    profiles,
    allowedSuggestedActionKeys: [
      'open_face_detail',
      'open_face_history',
    ],
  });
}

describe(
  'TOPIC-FACE-005J governed Face artifact commit/reveal',
  () => {
    it(
      'preserves approved interpretation material and reveals only after atomic commit using real Seyeon authority',
      () => {
        const {
          lane,
          profiles,
          source,
        } =
          seyeonRuntime();

        expect(
          source.contentVersion,
        ).toBe(
          lane.authorityVersion,
        );
        expect(
          profiles.capability
            .sourceContentVersion,
        ).toBe(
          source.contentVersion,
        );

        const decision =
          artifactDecision(
            'open_face_detail',
          );
        const artifact =
          decision.artifact;

        expect(
          artifact.characterId,
        ).toBe('seyeon');
        expect(
          artifact.characterContentVersion,
        ).toBe(
          source.contentVersion,
        );
        expect(
          artifact.sourceContractVersion,
        ).toBe(
          expectedSource
            .sourceContractVersion,
        );
        expect(
          artifact.sourceAuthorityRef,
        ).toBe(
          expectedSource
            .sourceAuthorityRef,
        );
        expect(
          artifact.authorizationReceiptRef,
        ).toBe(
          'authorization:face-reading:test',
        );
        expect(
          artifact.validationState,
        ).toBe(
          'semantic_validated',
        );
        expect(
          artifact.commitState,
        ).toBe(
          'requires_atomic_commit',
        );
        expect(
          artifact.revealState,
        ).toBe(
          'forbidden_before_commit',
        );
        expect(
          artifact.selectedInterpretationIds,
        ).toEqual([
          'interpretation:wealth:1',
          'interpretation:relations:1',
          'interpretation:career:1',
        ]);
        expect(
          artifact.selectedLensKeys,
        ).toEqual([
          'wealth',
          'interpersonal_relations',
          'career',
        ]);
        expect(
          artifact.protectedInterpretations
            .map((segment) => segment.text),
        ).toEqual([
          '코 쪽에서는 재물 흐름을 좋게 보는 직접 근거가 잡혀요.',
          '눈 쪽 대인관계는 좋은 근거와 주의해서 볼 근거가 함께 잡혀요.',
          '직업 쪽은 조건에 따라 함께 볼 수 있는 근거가 있어요.',
        ]);
        expect(
          artifact.protectedInterpretations[1],
        ).toMatchObject({
          lensKey:
            'interpersonal_relations',
          direction:
            'source_conflict',
          evidenceStatus:
            'source_conflict',
          conditions: [
            'same_lens_opposing_direct_evidence',
          ],
          evidenceRefs: [
            'evidence:traditional:relations:challenging',
            'evidence:traditional:relations:favorable',
          ],
          sourceRefs: [
            'source:scan:2',
          ],
        });

        const port =
          new InMemoryCharacterFaceGovernedReadingCommitPortV1();

        const result =
          commitAndRevealCharacterFaceGovernedReadingV1({
            turnId:
              'seyeon-governed-face-turn-1',
            attemptId:
              'attempt-1',
            artifactDecision:
              decision,
            commitPort:
              port,
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
          result.finalOutput,
        ).toEqual(
          artifact.finalOutput,
        );
        expect(
          result.commitReceipt
            .authorizationReceiptRef,
        ).toBe(
          artifact
            .authorizationReceiptRef,
        );
        expect(
          port.committedCount,
        ).toBe(1);
      },
    );

    it(
      'reuses the same receipt for the same artifact and rejects replacement on the same turn',
      () => {
        const port =
          new InMemoryCharacterFaceGovernedReadingCommitPortV1();

        const detail =
          artifactDecision(
            'open_face_detail',
          );

        const first =
          commitAndRevealCharacterFaceGovernedReadingV1({
            turnId:
              'seyeon-governed-face-replay',
            attemptId:
              'attempt-1',
            artifactDecision:
              detail,
            commitPort:
              port,
          });

        const replay =
          commitAndRevealCharacterFaceGovernedReadingV1({
            turnId:
              'seyeon-governed-face-replay',
            attemptId:
              'attempt-2',
            artifactDecision:
              detail,
            commitPort:
              port,
          });

        expect(
          replay.replayedCommittedTurn,
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
          commitAndRevealCharacterFaceGovernedReadingV1({
            turnId:
              'seyeon-governed-face-replay',
            attemptId:
              'attempt-3',
            artifactDecision:
              artifactDecision(
                'open_face_history',
              ),
            commitPort:
              port,
          }),
        ).toThrow(
          CharacterFaceGovernedControlledRevealErrorV1,
        );
        expect(
          port.committedCount,
        ).toBe(1);
      },
    );

    it(
      'does not reveal when atomic commit fails',
      () => {
        const decision =
          artifactDecision();

        const resultPort = {
          findCommitted: () =>
            null,
          commit: () => {
            throw new Error(
              'synthetic commit failure',
            );
          },
        };

        expect(() =>
          commitAndRevealCharacterFaceGovernedReadingV1({
            turnId:
              'seyeon-governed-face-commit-fail',
            attemptId:
              'attempt-1',
            artifactDecision:
              decision,
            commitPort:
              resultPort,
          }),
        ).toThrow(
          CharacterFaceGovernedControlledRevealErrorV1,
        );
      },
    );
  },
);
