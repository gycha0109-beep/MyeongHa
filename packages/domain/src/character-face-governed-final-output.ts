import {
  findReadingPublicTrustLanguageViolationV1,
} from '../../character-content/src/index.js';
import {
  CHARACTER_OUTPUT_GUARD_VERSION_V1,
  CharacterOutputGuardError,
  guardCharacterRendererOutput,
  type CharacterDialogueEnvelopeV1,
} from './character-output-guard.js';
import {
  admitCharacterFaceGovernedInterpretationHandoffV1,
  type CharacterFaceGovernedInterpretationSourceBindingV1,
  type CharacterFaceProtectedInterpretationSegmentV1,
} from './character-face-governed-interpretation.js';
import {
  CHARACTER_FACE_GOVERNED_READING_PLAN_SCHEMA_VERSION_V1,
  buildCharacterFaceGovernedReadingPlanV1,
  type CharacterFaceGovernedReadingPlanV1,
} from './character-face-governed-reading-plan.js';
import type {
  CharacterFaceNamedProfileBundleV1,
} from './character-face-named-profile-registry.js';
import type {
  CharacterRuntimeContextWithFaceGroundingV1,
} from './character-face-grounding-admission.js';

export const CHARACTER_FACE_GOVERNED_FINAL_OUTPUT_SCHEMA_VERSION_V1 =
  'character-face-governed-final-output-v1' as const;

export const CHARACTER_FACE_GOVERNED_FINALIZER_VERSION_V1 =
  'myeongha-character-face-governed-finalizer-v1' as const;

export const CHARACTER_FACE_GOVERNED_OUTPUT_GUARD_VERSION_V1 =
  'myeongha-character-face-governed-output-guard-v1' as const;

export interface CharacterFaceGovernedFinalRendererDraftV1 {
  readonly schemaVersion: 'v1';
  readonly emotion: string;
  readonly animationCue?: string;
  readonly suggestedActions: readonly unknown[];
}

export interface CharacterFaceGovernedFollowUpV1 {
  readonly text: string;
  readonly sourceInterpretationRefs: readonly string[];
  readonly sourceLensKeys: readonly string[];
  readonly questionStrategy: string;
  readonly framingKey: string;
}

export interface CharacterFaceGovernedFinalOutputEnvelopeV1 {
  readonly schemaVersion:
    typeof CHARACTER_FACE_GOVERNED_FINAL_OUTPUT_SCHEMA_VERSION_V1;
  readonly finalizerVersion:
    typeof CHARACTER_FACE_GOVERNED_FINALIZER_VERSION_V1;
  readonly outputGuardVersion:
    typeof CHARACTER_OUTPUT_GUARD_VERSION_V1;
  readonly governedOutputGuardVersion:
    typeof CHARACTER_FACE_GOVERNED_OUTPUT_GUARD_VERSION_V1;
  readonly characterId: string;
  readonly characterContentVersion: string;
  readonly topicKey: string;
  readonly sourceResultHash: string;
  readonly faceBundleHash: string;
  readonly handoffHash: string;
  readonly readingPlanRef: string;
  readonly dialogue: CharacterDialogueEnvelopeV1;
  readonly face: Readonly<{
    state: 'accepted';
    validationState: 'semantic_validated';
    exactProtectedMeanings: true;
    protectedInterpretations:
      readonly CharacterFaceProtectedInterpretationSegmentV1[];
    followUp: CharacterFaceGovernedFollowUpV1 | null;
    selectedInterpretationIds: readonly string[];
    selectedLensKeys: readonly string[];
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(value).find((key) => !allowedSet.has(key));
  if (unexpected !== undefined) {
    throw new CharacterOutputGuardError(
      `governedFaceFinalRendererOutput contains unexpected field: ${unexpected}`,
    );
  }
}

function parseRendererDraft(
  rawOutput: unknown,
): CharacterFaceGovernedFinalRendererDraftV1 {
  if (!isRecord(rawOutput)) {
    throw new CharacterOutputGuardError(
      'Governed Face final renderer output must be an object.',
    );
  }

  assertOnlyKeys(rawOutput, [
    'schemaVersion',
    'emotion',
    'animationCue',
    'suggestedActions',
  ]);

  if (rawOutput.schemaVersion !== 'v1') {
    throw new CharacterOutputGuardError(
      'Governed Face final renderer schemaVersion must be v1.',
    );
  }

  if (typeof rawOutput.emotion !== 'string') {
    throw new CharacterOutputGuardError(
      'Governed Face final renderer emotion must be a string.',
    );
  }

  if (
    rawOutput.animationCue !== undefined &&
    typeof rawOutput.animationCue !== 'string'
  ) {
    throw new CharacterOutputGuardError(
      'Governed Face final renderer animationCue must be a string when present.',
    );
  }

  if (!Array.isArray(rawOutput.suggestedActions)) {
    throw new CharacterOutputGuardError(
      'Governed Face final renderer suggestedActions must be an array.',
    );
  }

  return Object.freeze({
    schemaVersion: 'v1' as const,
    emotion: rawOutput.emotion,
    ...(rawOutput.animationCue === undefined
      ? {}
      : { animationCue: rawOutput.animationCue }),
    suggestedActions: Object.freeze([...rawOutput.suggestedActions]),
  });
}

function assertPublicTrustLanguage(text: string, path: string): void {
  const violation = findReadingPublicTrustLanguageViolationV1(text);
  if (violation !== null) {
    throw new CharacterOutputGuardError(
      `${path} violates reading public trust language policy: ${violation.ruleKey}.`,
    );
  }
}

function buildDialogue(
  input: Readonly<{
    draft: CharacterFaceGovernedFinalRendererDraftV1;
    context: CharacterRuntimeContextWithFaceGroundingV1;
    allowedSuggestedActionKeys: readonly string[];
  }>,
): CharacterDialogueEnvelopeV1 {
  const dialogue = guardCharacterRendererOutput({
    context: input.context,
    allowedSuggestedActionKeys: input.allowedSuggestedActionKeys,
    rawOutput: {
      schemaVersion: 'v1',
      emotion: input.draft.emotion,
      ...(input.draft.animationCue === undefined
        ? {}
        : { animationCue: input.draft.animationCue }),
      memoryProposals: [],
      relationshipEventProposals: [],
      suggestedActions: input.draft.suggestedActions,
    },
  });

  if (
    dialogue.framingBefore !== null ||
    dialogue.framingAfter !== null ||
    dialogue.memoryProposals.length !== 0 ||
    dialogue.relationshipEventProposals.length !== 0 ||
    dialogue.protectedSajuSegments.length !== 0 ||
    dialogue.protectedSajuDisclosures.length !== 0 ||
    dialogue.calculationAmbiguity.length !== 0
  ) {
    throw new CharacterOutputGuardError(
      'Governed Face final output may not contain post-guard framing, memory/relationship side effects, or Saju protected material.',
    );
  }

  return dialogue;
}

function extractFollowUp(
  plan: CharacterFaceGovernedReadingPlanV1,
): CharacterFaceGovernedFollowUpV1 | null {
  const beat = plan.beats.find(
    (
      candidate,
    ): candidate is Extract<
      CharacterFaceGovernedReadingPlanV1['beats'][number],
      { kind: 'follow_up_question' }
    > => candidate.kind === 'follow_up_question',
  );

  if (beat === undefined) return null;

  return Object.freeze({
    text: beat.text,
    sourceInterpretationRefs: Object.freeze([
      ...beat.sourceInterpretationRefs,
    ]),
    sourceLensKeys: Object.freeze([...beat.sourceLensKeys]),
    questionStrategy: beat.questionStrategy,
    framingKey: beat.framingKey,
  });
}

export function finalizeCharacterFaceGovernedInterpretationOutputV1(
  input: Readonly<{
    candidateHandoff: unknown;
    expectedSource:
      CharacterFaceGovernedInterpretationSourceBindingV1;
    rawRendererOutput: unknown;
    context:
      CharacterRuntimeContextWithFaceGroundingV1;
    profiles: CharacterFaceNamedProfileBundleV1;
    allowedSuggestedActionKeys: readonly string[];
  }>,
): CharacterFaceGovernedFinalOutputEnvelopeV1 {
  const draft = parseRendererDraft(input.rawRendererOutput);

  const handoff =
    admitCharacterFaceGovernedInterpretationHandoffV1({
      candidate: input.candidateHandoff,
      expectedSource: input.expectedSource,
    });

  const planDecision =
    buildCharacterFaceGovernedReadingPlanV1({
      context: input.context,
      handoff,
      profiles: input.profiles,
    });

  if (
    planDecision.plan.schemaVersion !==
    CHARACTER_FACE_GOVERNED_READING_PLAN_SCHEMA_VERSION_V1
  ) {
    throw new CharacterOutputGuardError(
      'Governed Face reading plan schemaVersion is not supported.',
    );
  }

  for (const [index, segment] of planDecision.protectedSegments.entries()) {
    assertPublicTrustLanguage(
      segment.text,
      `face.protectedInterpretations[${index}].text`,
    );
  }

  const followUp = extractFollowUp(planDecision.plan);
  if (followUp !== null) {
    assertPublicTrustLanguage(followUp.text, 'face.followUp.text');
  }

  const dialogue = buildDialogue({
    draft,
    context: input.context,
    allowedSuggestedActionKeys: input.allowedSuggestedActionKeys,
  });

  if (input.context.face === null) {
    throw new CharacterOutputGuardError(
      'Governed Face finalization requires an admitted Face context.',
    );
  }

  return Object.freeze({
    schemaVersion:
      CHARACTER_FACE_GOVERNED_FINAL_OUTPUT_SCHEMA_VERSION_V1,
    finalizerVersion:
      CHARACTER_FACE_GOVERNED_FINALIZER_VERSION_V1,
    outputGuardVersion:
      CHARACTER_OUTPUT_GUARD_VERSION_V1,
    governedOutputGuardVersion:
      CHARACTER_FACE_GOVERNED_OUTPUT_GUARD_VERSION_V1,
    characterId: input.context.characterId,
    characterContentVersion: input.context.contentVersion,
    topicKey: input.context.face.topicKey,
    sourceResultHash: handoff.sourceResultHash,
    faceBundleHash: input.context.face.groundingRef.bundleHash,
    handoffHash: handoff.handoffHash,
    readingPlanRef: planDecision.plan.planId,
    dialogue,
    face: Object.freeze({
      state: 'accepted' as const,
      validationState: 'semantic_validated' as const,
      exactProtectedMeanings: true as const,
      protectedInterpretations: planDecision.protectedSegments,
      followUp,
      selectedInterpretationIds:
        planDecision.plan.selection.selectedInterpretationIds,
      selectedLensKeys:
        planDecision.plan.selection.selectedLensKeys,
    }),
  });
}
