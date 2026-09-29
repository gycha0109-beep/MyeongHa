import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function readRepoFile(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

describe('mobile M1 shell', () => {
  it('pins the Expo SDK 57 runtime and Expo Router entry', async () => {
    const manifest = JSON.parse(await readRepoFile('apps/mobile/package.json'));
    expect(manifest.main).toBe('expo-router/entry');
    expect(manifest.dependencies).toMatchObject({
      expo: '~57.0.25',
      'expo-router': '~57.0.23',
      react: '19.2.3',
      'react-native': '0.86.3',
    });
    expect(manifest.scripts.typecheck).toBe('tsc -p tsconfig.json --noEmit');
  });

  it('contains exactly the five primary route groups plus nested Face Reading', async () => {
    const layout = await readRepoFile('apps/mobile/src/app/(tabs)/_layout.tsx');
    for (const route of ['index', 'reading', 'chat', 'records', 'my']) {
      expect(layout).toContain(`name="${route}"`);
    }
    expect(layout).not.toContain('name="face"');

    const face = await readRepoFile('apps/mobile/src/app/(tabs)/reading/face.tsx');
    expect(face).toContain('ReadingSubnav');
  });

  it('keeps typed routes and the myeongha deep-link scheme enabled', async () => {
    const config = JSON.parse(await readRepoFile('apps/mobile/app.json'));
    expect(config.expo.scheme).toBe('myeongha');
    expect(config.expo.experiments.typedRoutes).toBe(true);
  });

  it('pins the patched URI decoder required by dependency review', async () => {
    const rootManifest = JSON.parse(await readRepoFile('package.json'));
    const lockfile = JSON.parse(await readRepoFile('package-lock.json'));

    expect(rootManifest.overrides?.['decode-uri-component']).toBe('0.5.0');
    expect(rootManifest.overrides?.uuid).toBe('11.1.1');
    expect(lockfile.packages?.['node_modules/decode-uri-component']?.version).toBe('0.5.0');
    expect(lockfile.packages?.['node_modules/uuid']?.version).toBe('11.1.1');
  });

  it('does not depend on a WebView wrapper', async () => {
    const manifest = await readRepoFile('apps/mobile/package.json');
    expect(manifest).not.toContain('react-native-webview');
  });
});
