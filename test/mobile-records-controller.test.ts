import { describe, expect, it } from 'vitest';

import { createMobileRecordsControllerV1 } from '../apps/mobile/src/features/records/mobile-records-controller.js';
import { createMobileRecordsRepositoriesV1 } from '../apps/mobile/src/features/records/mobile-records-repository.js';
import type { MobileRecordsServiceV1 } from '../apps/mobile/src/features/records/mobile-records-service.js';

function service(counter: { life: number; readings: number; memories: number }): MobileRecordsServiceV1 {
  return {
    async readLifeRecordPage() {
      counter.life += 1;
      return { facts: [], pagination: { pageSize: 20, hasMore: false, nextCursor: null } };
    },
    async readReadingPage() {
      counter.readings += 1;
      return { readings: [], pagination: { pageSize: 20, hasMore: false, nextCursor: null } };
    },
    async readMemoryPage() {
      counter.memories += 1;
      return { memories: [], pagination: { pageSize: 20, hasMore: false, nextCursor: null } };
    },
  };
}

describe('mobile Records controller cache', () => {
  it('reuses fresh in-memory collection state and revalidates after TTL', async () => {
    const counter = { life: 0, readings: 0, memories: 0 };
    let now = 1_000;
    const controller = createMobileRecordsControllerV1({
      repositories: createMobileRecordsRepositoriesV1(service(counter)),
      cacheTtlMs: 60_000,
      nowEpochMs: () => now,
    });

    await controller.loadInitial('life');
    await controller.loadInitial('life');
    expect(counter.life).toBe(1);

    now += 60_001;
    await controller.loadInitial('life');
    expect(counter.life).toBe(2);
  });

  it('isolates a failed collection while other collections remain ready', async () => {
    const counter = { life: 0, readings: 0, memories: 0 };
    const base = service(counter);
    const controller = createMobileRecordsControllerV1({
      repositories: createMobileRecordsRepositoriesV1({
        ...base,
        async readReadingPage() {
          counter.readings += 1;
          throw new Error('reading unavailable');
        },
      }),
    });

    const result = await controller.loadInitialAll();

    expect(result.life.status).toBe('ready');
    expect(result.memories.status).toBe('ready');
    expect(result.readings.status).toBe('error');
  });
});
