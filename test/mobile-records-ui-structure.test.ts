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


describe('mobile M4-D Official Reading reread structure', () => {
  it('opens only archive-openable Reading cards into the dedicated detail route', async () => {
    const screen = await readRepoFile('apps/mobile/src/app/(tabs)/records/index.tsx');
    const components = await readRepoFile('apps/mobile/src/features/records/RecordsComponents.tsx');
    const viewModel = await readRepoFile('apps/mobile/src/features/records/records-view-model.ts');

    expect(screen).toContain('router.push');
    expect(screen).toContain('/reading/');
    expect(components).toContain('저장된 풀이 다시 읽기');
    expect(components).toContain('readingIsArchiveOpenableV1');
    expect(viewModel).toContain("value === 'delivered'");
    expect(viewModel).toContain("value === 'delivered_with_fallback'");
  });

  it('keeps the detail screen behind the Records service and safe display projection', async () => {
    const detail = await readRepoFile('apps/mobile/src/app/reading/[readingId].tsx');
    const service = await readRepoFile('apps/mobile/src/features/records/mobile-records-service.ts');
    const client = await readRepoFile('packages/api-client/src/records.ts');

    expect(detail).toContain('mobileRecordsServiceV1.readOfficialReading');
    expect(detail).not.toContain('fetch(');
    expect(detail).not.toContain('SecureStore');
    expect(detail).not.toContain('JSON.stringify');
    expect(service).toContain('readOfficialReadingRecordV1');
    expect(client).toContain('projectProductReadingResponseV2');
    expect(client).not.toContain('responseHash:');
  });
});
