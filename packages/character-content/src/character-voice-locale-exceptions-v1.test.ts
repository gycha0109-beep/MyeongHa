import { describe, expect, it } from 'vitest';
import { resolveCharacterVoiceAuthorityV1 } from './character-voice-continuity-v1.js';
import {
  APPROVED_CHARACTER_VOICE_LOCALE_EXCEPTIONS_V1,
  CHARACTER_VOICE_LOCALE_DELTA_CONTRACT_V1,
  prepareCharacterVoiceSparseLocaleV1,
  type CharacterVoiceExceptionCommonConventionsV1,
  type CharacterVoiceSparseLocaleEntryV1,
} from './character-voice-locale-exceptions-v1.js';
import { CHARACTER_RUNTIME_AUTHORING_V1 } from './runtime-authoring-v1.js';

const authoring = CHARACTER_RUNTIME_AUTHORING_V1.find(
  (item) => item.characterId === 'seyeon',
);
if (!authoring) throw new Error('Character authoring fixture missing');

const published = {
  characterId: authoring.characterId,
  contentVersion: 'test-published-content-v1',
  speech: authoring.speech,
  persona: authoring.persona,
};
const voice = resolveCharacterVoiceAuthorityV1(published, 'general_chat');

const commonJa: CharacterVoiceExceptionCommonConventionsV1 = Object.freeze({
  locale: 'ja-JP',
  version: 'test-shared-conventions-v1',
  firstPersonConventionRef: 'ja.self_reference.contextual',
  addresseeConventionRef: 'ja.addressee.relationship',
  politenessConventionRef: 'ja.politeness.contextual',
  status: 'authoring_only',
});

const commonZhTw: CharacterVoiceExceptionCommonConventionsV1 = Object.freeze({
  locale: 'zh-TW',
  version: 'test-shared-conventions-v1',
  firstPersonConventionRef: 'zh_tw.self_reference.contextual',
  addresseeConventionRef: 'zh_tw.addressee.relationship',
  politenessConventionRef: 'zh_tw.politeness.pragmatic',
  status: 'authoring_only',
});

const mockApprovedEntry: CharacterVoiceSparseLocaleEntryV1 = {
  delta: {
    contractVersion: CHARACTER_VOICE_LOCALE_DELTA_CONTRACT_V1,
    characterId: 'seyeon',
    sourceContentVersion: 'test-published-content-v1',
    locale: 'ja-JP',
    profileVersion: 'test-localized-profile-v1',
    localeConventionsVersion: 'test-shared-conventions-v1',
    // Synthetic references ONLY, not actual Japanese pronouns or Reader style.
    firstPersonRef: 'test.spec.style.self_reference',
    contextRules: [
      { conditionRef: 'test.spec.context.formal', styleRef: 'test.spec.style.formal' },
    ],
  },
  ownerApproval: {
    approvalRef: 'test-only-owner-approval',
    characterId: 'seyeon',
    sourceContentVersion: 'test-published-content-v1',
    locale: 'ja-JP',
    profileVersion: 'test-localized-profile-v1',
    localeConventionsVersion: 'test-shared-conventions-v1',
  },
};

describe('I18N-06c source-bound sparse Reader voice exceptions', () => {
  it('ships no approved character x locale exceptions or guessed language values', () => {
    expect(APPROVED_CHARACTER_VOICE_LOCALE_EXCEPTIONS_V1).toEqual([]);
    expect(Object.isFrozen(APPROVED_CHARACTER_VOICE_LOCALE_EXCEPTIONS_V1)).toBe(true);
    expect(prepareCharacterVoiceSparseLocaleV1({
      voiceAuthority: voice,
      requestedLocale: 'ja-JP',
      commonConventions: commonJa,
    })).toEqual({ state: 'hold', reason: 'exception_missing' });
    expect(prepareCharacterVoiceSparseLocaleV1({
      voiceAuthority: voice,
      requestedLocale: 'zh-TW',
      commonConventions: commonZhTw,
    })).toEqual({ state: 'hold', reason: 'exception_missing' });
  });

  it('preserves the existing published Korean voice across all product surfaces', () => {
    for (const surface of ['general_chat', 'saju_product', 'face_product'] as const) {
      const authority = resolveCharacterVoiceAuthorityV1(published, surface);
      expect(prepareCharacterVoiceSparseLocaleV1({
        voiceAuthority: authority,
        requestedLocale: 'ko-KR',
        trustedEntries: [mockApprovedEntry],
      })).toEqual({
        state: 'korean_existing',
        locale: 'ko-KR',
        characterId: published.characterId,
        sourceContentVersion: published.contentVersion,
      });
      expect(authority.speech).toBe(published.speech);
      expect(authority.communication).toBe(published.persona.communication);
    }
  });

  it('holds unsupported locale and invalid published Character voice', () => {
    for (const locale of ['', 'ja', 'zh-CN', 'en-US', 'ko-kr']) {
      expect(prepareCharacterVoiceSparseLocaleV1({
        voiceAuthority: voice, requestedLocale: locale,
      })).toEqual({ state: 'hold', reason: 'unsupported_locale' });
    }
    expect(prepareCharacterVoiceSparseLocaleV1({
      voiceAuthority: { ...voice, source: 'forged' } as unknown as typeof voice,
      requestedLocale: 'ko-KR',
    })).toEqual({ state: 'hold', reason: 'invalid_voice_authority' });
  });

  it('requires a matching and versioned locale-common rulebook', () => {
    expect(prepareCharacterVoiceSparseLocaleV1({
      voiceAuthority: voice,
      requestedLocale: 'ja-JP',
    })).toEqual({ state: 'hold', reason: 'common_conventions_missing' });
    expect(prepareCharacterVoiceSparseLocaleV1({
      voiceAuthority: voice,
      requestedLocale: 'ja-JP',
      commonConventions: commonZhTw,
      trustedEntries: [mockApprovedEntry],
    })).toEqual({ state: 'hold', reason: 'common_conventions_mismatch' });
    expect(prepareCharacterVoiceSparseLocaleV1({
      voiceAuthority: voice,
      requestedLocale: 'ja-JP',
      commonConventions: { ...commonJa, status: undefined } as unknown as
        CharacterVoiceExceptionCommonConventionsV1,
      trustedEntries: [mockApprovedEntry],
    })).toEqual({ state: 'hold', reason: 'common_conventions_mismatch' });
  });

  it('rejects missing approval and source/content/version/locale mismatches', () => {
    const base = {
      voiceAuthority: voice,
      requestedLocale: 'ja-JP',
      commonConventions: commonJa,
    } as const;
    expect(prepareCharacterVoiceSparseLocaleV1({
      ...base, trustedEntries: [{ delta: mockApprovedEntry.delta }],
    })).toEqual({ state: 'hold', reason: 'exception_unapproved' });
    expect(prepareCharacterVoiceSparseLocaleV1({
      ...base,
      trustedEntries: [{
        ...mockApprovedEntry,
        ownerApproval: {
          ...mockApprovedEntry.ownerApproval!,
          sourceContentVersion: 'different-content',
        },
      }],
    })).toEqual({ state: 'hold', reason: 'exception_unapproved' });
    expect(prepareCharacterVoiceSparseLocaleV1({
      ...base,
      trustedEntries: [{
        ...mockApprovedEntry,
        delta: { ...mockApprovedEntry.delta, sourceContentVersion: 'stale' },
      }],
    })).toEqual({ state: 'hold', reason: 'exception_invalid' });
    expect(prepareCharacterVoiceSparseLocaleV1({
      ...base,
      trustedEntries: [{
        ...mockApprovedEntry,
        delta: { ...mockApprovedEntry.delta, localeConventionsVersion: 'old' },
      }],
    })).toEqual({ state: 'hold', reason: 'exception_invalid' });
    expect(prepareCharacterVoiceSparseLocaleV1({
      ...base,
      trustedEntries: [{
        ...mockApprovedEntry,
        delta: { ...mockApprovedEntry.delta, characterId: 'other' },
      }],
    })).toEqual({ state: 'hold', reason: 'exception_missing' });
  });

  it('refuses multiple candidate profiles rather than choosing an arbitrary version', () => {
    expect(prepareCharacterVoiceSparseLocaleV1({
      voiceAuthority: voice,
      requestedLocale: 'ja-JP',
      commonConventions: commonJa,
      trustedEntries: [mockApprovedEntry, {
        ...mockApprovedEntry,
        delta: { ...mockApprovedEntry.delta, profileVersion: 'another' },
      }],
    })).toEqual({ state: 'hold', reason: 'exception_ambiguous' });
  });

  it('rejects hidden Bible overrides and conflicting context conditions', () => {
    const base = { voiceAuthority: voice, requestedLocale: 'ja-JP',
      commonConventions: commonJa } as const;
    expect(prepareCharacterVoiceSparseLocaleV1({
      ...base,
      trustedEntries: [{
        ...mockApprovedEntry,
        delta: { ...mockApprovedEntry.delta, persona: 'forged-new-bible' } as
          unknown as typeof mockApprovedEntry.delta,
      }],
    })).toEqual({ state: 'hold', reason: 'exception_invalid' });
    expect(prepareCharacterVoiceSparseLocaleV1({
      ...base,
      trustedEntries: [{
        ...mockApprovedEntry,
        delta: {
          ...mockApprovedEntry.delta,
          firstPersonRef: 'unsupported raw phrase!',
        },
      }],
    })).toEqual({ state: 'hold', reason: 'exception_invalid' });
    expect(prepareCharacterVoiceSparseLocaleV1({
      ...base,
      trustedEntries: [{
        ...mockApprovedEntry,
        delta: {
          ...mockApprovedEntry.delta,
          contextRules: [
            { conditionRef: 'same', styleRef: 'test.spec.a' },
            { conditionRef: 'same', styleRef: 'test.spec.b' },
          ],
        },
      }],
    })).toEqual({ state: 'hold', reason: 'exception_invalid' });
  });

  it('prepares only approved style references and never grants foreign output', () => {
    const result = prepareCharacterVoiceSparseLocaleV1({
      voiceAuthority: voice,
      requestedLocale: 'ja-JP',
      commonConventions: commonJa,
      trustedEntries: [mockApprovedEntry],
    });
    expect(result).toEqual({
      state: 'authoring_prepared',
      releaseState: 'hold',
      characterId: 'seyeon',
      sourceContentVersion: 'test-published-content-v1',
      locale: 'ja-JP',
      commonConventionsVersion: 'test-shared-conventions-v1',
      profileVersion: 'test-localized-profile-v1',
      ownerApprovalRef: 'test-only-owner-approval',
      styleRefs: {
        firstPersonRef: 'test.spec.style.self_reference',
        contextRules: [{
          conditionRef: 'test.spec.context.formal',
          styleRef: 'test.spec.style.formal',
        }],
      },
    });
    if (result.state !== 'authoring_prepared') {
      throw new Error('Expected authoring preparation');
    }
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.styleRefs)).toBe(true);
    expect(Object.isFrozen(result.styleRefs.contextRules)).toBe(true);
    expect(Object.isFrozen(result.styleRefs.contextRules[0])).toBe(true);
    expect('speech' in result).toBe(false);
    expect('persona' in result).toBe(false);
    expect('utterance' in result).toBe(false);
    expect('releaseAdmitted' in result).toBe(false);
  });

  it('accepts an approved no-override profile without requiring every field', () => {
    const result = prepareCharacterVoiceSparseLocaleV1({
      voiceAuthority: voice,
      requestedLocale: 'ja-JP',
      commonConventions: commonJa,
      trustedEntries: [{
        ...mockApprovedEntry,
        delta: {
          contractVersion: CHARACTER_VOICE_LOCALE_DELTA_CONTRACT_V1,
          characterId: 'seyeon',
          sourceContentVersion: 'test-published-content-v1',
          locale: 'ja-JP',
          profileVersion: 'test-localized-profile-v1',
          localeConventionsVersion: 'test-shared-conventions-v1',
        },
      }],
    });
    expect(result.state).toBe('authoring_prepared');
    if (result.state !== 'authoring_prepared') throw new Error('Unexpected state');
    expect(result.styleRefs).toEqual({ contextRules: [] });
    expect(result.releaseState).toBe('hold');
  });
});
