import { describe, expect, it } from 'vitest';
import { normalizeUiLocale, SUPPORTED_UI_LOCALES, translateStaticUi } from '../ui-i18n.js';

describe('fixed web UI localization', () => {
  it('supports Korean, Japanese and Traditional Chinese only', () => {
    expect(SUPPORTED_UI_LOCALES).toEqual(['ko-KR', 'ja-JP', 'zh-TW']);
    expect(normalizeUiLocale('zh-CN')).toBe('ko-KR');
    expect(normalizeUiLocale('ja-JP')).toBe('ja-JP');
  });

  it('uses Korean as the reversible source and maps both translations correctly', () => {
    expect(translateStaticUi('홈', 'ko-KR')).toBe('홈');
    expect(translateStaticUi('홈', 'ja-JP')).toBe('ホーム');
    expect(translateStaticUi('홈', 'zh-TW')).toBe('首頁');
    expect(translateStaticUi('사주', 'ja-JP')).toBe('四柱推命');
    expect(translateStaticUi('사주', 'zh-TW')).toBe('八字命理');
  });

  it('leaves non-UI, dynamic text untouched', () => {
    for (const lang of SUPPORTED_UI_LOCALES) {
      expect(translateStaticUi('사용자 상담의 임의 문장', lang)).toBe('사용자 상담의 임의 문장');
      expect(translateStaticUi('1988-01-01 12:30', lang)).toBe('1988-01-01 12:30');
    }
  });
});
