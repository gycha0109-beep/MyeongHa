import {
  resolveCharacterRuntimeAuthorityLaneV1,
} from '../../packages/character-content/src/runtime-authority-lane-v1.js';
import {
  buildCharacterFaceGovernedReadingArtifactCandidateV1,
  type CharacterFaceGovernedReadingArtifactBuildDecisionV1,
} from '../../packages/domain/src/character-face-governed-reading-artifact.js';
import type {
  CharacterRuntimeContextV1,
} from '../../packages/domain/src/character-runtime-context.js';
import {
  CHARACTER_FACE_GOVERNED_GROUNDING_PROJECTION_VERSION_V1,
  CHARACTER_FACE_GOVERNED_GROUNDING_REF_SCHEMA_VERSION_V1,
  CHARACTER_FACE_GOVERNED_GROUNDING_SCHEMA_VERSION_V1,
  CHARACTER_FACE_GOVERNED_MODE_V1,
  CHARACTER_FACE_GOVERNED_REALIZATION_POLICY_REGISTRY_VERSION_V1,
  CHARACTER_FACE_GOVERNED_REALIZATION_POLICY_V1,
} from '../../packages/domain/src/character-face-governed-grounding.js';
import {
  admitCharacterRuntimeGovernedFaceGroundingV1,
} from '../../packages/domain/src/character-face-governed-runtime.js';
import {
  resolveCharacterFaceNamedProfileBundleV1,
} from '../../packages/domain/src/character-face-named-profile-registry.js';
import {
  CHARACTER_FACE_GOVERNED_INTERPRETATION_AUTHORIZATION_SCOPE_V1,
  CHARACTER_FACE_GOVERNED_INTERPRETATION_AUTHORIZATION_STATE_V1,
  CHARACTER_FACE_GOVERNED_INTERPRETATION_HASH_PREFIX_V1,
  CHARACTER_FACE_GOVERNED_INTERPRETATION_REQUIRED_PROHIBITIONS_V1,
  CHARACTER_FACE_GOVERNED_INTERPRETATION_SCHEMA_VERSION_V1,
  hashCharacterFaceGovernedInterpretationMaterialV1,
  type CharacterFaceGovernedInterpretationSourceBindingV1,
} from '../../packages/domain/src/character-face-governed-interpretation.js';

export const TEST_GOVERNED_FACE_SOURCE_RESULT_HASH =
  'face-topic-source-result:' + 'a'.repeat(64);
const FACE_ENGINE_VERSION =
  'test-only:face-engine-v1';
const FACE_READING_REF =
  'test-only:face-reading-ref-v1';

export const TEST_GOVERNED_FACE_EXPECTED_SOURCE:
CharacterFaceGovernedInterpretationSourceBindingV1 =
  Object.freeze({
    sourceContractVersion:
      'face-product-interpretation-v1',
    sourceAuthorityRef:
      'face-authority:product-reading:test',
    sourceResultHash:
      TEST_GOVERNED_FACE_SOURCE_RESULT_HASH,
    topicKey:
      'face.reading.three_divisions',
  });

const requiredProhibitions =
  Object.freeze([
    ...CHARACTER_FACE_GOVERNED_INTERPRETATION_REQUIRED_PROHIBITIONS_V1,
  ].sort());

function governedCandidate() {
  const units =
    Object.freeze([
      Object.freeze({
        interpretationId:
          'interpretation:test:durable:1',
        lensKey:
          'wealth',
        direction:
          'mixed_or_conditional' as const,
        evidenceStatus:
          'direct_evidence' as const,
        protectedMeaningText:
          '시험 자료: 승인된 조건 안에서만 이 의미를 보존합니다.',
        observationRefs:
          Object.freeze([
            'observation:test:1',
          ]),
        bindingRefs:
          Object.freeze([
            'binding:test:1',
          ]),
        evidenceRefs:
          Object.freeze([
            'evidence:test:1',
          ]),
        sourceRefs:
          Object.freeze([
            'source:test:1',
          ]),
        conditions:
          Object.freeze([
            'test_condition',
          ]),
        qualifiers:
          Object.freeze([
            'test_qualifier',
          ]),
        prohibitedExtensions:
          requiredProhibitions,
      }),
    ]);

  const withoutHash = {
    schemaVersion:
      CHARACTER_FACE_GOVERNED_INTERPRETATION_SCHEMA_VERSION_V1,
    sourceContractVersion:
      TEST_GOVERNED_FACE_EXPECTED_SOURCE.sourceContractVersion,
    sourceAuthorityRef:
      TEST_GOVERNED_FACE_EXPECTED_SOURCE.sourceAuthorityRef,
    sourceResultHash:
      TEST_GOVERNED_FACE_EXPECTED_SOURCE.sourceResultHash,
    topicKey:
      TEST_GOVERNED_FACE_EXPECTED_SOURCE.topicKey,
    authorizationState:
      CHARACTER_FACE_GOVERNED_INTERPRETATION_AUTHORIZATION_STATE_V1,
    authorizationScope:
      CHARACTER_FACE_GOVERNED_INTERPRETATION_AUTHORIZATION_SCOPE_V1,
    authorizationReceiptRef:
      'authorization:face-reading:durable-test',
    units,
  } as const;

  return Object.freeze({
    ...withoutHash,
    handoffHash:
      CHARACTER_FACE_GOVERNED_INTERPRETATION_HASH_PREFIX_V1 +
      hashCharacterFaceGovernedInterpretationMaterialV1(
        withoutHash,
      ),
  });
}

export function makeGovernedFaceArtifactDecisionForTest():
CharacterFaceGovernedReadingArtifactBuildDecisionV1 {
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
      'Seyeon runtime authority and Face profiles are required for governed artifact fixture.',
    );
  }

  const source =
    profiles.authoringSource;
  const base = {
    schemaVersion:
      'v1',
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
      relationshipRevision:
        1,
      relationshipPolicyVersion:
        'relationship-policy-governed-durable-test-v1',
      projectionPolicyVersion:
        'relationship-projection-governed-durable-test-v1',
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
        lane.runtime.relationshipBehavior.behaviorVersion,
      matchedBehaviorRuleKey:
        null,
      mode:
        lane.runtime.relationshipBehavior.defaultMode,
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
    saju:
      null,
  } as unknown as CharacterRuntimeContextV1;

  const handoff =
    governedCandidate();
  const groundingUnits =
    Object.freeze(
      handoff.units.map((entry) =>
        Object.freeze({
          ...entry,
          realizationPolicyRef:
            CHARACTER_FACE_GOVERNED_REALIZATION_POLICY_V1,
        }),
      ),
    );
  const groundingMaterial =
    Object.freeze({
      schemaVersion:
        CHARACTER_FACE_GOVERNED_GROUNDING_SCHEMA_VERSION_V1,
      projectionVersion:
        CHARACTER_FACE_GOVERNED_GROUNDING_PROJECTION_VERSION_V1,
      realizationPolicyRegistryVersion:
        CHARACTER_FACE_GOVERNED_REALIZATION_POLICY_REGISTRY_VERSION_V1,
      mode:
        CHARACTER_FACE_GOVERNED_MODE_V1,
      topicKey:
        handoff.topicKey,
      sourceContractVersion:
        handoff.sourceContractVersion,
      sourceAuthorityRef:
        handoff.sourceAuthorityRef,
      sourceResultHash:
        handoff.sourceResultHash,
      authorizationReceiptRef:
        handoff.authorizationReceiptRef,
      handoffHash:
        handoff.handoffHash,
      faceEngineVersion:
        FACE_ENGINE_VERSION,
      faceReadingRef:
        FACE_READING_REF,
      methodologyPackRefs:
        Object.freeze([
          'test-only:methodology-pack-v1',
        ]),
      bindingGroupRefs:
        Object.freeze([
          'test-only:binding-group-v1',
        ]),
      units:
        groundingUnits,
      unavailableSections:
        Object.freeze([]),
      prohibitedInferences:
        Object.freeze([
          'guaranteed_future_outcome',
        ]),
      provenanceRefs:
        Object.freeze([
          'test-only:governed-face-grounding',
        ]),
    });
  const grounding =
    Object.freeze({
      ...groundingMaterial,
      bundleHash:
        'face-governed-character-grounding:' +
        hashCharacterFaceGovernedInterpretationMaterialV1(
          groundingMaterial,
        ),
    });
  const groundingRef =
    Object.freeze({
      schemaVersion:
        CHARACTER_FACE_GOVERNED_GROUNDING_REF_SCHEMA_VERSION_V1,
      projectionVersion:
        grounding.projectionVersion,
      mode:
        grounding.mode,
      topicKey:
        grounding.topicKey,
      sourceContractVersion:
        grounding.sourceContractVersion,
      sourceAuthorityRef:
        grounding.sourceAuthorityRef,
      sourceResultHash:
        grounding.sourceResultHash,
      authorizationReceiptRef:
        grounding.authorizationReceiptRef,
      handoffHash:
        grounding.handoffHash,
      faceEngineVersion:
        grounding.faceEngineVersion,
      faceReadingRef:
        grounding.faceReadingRef,
      methodologyPackRefs:
        grounding.methodologyPackRefs,
      bundleHash:
        grounding.bundleHash,
    });

  const context =
    admitCharacterRuntimeGovernedFaceGroundingV1({
      context:
        base,
      candidateGrounding:
        grounding,
      candidateGroundingRef:
        groundingRef,
      candidateHandoff:
        handoff,
      expectedSource:
        TEST_GOVERNED_FACE_EXPECTED_SOURCE,
    });

  return buildCharacterFaceGovernedReadingArtifactCandidateV1({
    candidateHandoff:
      governedCandidate(),
    expectedSource:
      TEST_GOVERNED_FACE_EXPECTED_SOURCE,
    rawRendererOutput: {
      schemaVersion:
        'v1',
      emotion:
        'neutral',
      animationCue:
        'idle',
      suggestedActions: [],
    },
    context,
    profiles,
    allowedSuggestedActionKeys: [],
  });
}
