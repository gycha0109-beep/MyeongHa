import { describe, expect, it } from 'vitest';

import { mobileMySectionStaticErrorV1 } from '../apps/mobile/src/features/my/mobile-my-section-error-copy.js';
import { translateMobileUiCopy } from '../apps/mobile/src/ui/mobile-ui-copy.js';

describe('mobile My section failures, five-language W1 parity', () => {
  const known = [
    '현재 내 정보를 불러올 수 없습니다.',
    '현재 출생정보를 불러올 수 없습니다.',
  ] as const;

  it('uses only existing, reviewed static copy for all five UI languages', () => {
    for (const source of known) {
      const safeCopy = mobileMySectionStaticErrorV1(source);
      expect(safeCopy).not.toBeNull();
      for (const locale of ['ko-KR', 'ja-JP', 'zh-TW', 'en-US', 'zh-CN'] as const) {
        const translated = translateMobileUiCopy(safeCopy!, locale);
        expect(translated.length).toBeGreaterThan(0);
        if (locale !== 'ko-KR') expect(translated).not.toBe(safeCopy);
      }
    }
  });

  it('never authorizes translation of unknown or dynamic server messages', () => {
    expect(mobileMySectionStaticErrorV1('HTTP 401: current session rejected')).toBeNull();
    expect(mobileMySectionStaticErrorV1('사용자 발화 내용')).toBeNull();
    expect(mobileMySectionStaticErrorV1('')).toBeNull();
  });
});
