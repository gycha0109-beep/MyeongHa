import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function readRepoFile(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

describe('mobile M4-A Records authority boundary', () => {
  it('keeps bearer, fetch, and SecureStore out of the Records screen', async () => {
    const screen = await readRepoFile('apps/mobile/src/app/(tabs)/records/index.tsx');
    expect(screen).not.toContain('fetch(');
    expect(screen).not.toContain('SecureStore');
    expect(screen).not.toContain('Authorization');
  });

  it('keeps Records collections as separate source contracts', async () => {
    const client = await readRepoFile('packages/api-client/src/records.ts');
    expect(client).toContain('LifeRecordFactV1');
    expect(client).toContain('ReadingHistoryItemV1');
    expect(client).toContain('MemoryItemV1');
    expect(client).not.toContain('interface RecordItem');
  });
});
