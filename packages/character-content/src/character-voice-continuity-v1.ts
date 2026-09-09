import type {
  CharacterContentDefinition,
  CharacterPersonaProfile,
} from './schema.js';

export const CHARACTER_CONVERSATION_SURFACES_V1 = [
  'general_chat',
  'saju_product',
] as const;

export type CharacterConversationSurfaceV1 =
  (typeof CHARACTER_CONVERSATION_SURFACES_V1)[number];

export const CHARACTER_VOICE_AUTHORITY_SOURCE_V1 = 'published_character_content' as const;

export const CHARACTER_SAJU_VOICE_CONTINUITY_POLICY_V1 = {
  voiceAuthority: 'shared_published_character_content',
  sajuSpecificVoiceOverride: 'forbidden',
  protectedSemanticPayload: 'immutable',
  unauthorizedRealityInference: 'forbidden',
  stageDirectionInSpeech: 'forbidden',
  visualReactionChannel: 'emotion_animation_cue_only',
} as const;

export type CharacterVoiceSourceV1 = Pick<
  CharacterContentDefinition,
  'characterId' | 'contentVersion' | 'speech'
> & {
  readonly persona: CharacterPersonaProfile;
};

export interface CharacterVoiceAuthorityV1 {
  readonly characterId: string;
  readonly surface: CharacterConversationSurfaceV1;
  readonly source: typeof CHARACTER_VOICE_AUTHORITY_SOURCE_V1;
  readonly contentVersion: string;
  readonly speech: CharacterContentDefinition['speech'];
  readonly communication: CharacterPersonaProfile['communication'];
}

export const CHARACTER_VOICE_CONTINUITY_VIOLATION_CODES_V1 = [
  'VOICE_AUTHORITY_MISMATCH',
  'VOICE_CONTENT_VERSION_MISMATCH',
  'SAJU_VOICE_OVERRIDE_FORBIDDEN',
  'UNAUTHORIZED_REALITY_FACT',
  'STAGE_DIRECTION_IN_SPEECH',
] as const;

export type CharacterVoiceContinuityViolationCodeV1 =
  (typeof CHARACTER_VOICE_CONTINUITY_VIOLATION_CODES_V1)[number];

export interface CharacterVoiceContinuityEvidenceV1 {
  readonly characterId: string;
  readonly characterContentVersion: string;
  readonly surface: CharacterConversationSurfaceV1;
  readonly voiceAuthorityCharacterId: string;
  readonly voiceAuthorityContentVersion: string;
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

/**
 * General chat and Saju products deliberately resolve the same published speech and
 * communication objects. A product surface may add grounded content constraints,
 * but it never receives a separate Character voice authority.
 */
export function resolveCharacterVoiceAuthorityV1(
  character: CharacterVoiceSourceV1,
  surface: CharacterConversationSurfaceV1,
): CharacterVoiceAuthorityV1 {
  return {
    characterId: character.characterId,
    surface,
    source: CHARACTER_VOICE_AUTHORITY_SOURCE_V1,
    contentVersion: character.contentVersion,
    speech: character.speech,
    communication: character.persona.communication,
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

  if (evidence.voiceAuthorityCharacterId !== evidence.characterId) {
    violations.push({
      code: 'VOICE_AUTHORITY_MISMATCH',
      detail: 'The rendered response must use the selected published Character voice authority.',
      value: evidence.voiceAuthorityCharacterId,
    });
  }

  if (evidence.voiceAuthorityContentVersion !== evidence.characterContentVersion) {
    violations.push({
      code: 'VOICE_CONTENT_VERSION_MISMATCH',
      detail: 'The rendered response must use the same published Character content version loaded for the turn.',
      value: `${evidence.voiceAuthorityContentVersion} != ${evidence.characterContentVersion}`,
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
