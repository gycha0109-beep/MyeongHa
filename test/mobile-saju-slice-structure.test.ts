import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function readRepoFile(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

describe('mobile M3-C Saju vertical slice structure', () => {
  it('keeps calculation behind services and does not invent interpretation in the screen', async () => {
    const screen = await readRepoFile('apps/mobile/src/app/(tabs)/reading/index.tsx');

    expect(screen).not.toContain('fetch(');
    expect(screen).not.toContain('SecureStore');
    expect(screen).toContain('mobileSajuServiceV1');
    expect(screen).toContain('loadMobileCurrentSajuV1');
    expect(screen).not.toContain('interpretationAuthorized: true');
  });

  it('renders the four calculation-only result sections', async () => {
    const screen = await readRepoFile('apps/mobile/src/app/(tabs)/reading/index.tsx');

    expect(screen).toContain('SajuPillarGrid');
    expect(screen).toContain('DayMasterCard');
    expect(screen).toContain('ElementBalance');
    expect(screen).toContain('CalculationCompleteness');
  });

  it('keeps Face Reading nested under the same primary Saju tab', async () => {
    const tabs = await readRepoFile('apps/mobile/src/app/(tabs)/_layout.tsx');
    const face = await readRepoFile('apps/mobile/src/app/(tabs)/reading/face.tsx');

    expect(tabs).not.toContain('name="face"');
    expect(face).toContain('ReadingSubnav');
  });
});
