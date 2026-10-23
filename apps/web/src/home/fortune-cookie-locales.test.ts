import { describe, it, expect } from 'vitest';
import { FORTUNE_COOKIE_MESSAGES_V1 } from './fortune-cookie.js';
import { FORTUNE_COOKIE_LOCALE_COPY_V1, fortuneCookieMessageV1 } from './fortune-cookie-locales.js';

describe('Fortune cookie locales', () => {
  it('localizes all 100 authored fortunes without changing the draw identity', () => {
    expect(FORTUNE_COOKIE_MESSAGES_V1).toHaveLength(100);
    for (const locale of ['ja-JP','zh-TW'] as const) {
      expect(FORTUNE_COOKIE_LOCALE_COPY_V1[locale]).toHaveLength(FORTUNE_COOKIE_MESSAGES_V1.length);
      FORTUNE_COOKIE_MESSAGES_V1.forEach((original, index) => {
        const localized = fortuneCookieMessageV1(index, locale);
        expect(localized.length).toBeGreaterThan(5);
        expect(localized).not.toBe(original);
        expect(localized).not.toMatch(/[가-힣]/u);
        expect(fortuneCookieMessageV1(index,'ko-KR')).toBe(original);
      });
    }
  });
  it('does not fabricate a reading for an invalid draw', () => {
    expect(fortuneCookieMessageV1(-1, 'ja-JP')).toBe('');
    expect(fortuneCookieMessageV1(9999,'zh-TW')).toBe('');
  });
});
