import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function readRepoFile(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

describe('mobile M4-B Records UI structure', () => {
  it('exposes exactly the four source-safe Records tabs', async () => {
    const components = await readRepoFile('apps/mobile/src/features/records/RecordsComponents.tsx');
    expect(components).toContain("{ key: 'all', label: '전체' }");
    expect(components).toContain("{ key: 'life', label: '현세록' }");
    expect(components).toContain("{ key: 'readings', label: '지난 읽기' }");
    expect(components).toContain("{ key: 'memories', label: '기억' }");
    expect(components).not.toContain('이어지는 이야기');
    expect(components).not.toContain('저장한 결과');
  });

  it('keeps the screen behind controller/service boundaries', async () => {
    const screen = await readRepoFile('apps/mobile/src/app/(tabs)/records/index.tsx');
    expect(screen).not.toContain('fetch(');
    expect(screen).not.toContain('SecureStore');
    expect(screen).not.toContain('Authorization');
    expect(screen).toContain('useMobileRecordsV1');
    expect(screen).toContain('FlatList');
  });

  it('does not stringify raw Life Fact or Memory payloads into cards', async () => {
    const components = await readRepoFile('apps/mobile/src/features/records/RecordsComponents.tsx');
    expect(components).not.toContain('JSON.stringify');
    expect(components).not.toContain('valueJsonb');
    expect(components).not.toContain('contentJsonb');
  });
});
