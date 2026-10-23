import { describe, expect, it } from 'vitest';
import {
  CHARACTER_RUNTIME_AUTHORING_V1,
} from './runtime-authoring-v1.js';
import {
  resolveCharacterVoiceAuthorityV1,
} from './character-voice-continuity-v1.js';
import {
  CHARACTER_VOICE_COMMON_CONVENTIONS_V1,
} from './character-voice-locale-conventions-v1.js';
import {
  APPROVED_CHARACTER_VOICE_LOCALE_EXCEPTIONS_V1,
} from './character-voice-locale-exceptions-v1.js';
import {
  READER_VOICE_LOCALE_COMPOSITION_VERSION_V1,
  prepareReaderVoiceLocaleCompositionV1,
} from './reader-voice-locale-composition-v1.js';

const fixtures = CHARACTER_RUNTIME_AUTHORING_V1.map(authoring => ({
  characterId: authoring.characterId,
  contentVersion: `test-published-${authoring.characterId}-v1`,
  speech: authoring.speech,
  persona: authoring.persona,
}));

describe('I18N-06 approved-only Reader voice locale composition', () => {
  it('keeps exact published Korean voice across all nine Characters and three surfaces', () => {
    expect(fixtures).toHaveLength(9);
    for (const published of fixtures) {
      for (const surface of ['general_chat', 'saju_product', 'face_product'] as const) {
        const authority = resolveCharacterVoiceAuthorityV1(published, surface);
        const decision = prepareReaderVoiceLocaleCompositionV1({
          selectedCharacterId: published.characterId,
          voiceAuthority: authority,
          requestedVoiceLocale: 'ko-KR',
        });
        if (published.characterId === 'seorin' || published.characterId === 'mira' || published.characterId === 'doyun') {
          expect(decision).toEqual({ state: 'hold', reason: 'invalid_neutral_voice' });
          continue;
        }
        expect(decision).toEqual({
          state: 'korean_existing',
          schemaVersion: READER_VOICE_LOCALE_COMPOSITION_VERSION_V1,
          characterId: published.characterId,
          sourceContentVersion: published.contentVersion,
          voiceAuthority: authority,
          release: 'existing_korean_path_only',
        });
        if (decision.state !== 'korean_existing') {
          throw new Error('Existing Korean voice was not preserved');
        }
        expect(decision.voiceAuthority).toBe(authority);
        expect(decision.voiceAuthority.speech).toBe(published.speech);
        expect(decision.voiceAuthority.communication).toBe(
          published.persona.communication,
        );
      }
    }
  });

  it('shares JA and ZH-TW common rules but does not invent Character exceptions', () => {
    expect(APPROVED_CHARACTER_VOICE_LOCALE_EXCEPTIONS_V1).toHaveLength(0);
    for (const published of fixtures) {
      const authority = resolveCharacterVoiceAuthorityV1(published, 'general_chat');
      for (const locale of ['ja-JP', 'zh-TW'] as const) {
        const decision = prepareReaderVoiceLocaleCompositionV1({
          selectedCharacterId: published.characterId,
          voiceAuthority: authority,
          requestedVoiceLocale: locale,
        });
        if (published.characterId === 'seorin' || published.characterId === 'mira' || published.characterId === 'doyun') {
          expect(decision).toEqual({ state: 'hold', reason: 'invalid_neutral_voice' });
          continue;
        }
        expect(decision).toEqual({
          state: 'common_rules_only',
          schemaVersion: READER_VOICE_LOCALE_COMPOSITION_VERSION_V1,
          characterId: published.characterId,
          sourceContentVersion: published.contentVersion,
          locale,
          commonRulesVersion: CHARACTER_VOICE_COMMON_CONVENTIONS_V1[locale].version,
          characterDelta: 'not_authored',
          release: 'hold',
        });
        expect('voiceAuthority' in decision).toBe(false);
        expect('utterance' in decision).toBe(false);
        expect('prompt' in decision).toBe(false);
        expect('styleRefs' in decision).toBe(false);
      }
    }
  });

  it('never equates a UI locale choice with Reader response output permission', () => {
    const published = fixtures[0]!;
    const authority = resolveCharacterVoiceAuthorityV1(published, 'saju_product');
    for (const locale of ['', 'ja', 'ja-jp', 'zh-CN', 'en-US', 'ko-kr']) {
      expect(prepareReaderVoiceLocaleCompositionV1({
        selectedCharacterId: published.characterId,
        voiceAuthority: authority,
        requestedVoiceLocale: locale,
      })).toEqual({
        state: 'hold', reason: 'unsupported_locale',
      });
    }
  });

  it('does not use an unrelated published character identity or unbound source', () => {
    const published = fixtures[0]!;
    const authority = resolveCharacterVoiceAuthorityV1(published, 'general_chat');
    expect(prepareReaderVoiceLocaleCompositionV1({
      selectedCharacterId: 'not-in-the-launch-roster',
      voiceAuthority: authority,
      requestedVoiceLocale: 'ja-JP',
    })).toEqual({ state: 'hold', reason: 'invalid_neutral_voice' });
    expect(prepareReaderVoiceLocaleCompositionV1({
      selectedCharacterId: 'yeoul',
      voiceAuthority: authority,
      requestedVoiceLocale: 'ko-KR',
    })).toEqual({ state: 'hold', reason: 'invalid_neutral_voice' });
    expect(prepareReaderVoiceLocaleCompositionV1({
      selectedCharacterId: published.characterId,
      voiceAuthority: { ...authority, source: 'browser_requested' } as unknown as typeof authority,
      requestedVoiceLocale: 'ko-KR',
    })).toEqual({ state: 'hold', reason: 'invalid_neutral_voice' });
    expect(prepareReaderVoiceLocaleCompositionV1({
      selectedCharacterId: published.characterId,
      voiceAuthority: { ...authority, contentVersion: '' },
      requestedVoiceLocale: 'ko-KR',
    })).toEqual({ state: 'hold', reason: 'invalid_neutral_voice' });
  });

  it('never exposes actual JA/ZH-TW prose or an approved speaking persona', () => {
    const published = fixtures[0]!;
    const authority = resolveCharacterVoiceAuthorityV1(published, 'face_product');
    for (const locale of ['ja-JP', 'zh-TW']) {
      const decision = prepareReaderVoiceLocaleCompositionV1({
        selectedCharacterId: published.characterId,
        voiceAuthority: authority,
        requestedVoiceLocale: locale,
      });
      expect(decision.state).not.toBe('korean_existing');
      expect('foreignLanguageRelease' in decision).toBe(false);
      expect('approvedForOutput' in decision).toBe(false);
      expect(JSON.stringify(decision)).not.toContain('俺');
      expect(JSON.stringify(decision)).not.toContain('僕');
      expect(JSON.stringify(decision)).not.toContain('あたし');
    }
  });
});
