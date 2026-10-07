import {
  resolveCharacterVoiceAuthorityV1,
} from '../../character-content/src/index.js';
import type {
  CharacterRuntimeContextV1,
} from './character-runtime-context.js';
import {
  admitCharacterFaceGovernedGroundingV1,
} from './character-face-governed-grounding-admission.js';
import {
  CHARACTER_FACE_GOVERNED_MODE_V1,
  type CharacterFaceGovernedGroundingRefV1,
} from './character-face-governed-grounding.js';
import type {
  CharacterFaceGovernedInterpretationSourceBindingV1,
} from './character-face-governed-interpretation.js';

export const CHARACTER_FACE_GOVERNED_CONTEXT_SCHEMA_VERSION_V1 =
  'character-governed-face-context-v1' as const;

export interface CharacterGovernedFaceRuntimeContextV1 {
  readonly schemaVersion:
    typeof CHARACTER_FACE_GOVERNED_CONTEXT_SCHEMA_VERSION_V1;
  readonly topicKey: string;
  readonly mode: typeof CHARACTER_FACE_GOVERNED_MODE_V1;
  readonly sourceContractVersion: string;
  readonly sourceAuthorityRef: string;
  readonly sourceResultHash: string;
  readonly authorizationReceiptRef: string;
  readonly handoffHash: string;
  readonly groundingRef: CharacterFaceGovernedGroundingRefV1;
}

export interface CharacterRuntimeContextWithGovernedFaceGroundingV1
  extends CharacterRuntimeContextV1 {
  readonly governedFace:
    CharacterGovernedFaceRuntimeContextV1 | null;
}

export function admitCharacterRuntimeGovernedFaceGroundingV1(input: Readonly<{
  context: CharacterRuntimeContextV1;
  candidateGrounding: unknown;
  candidateGroundingRef: unknown;
  candidateHandoff: unknown;
  expectedSource: CharacterFaceGovernedInterpretationSourceBindingV1;
}>): CharacterRuntimeContextWithGovernedFaceGroundingV1 {
  if (input.context.saju !== null) {
    throw new TypeError('Governed Face runtime cannot be mixed with Saju runtime context.');
  }
  const admitted = admitCharacterFaceGovernedGroundingV1(input);
  const governedFace = Object.freeze({
    schemaVersion: CHARACTER_FACE_GOVERNED_CONTEXT_SCHEMA_VERSION_V1,
    topicKey: admitted.grounding.topicKey,
    mode: CHARACTER_FACE_GOVERNED_MODE_V1,
    sourceContractVersion: admitted.grounding.sourceContractVersion,
    sourceAuthorityRef: admitted.grounding.sourceAuthorityRef,
    sourceResultHash: admitted.grounding.sourceResultHash,
    authorizationReceiptRef: admitted.grounding.authorizationReceiptRef,
    handoffHash: admitted.grounding.handoffHash,
    groundingRef: admitted.groundingRef,
  }) satisfies CharacterGovernedFaceRuntimeContextV1;

  return Object.freeze({
    ...input.context,
    voiceAuthority: Object.freeze(
      resolveCharacterVoiceAuthorityV1(
        {
          characterId: input.context.characterId,
          contentVersion: input.context.contentVersion,
          speech: input.context.speech,
          persona: input.context.persona,
        },
        'face_product',
      ),
    ),
    governedFace,
  });
}
