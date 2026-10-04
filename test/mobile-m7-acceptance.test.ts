import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function readRepoFile(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

describe('mobile M7 acceptance', () => {
  it('pins the Expo SDK 57 ImagePicker version in package and lockfile', async () => {
    const pkg = JSON.parse(await readRepoFile('apps/mobile/package.json'));
    const lock = JSON.parse(await readRepoFile('package-lock.json'));

    expect(pkg.dependencies['expo-image-picker']).toBe('~57.0.20');
    expect(lock.packages['apps/mobile'].dependencies['expo-image-picker']).toBe('~57.0.20');
    expect(lock.packages['node_modules/expo-image-picker'].version).toBe('57.0.20');
  });

  it('records M7 media staging as complete without claiming Face analysis authority', async () => {
    const architecture = await readRepoFile('docs/MOBILE_CLIENT_ARCHITECTURE_V1.md');
    expect(architecture).toContain('M7  Face Reading media path                              DONE');
    expect(architecture).toContain('engine handoff remains disabled');
    expect(architecture).toContain('does **not** treat that option as evidence that metadata has been stripped');
  });

  it('keeps the Face screen inside the Saju navigation container', async () => {
    const contract = await readRepoFile('apps/mobile/src/navigation/mobile-navigation-contract.ts');
    expect(contract).toContain("face: '/reading/face'");
    expect(contract).toContain("return 'reading'");
  });
});
