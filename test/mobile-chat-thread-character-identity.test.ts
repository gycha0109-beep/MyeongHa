import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

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
    expect(components).toContain('MOBILE_CHAT_LAUNCH_ROSTER_V1.find');
    expect(components).toContain('resolveMobileChatCharacterPresentationV1');
  });

  it('keeps an unknown or not-yet-loaded Character identity neutral', async () => {
    const components = await readRepoFile(
      'apps/mobile/src/features/chat/ChatReadComponents.tsx',
    );

    expect(components).toContain("const displayName = character?.displayName ?? '대화 상대'");
    expect(components).toContain("character === null ? '明' : displayName.slice(0, 1)");
    expect(components).not.toContain('threadId.includes');
    expect(components).not.toContain('routeThreadId');
  });
});
