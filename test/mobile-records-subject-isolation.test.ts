import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';

import { MyeongHaApiClientV1 } from '../packages/api-client/src/index.js';
import { createMobileRecordsServiceV1, type MobileRecordsServiceV1 } from '../apps/mobile/src/features/records/mobile-records-service.js';
import { createMobileRecordsRepositoriesV1 } from '../apps/mobile/src/features/records/mobile-records-repository.js';
import { createMobileRecordsControllerV1 } from '../apps/mobile/src/features/records/mobile-records-controller.js';

const readingId = '44444444-4444-4444-8444-444444444444';
const date = '2026-10-09T00:00:00.000Z';
const readingHistory = (id: string) => ({
  readingId: id,
  readingSessionId: '55555555-5555-4555-8555-555555555555',
  sajuDomain: 'general',
  readingContractVersion: 'myeonghwa-product-reading-response-v2',
  productResponseState: 'delivered',
  readerCharacterIds: [],
  createdAt: date,
  completedAt: date,
});
const officialReading = {
  ...readingHistory(readingId),
  reading: {
    responseId: `reading_response_${'d'.repeat(24)}`,
    responseVersion: 'myeonghwa-product-reading-response-v2',
    state: 'delivered',
    messageCode: 'READING_DELIVERED',
    requiredAction: 'none',
    reading: {
      readingId,
      sections: [{
        sectionType: 'overview',
        title: '핵심',
        state: 'complete',
        blocks: [{ type: 'paragraph', text: '서버 소유 공식 풀이' }],
      }],
      disclosures: [],
    },
  },
};

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

function fixture() {
  const entered = deferred();
  const blocked = deferred();
  let bearer = 'member-A';
  let reads = 0;
  const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    reads += 1;
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer member-A');
    entered.release();
    await blocked.promise;
    const { pathname, searchParams } = new URL(String(url));
    const data = pathname === '/api/life-record'
      ? { facts: [], pagination: { pageSize: 20, hasMore: false, nextCursor: null } }
      : pathname === '/api/memories'
        ? { memories: [], pagination: { pageSize: 20, hasMore: false, nextCursor: null } }
        : searchParams.has('readingId')
          ? officialReading
          : { readings: [], pagination: { pageSize: 20, hasMore: false, nextCursor: null } };
    return Response.json({ ok: true, data });
  });
  let activeChecks = 0;
  const service = createMobileRecordsServiceV1({
    client: new MyeongHaApiClientV1({ origin: 'https://myeongha.test', fetchImpl }),
    session: {
      async withActiveBearer<T>(operation: (activeBearer: string) => Promise<T>): Promise<T> {
        activeChecks += 1;
        return operation(bearer);
      },
    },
  });
  return {
    service,
    entered: entered.promise,
    release: blocked.release,
    switchSubject: () => { bearer = 'member-B'; },
    reads: () => reads,
    checks: () => activeChecks,
  };
}

describe('M3-beta-2b current Subject isolation for Records + Official Reading', () => {
  const readCases: readonly [string, (service: MobileRecordsServiceV1) => Promise<unknown>][] = [
    ['life', (service) => service.readLifeRecordPage()],
    ['reading-history', (service) => service.readReadingPage()],
    ['memories', (service) => service.readMemoryPage()],
    ['official-reading', (service) => service.readOfficialReading(readingId)],
  ];

  it.each(readCases)('discards a previously authorized %s response after a Subject switch', async (_, read) => {
    const f = fixture();
    const pending = read(f.service);
    await f.entered;
    f.switchSubject();
    f.release();
    await expect(pending).rejects.toMatchObject({ code: 'CLIENT_RECORDS_SESSION_CHANGED' });
    expect(f.reads()).toBe(1);
    expect(f.checks()).toBe(2);
  });

  it('keeps same-Subject archived Official Reading readable', async () => {
    const f = fixture();
    const pending = f.service.readOfficialReading(readingId);
    await f.entered;
    f.release();
    await expect(pending).resolves.toMatchObject({
      readingId,
      display: { kind: 'delivered' },
    });
    expect(f.checks()).toBe(2);
  });

  it('invalidates all three Records collection caches even with unfinished HTTP', async () => {
    const firstEntered = deferred();
    const firstHeld = deferred();
    let calls = 0;
    const base = emptyService();
    const repos = createMobileRecordsRepositoriesV1({
      ...base,
      async readReadingPage() {
        calls += 1;
        if (calls === 1) {
          firstEntered.release();
          await firstHeld.promise;
          return { readings: [readingHistory('old-subject-reading')], pagination: { pageSize: 20, hasMore: false, nextCursor: null } };
        }
        return { readings: [readingHistory('new-subject-reading')], pagination: { pageSize: 20, hasMore: false, nextCursor: null } };
      },
    });

    const first = repos.readings.loadInitial();
    await firstEntered.promise;
    expect(repos.readings.getSnapshot().status).toBe('loading_initial');

    repos.life.reset();
    repos.readings.reset();
    repos.memories.reset();
    expect(repos.readings.getSnapshot()).toMatchObject({ status: 'idle', items: [] });

    const fresh = await repos.readings.loadInitial();
    expect(fresh.items.map((item) => item.readingId)).toEqual(['new-subject-reading']);
    firstHeld.release();
    await first;

    expect(repos.readings.getSnapshot().items.map((item) => item.readingId)).toEqual([
      'new-subject-reading',
    ]);
    expect(calls).toBe(2);
  });

  it('rejects stale loadMore results after reset and never combines two Subjects', async () => {
    const held = deferred();
    const entered = deferred();
    let round = 0;
    const repos = createMobileRecordsRepositoriesV1({
      ...emptyService(),
      async readReadingPage(options = {}) {
        if (options.cursor) {
          entered.release();
          await held.promise;
          return { readings: [readingHistory('old-subject-page-two')], pagination: { pageSize: 2, hasMore: false, nextCursor: null } };
        }
        round += 1;
        return {
          readings: [readingHistory(round === 1 ? 'old-subject-page-one' : 'new-subject-page-one')],
          pagination: { pageSize: 2, hasMore: round === 1, nextCursor: round === 1 ? 'old-subject-cursor' : null },
        };
      },
    }, 2);
    await repos.readings.loadInitial();
    const pending = repos.readings.loadMore();
    await entered.promise;

    repos.readings.reset();
    await repos.readings.loadInitial();
    held.release();
    await pending;
    expect(repos.readings.getSnapshot()).toMatchObject({ status: 'ready', hasMore: false });
    expect(repos.readings.getSnapshot().items.map((row) => row.readingId)).toEqual([
      'new-subject-page-one',
    ]);
  });

  it('clears TTL and rejects stale controller completion after Records re-entry', async () => {
    let calls = 0;
    const base = emptyService();
    const controller = createMobileRecordsControllerV1({
      repositories: createMobileRecordsRepositoriesV1({
        ...base,
        async readReadingPage() {
          calls += 1;
          return {
            readings: [readingHistory(`reading-${calls}`)],
            pagination: { pageSize: 20, hasMore: false, nextCursor: null },
          };
        },
      }),
      cacheTtlMs: 60_000,
      nowEpochMs: () => 10_000,
    });
    await controller.loadInitial('readings');
    await controller.loadInitial('readings');
    expect(calls).toBe(1);
    expect(controller.getSnapshots().readings.items).toHaveLength(1);
    expect(controller.reset().readings.items).toHaveLength(0);
    await controller.loadInitial('readings');
    expect(calls).toBe(2);
    expect(controller.getSnapshots().readings.items.map((x) => x.readingId)).toEqual(['reading-2']);
  });

  it('clears cached rows if the active Subject changes during a forced refresh', async () => {
    let reads = 0;
    const repos = createMobileRecordsRepositoriesV1({
      ...emptyService(),
      async readReadingPage() {
        reads += 1;
        if (reads === 2) {
          throw Object.assign(new Error('session replaced'), { code: 'CLIENT_RECORDS_SESSION_CHANGED' });
        }
        return {
          readings: [readingHistory('old-subject-reading')],
          pagination: { pageSize: 20, hasMore: false, nextCursor: null },
        };
      },
    });
    await repos.readings.loadInitial();
    expect(repos.readings.getSnapshot().items).toHaveLength(1);
    await expect(repos.readings.loadInitial()).rejects.toMatchObject({ code: 'CLIENT_RECORDS_SESSION_CHANGED' });
    expect(repos.readings.getSnapshot()).toMatchObject({ status: 'error', items: [], nextCursor: null });
  });

  it('binds Records screen and Official Reading detail to focus epochs, not only HTTP identity', async () => {
    const read = (path: string) =>
      readFile(new URL('../' + path, import.meta.url), 'utf8');
    const [list, detail] = await Promise.all([
      read('apps/mobile/src/features/records/use-mobile-records.tsx'),
      read('apps/mobile/src/app/reading/[readingId].tsx'),
    ]);
    expect(list).toContain('useFocusEffect');
    expect(list).toContain('mobileRecordsControllerV1.reset()');
    expect(list).toContain('focusEpoch.current');
    expect(detail).toContain('useFocusEffect');
    expect(detail).toContain('requestEpoch.current');
    expect(detail).toContain('epoch === requestEpoch.current');
    expect(detail).toContain('mobileRecordsServiceV1.readOfficialReading(readingId)');
  });
});

function emptyService(): MobileRecordsServiceV1 {
  return {
    async readLifeRecordPage() {
      return { facts: [], pagination: { pageSize: 20, hasMore: false, nextCursor: null } };
    },
    async readReadingPage() {
      return { readings: [], pagination: { pageSize: 20, hasMore: false, nextCursor: null } };
    },
    async readMemoryPage() {
      return { memories: [], pagination: { pageSize: 20, hasMore: false, nextCursor: null } };
    },
    async readOfficialReading() {
      throw new Error('not used');
    },
  };
}
