import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function readRepoFile(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

describe('mobile M5-A Home authority structure', () => {
  it('does not call unimplemented Home, Character, Chat-list, or Preview Reading endpoints', async () => {
    const service = await readRepoFile('apps/mobile/src/features/home/mobile-home-service.ts');
    expect(service).not.toContain('/api/home');
    expect(service).not.toContain('/api/characters');
    expect(service).not.toContain('/api/chat');
    expect(service).not.toContain('preview-reading');
    expect(service).toContain('readCurrentSubjectProfileV1');
    expect(service).toContain('readCurrentBirthProfileV1');
    expect(service).toContain('readReadingHistoryPageV1');
    expect(service).toContain('calculateCurrentSajuV1');
  });

  it('contains no static Character roster or Character recommendation identity', async () => {
    const viewModel = await readRepoFile('apps/mobile/src/features/home/home-view-model.ts');
    for (const name of ['백헌', '세연', '여울', '서린', '라현', '미라', '태겸', '윤호', '도윤']) {
      expect(viewModel).not.toContain(name);
    }
    expect(viewModel).not.toContain('characterId');
  });

  it('keeps Home presentation free of fabricated daily-fortune copy', async () => {
    const viewModel = await readRepoFile('apps/mobile/src/features/home/home-view-model.ts');
    expect(viewModel).not.toContain('오늘 운세');
    expect(viewModel).not.toContain('재물운이 좋');
    expect(viewModel).not.toContain('조심하세요');
  });
});
