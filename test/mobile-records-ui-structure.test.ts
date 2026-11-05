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


describe('Records list completeness and failure disclosure', () => {
  it('never claims an empty archive while selected sources are pending or failed', async () => {
    const { recordsInitiallyLoadingV1, recordsConfirmedEmptyV1 } =
      await import('../apps/mobile/src/features/records/records-view-model.js');
    type Status = 'idle' | 'loading_initial' | 'ready' | 'loading_more' | 'error';
    const create = (life: Status, readings: Status, memories: Status) => {
      const section = (status: Status) => ({
        status, items: [], hasMore: false, nextCursor: null, errorCode: status === 'error' ? 'READ_FAILED' : null,
      });
      return {
        life: section(life), readings: section(readings), memories: section(memories),
      };
    };
    const pending = create('ready', 'loading_initial', 'ready');
    expect(recordsInitiallyLoadingV1(pending, 'all')).toBe(true);
    expect(recordsConfirmedEmptyV1(pending, 'all')).toBe(false);
    expect(recordsConfirmedEmptyV1(pending, 'life')).toBe(true);
    const failed = create('error', 'ready', 'ready');
    expect(recordsInitiallyLoadingV1(failed, 'all')).toBe(false);
    expect(recordsConfirmedEmptyV1(failed, 'all')).toBe(false);
    expect(recordsConfirmedEmptyV1(failed, 'life')).toBe(false);
    expect(recordsConfirmedEmptyV1(failed, 'readings')).toBe(true);
    const complete = create('ready', 'ready', 'ready');
    expect(recordsInitiallyLoadingV1(complete, 'all')).toBe(false);
    expect(recordsConfirmedEmptyV1(complete, 'all')).toBe(true);
    const paged = { ...complete, life: { ...complete.life, hasMore: true } };
    expect(recordsConfirmedEmptyV1(paged, 'all')).toBe(false);
  });

  it('keeps error retry available while suppressing false no-record messages', async () => {
    const screen = await readRepoFile('apps/mobile/src/app/(tabs)/records/index.tsx');
    expect(screen).toContain('recordsInitiallyLoadingV1(snapshots, tab)');
    expect(screen).toContain('recordsConfirmedEmptyV1(snapshots, tab)');
    expect(screen).toContain('!confirmedEmpty ? null : <RecordsEmptyState');
    expect(screen).toContain('onRetry={() => void retryFailed(tab)}');
    expect(screen).not.toContain('initialLoadingForTab(');
  });
});
