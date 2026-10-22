import {
  CHARACTER_RUNTIME_AUTHORING_V1_CHARACTER_IDS,
  type CharacterRuntimeAuthoringV1CharacterId,
} from './runtime-authoring-v1.js';
import {
  CHARACTER_VOICE_AUTHORITY_SOURCE_V1,
  type CharacterVoiceAuthorityV1,
} from './character-voice-continuity-v1.js';

/**
 * I18N-06 Bible-first, read-only handoff.
 *
 * This projects an already-published Character voice rather than inferring a
 * production Bible from the nine PO-approved typed authoring candidates.
 * The comparison ledger is for Character owner follow-up, not a runtime switch.
 * It never installs a locale-specific pronoun, changes relationship state,
 * produces Reader text or permits a new language to be served.
 */
export const READER_LANGUAGE_NEUTRAL_VOICE_HANDOFF_VERSION_V1 =
  'reader-language-neutral-voice-handoff-v1' as const;

export const READER_VOICE_ALIGNMENT_DIAGNOSTICS_V1 = Object.freeze({
  seyeon: 'character_owner_reconciliation_required',
  yeoul: 'character_owner_reconciliation_required',
  seorin: 'character_owner_reconciliation_required',
  rahyeon: 'no_material_difference_flagged',
  mira: 'character_owner_reconciliation_required',
  taegyeom: 'no_material_difference_flagged',
  yunho: 'no_material_difference_flagged',
  doyun: 'character_owner_reconciliation_required',
  baekheon: 'character_owner_reconciliation_required',
} as const satisfies Record<CharacterRuntimeAuthoringV1CharacterId,
  'character_owner_reconciliation_required' | 'no_material_difference_flagged'>);

export const READER_VOICE_ALIGNMENT_DIAGNOSTIC_SOURCE_V1 =
  'docs/FRONTEND_INTEGRATION_READER_LANGUAGE_NEUTRAL_VOICE_MATRIX_V1_20261022.md' as const;

export type ReaderVoiceNeutralHandoffDecisionV1 =
  | Readonly<{
      state: 'prepared';
      schemaVersion: typeof READER_LANGUAGE_NEUTRAL_VOICE_HANDOFF_VERSION_V1;
      outputAuthority: 'existing_published_character_content_only';
      foreignLanguageRelease: 'hold';
      voiceAuthority: CharacterVoiceAuthorityV1;
      characterId: CharacterRuntimeAuthoringV1CharacterId;
      contentVersion: string;
      alignment: typeof READER_VOICE_ALIGNMENT_DIAGNOSTICS_V1[CharacterRuntimeAuthoringV1CharacterId];
      alignmentSource: typeof READER_VOICE_ALIGNMENT_DIAGNOSTIC_SOURCE_V1;
      localeStyle: 'not_authored';
    }>
  | Readonly<{
      state: 'hold';
      reason: 'unknown_character' | 'invalid_published_voice' | 'voice_identity_mismatch';
    }>;

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 &&
    value === value.trim() && value.length <= 256;
}

function rosterId(value: string): value is CharacterRuntimeAuthoringV1CharacterId {
  return CHARACTER_RUNTIME_AUTHORING_V1_CHARACTER_IDS.some(id => id === value);
}

/**
 * Existing Character content must be supplied from the same server-governed
 * published release used by Reader Runtime, not an HTTP/UI authoring candidate.
 * This purely structural projection is NOT a publication/entitlement assertion.
 */
export function prepareReaderLanguageNeutralVoiceHandoffV1(input: Readonly<{
  selectedCharacterId: string;
  voiceAuthority: CharacterVoiceAuthorityV1;
}>): ReaderVoiceNeutralHandoffDecisionV1 {
  const { selectedCharacterId, voiceAuthority } = input;
  if (!rosterId(selectedCharacterId)) {
    return Object.freeze({ state: 'hold', reason: 'unknown_character' });
  }
  if (voiceAuthority?.source !== CHARACTER_VOICE_AUTHORITY_SOURCE_V1 ||
      !nonempty(voiceAuthority.characterId) ||
      !nonempty(voiceAuthority.contentVersion) ||
      !nonempty(voiceAuthority.speech?.register) ||
      !nonempty(voiceAuthority.speech?.sentenceRhythm) ||
      !nonempty(voiceAuthority.communication?.register) ||
      !nonempty(voiceAuthority.communication?.sentenceRhythm)) {
    return Object.freeze({ state: 'hold', reason: 'invalid_published_voice' });
  }
  if (selectedCharacterId !== voiceAuthority.characterId) {
    return Object.freeze({ state: 'hold', reason: 'voice_identity_mismatch' });
  }
  return Object.freeze({
    state: 'prepared',
    schemaVersion: READER_LANGUAGE_NEUTRAL_VOICE_HANDOFF_VERSION_V1,
    outputAuthority: 'existing_published_character_content_only',
    foreignLanguageRelease: 'hold',
    voiceAuthority,
    characterId: selectedCharacterId,
    contentVersion: voiceAuthority.contentVersion,
    alignment: READER_VOICE_ALIGNMENT_DIAGNOSTICS_V1[selectedCharacterId],
    alignmentSource: READER_VOICE_ALIGNMENT_DIAGNOSTIC_SOURCE_V1,
    localeStyle: 'not_authored',
  });
}
