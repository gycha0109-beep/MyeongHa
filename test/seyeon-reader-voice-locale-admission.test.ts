import { describe, expect, it } from 'vitest';
import {
  assertSeyeonResponseVoiceLocaleV1,
  runSeyeonCharacterTurnV2,
  SeyeonCharacterRuntimeErrorV2,
  type RunSeyeonCharacterTurnV2Input,
} from '../apps/api/src/seyeon-character-runtime-v2.js';

describe('I18N-06a Se-yeon Reader response locale gate', () => {
  it('preserves the existing Korean execution locale', () => {
    expect(assertSeyeonResponseVoiceLocaleV1('ko-KR')).toBe('ko-KR');
  });

  it('does not equate a supported UI locale to authorized Reader output', () => {
    for (const locale of ['ja-JP', 'zh-TW', 'zh-CN', '', 'ko-kr']) {
      expect(() => assertSeyeonResponseVoiceLocaleV1(locale)).toThrow(
        SeyeonCharacterRuntimeErrorV2,
      );
    }
  });

  it('holds foreign Reader output before consulting preflight or provider ports', async () => {
    for (const locale of ['ja-JP', 'zh-TW']) {
      // Missing dependencies are intentional: the locale gate must run first.
      const invalidUnreachableInput = {
        responseVoiceLocale: locale,
      } as RunSeyeonCharacterTurnV2Input;
      await expect(runSeyeonCharacterTurnV2(invalidUnreachableInput))
        .rejects.toMatchObject({
          stage: 'render',
          message: 'Non-Korean Se-yeon Reader response is not released.',
        });
    }
  });
});
