import {
  CHARACTER_VOICE_AUTHORITY_SOURCE_V1,
  type CharacterVoiceAuthorityV1,
} from './character-voice-continuity-v1.js';

/**
 * I18N-06a: presentation-only voice locale boundary.
 * A UI locale is NOT an authorization to render in that language.
 * Canonical published Character speech/communication remains the only voice
 * authority for general chat, Saju and Face. No locale profile may replace it.
 */
export const CHARACTER_VOICE_LOCALE_CONTRACT_VERSION_V1 =
  'myeongha-character-voice-locale-v1' as const;

export const CHARACTER_VOICE_LOCALES_V1 = [
  'ko-KR', 'ja-JP', 'zh-TW',
] as const;

export type CharacterVoiceLocaleV1 =
  (typeof CHARACTER_VOICE_LOCALES_V1)[number];

/**
 * Language-level conventions are shared across Characters; these are
 * authoring references, not an LLM prompt or a release decision.
 */
export interface CharacterVoiceLocaleConventionsV1 {
  readonly locale: CharacterVoiceLocaleV1;
  readonly version: string;
  readonly firstPersonConventionRef: string;
  readonly addresseeConventionRef: string;
  readonly politenessConventionRef: string;
}

/** Only differences from the published Bible, never a second Bible. */
export interface CharacterVoiceLocaleDeltaV1 {
  readonly contractVersion: typeof CHARACTER_VOICE_LOCALE_CONTRACT_VERSION_V1;
  readonly characterId: string;
  readonly sourceContentVersion: string;
  readonly locale: Exclude<CharacterVoiceLocaleV1, 'ko-KR'>;
  readonly profileVersion: string;
  readonly localeConventionsVersion: string;
  readonly firstPersonRef?: string;
  readonly addresseeStyleRef?: string;
  readonly politenessRegisterRef?: string;
  readonly sentenceEndingRef?: string;
  readonly contextRules?: readonly Readonly<{
    readonly conditionRef: string;
    readonly styleRef: string;
  }>[];
}

/**
 * `korean_existing` is the only executable state in I18N-06a.
 * The `hold` states deliberately never return a candidate profile or prompt,
 * including when language conventions and a delta are both present.
 */
export type CharacterVoiceLocaleDecisionV1 =
  | Readonly<{
      state: 'korean_existing';
      locale: 'ko-KR';
      characterId: string;
      sourceContentVersion: string;
    }>
  | Readonly<{
      state: 'hold';
      reason:
        | 'invalid_voice_authority'
        | 'unsupported_locale'
        | 'locale_conventions_missing'
        | 'locale_conventions_mismatch'
        | 'character_delta_missing'
        | 'character_delta_mismatch'
        | 'non_korean_release_not_admitted';
    }>;

function boundedRef(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 &&
    value.length <= 256 && value === value.trim();
}

function localeSupported(value: string): value is CharacterVoiceLocaleV1 {
  return CHARACTER_VOICE_LOCALES_V1.some((locale) => locale === value);
}

function conventionsValid(value: CharacterVoiceLocaleConventionsV1): boolean {
  return boundedRef(value.version) &&
    boundedRef(value.firstPersonConventionRef) &&
    boundedRef(value.addresseeConventionRef) &&
    boundedRef(value.politenessConventionRef);
}

function deltaValid(value: CharacterVoiceLocaleDeltaV1): boolean {
  const optionalRefs = [
    value.firstPersonRef,
    value.addresseeStyleRef,
    value.politenessRegisterRef,
    value.sentenceEndingRef,
  ];
  return value.contractVersion === CHARACTER_VOICE_LOCALE_CONTRACT_VERSION_V1 &&
    boundedRef(value.characterId) &&
    boundedRef(value.sourceContentVersion) &&
    boundedRef(value.profileVersion) &&
    boundedRef(value.localeConventionsVersion) &&
    optionalRefs.every((v) => v === undefined || boundedRef(v)) &&
    (value.contextRules === undefined ||
      (Array.isArray(value.contextRules) && value.contextRules.length <= 32 &&
        value.contextRules.every((rule) =>
          boundedRef(rule.conditionRef) && boundedRef(rule.styleRef))));
}

/** Source-anchored, fail-closed planning only; NEVER grants foreign-language output. */
export function resolveCharacterVoiceLocaleV1(input: Readonly<{
  voiceAuthority: CharacterVoiceAuthorityV1;
  requestedLocale: string;
  conventions?: CharacterVoiceLocaleConventionsV1;
  delta?: CharacterVoiceLocaleDeltaV1;
}>): CharacterVoiceLocaleDecisionV1 {
  const { voiceAuthority, requestedLocale, conventions, delta } = input;
  if (voiceAuthority?.source !== CHARACTER_VOICE_AUTHORITY_SOURCE_V1 ||
      !boundedRef(voiceAuthority.characterId) ||
      !boundedRef(voiceAuthority.contentVersion) ||
      voiceAuthority.speech === undefined ||
      voiceAuthority.communication === undefined) {
    return Object.freeze({ state: 'hold', reason: 'invalid_voice_authority' });
  }
  if (!localeSupported(requestedLocale)) {
    return Object.freeze({ state: 'hold', reason: 'unsupported_locale' });
  }
  if (requestedLocale === 'ko-KR') {
    return Object.freeze({
      state: 'korean_existing',
      locale: 'ko-KR',
      characterId: voiceAuthority.characterId,
      sourceContentVersion: voiceAuthority.contentVersion,
    });
  }
  if (conventions === undefined) {
    return Object.freeze({ state: 'hold', reason: 'locale_conventions_missing' });
  }
  if (conventions.locale !== requestedLocale || !conventionsValid(conventions)) {
    return Object.freeze({ state: 'hold', reason: 'locale_conventions_mismatch' });
  }
  if (delta === undefined) {
    return Object.freeze({ state: 'hold', reason: 'character_delta_missing' });
  }
  if (!deltaValid(delta) ||
      delta.characterId !== voiceAuthority.characterId ||
      delta.sourceContentVersion !== voiceAuthority.contentVersion ||
      delta.locale !== requestedLocale ||
      delta.localeConventionsVersion !== conventions.version) {
    return Object.freeze({ state: 'hold', reason: 'character_delta_mismatch' });
  }
  // These authoring references can be prepared; approval, grounded rendering,
  // semantic review, output guard and release admission are separate gates.
  return Object.freeze({ state: 'hold', reason: 'non_korean_release_not_admitted' });
}
