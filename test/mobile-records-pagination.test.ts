import { describe, expect, it } from 'vitest';

import {
  MobileRecordsRepositoryErrorV1,
  createMobileRecordsRepositoriesV1,
} from '../apps/mobile/src/features/records/mobile-records-repository.js';
import type { MobileRecordsServiceV1 } from '../apps/mobile/src/features/records/mobile-records-service.js';

function service(overrides: Partial<MobileRecordsServiceV1>): MobileRecordsServiceV1 {
  return {
    async readLifeRecordPage() {
      return { facts: [], pagination: { pageSize: 2, hasMore: false, nextCursor: null } };
    },
    async readReadingPage() {
      return { readings: [], pagination: { pageSize: 2, hasMore: false, nextCursor: null } };
    },
    async readMemoryPage() {
      return { memories: [], pagination: { pageSize: 2, hasMore: false, nextCursor: null } };
    },
    ...overrides,
  };
}

describe('mobile Records pagination repository', () => {
  it('appends a second page and preserves canonical identities', async () => {
    const calls: Array<string | undefined> = [];
    const repos = createMobileRecordsRepositoriesV1(service({
      async readMemoryPage(options = {}) {
        calls.push(options.cursor);
        if (options.cursor === undefined) {
          return {
            memories: [{
              memoryItemId: 'memory-1',
              memoryType: 'conversation',
              schemaVersion: 'v1',
              contentJsonb: {},
              createdByCharacterId: null,
              createdAt: '2026-09-29T00:00:00.000Z',
            }],
            pagination: { pageSize: 2, hasMore: true, nextCursor: 'cursor-2' },
          };
        }
        return {
          memories: [{
            memoryItemId: 'memory-2',
            memoryType: 'conversation',
            schemaVersion: 'v1',
            contentJsonb: {},
            createdByCharacterId: null,
            createdAt: '2026-09-28T00:00:00.000Z',
          }],
          pagination: { pageSize: 2, hasMore: false, nextCursor: null },
        };
      },
    }), 2);

    await repos.memories.loadInitial();
    const final = await repos.memories.loadMore();

    expect(calls).toEqual([undefined, 'cursor-2']);
    expect(final.items.map((item) => item.memoryItemId)).toEqual(['memory-1', 'memory-2']);
    expect(final.hasMore).toBe(false);
  });

  it('fails closed when a cursor does not advance', async () => {
    const repos = createMobileRecordsRepositoriesV1(service({
      async readLifeRecordPage(options = {}) {
        if (options.cursor === undefined) {
          return {
            facts: [],
            pagination: { pageSize: 2, hasMore: true, nextCursor: 'repeat' },
          };
        }
        return {
          facts: [],
          pagination: { pageSize: 2, hasMore: true, nextCursor: 'repeat' },
        };
      },
    }), 2);

    await repos.life.loadInitial();
    await expect(repos.life.loadMore()).rejects.toBeInstanceOf(
      MobileRecordsRepositoryErrorV1,
    );
    expect(repos.life.getSnapshot()).toMatchObject({
      status: 'error',
      errorCode: 'RECORDS_PAGINATION_PROTOCOL_ERROR',
    });
  });

  it('fails closed when a later page repeats a canonical id', async () => {
    const item = {
      readingId: 'reading-1',
      readingSessionId: 'session-1',
      sajuDomain: 'general',
      readingContractVersion: 'v1',
      productResponseState: 'delivered',
      readerCharacterIds: [],
      createdAt: '2026-09-28T00:00:00.000Z',
      completedAt: '2026-09-28T01:00:00.000Z',
    };
    const repos = createMobileRecordsRepositoriesV1(service({
      async readReadingPage(options = {}) {
        return options.cursor === undefined
          ? {
              readings: [item],
              pagination: { pageSize: 2, hasMore: true, nextCursor: 'cursor-2' },
            }
          : {
              readings: [item],
              pagination: { pageSize: 2, hasMore: false, nextCursor: null },
            };
      },
    }), 2);

    await repos.readings.loadInitial();
    await expect(repos.readings.loadMore()).rejects.toMatchObject({
      code: 'RECORDS_PAGINATION_PROTOCOL_ERROR',
    });
  });

  it('deduplicates concurrent initial loads with one in-flight request', async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const repos = createMobileRecordsRepositoriesV1(service({
      async readLifeRecordPage() {
        calls += 1;
        await gate;
        return {
          facts: [],
          pagination: { pageSize: 2, hasMore: false, nextCursor: null },
        };
      },
    }), 2);

    const first = repos.life.loadInitial();
    const second = repos.life.loadInitial();
    release();
    await Promise.all([first, second]);

    expect(calls).toBe(1);
  });
});
