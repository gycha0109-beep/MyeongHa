import {
  CHARACTER_VOICE_LOCALES_V1,
  resolveCharacterVoiceLocaleV1,
} from './character-voice-locale-v1.js';
import {
  inspectCharacterVoiceCommonConventionsV1,
} from './character-voice-locale-conventions-v1.js';
import {
  APPROVED_CHARACTER_VOICE_LOCALE_EXCEPTIONS_V1,
  prepareCharacterVoiceSparseLocaleV1,
  type CharacterVoiceSparseLocaleSelectionV1,
} from './character-voice-locale-exceptions-v1.js';
import {
  prepareReaderLanguageNeutralVoiceHandoffV1,
  type ReaderVoiceNeutralHandoffDecisionV1,
} from './reader-language-neutral-voice-handoff-v1.js';
import type { CharacterVoiceAuthorityV1 } from './character-voice-continuity-v1.js';

/**
 * I18N-06: One published Character Bible, one language-common rulebook,
 * optional sparse Character x locale delta.
 *
 * IMPORTANT: requestedVoiceLocale must be a server-owned Reader response
 * language request. It must NEVER be inferred from the UI locale header,
 * Accept-Language, a saved Chat message, or a browser-provided Character hint.
 * No branch of this function grants foreign-language production output.
 */
export const READER_VOICE_LOCALE_COMPOSITION_VERSION_V1 =
  'reader-voice-locale-composition-v1' as const;

export type ReaderVoiceLocaleCompositionDecisionV1 =
  | Readonly<{
      state: 'korean_existing';
      schemaVersion: typeof READER_VOICE_LOCALE_COMPOSITION_VERSION_V1;
      characterId: string;
      sourceContentVersion: string;
      voiceAuthority: CharacterVoiceAuthorityV1;
      release: 'existing_korean_path_only';
    }>
  | Readonly<{
      state: 'common_rules_only';
      schemaVersion: typeof READER_VOICE_LOCALE_COMPOSITION_VERSION_V1;
      characterId: string;
      sourceContentVersion: string;
      locale: 'ja-JP' | 'zh-TW';
      commonRulesVersion: string;
      characterDelta: 'not_authored';
      release: 'hold';
    }>
  | Readonly<{
      state: 'approved_delta_prepared';
      schemaVersion: typeof READER_VOICE_LOCALE_COMPOSITION_VERSION_V1;
      characterId: string;
      sourceContentVersion: string;
      locale: 'ja-JP' | 'zh-TW';
      commonRulesVersion: string;
      profileVersion: string;
      ownerApprovalRef: string;
      styleRefs: Extract<
        CharacterVoiceSparseLocaleSelectionV1,
        { readonly state: 'authoring_prepared' }
      >['styleRefs'];
      release: 'hold';
    }>
  | Readonly<{
      state: 'hold';
      reason:
        | 'invalid_neutral_voice'
        | 'unsupported_locale'
        | 'common_rules_unavailable'
        | 'approved_delta_invalid'
        | 'locale_contract_mismatch';
    }>;

/**
 * The approved registry is owned by character content, not by the caller.
 * The caller cannot submit ad-hoc exceptions, approvals or foreign-language
 * raw text. The source-neutral voice points at the same published content.
 */
export function prepareReaderVoiceLocaleCompositionV1(input: Readonly<{
  selectedCharacterId: string;
  voiceAuthority: CharacterVoiceAuthorityV1;
  requestedVoiceLocale: string;
}>): ReaderVoiceLocaleCompositionDecisionV1 {
  const neutral: ReaderVoiceNeutralHandoffDecisionV1 =
    prepareReaderLanguageNeutralVoiceHandoffV1({
      selectedCharacterId: input.selectedCharacterId,
      voiceAuthority: input.voiceAuthority,
    });
  if (neutral.state !== 'prepared') {
    return Object.freeze({ state: 'hold', reason: 'invalid_neutral_voice' });
  }

  const requestedLocale = input.requestedVoiceLocale;
  if (!CHARACTER_VOICE_LOCALES_V1.some(locale => locale === requestedLocale)) {
    return Object.freeze({ state: 'hold', reason: 'unsupported_locale' });
  }

  if (requestedLocale === 'ko-KR') {
    const korean = resolveCharacterVoiceLocaleV1({
      voiceAuthority: neutral.voiceAuthority,
      requestedLocale,
    });
    if (korean.state !== 'korean_existing') {
      return Object.freeze({ state: 'hold', reason: 'locale_contract_mismatch' });
    }
    return Object.freeze({
      state: 'korean_existing',
      schemaVersion: READER_VOICE_LOCALE_COMPOSITION_VERSION_V1,
      characterId: neutral.characterId,
      sourceContentVersion: neutral.contentVersion,
      voiceAuthority: neutral.voiceAuthority,
      release: 'existing_korean_path_only',
    });
  }

  const inspected = inspectCharacterVoiceCommonConventionsV1(requestedLocale);
  if (inspected.state !== 'authoring_only') {
    return Object.freeze({ state: 'hold', reason: 'common_rules_unavailable' });
  }
  const conventions = inspected.conventions;
  const selection = prepareCharacterVoiceSparseLocaleV1({
    voiceAuthority: neutral.voiceAuthority,
    requestedLocale,
    commonConventions: conventions,
  });

  if (selection.state === 'hold' && selection.reason === 'exception_missing') {
    // A안: no Character delta means just the language-common rulebook;
    // it MUST NOT manufacture an empty, approved Character profile.
    return Object.freeze({
      state: 'common_rules_only',
      schemaVersion: READER_VOICE_LOCALE_COMPOSITION_VERSION_V1,
      characterId: neutral.characterId,
      sourceContentVersion: neutral.contentVersion,
      locale: conventions.locale,
      commonRulesVersion: conventions.version,
      characterDelta: 'not_authored',
      release: 'hold',
    });
  }
  if (selection.state !== 'authoring_prepared') {
    return Object.freeze({ state: 'hold', reason: 'approved_delta_invalid' });
  }

  // The 06c selector has already required exactly one approved entry with
  // exact Character+content+locale+common-rules versions. Recheck that
  // same entry against 06a's fail-closed Reader locale contract.
  const matches = APPROVED_CHARACTER_VOICE_LOCALE_EXCEPTIONS_V1.filter(entry =>
    entry.delta.characterId === selection.characterId &&
    entry.delta.sourceContentVersion === selection.sourceContentVersion &&
    entry.delta.locale === selection.locale &&
    entry.delta.profileVersion === selection.profileVersion,
  );
  if (matches.length !== 1) {
    return Object.freeze({ state: 'hold', reason: 'approved_delta_invalid' });
  }
  const localeDecision = resolveCharacterVoiceLocaleV1({
    voiceAuthority: neutral.voiceAuthority,
    requestedLocale,
    conventions,
    delta: matches[0]!.delta,
  });
  if (localeDecision.state !== 'hold' ||
      localeDecision.reason !== 'non_korean_release_not_admitted') {
    return Object.freeze({ state: 'hold', reason: 'locale_contract_mismatch' });
  }

  return Object.freeze({
    state: 'approved_delta_prepared',
    schemaVersion: READER_VOICE_LOCALE_COMPOSITION_VERSION_V1,
    characterId: selection.characterId,
    sourceContentVersion: selection.sourceContentVersion,
    locale: selection.locale,
    commonRulesVersion: selection.commonConventionsVersion,
    profileVersion: selection.profileVersion,
    ownerApprovalRef: selection.ownerApprovalRef,
    styleRefs: selection.styleRefs,
    release: 'hold',
  });
}
