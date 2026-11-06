import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { translateMobileUiCopy } from '../apps/mobile/src/ui/mobile-ui-copy.js';

describe('My authentication card does not treat an unchecked owner as Guest', () => {
  it('renders a neutral account state before displaying Member/Guest actions', async () => {
    const [ui, screen] = await Promise.all([
      readFile(new URL('../apps/mobile/src/features/my/MyComponents.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/app/(tabs)/my/index.tsx', import.meta.url), 'utf8'),
    ]);
    expect(ui).toContain("subjectKind: 'checking' | 'guest' | 'member'");
    const neutral = ui.slice(ui.indexOf("if (subjectKind === 'checking')"), ui.indexOf("if (subjectKind === 'member')"));
    expect(neutral).toContain("t('회원 상태를 확인하는 중입니다…')");
    expect(neutral).not.toContain('<Pressable');
    expect(neutral).not.toContain('<TextInput');
    expect(screen).toContain('subjectKind={currentAccount}');
    expect(screen).toContain("memberSessionPresent === false ? 'guest' : 'checking'");
    expect(screen).not.toContain("memberSessionPresent === true ? 'member' : 'guest'");
  });

  it('uses five language static checking copy without guessing member status', () => {
    const text = '회원 상태를 확인하는 중입니다…';
    expect(translateMobileUiCopy(text, 'ko-KR')).toBe(text);
    for (const locale of ['ja-JP', 'zh-TW', 'en-US', 'zh-CN'] as const) {
      expect(translateMobileUiCopy(text, locale)).not.toBe(text);
      expect(translateMobileUiCopy(text, locale)).not.toMatch(/[가-힣]/u);
    }
  });
});
