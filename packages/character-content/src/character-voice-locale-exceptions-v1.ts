import {
  CHARACTER_VOICE_AUTHORITY_SOURCE_V1,
  type CharacterVoiceAuthorityV1,
} from './character-voice-continuity-v1.js';

/**
 * I18N-06c: sparse, source-bound Character x locale voice exceptions.
 *
 * The published Character Bible stays authoritative for all conversation
 * surfaces. This module selects references to explicitly owner-approved
 * language differences, NOT text, a second Bible, a prompt, or permission
 * to generate a foreign-language Reader response.
 *
 * The structural inputs are compatible with I18N-06a
 * CharacterVoiceLocaleDeltaV1 and I18N-06b
 * CharacterVoiceCommonConventionsV1. Neither independent PR has to be
 * merged merely to prepare this fail-closed, non-executable registry.
 */
export const CHARACTER_VOICE_LOCALE_EXCEPTION_VERSION_V1 =
  'myeongha-character-voice-locale-exceptions-v1' as const;
export const CHARACTER_VOICE_LOCALE_DELTA_CONTRACT_V1 =
  'myeongha-character-voice-locale-v1' as const;

export type CharacterVoiceExceptionLocaleV1 = 'ja-JP' | 'zh-TW';

export interface CharacterVoiceExceptionCommonConventionsV1 {
  readonly locale: string;
  readonly version: string;
  readonly firstPersonConventionRef: string;
  readonly addresseeConventionRef: string;
  readonly politenessConventionRef: string;
  readonly status?: 'authoring_only';
}

export interface CharacterVoiceSparseLocaleDeltaV1 {
  readonly contractVersion: typeof CHARACTER_VOICE_LOCALE_DELTA_CONTRACT_V1;
  readonly characterId: string;
  readonly sourceContentVersion: string;
  readonly locale: CharacterVoiceExceptionLocaleV1;
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
 * Source-owner approval is independent of the JSON/profile's own assertions.
 * Entries must be supplied from an internal trusted approval source, never
 * directly from request headers, user chat, or unreviewed LLM output.
 */
export interface CharacterVoiceSparseLocaleApprovalV1 {
  readonly approvalRef: string;
  readonly characterId: string;
  readonly sourceContentVersion: string;
  readonly locale: CharacterVoiceExceptionLocaleV1;
  readonly profileVersion: string;
  readonly localeConventionsVersion: string;
}

export interface CharacterVoiceSparseLocaleEntryV1 {
  readonly delta: CharacterVoiceSparseLocaleDeltaV1;
  readonly ownerApproval?: CharacterVoiceSparseLocaleApprovalV1;
}

/** Deliberately empty until concrete character language values are approved. */
export const APPROVED_CHARACTER_VOICE_LOCALE_EXCEPTIONS_V1:
  readonly CharacterVoiceSparseLocaleEntryV1[] = Object.freeze([]);

export type CharacterVoiceSparseLocaleSelectionV1 =
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
        | 'common_conventions_missing'
        | 'common_conventions_mismatch'
        | 'exception_missing'
        | 'exception_ambiguous'
        | 'exception_invalid'
        | 'exception_unapproved';
    }>
  | Readonly<{
      state: 'authoring_prepared';
      releaseState: 'hold';
      characterId: string;
      sourceContentVersion: string;
      locale: CharacterVoiceExceptionLocaleV1;
      commonConventionsVersion: string;
      profileVersion: string;
      ownerApprovalRef: string;
      styleRefs: Readonly<{
        firstPersonRef?: string;
        addresseeStyleRef?: string;
        politenessRegisterRef?: string;
        sentenceEndingRef?: string;
        contextRules: readonly Readonly<{
          conditionRef: string;
          styleRef: string;
        }>[];
      }>;
    }>;

function boundedId(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 &&
    value.length <= 256 && value.trim() === value &&
    !/[\u0000-\u001f\u007f]/u.test(value);
}

function stableStyleRef(value: unknown): value is string {
  return boundedId(value) &&
    /^[a-z0-9][a-z0-9._:/-]*$/u.test(value);
}

const DELTA_KEYS = Object.freeze([
  'contractVersion', 'characterId', 'sourceContentVersion',
  'locale', 'profileVersion', 'localeConventionsVersion',
  'firstPersonRef', 'addresseeStyleRef', 'politenessRegisterRef',
  'sentenceEndingRef', 'contextRules',
] as const);

function deltaValid(delta: CharacterVoiceSparseLocaleDeltaV1): boolean {
  if (typeof delta !== 'object' || delta === null ||
      Object.keys(delta).some((key) => !DELTA_KEYS.some((allowed) => allowed === key))) {
    return false;
  }
  const optionalRefs = [
    delta.firstPersonRef, delta.addresseeStyleRef,
    delta.politenessRegisterRef, delta.sentenceEndingRef,
  ];
  if (delta.contractVersion !== CHARACTER_VOICE_LOCALE_DELTA_CONTRACT_V1 ||
      !boundedId(delta.characterId) ||
      !boundedId(delta.sourceContentVersion) ||
      !boundedId(delta.profileVersion) ||
      !boundedId(delta.localeConventionsVersion) ||
      optionalRefs.some((ref) => ref !== undefined && !stableStyleRef(ref))) {
    return false;
  }
  if (delta.contextRules === undefined) return true;
  if (!Array.isArray(delta.contextRules) || delta.contextRules.length > 32) {
    return false;
  }
  const conditions = new Set<string>();
  for (const rule of delta.contextRules) {
    if (typeof rule !== 'object' || rule === null ||
        Object.keys(rule).some((key) => key !== 'conditionRef' && key !== 'styleRef') ||
        !stableStyleRef(rule.conditionRef) || !stableStyleRef(rule.styleRef) ||
        conditions.has(rule.conditionRef)) {
      return false;
    }
    conditions.add(rule.conditionRef);
  }
  return true;
}

function approvedForExactSource(
  delta: CharacterVoiceSparseLocaleDeltaV1,
  approval: CharacterVoiceSparseLocaleApprovalV1 | undefined,
): approval is CharacterVoiceSparseLocaleApprovalV1 {
  return approval !== undefined &&
    boundedId(approval.approvalRef) &&
    approval.characterId === delta.characterId &&
    approval.sourceContentVersion === delta.sourceContentVersion &&
    approval.locale === delta.locale &&
    approval.profileVersion === delta.profileVersion &&
    approval.localeConventionsVersion === delta.localeConventionsVersion;
}

/**
 * A structured, authoring-only selection. Even an approved exception remains
 * releaseState=hold until I18N-06d persona/semantic/locale output guards
 * and the production release admission independently approve generation.
 */
export function prepareCharacterVoiceSparseLocaleV1(input: Readonly<{
  voiceAuthority: CharacterVoiceAuthorityV1;
  requestedLocale: string;
  commonConventions?: CharacterVoiceExceptionCommonConventionsV1;
  trustedEntries?: readonly CharacterVoiceSparseLocaleEntryV1[];
}>): CharacterVoiceSparseLocaleSelectionV1 {
  const { voiceAuthority, requestedLocale, commonConventions } = input;
  if (voiceAuthority?.source !== CHARACTER_VOICE_AUTHORITY_SOURCE_V1 ||
      !boundedId(voiceAuthority.characterId) ||
      !boundedId(voiceAuthority.contentVersion) ||
      voiceAuthority.speech === undefined ||
      voiceAuthority.communication === undefined) {
    return Object.freeze({ state: 'hold', reason: 'invalid_voice_authority' });
  }
  if (requestedLocale === 'ko-KR') {
    return Object.freeze({
      state: 'korean_existing',
      locale: 'ko-KR',
      characterId: voiceAuthority.characterId,
      sourceContentVersion: voiceAuthority.contentVersion,
    });
  }
  if (requestedLocale !== 'ja-JP' && requestedLocale !== 'zh-TW') {
    return Object.freeze({ state: 'hold', reason: 'unsupported_locale' });
  }
  if (commonConventions === undefined) {
    return Object.freeze({ state: 'hold', reason: 'common_conventions_missing' });
  }
  if (commonConventions.locale !== requestedLocale ||
      !boundedId(commonConventions.version) ||
      !stableStyleRef(commonConventions.firstPersonConventionRef) ||
      !stableStyleRef(commonConventions.addresseeConventionRef) ||
      !stableStyleRef(commonConventions.politenessConventionRef) ||
      commonConventions.status !== 'authoring_only') {
    return Object.freeze({ state: 'hold', reason: 'common_conventions_mismatch' });
  }

  const matching = (input.trustedEntries ?? APPROVED_CHARACTER_VOICE_LOCALE_EXCEPTIONS_V1)
    .filter((entry) => entry?.delta?.characterId === voiceAuthority.characterId &&
      entry.delta.locale === requestedLocale);
  if (matching.length === 0) {
    return Object.freeze({ state: 'hold', reason: 'exception_missing' });
  }
  if (matching.length !== 1) {
    return Object.freeze({ state: 'hold', reason: 'exception_ambiguous' });
  }
  const entry = matching[0];
  if (!entry || !deltaValid(entry.delta) ||
      entry.delta.sourceContentVersion !== voiceAuthority.contentVersion ||
      entry.delta.localeConventionsVersion !== commonConventions.version) {
    return Object.freeze({ state: 'hold', reason: 'exception_invalid' });
  }
  if (!approvedForExactSource(entry.delta, entry.ownerApproval)) {
    return Object.freeze({ state: 'hold', reason: 'exception_unapproved' });
  }

  const delta = entry.delta;
  const contextRules = Object.freeze(
    (delta.contextRules ?? []).map((rule) => Object.freeze({
      conditionRef: rule.conditionRef, styleRef: rule.styleRef,
    })),
  );
  const styleRefs = Object.freeze({
    ...(delta.firstPersonRef === undefined ? {} : { firstPersonRef: delta.firstPersonRef }),
    ...(delta.addresseeStyleRef === undefined ? {} : { addresseeStyleRef: delta.addresseeStyleRef }),
    ...(delta.politenessRegisterRef === undefined ? {} : { politenessRegisterRef: delta.politenessRegisterRef }),
    ...(delta.sentenceEndingRef === undefined ? {} : { sentenceEndingRef: delta.sentenceEndingRef }),
    contextRules,
  });

  return Object.freeze({
    state: 'authoring_prepared',
    releaseState: 'hold',
    characterId: voiceAuthority.characterId,
    sourceContentVersion: voiceAuthority.contentVersion,
    locale: requestedLocale,
    commonConventionsVersion: commonConventions.version,
    profileVersion: delta.profileVersion,
    ownerApprovalRef: entry.ownerApproval.approvalRef,
    styleRefs,
  });
}
