import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function readRepoFile(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

describe('mobile M5 acceptance', () => {
  it('keeps Home composition on existing Production authorities only', async () => {
    const service = await readRepoFile('apps/mobile/src/features/home/mobile-home-service.ts');
    expect(service).toContain('readCurrentSubjectProfileV1');
    expect(service).toContain('readCurrentBirthProfileV1');
    expect(service).toContain('readReadingHistoryPageV1');
    expect(service).toContain('calculateCurrentSajuV1');
    expect(service).not.toContain('/api/home');
    expect(service).not.toContain('/api/characters');
    expect(service).not.toContain('/api/chat');
    expect(service).not.toContain('preview-reading');
  });

  it('invalidates the Home projection after a successful Birth create or recovered existing Birth', async () => {
    const birthScreen = await readRepoFile('apps/mobile/src/app/birth/index.tsx');
    const invalidations = birthScreen.match(/mobileHomeControllerV1\.invalidate\(\)/gu) ?? [];
    expect(invalidations).toHaveLength(2);
  });

  it('gives every interactive Home Pressable an explicit button accessibility role', async () => {
    const components = await readRepoFile('apps/mobile/src/features/home/HomeComponents.tsx');
    const pressables = components.match(/<Pressable/gu) ?? [];
    const roles = components.match(/accessibilityRole="button"/gu) ?? [];
    expect(pressables.length).toBeGreaterThan(0);
    expect(roles).toHaveLength(pressables.length);
  });

  it('records M5 as complete and M6 as the next delivery phase', async () => {
    const architecture = await readRepoFile('docs/MOBILE_CLIENT_ARCHITECTURE_V1.md');
    expect(architecture).toContain('M5  Home projection composition                          DONE');
    expect(architecture).toContain('M6  Chat Hub + server-authorized read path               NEXT');
  });
});
