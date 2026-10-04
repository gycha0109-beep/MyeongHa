import {
  CHARACTER_VOICE_AUTHORITY_SOURCE_V1,
} from '../../character-content/src/index.js';
import type {
  CharacterRuntimeContextWithFaceGroundingV1,
} from './character-face-grounding-admission.js';

export const CHARACTER_FACE_VOICE_RUNTIME_INVARIANT_VERSION_V1 =
  'character-face-voice-runtime-invariant-v1' as const;

export class CharacterFaceVoiceRuntimeInvariantErrorV1
  extends TypeError {
  constructor(message: string) {
    super(message);
    this.name =
      'CharacterFaceVoiceRuntimeInvariantErrorV1';
  }
}

export function assertCharacterFaceVoiceRuntimeInvariantV1(
  context:
    CharacterRuntimeContextWithFaceGroundingV1,
): void {
  if (context.face === null) {
    throw new CharacterFaceVoiceRuntimeInvariantErrorV1(
      'Face voice runtime invariant requires a Face-bearing runtime context.',
    );
  }

  const authority =
    context.voiceAuthority;

  if (
    authority.source !==
    CHARACTER_VOICE_AUTHORITY_SOURCE_V1
  ) {
    throw new CharacterFaceVoiceRuntimeInvariantErrorV1(
      'Face renderer voice authority must come from published Character content.',
    );
  }

  if (
    authority.surface !==
    'face_product'
  ) {
    throw new CharacterFaceVoiceRuntimeInvariantErrorV1(
      'Face renderer voice authority surface must be face_product.',
    );
  }

  if (
    authority.characterId !==
    context.characterId
  ) {
    throw new CharacterFaceVoiceRuntimeInvariantErrorV1(
      'Face renderer voice authority does not match the active Character.',
    );
  }

  if (
    authority.contentVersion !==
    context.contentVersion
  ) {
    throw new CharacterFaceVoiceRuntimeInvariantErrorV1(
      'Face renderer voice authority does not match the active Character content version.',
    );
  }

  if (
    authority.speech !==
    context.speech
  ) {
    throw new CharacterFaceVoiceRuntimeInvariantErrorV1(
      'Face renderer must use the exact published Character speech object for the turn.',
    );
  }

  if (
    authority.communication !==
    context.persona.communication
  ) {
    throw new CharacterFaceVoiceRuntimeInvariantErrorV1(
      'Face renderer must use the exact published Character communication object for the turn.',
    );
  }
}
