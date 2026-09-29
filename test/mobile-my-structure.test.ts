import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function readRepoFile(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

describe('mobile M4-C My structure', () => {
  it('keeps My behind the service/loader boundary', async () => {
    const screen = await readRepoFile('apps/mobile/src/app/(tabs)/my/index.tsx');
    expect(screen).not.toContain('fetch(');
    expect(screen).not.toContain('SecureStore');
    expect(screen).not.toContain('Authorization');
    expect(screen).toContain('useMobileMyV1');
  });

  it('keeps unavailable settings as non-Pressable information rows', async () => {
    const components = await readRepoFile('apps/mobile/src/features/my/MyComponents.tsx');
    const pendingBlock = components.slice(
      components.indexOf('export function MyPendingSettings'),
      components.indexOf('const styles'),
    );
    expect(pendingBlock).toContain('준비 중');
    expect(pendingBlock).not.toContain('<Pressable');
    expect(pendingBlock).not.toContain('onPress=');
  });

  it('exposes only working navigation cards for current mobile routes', async () => {
    const components = await readRepoFile('apps/mobile/src/features/my/MyComponents.tsx');
    expect(components).toContain("route: '/reading'");
    expect(components).toContain("route: '/records'");
    expect(components).toContain("route: '/chat'");
    expect(components).toContain("router.push('/birth')");
  });
});
