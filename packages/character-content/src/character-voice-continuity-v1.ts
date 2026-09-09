import {
  CHARACTER_RUNTIME_AUTHORING_V1,
  type CharacterRuntimeAuthoringV1CharacterId,
  type CharacterRuntimeAuthoringV1Definition,
} from './runtime-authoring-v1.js';

export const CHARACTER_CONVERSATION_SURFACES_V1 = [
  'general_chat',
  'saju_product',
] as const;

export type CharacterConversationSurfaceV1 =
  (typeof CHARACTER_CONVERSATION_SURFACES_V1)[number];

export const CHARACTER_VOICE_AUTHORITY_VERSION_V1 = 'runtime-authoring-v1' as const;

export const CHARACTER_SAJU_VOICE_CONTINUITY_POLICY_V1 = {
  voiceAuthority: 'shared_runtime_authoring',
  sajuSpecificVoiceOverride: 'forbidden',
  protectedSemanticPayload: 'immutable',
  unauthorizedRealityInference: 'forbidden',
  stageDirectionInSpeech: 'forbidden',
  visualReactionChannel: 'emotion_animation_cue_only',
} as const;

export interface CharacterVoiceAuthorityV1 {
  readonly characterId: CharacterRuntimeAuthoringV1CharacterId;
  readonly surface: CharacterConversationSurfaceV1;
  readonly sourceVersion: typeof CHARACTER_VOICE_AUTHORITY_VERSION_V1;
  readonly speech: CharacterRuntimeAuthoringV1Definition['speech'];
  readonly communication: CharacterRuntimeAuthoringV1Definition['persona']['communication'];
}

export const CHARACTER_VOICE_CONTINUITY_VIOLATION_CODES_V1 = [
  'VOICE_AUTHORITY_MISMATCH',
  'SAJU_VOICE_OVERRIDE_FORBIDDEN',
  'UNAUTHORIZED_REALITY_FACT',
  'STAGE_DIRECTION_IN_SPEECH',
] as const;

export type CharacterVoiceContinuityViolationCodeV1 =
  (typeof CHARACTER_VOICE_CONTINUITY_VIOLATION_CODES_V1)[number];

export interface CharacterVoiceContinuityEvidenceV1 {
  readonly characterId: CharacterRuntimeAuthoringV1CharacterId;
  readonly surface: CharacterConversationSurfaceV1;
  readonly voiceAuthorityCharacterId: CharacterRuntimeAuthoringV1CharacterId;
  readonly voiceAuthorityVersion: typeof CHARACTER_VOICE_AUTHORITY_VERSION_V1;
  readonly sajuVoiceOverrideRequested?: boolean;
  readonly introducedRealityFactKeys?: readonly string[];
  readonly authorizedRealityFactKeys?: readonly string[];
  readonly proseStageDirections?: readonly string[];
}

export interface CharacterVoiceContinuityViolationV1 {
  readonly code: CharacterVoiceContinuityViolationCodeV1;
  readonly detail: string;
  readonly value?: string;
}

export interface CharacterVoiceContinuityValidationResultV1 {
  readonly ok: boolean;
  readonly violations: readonly CharacterVoiceContinuityViolationV1[];
}

function getRuntimeAuthoringDefinition(
  characterId: CharacterRuntimeAuthoringV1CharacterId,
): CharacterRuntimeAuthoringV1Definition {
  const definition = CHARACTER_RUNTIME_AUTHORING_V1.find(
    (candidate) => candidate.characterId === characterId,
  );

  if (definition === undefined) {
    throw new Error(`Missing runtime authoring authority for character: ${characterId}`);
  }

  return definition;
}

/**
 * General chat and Saju products deliberately resolve the same authored speech and
 * communication objects. A product surface may add grounded content constraints,
 * but it never receives a separate Character voice authority.
 */
export function resolveCharacterVoiceAuthorityV1(
  characterId: CharacterRuntimeAuthoringV1CharacterId,
  surface: CharacterConversationSurfaceV1,
): CharacterVoiceAuthorityV1 {
  const definition = getRuntimeAuthoringDefinition(characterId);

  return {
    characterId,
    surface,
    sourceVersion: CHARACTER_VOICE_AUTHORITY_VERSION_V1,
    speech: definition.speech,
    communication: definition.persona.communication,
  };
}

/**
 * Validates structured render evidence at the Character/Saju boundary.
 *
 * This validator intentionally does not infer facts or parse free-form prose. The
 * renderer/compiler must report introduced reality fact keys and any stage-direction
 * segments explicitly so the boundary can fail closed instead of guessing from text.
 */
export function validateCharacterVoiceContinuityV1(
  evidence: CharacterVoiceContinuityEvidenceV1,
): CharacterVoiceContinuityValidationResultV1 {
  const violations: CharacterVoiceContinuityViolationV1[] = [];

  if (
    evidence.voiceAuthorityCharacterId !== evidence.characterId ||
    evidence.voiceAuthorityVersion !== CHARACTER_VOICE_AUTHORITY_VERSION_V1
  ) {
    violations.push({
      code: 'VOICE_AUTHORITY_MISMATCH',
      detail: 'The rendered response must use the selected Character runtime authoring authority.',
      value: `${evidence.voiceAuthorityCharacterId}@${evidence.voiceAuthorityVersion}`,
    });
  }

  if (evidence.surface === 'saju_product' && evidence.sajuVoiceOverrideRequested === true) {
    violations.push({
      code: 'SAJU_VOICE_OVERRIDE_FORBIDDEN',
      detail: 'Saju products may not replace the Character voice with a product-specific voice.',
    });
  }

  const authorizedRealityFactKeys = new Set(evidence.authorizedRealityFactKeys ?? []);
  for (const factKey of evidence.introducedRealityFactKeys ?? []) {
    if (!authorizedRealityFactKeys.has(factKey)) {
      violations.push({
        code: 'UNAUTHORIZED_REALITY_FACT',
        detail: 'Reality-specific wording requires an explicitly authorized context fact key.',
        value: factKey,
      });
    }
  }

  for (const stageDirection of evidence.proseStageDirections ?? []) {
    violations.push({
      code: 'STAGE_DIRECTION_IN_SPEECH',
      detail: 'Character poses and expressions belong in visual cues, not prose speech.',
      value: stageDirection,
    });
  }

  return {
    ok: violations.length === 0,
    violations,
  };
}
