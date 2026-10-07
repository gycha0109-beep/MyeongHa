import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  resolveCharacterRuntimeAuthorityLaneV1,
} from '../character-content/src/runtime-authority-lane-v1.js';
import type {
  CharacterRuntimeContextV1,
} from './character-runtime-context.js';
import {
  CHARACTER_FACE_REALIZATION_MODE_V1,
  CHARACTER_FACE_SOURCE_BINDING_SCHEMA_VERSION_V1,
  FACE_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
  FACE_CHARACTER_GROUNDING_REF_SCHEMA_VERSION_V1,
  admitCharacterRuntimeFaceGroundingV1,
} from './character-face-grounding-admission.js';
import {
  resolveCharacterFaceNamedProfileBundleV1,
} from './character-face-named-profile-registry.js';
import {
  CHARACTER_FACE_GOVERNED_INTERPRETATION_AUTHORIZATION_SCOPE_V1,
  CHARACTER_FACE_GOVERNED_INTERPRETATION_AUTHORIZATION_STATE_V1,
  CHARACTER_FACE_GOVERNED_INTERPRETATION_HASH_PREFIX_V1,
  CHARACTER_FACE_GOVERNED_INTERPRETATION_REQUIRED_PROHIBITIONS_V1,
  CHARACTER_FACE_GOVERNED_INTERPRETATION_SCHEMA_VERSION_V1,
  hashCharacterFaceGovernedInterpretationMaterialV1,
  type CharacterFaceGovernedInterpretationSourceBindingV1,
} from './character-face-governed-interpretation.js';
import {
  CharacterFaceGovernedReadingPlanErrorV1,
  buildCharacterFaceGovernedReadingPlanV1,
} from './character-face-governed-reading-plan.js';
import {
  finalizeCharacterFaceGovernedInterpretationOutputV1,
} from './character-face-governed-final-output.js';

const SOURCE_RESULT_HASH =
  `face-topic-source-result:${'a'.repeat(64)}`;
const PROJECTION_HASH =
  `face-product-projection:${'b'.repeat(64)}`;
const GROUNDING_HASH =
  `face-grounding:${'c'.repeat(64)}`;
const DISPLAY_FACTS_HASH =
  `face-display-facts:${'d'.repeat(64)}`;
const BUNDLE_HASH =
  `face-character-grounding:${'e'.repeat(64)}`;

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

function governedCandidate() {
  const units = Object.freeze([
    Object.freeze({
      interpretationId:
        'interpretation:wealth:1',
      lensKey: 'wealth',
      direction: 'favorable',
      evidenceStatus:
        'direct_evidence',
      protectedMeaningText:
        '코 쪽에서는 재물 흐름을 좋게 보는 직접 근거가 잡혀요.',
      observationRefs:
        Object.freeze([
          'observation:nose:1',
        ]),
      bindingRefs:
        Object.freeze([
          'binding:nose:wealth:1',
        ]),
      evidenceRefs:
        Object.freeze([
          'evidence:traditional:wealth:1',
        ]),
      sourceRefs:
        Object.freeze([
          'source:scan:1',
        ]),
      conditions:
        Object.freeze([]),
      qualifiers:
        Object.freeze([
          'historical_traditional_reading',
        ]),
      prohibitedExtensions:
        requiredProhibitions,
    }),
    Object.freeze({
      interpretationId:
        'interpretation:relations:1',
      lensKey:
        'interpersonal_relations',
      direction:
        'source_conflict',
      evidenceStatus:
        'source_conflict',
      protectedMeaningText:
        '눈 쪽 대인관계는 좋은 근거와 주의해서 볼 근거가 함께 잡혀요.',
      observationRefs:
        Object.freeze([
          'observation:eye:1',
        ]),
      bindingRefs:
        Object.freeze([
          'binding:eye:relations:1',
        ]),
      evidenceRefs:
        Object.freeze([
          'evidence:traditional:relations:challenging',
          'evidence:traditional:relations:favorable',
        ]),
      sourceRefs:
        Object.freeze([
          'source:scan:2',
        ]),
      conditions:
        Object.freeze([
          'same_lens_opposing_direct_evidence',
        ]),
      qualifiers:
        Object.freeze([]),
      prohibitedExtensions:
        requiredProhibitions,
    }),
    Object.freeze({
      interpretationId:
        'interpretation:career:1',
      lensKey: 'career',
      direction:
        'mixed_or_conditional',
      evidenceStatus:
        'parallel_evidence',
      protectedMeaningText:
        '직업 쪽은 조건에 따라 함께 볼 수 있는 근거가 있어요.',
      observationRefs:
        Object.freeze([
          'observation:brow:1',
        ]),
      bindingRefs:
        Object.freeze([
          'binding:brow:career:1',
        ]),
      evidenceRefs:
        Object.freeze([
          'evidence:traditional:career:1',
        ]),
      sourceRefs:
        Object.freeze([
          'source:scan:3',
        ]),
      conditions:
        Object.freeze([
          'source_condition_required',
        ]),
      qualifiers:
        Object.freeze([]),
      prohibitedExtensions:
        requiredProhibitions,
    }),
    Object.freeze({
      interpretationId:
        'interpretation:spouse:1',
      lensKey: 'spouse',
      direction:
        'non_directional',
      evidenceStatus:
        'direct_relation',
      protectedMeaningText:
        '배우자 쪽으로 직접 연결되는 전통 근거도 확인돼요.',
      observationRefs:
        Object.freeze([
          'observation:nose:2',
        ]),
      bindingRefs:
        Object.freeze([
          'binding:nose:spouse:1',
        ]),
      evidenceRefs:
        Object.freeze([
          'evidence:traditional:spouse:1',
        ]),
      sourceRefs:
        Object.freeze([
          'source:scan:4',
        ]),
      conditions:
        Object.freeze([]),
      qualifiers:
        Object.freeze([]),
      prohibitedExtensions:
        requiredProhibitions,
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

  if (lane === null || profiles === null) {
    throw new Error(
      'Seyeon runtime authority and Face profiles are required.',
    );
  }

  const source = profiles.authoringSource;
  const base = {
    schemaVersion: 'v1',
    characterId: source.characterId,
    contentBundleId:
      'character-runtime-authority-lane-seyeon-v1',
    contentVersion:
      source.contentVersion,
    speech: source.speech,
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
      schemaVersion: 'v1',
      relationshipRevision: 1,
      relationshipPolicyVersion:
        'relationship-policy-seyeon-governed-face-v1',
      projectionPolicyVersion:
        'relationship-projection-seyeon-governed-face-v1',
      stageKey: 'public',
      closenessBand: 'low',
      trustBand: 'low',
      frictionBand: 'low',
      recentEventKeys: [],
      behaviorVersion:
        lane.runtime.relationshipBehavior.behaviorVersion,
      matchedBehaviorRuleKey: null,
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
    saju: null,
  } as unknown as CharacterRuntimeContextV1;

  const context =
    admitCharacterRuntimeFaceGroundingV1({
      context: base,
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
    profiles,
    context,
  } as const;
}

describe(
  'Character Face governed interpretation reading/output',
  () => {
    it(
      'uses real Seyeon profile, preserves upstream order, and applies only the authored max count',
      () => {
        const { profiles, context } =
          seyeonRuntime();
        const candidate =
          governedCandidate();

        const admitted = (() => {
          const result =
            finalizeCharacterFaceGovernedInterpretationOutputV1({
              candidateHandoff:
                candidate,
              expectedSource,
              rawRendererOutput: {
                schemaVersion: 'v1',
                emotion: 'neutral',
                animationCue: 'idle',
                suggestedActions: [],
              },
              context,
              profiles,
              allowedSuggestedActionKeys: [],
            });
          return result;
        })();

        expect(
          admitted.face
            .selectedInterpretationIds,
        ).toEqual([
          'interpretation:wealth:1',
          'interpretation:relations:1',
          'interpretation:career:1',
        ]);
        expect(
          admitted.face.selectedLensKeys,
        ).toEqual([
          'wealth',
          'interpersonal_relations',
          'career',
        ]);
        expect(
          admitted.face
            .protectedInterpretations
            .map((segment) => segment.text),
        ).toEqual([
          '코 쪽에서는 재물 흐름을 좋게 보는 직접 근거가 잡혀요.',
          '눈 쪽 대인관계는 좋은 근거와 주의해서 볼 근거가 함께 잡혀요.',
          '직업 쪽은 조건에 따라 함께 볼 수 있는 근거가 있어요.',
        ]);
        expect(
          admitted.face
            .protectedInterpretations[1]
            ?.direction,
        ).toBe('source_conflict');
        expect(
          admitted.face.followUp
            ?.sourceLensKeys,
        ).toEqual([
          'wealth',
          'interpersonal_relations',
          'career',
        ]);
        expect(
          admitted.face.followUp?.text,
        ).toBe('어느 항목을 더 볼까요?');
        expect(
          admitted.dialogue
            .memoryProposals,
        ).toEqual([]);
        expect(
          admitted.dialogue
            .relationshipEventProposals,
        ).toEqual([]);
      },
    );

    it(
      'rejects a governed interpretation result from another Face analysis',
      () => {
        const { profiles, context } =
          seyeonRuntime();
        const candidate = {
          ...governedCandidate(),
          sourceResultHash:
            `face-topic-source-result:${'f'.repeat(64)}`,
        };

        expect(() =>
          finalizeCharacterFaceGovernedInterpretationOutputV1({
            candidateHandoff:
              candidate,
            expectedSource: {
              ...expectedSource,
              sourceResultHash:
                candidate.sourceResultHash,
            },
            rawRendererOutput: {
              schemaVersion: 'v1',
              emotion: 'neutral',
              suggestedActions: [],
            },
            context,
            profiles,
            allowedSuggestedActionKeys: [],
          }),
        ).toThrow(
          CharacterFaceGovernedReadingPlanErrorV1,
        );
      },
    );

    it(
      'rejects trust-damaging public wording even when an upstream candidate claims authorization',
      () => {
        const { profiles, context } =
          seyeonRuntime();

        const base =
          governedCandidate();
        const units = base.units.map(
          (unit, index) =>
            index === 0
              ? {
                  ...unit,
                  protectedMeaningText:
                    '사진 한 장만으로 확정할 수 없으니 참고만 해주세요.',
                }
              : unit,
        );

        const withoutHash = {
          schemaVersion:
            base.schemaVersion,
          sourceContractVersion:
            base.sourceContractVersion,
          sourceAuthorityRef:
            base.sourceAuthorityRef,
          sourceResultHash:
            base.sourceResultHash,
          topicKey: base.topicKey,
          authorizationState:
            base.authorizationState,
          authorizationScope:
            base.authorizationScope,
          authorizationReceiptRef:
            base.authorizationReceiptRef,
          units,
        };

        const candidate = {
          ...withoutHash,
          handoffHash:
            CHARACTER_FACE_GOVERNED_INTERPRETATION_HASH_PREFIX_V1 +
            hashCharacterFaceGovernedInterpretationMaterialV1(
              withoutHash,
            ),
        };

        expect(() =>
          finalizeCharacterFaceGovernedInterpretationOutputV1({
            candidateHandoff:
              candidate,
            expectedSource,
            rawRendererOutput: {
              schemaVersion: 'v1',
              emotion: 'neutral',
              suggestedActions: [],
            },
            context,
            profiles,
            allowedSuggestedActionKeys: [],
          }),
        ).toThrow(/trust language policy/);
      },
    );
  },
);
