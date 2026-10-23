import { describe, expect, it } from 'vitest';
import {
  resolveCharacterVoiceAuthorityV1,
} from './character-voice-continuity-v1.js';
import {
  CHARACTER_VOICE_LOCALE_CONTRACT_VERSION_V1,
  resolveCharacterVoiceLocaleV1,
  type CharacterVoiceLocaleConventionsV1,
  type CharacterVoiceLocaleDeltaV1,
} from './character-voice-locale-v1.js';
import { CHARACTER_RUNTIME_AUTHORING_V1 } from './runtime-authoring-v1.js';

const authoring = CHARACTER_RUNTIME_AUTHORING_V1.find((x) => x.characterId === 'seyeon');
if (!authoring) throw new Error('Se-yeon authoring source missing');

const published = {
  characterId: authoring.characterId,
  contentVersion: 'seyeon-published-v1',
  speech: authoring.speech,
  persona: authoring.persona,
};

const japanese: CharacterVoiceLocaleConventionsV1 = {
  locale: 'ja-JP',
  version: 'ja-conventions-v1',
  firstPersonConventionRef: 'locale.ja.first_person',
  addresseeConventionRef: 'locale.ja.addressee',
  politenessConventionRef: 'locale.ja.politeness',
};

const delta: CharacterVoiceLocaleDeltaV1 = {
  contractVersion: CHARACTER_VOICE_LOCALE_CONTRACT_VERSION_V1,
  characterId: 'seyeon',
  sourceContentVersion: 'seyeon-published-v1',
  locale: 'ja-JP',
  profileVersion: 'seyeon-ja-staging-v1',
  localeConventionsVersion: 'ja-conventions-v1',
  // Deliberately no invented 1st-person, honorific, or context authoring.
};

describe('I18N-06a Reader locale voice contract', () => {
  it('uses the same published Bible voice on all surfaces and keeps Korean unchanged', () => {
    for (const surface of ['general_chat', 'saju_product', 'face_product'] as const) {
      const authority = resolveCharacterVoiceAuthorityV1(published, surface);
      expect(resolveCharacterVoiceLocaleV1({
        voiceAuthority: authority,
        requestedLocale: 'ko-KR',
      })).toEqual({
        state: 'korean_existing',
        locale: 'ko-KR',
        characterId: 'seyeon',
        sourceContentVersion: 'seyeon-published-v1',
      });
      expect(authority.speech).toBe(published.speech);
      expect(authority.communication).toBe(published.persona.communication);
    }
  });

  it('does not infer foreign language from malformed or unsupported locale', () => {
    const authority = resolveCharacterVoiceAuthorityV1(published, 'general_chat');
    for (const locale of ['', 'ja', 'ja-jp', 'zh-CN', 'en-US', 'ko-kr']) {
      expect(resolveCharacterVoiceLocaleV1({
        voiceAuthority: authority,
        requestedLocale: locale,
      })).toEqual({ state: 'hold', reason: 'unsupported_locale' });
    }
  });

  it('requires both language conventions and matching Character delta', () => {
    const authority = resolveCharacterVoiceAuthorityV1(published, 'general_chat');
    expect(resolveCharacterVoiceLocaleV1({
      voiceAuthority: authority, requestedLocale: 'ja-JP',
    })).toEqual({ state: 'hold', reason: 'locale_conventions_missing' });
    expect(resolveCharacterVoiceLocaleV1({
      voiceAuthority: authority, requestedLocale: 'ja-JP', conventions: japanese,
    })).toEqual({ state: 'hold', reason: 'character_delta_missing' });
    expect(resolveCharacterVoiceLocaleV1({
      voiceAuthority: authority, requestedLocale: 'zh-TW', conventions: japanese,
      delta,
    })).toEqual({ state: 'hold', reason: 'locale_conventions_mismatch' });
    expect(resolveCharacterVoiceLocaleV1({
      voiceAuthority: authority, requestedLocale: 'ja-JP', conventions: japanese,
      delta: { ...delta, characterId: 'taegyeom' },
    })).toEqual({ state: 'hold', reason: 'character_delta_mismatch' });
    expect(resolveCharacterVoiceLocaleV1({
      voiceAuthority: authority, requestedLocale: 'ja-JP', conventions: japanese,
      delta: { ...delta, sourceContentVersion: 'stale-content' },
    })).toEqual({ state: 'hold', reason: 'character_delta_mismatch' });
    expect(resolveCharacterVoiceLocaleV1({
      voiceAuthority: authority, requestedLocale: 'ja-JP', conventions: japanese,
      delta: { ...delta, localeConventionsVersion: 'old-conventions' },
    })).toEqual({ state: 'hold', reason: 'character_delta_mismatch' });
  });

  it('never grants foreign output even if every authoring reference is present', () => {
    const authority = resolveCharacterVoiceAuthorityV1(published, 'general_chat');
    const originalSpeech = authority.speech;
    const originalCommunication = authority.communication;
    expect(resolveCharacterVoiceLocaleV1({
      voiceAuthority: authority,
      requestedLocale: 'ja-JP',
      conventions: japanese,
      delta,
    })).toEqual({ state: 'hold', reason: 'non_korean_release_not_admitted' });
    expect(authority.speech).toBe(originalSpeech);
    expect(authority.communication).toBe(originalCommunication);
  });

  it('refuses detached or forged voice authority', () => {
    const authority = resolveCharacterVoiceAuthorityV1(published, 'general_chat');
    expect(resolveCharacterVoiceLocaleV1({
      voiceAuthority: { ...authority, source: 'other' } as unknown as typeof authority,
      requestedLocale: 'ko-KR',
    })).toEqual({ state: 'hold', reason: 'invalid_voice_authority' });
  });

  it('rejects invalid context refs rather than admitting a disguised new Bible', () => {
    const authority = resolveCharacterVoiceAuthorityV1(published, 'general_chat');
    expect(resolveCharacterVoiceLocaleV1({
      voiceAuthority: authority,
      requestedLocale: 'ja-JP',
      conventions: japanese,
      delta: { ...delta, contextRules: [{ conditionRef: '', styleRef: 'rule' }] },
    })).toEqual({ state: 'hold', reason: 'character_delta_mismatch' });
  });
});
