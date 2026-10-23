import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import {
  PLANNED_STATIC_UI_COPY_V1,
  lookupPlannedStaticUiCopyV1,
} from '../apps/web/ui-i18n-planned-copy-v1.js';
import {
  PLANNED_MOBILE_STATIC_UI_COPY_V1,
  lookupPlannedMobileStaticUiCopyV1,
} from '../apps/mobile/src/ui/mobile-planned-ui-copy-v1.js';
import {
  SUPPORTED_UI_LOCALES,
  PLANNED_UI_LOCALES,
  normalizeUiLocale,
} from '../apps/web/ui-i18n.js';
import {
  SUPPORTED_MOBILE_UI_LOCALES,
  PLANNED_MOBILE_UI_LOCALES,
  normalizeMobileUiLocale,
} from '../apps/mobile/src/ui/mobile-ui-copy.js';

const source = (path: string) => readFile(new URL('../' + path, import.meta.url), 'utf8');

describe('I18N-07 staged EN-US and ZH-CN authored UI copy', () => {
  it('authors both UI target variants for navigation, account, Saju input and chat read-state without missing parity', () => {
    expect(PLANNED_STATIC_UI_COPY_V1.size).toBeGreaterThanOrEqual(80);
    expect([...PLANNED_MOBILE_STATIC_UI_COPY_V1]).toEqual([...PLANNED_STATIC_UI_COPY_V1]);
    for (const [ko, pair] of PLANNED_STATIC_UI_COPY_V1) {
      expect(ko.trim().length).toBeGreaterThan(0);
      expect(pair).toHaveLength(2);
      for (const text of pair) {
        expect(text.trim().length).toBeGreaterThan(0);
        expect(text).not.toMatch(/[가-힣]/u);
      }
      expect(lookupPlannedStaticUiCopyV1(ko, 'en-US')).toBe(pair[0]);
      expect(lookupPlannedStaticUiCopyV1(ko, 'zh-CN')).toBe(pair[1]);
      expect(lookupPlannedMobileStaticUiCopyV1(ko, 'en-US')).toBe(pair[0]);
      expect(lookupPlannedMobileStaticUiCopyV1(ko, 'zh-CN')).toBe(pair[1]);
    }
    expect(lookupPlannedStaticUiCopyV1('홈', 'en-US')).toBe('Home');
    expect(lookupPlannedStaticUiCopyV1('홈', 'zh-CN')).toBe('首页');
    expect(lookupPlannedStaticUiCopyV1('사주', 'zh-CN')).toBe('八字');
    expect(lookupPlannedMobileStaticUiCopyV1('대화 기록', 'en-US')).toBe('Chat history');
    expect(lookupPlannedMobileStaticUiCopyV1('대화 기록', 'zh-CN')).toBe('对话记录');
  });

  it('fails closed for unsupported input and for source, private messages or unknown copy', () => {
    for (const text of [
      '1995-08-17 19:30', 'SEYEON_HISTORY_REVEAL_HOLD',
      'USER_CHAT_SECRET_NEVER_TRANSLATE_2026', '직접 입력한 사적인 메모',
      '서버가 보낸 미확인 공식 풀이', 'message.body', 'greeting.openingLine',
    ]) {
      for (const locale of ['en-US', 'zh-CN']) {
        expect(lookupPlannedStaticUiCopyV1(text, locale)).toBeNull();
        expect(lookupPlannedMobileStaticUiCopyV1(text, locale)).toBeNull();
      }
    }
    for (const unsupported of ['ko-KR', 'ja-JP', 'zh-TW', 'en', 'en-GB', 'zh', 'zh-Hans', null, undefined]) {
      expect(lookupPlannedStaticUiCopyV1('홈', unsupported)).toBeNull();
      expect(lookupPlannedMobileStaticUiCopyV1('홈', unsupported)).toBeNull();
    }
  });

  it('does not silently enable English or Simplified Chinese from the staged copy alone', async () => {
    const [web, mobile, api, plannedWeb, plannedMobile] = await Promise.all([
      source('apps/web/ui-i18n.js'),
      source('apps/mobile/src/ui/mobile-ui-copy.ts'),
      source('apps/api/src/request-ui-locale-v1.ts'),
      source('apps/web/ui-i18n-planned-copy-v1.js'),
      source('apps/mobile/src/ui/mobile-planned-ui-copy-v1.ts'),
    ]);
    expect(PLANNED_UI_LOCALES).toEqual(['en-US', 'zh-CN']);
    expect(PLANNED_MOBILE_UI_LOCALES).toEqual(PLANNED_UI_LOCALES);
    expect(SUPPORTED_UI_LOCALES).toEqual(['ko-KR', 'ja-JP', 'zh-TW']);
    expect(SUPPORTED_MOBILE_UI_LOCALES).toEqual(SUPPORTED_UI_LOCALES);
    for (const locale of PLANNED_UI_LOCALES) {
      expect(normalizeUiLocale(locale)).toBe('ko-KR');
      expect(normalizeMobileUiLocale(locale)).toBe('ko-KR');
    }
    expect(web).not.toContain('lookupPlannedStaticUiCopyV1(');
    expect(mobile).not.toContain('lookupPlannedMobileStaticUiCopyV1(');
    expect(api).not.toContain("'en-US' ||");
    expect(api).not.toContain("'zh-CN' ||");
    expect(plannedWeb).not.toContain('fetch(');
    expect(plannedMobile).not.toContain('fetch(');
    expect(plannedWeb).not.toContain('responseVoiceLocale');
    expect(plannedMobile).not.toContain('responseVoiceLocale');
  });
});
