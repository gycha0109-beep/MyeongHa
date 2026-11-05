import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { translateMobileUiCopy } from '../apps/mobile/src/ui/mobile-ui-copy.js';

async function readRepoFile(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

describe('mobile Chat thread Character identity presentation', () => {
  it('binds the thread header to the server-returned snapshot characterId', async () => {
    const components = await readRepoFile(
      'apps/mobile/src/features/chat/ChatReadComponents.tsx',
    );
    const detail = await readRepoFile(
      'apps/mobile/src/app/(tabs)/chat/[threadId].tsx',
    );

    expect(detail).toContain('<ChatReadHeader snapshot={snapshot} />');
    expect(components).toContain('snapshot.characterId');
    expect(components).toContain('MOBILE_CHAT_KNOWN_CHARACTERS_V1.find');
    expect(components).toContain('resolveMobileChatCharacterPresentationV1');
  });

  it('keeps an unknown or not-yet-loaded Character identity neutral', async () => {
    const components = await readRepoFile(
      'apps/mobile/src/features/chat/ChatReadComponents.tsx',
    );

    expect(components).toContain("const displayName = character?.displayName ?? t('대화 상대')");
    expect(components).toContain("character === null ? '明' : displayName.slice(0, 1)");
    expect(components).not.toContain('threadId.includes');
    expect(components).not.toContain('routeThreadId');
  });
  it('uses the selected UI language for verified room role metadata, never rewrites the name', async () => {
    const components = await readRepoFile('apps/mobile/src/features/chat/ChatReadComponents.tsx');
    expect(components).toContain("${t(presentation.title)} · ${t('대화 기록')}");
    expect(components).toContain('const displayName = character?.displayName');
    expect(components).toContain('<Text style={styles.headerTitle}>{displayName}</Text>');
    expect(components).not.toContain('t(displayName)');
    const expected = {
      'ko-KR': '명하의 안내인',
      'ja-JP': '命河の案内人',
      'zh-TW': '命河的引路人',
      'en-US': "MyeongHa's guide",
      'zh-CN': '命河的引路人',
    } as const;
    for (const [locale, role] of Object.entries(expected) as [keyof typeof expected, string][]) {
      expect(translateMobileUiCopy('명하의 안내인', locale)).toBe(role);
    }
  });


});
