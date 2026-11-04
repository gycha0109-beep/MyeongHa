import { describe, expect, it } from 'vitest';
import { SAJU_READER_SURFACE_COPY_V1 } from '../apps/web/ui-i18n-saju-reader-surface-copy-v1.js';
import { MOBILE_WEB_SAJU_SURFACE_COPY_V1 } from '../apps/mobile/src/ui/mobile-web-saju-surface-copy-v1.js';
import { translateMobileUiCopy } from '../apps/mobile/src/ui/mobile-ui-copy.js';

const locales = ['ja-JP', 'zh-TW', 'en-US', 'zh-CN'] as const;

describe('native Saju/Reader fixed UI fallback matches newly reviewed Web copy', () => {
  it('mirrors all reviewed 110 UI-only source strings without data or entitlement mutations', () => {
    expect(MOBILE_WEB_SAJU_SURFACE_COPY_V1.size).toBe(SAJU_READER_SURFACE_COPY_V1.size);
    expect(MOBILE_WEB_SAJU_SURFACE_COPY_V1.size).toBe(110);
    for (const [source, copy] of SAJU_READER_SURFACE_COPY_V1) {
      expect(MOBILE_WEB_SAJU_SURFACE_COPY_V1.get(source)).toEqual(copy);
      expect(translateMobileUiCopy(source, 'ko-KR')).toBe(source);
      for (const locale of locales) {
        const translated = translateMobileUiCopy(source, locale);
        expect(translated, `untranslated ${locale}: ${source}`).not.toBe(source);
        expect(translated, `Korean leak ${locale}: ${source}`).not.toMatch(/[가-힣]/u);
      }
    }
  });

  it('fills formerly missing strings without overriding previously shipped native translations', () => {
    expect(translateMobileUiCopy('보고서 구성 미리보기','en-US')).toBe('Report structure preview');
    expect(translateMobileUiCopy('입력 정보','en-US')).toBe('Entered information');
    expect(translateMobileUiCopy('출생지','zh-CN')).toBe('出生地');
    expect(translateMobileUiCopy('사주 해석 상품','ja-JP')).toBe('四柱推命の鑑定商品');
    // Existing mobile wording, which deliberately predates a later web-only rewrite.
    expect(translateMobileUiCopy('양력','en-US')).toBe('Solar calendar');
    expect(translateMobileUiCopy('음력','zh-CN')).toBe('农历');
    for (const value of ['PRIVATE_PERSONAL_2026','개인 대화: 열쇠를 잃어버렸어','1996-01-09']) {
      for (const locale of locales) expect(translateMobileUiCopy(value,locale)).toBe(value);
    }
  });
});
