import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';

import {
  SUPPORTED_UI_LOCALES,
  PLANNED_UI_LOCALES,
  normalizeUiLocale,
  getUiLocaleRequestHeadersV1,
} from '../apps/web/ui-i18n.js';
import {
  SUPPORTED_MOBILE_UI_LOCALES,
  PLANNED_MOBILE_UI_LOCALES,
  normalizeMobileUiLocale,
} from '../apps/mobile/src/ui/mobile-ui-copy.js';
import {
  REQUEST_UI_LOCALE_HEADER_V1,
  resolveRequestUiLocaleV1,
  canonicalizeRequestUiLocaleHeadersV1,
} from '../apps/api/src/request-ui-locale-v1.js';

const source = (path: string) => readFile(new URL('../' + path, import.meta.url), 'utf8');

describe('I18N-07 en-US/zh-CN UI-only staged selection acceptance', () => {
  it('registers both roadmap targets without widening current UI or API admission', () => {
    expect(PLANNED_UI_LOCALES).toEqual(['en-US', 'zh-CN']);
    expect(PLANNED_MOBILE_UI_LOCALES).toEqual(PLANNED_UI_LOCALES);
    expect(SUPPORTED_UI_LOCALES).toEqual(['ko-KR', 'ja-JP', 'zh-TW']);
    expect(SUPPORTED_MOBILE_UI_LOCALES).toEqual(SUPPORTED_UI_LOCALES);
    for (const pending of PLANNED_UI_LOCALES) {
      expect(normalizeUiLocale(pending)).toBe('ko-KR');
      expect(normalizeMobileUiLocale(pending)).toBe('ko-KR');
      const request = new Request('https://myeongha.internal/api/me', {
        headers: { [REQUEST_UI_LOCALE_HEADER_V1]: pending },
      });
      expect(resolveRequestUiLocaleV1(request)).toEqual({
        locale: 'ko-KR',
        source: 'invalid-fallback',
      });
      expect(canonicalizeRequestUiLocaleHeadersV1(request).get(REQUEST_UI_LOCALE_HEADER_V1))
        .toBe('ko-KR');
    }
    for (const unsupported of ['en', 'en-GB', 'zh', 'zh-Hans', 'zh-HK']) {
      expect(normalizeUiLocale(unsupported)).toBe('ko-KR');
      expect(normalizeMobileUiLocale(unsupported)).toBe('ko-KR');
    }
  });

  it('never changes saved web UI preference into Reader or server language admission', () => {
    for (const pending of PLANNED_UI_LOCALES) {
      vi.stubGlobal('window', { localStorage: { getItem: () => pending } });
      expect(getUiLocaleRequestHeadersV1()).toEqual({ [REQUEST_UI_LOCALE_HEADER_V1]: 'ko-KR' });
    }
    vi.unstubAllGlobals();
  });

  it('displays the two planned choices as disabled on web and mobile without new selection actions', async () => {
    const [web, mobile, provider, uiCopy, api] = await Promise.all([
      source('apps/web/ui-i18n.js'),
      source('apps/mobile/src/features/my/MyComponents.tsx'),
      source('apps/mobile/src/ui/mobile-ui-locale.tsx'),
      source('apps/mobile/src/ui/mobile-ui-copy.ts'),
      source('apps/api/src/request-ui-locale-v1.ts'),
    ]);
    expect(web).toContain("['en-US', 'English (not available yet)']");
    expect(web).toContain("['zh-CN', '简体中文 (准备中)']");
    expect(web).toContain('option.disabled = true;');
    expect(web).toContain('if (!PLANNED_UI_LOCALES.includes(value)) continue;');
    expect(mobile).toContain("value: 'en-US', label: 'English · Not available yet'");
    expect(mobile).toContain("value: 'zh-CN', label: '简体中文 · 准备中'");
    expect(mobile).toContain('PLANNED_MOBILE_UI_LOCALES.includes(choice.value)');
    expect(mobile).toContain('accessibilityState={{ selected: false, disabled: true }}');
    expect(mobile).toContain('disabled\n');
    expect(mobile).toContain('onPress={() => setLocale(choice.value)}');
    expect(provider).toContain("useState<MobileUiLocale>('ko-KR')");
    expect(provider).toContain('SecureStore.setItemAsync(MOBILE_UI_LOCALE_STORAGE_KEY, normalized)');
    expect(uiCopy).toContain("return value === 'ko-KR' || value === 'ja-JP' || value === 'zh-TW' ? value : 'ko-KR'");
    expect(api).toContain("selected === 'ko-KR' || selected === 'ja-JP' || selected === 'zh-TW'");
    expect(web).not.toContain("option.disabled = false;");
  });

  it('retains source and authority boundaries until authored translations have acceptance', async () => {
    const [reader, chat, archive] = await Promise.all([
      source('apps/mobile/src/features/reading/mobile-official-reader-entry-locale-v1.ts'),
      source('apps/mobile/src/features/chat/ChatReadComponents.tsx'),
      source('apps/mobile/src/app/reading/[readingId].tsx'),
    ]);
    expect(chat).toContain('isSeyeonHistoryRevealHoldV1(snapshot)');
    expect(chat).toContain('const allowed = ready && seyeon;');
    expect(chat).toContain('{message.body}');
    expect(chat).toContain('{greeting.openingLine}');
    expect(reader).toContain('readerOutputLocalized: false');
    expect(archive).toContain('{step.primary}');
  });
});
