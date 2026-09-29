import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function readRepoFile(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

describe('mobile M3-B Birth flow structure', () => {
  it('keeps Birth as a stack route rather than a sixth primary tab', async () => {
    const rootLayout = await readRepoFile('apps/mobile/src/app/_layout.tsx');
    const tabsLayout = await readRepoFile('apps/mobile/src/app/(tabs)/_layout.tsx');

    expect(rootLayout).toContain('name="birth"');
    expect(tabsLayout).not.toContain('name="birth"');
  });

  it('does not call fetch or SecureStore directly from Birth screens', async () => {
    const birth = await readRepoFile('apps/mobile/src/app/birth/index.tsx');
    const saju = await readRepoFile('apps/mobile/src/app/(tabs)/reading/index.tsx');

    expect(birth).not.toContain('fetch(');
    expect(birth).not.toContain('SecureStore');
    expect(saju).not.toContain('fetch(');
    expect(saju).not.toContain('SecureStore');
    expect(birth).toContain('mobileBirthServiceV1');
    expect(saju).toContain('mobileBirthServiceV1');
  });
});
