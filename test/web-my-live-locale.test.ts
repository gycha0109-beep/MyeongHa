import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { translateStaticUi } from '../apps/web/ui-i18n.js';
import { MY_STATIC_UI_COPY_V1 } from '../apps/web/ui-my-copy.js';

const web = (file: string) => readFileSync(new URL('../apps/web/' + file, import.meta.url), 'utf8');

describe('My React-owned localization', () => {
  it('stores full translations for each of the four non-Korean locales', () => {
    for (const [source, translations] of MY_STATIC_UI_COPY_V1) {
      expect(Array.isArray(translations), source).toBe(true);
      expect(translations).toHaveLength(4);
      for (const value of translations) expect(typeof value).toBe('string');
    }
    expect(translateStaticUi('마이페이지', 'ja-JP')).toBe('マイページ');
    expect(translateStaticUi('마이페이지', 'zh-TW')).toBe('我的頁面');
    expect(translateStaticUi('마이페이지', 'en-US')).toBe('My Page');
    expect(translateStaticUi('마이페이지', 'zh-CN')).toBe('我的页面');
    expect(translateStaticUi('캐릭터 메모리', 'ja-JP')).toBe('キャラクターのメモリー');
    expect(translateStaticUi('캐릭터 메모리', 'zh-CN')).toBe('角色记忆');
    expect(translateStaticUi('계정 정보', 'en-US')).toBe('Account information');
  });

  it('translates every explicitly authored My label in all locales', () => {
    const jsx = web('src/my/MyPage.tsx');
    const keys = new Set<string>([...jsx.matchAll(/<MyText source="([^"]+)"\s*\/>/gu)].map(match => match[1]).filter((value): value is string => typeof value === 'string'));
    for (const match of jsx.matchAll(/<Choice title="([^"]+)" description="([^"]+)"/gu)) {
      keys.add(match[1]); keys.add(match[2]);
    }
    expect(keys.size).toBeGreaterThan(40);
    for (const locale of ['ja-JP', 'zh-TW', 'en-US', 'zh-CN'] as const) {
      for (const source of keys) {
        expect(translateStaticUi(source, locale), locale + ': ' + source).not.toBe(source);
      }
    }
  });

  it('keeps React text under React control and synchronizes on same-tab locale events', () => {
    const html = web('my.html');
    const globalI18n = web('ui-i18n.js');
    const page = web('src/my/MyPage.tsx');
    expect(html).toContain('id="my-react-root" data-ui-react-owned');
    expect(globalI18n).toContain('[data-ui-react-owned]');
    expect(page).toContain("document.addEventListener('myeongha:localechange', syncLocale)");
    expect(page).toContain('setLocale(getUiLocale())');
    expect(page).toContain('<MyLocaleContext.Provider value={locale}>');
    expect(page).toContain('uiLabel(account.message)');
    expect(page).toContain('uiLabel(birth.message)');
    expect(page).toContain('uiLabel(accountBadge)');
  });
});
