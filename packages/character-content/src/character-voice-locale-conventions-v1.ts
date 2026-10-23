/**
 * I18N-06b — shared language conventions for Reader delivery.
 *
 * Character identity is still owned by the one published Character Bible.
 * These locale-level constraints are an authoring reference, not a second
 * Character Bible, a prompt, a semantic authority, or output release approval.
 * Actual self-reference, address, register and expressive markers must be
 * explicitly approved in a character×locale profile and, where applicable,
 * in the governed conversational context.
 */
export const CHARACTER_VOICE_LOCALE_COMMON_RULES_VERSION_V1 =
  'myeongha-character-voice-common-rules-v1' as const;

export type CharacterVoiceCommonLocaleV1 = 'ja-JP' | 'zh-TW';

export type CharacterVoiceConventionDimensionV1 =
  | 'self_reference'
  | 'addressee'
  | 'politeness'
  | 'sentence_endings'
  | 'emotion_expression'
  | 'regional_usage';

export type CharacterVoiceConventionDecisionOwnerV1 =
  | 'character_locale_delta'
  | 'character_locale_delta_and_context'
  | 'locale_convention';

export interface CharacterVoiceConventionRuleV1 {
  readonly ruleKey: string;
  readonly dimension: CharacterVoiceConventionDimensionV1;
  readonly decisionOwner: CharacterVoiceConventionDecisionOwnerV1;
  readonly constraint: string;
}

/**
 * Shape intentionally includes the three convention references required by
 * I18N-06a, while retaining the human-reviewable rules for I18N-06b.
 */
export interface CharacterVoiceCommonConventionsV1 {
  readonly locale: CharacterVoiceCommonLocaleV1;
  readonly version: string;
  readonly firstPersonConventionRef: string;
  readonly addresseeConventionRef: string;
  readonly politenessConventionRef: string;
  readonly rules: readonly CharacterVoiceConventionRuleV1[];
  readonly status: 'authoring_only';
}

const JA_RULES: readonly CharacterVoiceConventionRuleV1[] = Object.freeze([
  Object.freeze({
    ruleKey: 'ja.self_reference.contextual',
    dimension: 'self_reference',
    decisionOwner: 'character_locale_delta_and_context',
    constraint:
      'Japanese first person may be omitted in natural speech. Never infer 俺, 僕, 私, あたし, or other forms from gender or an archetype; use only an approved Character-specific selection and context.',
  }),
  Object.freeze({
    ruleKey: 'ja.addressee.relationship',
    dimension: 'addressee',
    decisionOwner: 'character_locale_delta_and_context',
    constraint:
      'Use only approved names, name suffixes, or second-person address for the current relationship and setting. Never infer familiarity, seniority, or a nickname.',
  }),
  Object.freeze({
    ruleKey: 'ja.politeness.contextual',
    dimension: 'politeness',
    decisionOwner: 'character_locale_delta_and_context',
    constraint:
      'Plain versus です・ます register, honorifics, and humility follow approved Character delivery and the admitted situation; language switching must not advance relationship state.',
  }),
  Object.freeze({
    ruleKey: 'ja.endings.no_stereotype',
    dimension: 'sentence_endings',
    decisionOwner: 'character_locale_delta',
    constraint:
      'Do not assign gendered or exaggerated sentence-final particles (such as わ or ぜ) by archetype. Character-specific endings require separate approval.',
  }),
  Object.freeze({
    ruleKey: 'ja.emotion.preserve_bible',
    dimension: 'emotion_expression',
    decisionOwner: 'character_locale_delta_and_context',
    constraint:
      'Naturalize emotional and playful phrasing without replacing the canonical Character disposition, boundaries, or guarded behavior policy.',
  }),
  Object.freeze({
    ruleKey: 'ja.regional.standard',
    dimension: 'regional_usage',
    decisionOwner: 'locale_convention',
    constraint:
      'Use contemporary Japanese appropriate to ja-JP; do not invent dialect, historical speech, or occupational jargon as Character canon.',
  }),
]);

const ZH_TW_RULES: readonly CharacterVoiceConventionRuleV1[] = Object.freeze([
  Object.freeze({
    ruleKey: 'zh_tw.self_reference.contextual',
    dimension: 'self_reference',
    decisionOwner: 'character_locale_delta_and_context',
    constraint:
      'First-person usage follows natural Taiwan Traditional Chinese and the approved Character voice; do not invent a distinctive self-title or gender-coded persona.',
  }),
  Object.freeze({
    ruleKey: 'zh_tw.addressee.relationship',
    dimension: 'addressee',
    decisionOwner: 'character_locale_delta_and_context',
    constraint:
      'Choose 你, 您, names, and titles only from approved Character/address rules and admitted relationship context. Korean honorifics do not imply automatic use of 您.',
  }),
  Object.freeze({
    ruleKey: 'zh_tw.politeness.pragmatic',
    dimension: 'politeness',
    decisionOwner: 'character_locale_delta_and_context',
    constraint:
      'Express respect with natural phrasing and the approved Character register, not a mechanical substitution of Korean honorific markers.',
  }),
  Object.freeze({
    ruleKey: 'zh_tw.endings.approved',
    dimension: 'sentence_endings',
    decisionOwner: 'character_locale_delta',
    constraint:
      'Sentence-final particles and colloquialisms such as 喔, 啦, and 欸 are not default Character traits; require approved style and context.',
  }),
  Object.freeze({
    ruleKey: 'zh_tw.emotion.preserve_bible',
    dimension: 'emotion_expression',
    decisionOwner: 'character_locale_delta_and_context',
    constraint:
      'Adapt emotional expression without modifying Character identity, relationship permission, protected source claims, or memory authority.',
  }),
  Object.freeze({
    ruleKey: 'zh_tw.regional.traditional',
    dimension: 'regional_usage',
    decisionOwner: 'locale_convention',
    constraint:
      'Use Taiwan-oriented Traditional Chinese conventions for zh-TW; a simplified-to-traditional character swap alone does not authorize a localized Reader voice.',
  }),
]);

export const CHARACTER_VOICE_COMMON_CONVENTIONS_V1: Readonly<{
  'ja-JP': CharacterVoiceCommonConventionsV1;
  'zh-TW': CharacterVoiceCommonConventionsV1;
}> = Object.freeze({
  'ja-JP': Object.freeze({
    locale: 'ja-JP',
    version: CHARACTER_VOICE_LOCALE_COMMON_RULES_VERSION_V1,
    firstPersonConventionRef: 'ja.self_reference.contextual',
    addresseeConventionRef: 'ja.addressee.relationship',
    politenessConventionRef: 'ja.politeness.contextual',
    rules: JA_RULES,
    status: 'authoring_only',
  }),
  'zh-TW': Object.freeze({
    locale: 'zh-TW',
    version: CHARACTER_VOICE_LOCALE_COMMON_RULES_VERSION_V1,
    firstPersonConventionRef: 'zh_tw.self_reference.contextual',
    addresseeConventionRef: 'zh_tw.addressee.relationship',
    politenessConventionRef: 'zh_tw.politeness.pragmatic',
    rules: ZH_TW_RULES,
    status: 'authoring_only',
  }),
});

/**
 * Read-only authoring selection. Korean remains the unchanged runtime.
 * Unsupported locales never fall back to another language, and selecting
 * a rulebook cannot grant Reader output in Japanese or Chinese.
 */
export function inspectCharacterVoiceCommonConventionsV1(
  locale: string,
):
  | Readonly<{ state: 'authoring_only'; conventions: CharacterVoiceCommonConventionsV1 }>
  | Readonly<{ state: 'unavailable'; reason: 'korean_existing' | 'unsupported_locale' }> {
  if (locale === 'ko-KR') {
    return Object.freeze({ state: 'unavailable', reason: 'korean_existing' });
  }
  if (locale !== 'ja-JP' && locale !== 'zh-TW') {
    return Object.freeze({ state: 'unavailable', reason: 'unsupported_locale' });
  }
  return Object.freeze({
    state: 'authoring_only',
    conventions: CHARACTER_VOICE_COMMON_CONVENTIONS_V1[locale],
  });
}
