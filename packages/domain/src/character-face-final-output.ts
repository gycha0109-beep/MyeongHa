import {
  findReadingPublicTrustLanguageViolationV1,
} from '../../character-content/src/index.js';
import {
  CHARACTER_OUTPUT_GUARD_VERSION_V1,
  CharacterOutputGuardError,
  guardCharacterRendererOutput,
  type CharacterDialogueEnvelopeV1,
} from './character-output-guard.js';
import type {
  CharacterFaceCapabilityProfileV1,
} from './character-face-capability.js';
import type {
  CharacterFaceDeliveryProfileV1,
} from './character-face-delivery-profile.js';
import type {
  CharacterRuntimeContextWithFaceGroundingV1,
} from './character-face-grounding-admission.js';
import type {
  CharacterFacePerspectiveProfileV1,
} from './character-face-perspective.js';
import {
  CHARACTER_FACE_SEMANTIC_GUARD_VERSION_V1,
  guardCharacterFaceSemanticPreservationV1,
  type CharacterFaceSemanticGuardEvidenceV1,
} from './character-face-semantic-guard.js';
import type {
  CharacterFaceUtteranceV1,
} from './character-face-bounded-renderer.js';

export const CHARACTER_FACE_FINAL_OUTPUT_SCHEMA_VERSION_V1 =
  'character-face-final-output-v1' as const;

export const CHARACTER_FACE_FINALIZER_VERSION_V1 =
  'myeongha-character-face-finalizer-v1' as const;

export const CHARACTER_FACE_PUBLIC_FALLBACK_REASON_V1 =
  'face_output_unavailable' as const;

export interface CharacterFaceFinalRendererDraftV1 {
  readonly schemaVersion: 'v1';
  readonly emotion: string;
  readonly animationCue?: string;
  readonly suggestedActions:
    readonly unknown[];
}

export type CharacterFaceProtectedFinalMaterialV1 =
  | Readonly<{
      state: 'accepted';
      validationState:
        'semantic_validated';
      guardVersion:
        typeof CHARACTER_FACE_SEMANTIC_GUARD_VERSION_V1;
      utterance:
        CharacterFaceUtteranceV1;
      evidence:
        CharacterFaceSemanticGuardEvidenceV1;
    }>
  | Readonly<{
      state:
        'protected_fallback';
      validationState:
        'fallback_used';
      guardVersion:
        typeof CHARACTER_FACE_SEMANTIC_GUARD_VERSION_V1;
      publicReason:
        typeof CHARACTER_FACE_PUBLIC_FALLBACK_REASON_V1;
    }>;

export interface CharacterFaceFinalOutputEnvelopeV1 {
  readonly schemaVersion:
    typeof CHARACTER_FACE_FINAL_OUTPUT_SCHEMA_VERSION_V1;
  readonly finalizerVersion:
    typeof CHARACTER_FACE_FINALIZER_VERSION_V1;
  readonly outputGuardVersion:
    typeof CHARACTER_OUTPUT_GUARD_VERSION_V1;
  readonly characterId: string;
  readonly topicKey: string;
  readonly bundleHash: string;
  readonly dialogue:
    CharacterDialogueEnvelopeV1;
  readonly face:
    CharacterFaceProtectedFinalMaterialV1;
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function assertOnlyKeys(
  value:
    Record<string, unknown>,
  allowed:
    readonly string[],
): void {
  const allowedSet =
    new Set(allowed);
  const unexpected =
    Object.keys(value).find(
      (key) =>
        !allowedSet.has(key),
    );

  if (
    unexpected !== undefined
  ) {
    throw new CharacterOutputGuardError(
      `faceFinalRendererOutput contains unexpected field: ${unexpected}`,
    );
  }
}

function assertFaceOnlyRuntime(
  context:
    CharacterRuntimeContextWithFaceGroundingV1,
): asserts context is CharacterRuntimeContextWithFaceGroundingV1 & {
  readonly face:
    NonNullable<
      CharacterRuntimeContextWithFaceGroundingV1['face']
    >;
} {
  if (
    context.face === null
  ) {
    throw new CharacterOutputGuardError(
      'Face finalization requires an admitted Face-bearing runtime context.',
    );
  }

  if (
    context.saju !== null
  ) {
    throw new CharacterOutputGuardError(
      'Face v1 finalization does not allow mixed Saju and Face product context.',
    );
  }
}

function parseFaceRendererDraftV1(
  rawOutput: unknown,
): CharacterFaceFinalRendererDraftV1 {
  if (
    !isRecord(rawOutput)
  ) {
    throw new CharacterOutputGuardError(
      'Face final renderer output must be an object.',
    );
  }

  assertOnlyKeys(
    rawOutput,
    [
      'schemaVersion',
      'emotion',
      'animationCue',
      'suggestedActions',
    ],
  );

  if (
    rawOutput.schemaVersion !==
    'v1'
  ) {
    throw new CharacterOutputGuardError(
      'Face final renderer schemaVersion must be v1.',
    );
  }

  if (
    typeof rawOutput.emotion !==
    'string'
  ) {
    throw new CharacterOutputGuardError(
      'Face final renderer emotion must be a string.',
    );
  }

  if (
    rawOutput.animationCue !==
      undefined &&
    typeof rawOutput.animationCue !==
      'string'
  ) {
    throw new CharacterOutputGuardError(
      'Face final renderer animationCue must be a string when present.',
    );
  }

  if (
    !Array.isArray(
      rawOutput.suggestedActions,
    )
  ) {
    throw new CharacterOutputGuardError(
      'Face final renderer suggestedActions must be an array.',
    );
  }

  return Object.freeze({
    schemaVersion:
      'v1' as const,
    emotion:
      rawOutput.emotion,
    ...(
      rawOutput.animationCue ===
      undefined
        ? {}
        : {
            animationCue:
              rawOutput.animationCue,
          }
    ),
    suggestedActions:
      Object.freeze([
        ...rawOutput
          .suggestedActions,
      ]),
  });
}

function assertFacePublicTrustLanguage(
  utterance: CharacterFaceUtteranceV1,
): void {
  for (const [index, segment] of utterance.segments.entries()) {
    const violation =
      findReadingPublicTrustLanguageViolationV1(segment.text);
    if (violation !== null) {
      throw new CharacterOutputGuardError(
        `face.utterance.segments[${index}].text violates reading public trust language policy: ${violation.ruleKey}.`,
      );
    }
  }
}

function buildDialogueEnvelope(
  input: Readonly<{
    draft:
      CharacterFaceFinalRendererDraftV1;
    context:
      CharacterRuntimeContextWithFaceGroundingV1;
    allowedSuggestedActionKeys:
      readonly string[];
  }>,
): CharacterDialogueEnvelopeV1 {
  return guardCharacterRendererOutput({
    context:
      input.context,
    allowedSuggestedActionKeys:
      input.allowedSuggestedActionKeys,
    rawOutput: {
      schemaVersion: 'v1',
      emotion:
        input.draft.emotion,
      ...(
        input.draft.animationCue ===
        undefined
          ? {}
          : {
              animationCue:
                input.draft
                  .animationCue,
            }
      ),
      memoryProposals: [],
      relationshipEventProposals:
        [],
      suggestedActions:
        input.draft
          .suggestedActions,
    },
  });
}

export function finalizeCharacterFaceOutputV1(
  input: Readonly<{
    candidateFaceUtterance:
      unknown;
    rawRendererOutput:
      unknown;
    context:
      CharacterRuntimeContextWithFaceGroundingV1;
    grounding: unknown;
    characterContentVersion:
      string;
    capability:
      CharacterFaceCapabilityProfileV1;
    perspective:
      CharacterFacePerspectiveProfileV1;
    deliveryProfile:
      CharacterFaceDeliveryProfileV1;
    allowedSuggestedActionKeys:
      readonly string[];
  }>,
): CharacterFaceFinalOutputEnvelopeV1 {
  assertFaceOnlyRuntime(
    input.context,
  );

  const draft =
    parseFaceRendererDraftV1(
      input.rawRendererOutput,
    );

  const semanticDecision =
    guardCharacterFaceSemanticPreservationV1({
      candidate:
        input.candidateFaceUtterance,
      context:
        input.context,
      grounding:
        input.grounding,
      characterContentVersion:
        input.characterContentVersion,
      capability:
        input.capability,
      perspective:
        input.perspective,
      deliveryProfile:
        input.deliveryProfile,
    });

  if (
    semanticDecision.mode ===
    'accepted'
  ) {
    assertFacePublicTrustLanguage(
      semanticDecision.utterance,
    );
  }

  const dialogue =
    buildDialogueEnvelope({
      draft,
      context:
        input.context,
      allowedSuggestedActionKeys:
        input.allowedSuggestedActionKeys,
    });

  if (
    dialogue.framingBefore !==
      null ||
    dialogue.framingAfter !==
      null ||
    dialogue.memoryProposals
        .length !== 0 ||
    dialogue
      .relationshipEventProposals
      .length !== 0 ||
    dialogue.protectedSajuSegments
        .length !== 0 ||
    dialogue
      .protectedSajuDisclosures
      .length !== 0 ||
    dialogue.calculationAmbiguity
        .length !== 0
  ) {
    throw new CharacterOutputGuardError(
      'Face final output may not contain post-guard framing, memory/relationship side effects, or Saju protected material.',
    );
  }

  const face:
    CharacterFaceProtectedFinalMaterialV1 =
      semanticDecision.mode ===
      'accepted'
        ? Object.freeze({
            state:
              'accepted' as const,
            validationState:
              'semantic_validated' as const,
            guardVersion:
              semanticDecision
                .guardVersion,
            utterance:
              semanticDecision
                .utterance,
            evidence:
              semanticDecision
                .evidence,
          })
        : Object.freeze({
            state:
              'protected_fallback' as const,
            validationState:
              'fallback_used' as const,
            guardVersion:
              semanticDecision
                .guardVersion,
            publicReason:
              CHARACTER_FACE_PUBLIC_FALLBACK_REASON_V1,
          });

  return Object.freeze({
    schemaVersion:
      CHARACTER_FACE_FINAL_OUTPUT_SCHEMA_VERSION_V1,
    finalizerVersion:
      CHARACTER_FACE_FINALIZER_VERSION_V1,
    outputGuardVersion:
      CHARACTER_OUTPUT_GUARD_VERSION_V1,
    characterId:
      input.context.characterId,
    topicKey:
      input.context.face.topicKey,
    bundleHash:
      input.context.face
        .groundingRef
        .bundleHash,
    dialogue,
    face,
  });
}
