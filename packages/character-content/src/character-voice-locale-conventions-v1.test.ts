import { describe, expect, it } from 'vitest';
import {
  CHARACTER_VOICE_COMMON_CONVENTIONS_V1,
  CHARACTER_VOICE_LOCALE_COMMON_RULES_VERSION_V1,
  inspectCharacterVoiceCommonConventionsV1,
} from './character-voice-locale-conventions-v1.js';

describe('I18N-06b Reader language-common voice conventions', () => {
  it('provides independent Japanese and Taiwan Traditional Chinese authoring references', () => {
    for (const locale of ['ja-JP', 'zh-TW'] as const) {
      const result = inspectCharacterVoiceCommonConventionsV1(locale);
      expect(result.state).toBe('authoring_only');
      if (result.state !== 'authoring_only') throw new Error('Expected authoring-only conventions');
      expect(result.conventions).toBe(CHARACTER_VOICE_COMMON_CONVENTIONS_V1[locale]);
      expect(result.conventions.locale).toBe(locale);
      expect(result.conventions.version).toBe(CHARACTER_VOICE_LOCALE_COMMON_RULES_VERSION_V1);
      expect(result.conventions.status).toBe('authoring_only');
      expect(Object.isFrozen(result.conventions)).toBe(true);
      expect(Object.isFrozen(result.conventions.rules)).toBe(true);
      expect(result.conventions.rules.every((rule) => Object.isFrozen(rule))).toBe(true);
    }
  });

  it('covers shared language decisions without assigning Character-specific speech', () => {
    for (const conventions of Object.values(CHARACTER_VOICE_COMMON_CONVENTIONS_V1)) {
      expect(new Set(conventions.rules.map((rule) => rule.ruleKey)).size).toBe(conventions.rules.length);
      expect(new Set(conventions.rules.map((rule) => rule.dimension))).toEqual(
        new Set([
          'self_reference',
          'addressee',
          'politeness',
          'sentence_endings',
          'emotion_expression',
          'regional_usage',
        ]),
      );
      const references = [
        conventions.firstPersonConventionRef,
        conventions.addresseeConventionRef,
        conventions.politenessConventionRef,
      ];
      for (const ref of references) {
        expect(conventions.rules.some((rule) => rule.ruleKey === ref)).toBe(true);
      }
      for (const rule of conventions.rules) {
        expect(rule.constraint.trim().length).toBeGreaterThan(0);
        if (rule.dimension !== 'regional_usage') {
          expect(rule.decisionOwner).not.toBe('locale_convention');
        }
      }
      expect('characterId' in conventions).toBe(false);
      expect('selfReference' in conventions).toBe(false);
      expect('speech' in conventions).toBe(false);
      expect('releaseAdmitted' in conventions).toBe(false);
    }
  });

  it('requires Character/context approval for self-reference and address', () => {
    const ja = CHARACTER_VOICE_COMMON_CONVENTIONS_V1['ja-JP'];
    const zh = CHARACTER_VOICE_COMMON_CONVENTIONS_V1['zh-TW'];
    for (const conventions of [ja, zh]) {
      for (const dimension of ['self_reference', 'addressee', 'politeness']) {
        const rule = conventions.rules.find((item) => item.dimension === dimension);
        expect(rule?.decisionOwner).toBe('character_locale_delta_and_context');
      }
      expect(conventions.rules.find((rule) => rule.dimension === 'sentence_endings')?.decisionOwner)
        .toBe('character_locale_delta');
    }
    expect(ja.rules.find((rule) => rule.dimension === 'self_reference')?.constraint)
      .toContain('approved');
    expect(zh.rules.find((rule) => rule.dimension === 'addressee')?.constraint)
      .toContain('您');
  });

  it('preserves existing Korean and explicitly holds unsupported locale selections', () => {
    expect(inspectCharacterVoiceCommonConventionsV1('ko-KR')).toEqual({
      state: 'unavailable', reason: 'korean_existing',
    });
    for (const locale of ['', 'ja', 'ja-jp', 'zh-CN', 'en-US', 'zh-HK', 'ko-kr']) {
      expect(inspectCharacterVoiceCommonConventionsV1(locale)).toEqual({
        state: 'unavailable', reason: 'unsupported_locale',
      });
    }
  });
});
