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
  CHARACTER_FACE_REALIZATION_MODE_V1,
  CHARACTER_FACE_SOURCE_BINDING_SCHEMA_VERSION_V1,
  FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
  FACE_CHARACTER_GROUNDING_REF_SCHEMA_VERSION_V1,
  admitCharacterRuntimeFaceGroundingV1,
} from '../../packages/domain/src/character-face-grounding-admission.js';
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
const PROJECTION_HASH =
  'face-product-projection:' + 'b'.repeat(64);
const GROUNDING_HASH =
  'face-grounding:' + 'c'.repeat(64);
const DISPLAY_FACTS_HASH =
  'face-display-facts:' + 'd'.repeat(64);
const BUNDLE_HASH =
  'face-character-grounding:' + 'e'.repeat(64);

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
      'face.discover.extended',
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

  const context =
    admitCharacterRuntimeFaceGroundingV1({
      context:
        base,
      source: {
        schemaVersion:
          CHARACTER_FACE_SOURCE_BINDING_SCHEMA_VERSION_V1,
        topicKey:
          TEST_GOVERNED_FACE_EXPECTED_SOURCE.topicKey,
        readinessState:
          'available',
        mode:
          CHARACTER_FACE_REALIZATION_MODE_V1,
        sourceResultHash:
          TEST_GOVERNED_FACE_SOURCE_RESULT_HASH,
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
          TEST_GOVERNED_FACE_EXPECTED_SOURCE.topicKey,
        sourceResultHash:
          TEST_GOVERNED_FACE_SOURCE_RESULT_HASH,
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
