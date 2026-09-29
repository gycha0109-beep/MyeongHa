import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function readRepoFile(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

describe('mobile M5-B Home UI structure', () => {
  it('keeps network and credential authority out of the Home screen', async () => {
    const screen = await readRepoFile('apps/mobile/src/app/(tabs)/index.tsx');
    expect(screen).not.toContain('fetch(');
    expect(screen).not.toContain('SecureStore');
    expect(screen).not.toContain('Authorization');
    expect(screen).toContain('useMobileHomeV1');
  });

  it('keeps Reading topic tiles presentation-only and routes through the Saju hub', async () => {
    const components = await readRepoFile('apps/mobile/src/features/home/HomeComponents.tsx');
    const topicBlock = components.slice(
      components.indexOf('export function HomeReadingTopics'),
      components.indexOf('export function HomeCharacterPending'),
    );
    expect(topicBlock).toContain("router.push('/reading')");
    expect(topicBlock).not.toContain('sourceReadingText');
    expect(topicBlock).not.toContain('preview-reading');
  });

  it('keeps the Character surface non-interactive while Character authority is blocked', async () => {
    const components = await readRepoFile('apps/mobile/src/features/home/HomeComponents.tsx');
    const characterBlock = components.slice(
      components.indexOf('export function HomeCharacterPending'),
      components.indexOf('const styles'),
    );
    expect(characterBlock).toContain('준비 중');
    expect(characterBlock).not.toContain('<Pressable');
    expect(characterBlock).not.toContain('router.push');
  });

  it('labels the Saju hero as current-chart evidence rather than a daily prediction', async () => {
    const components = await readRepoFile('apps/mobile/src/features/home/HomeComponents.tsx');
    expect(components).toContain('현재 출생정보를 기준으로 계산된 명식 사실만 보여줍니다.');
    expect(components).not.toContain('오늘은 재물');
    expect(components).not.toContain('행운');
  });
});
