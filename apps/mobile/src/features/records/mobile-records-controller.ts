import type {
  LifeRecordFactV1,
  MemoryItemV1,
  ReadingHistoryItemV1,
} from '@myeongha/api-client';

import type {
  MobileRecordsCollectionRepositoryV1,
  MobileRecordsCollectionSnapshotV1,
} from './mobile-records-repository.js';

export type MobileRecordsCollectionKeyV1 = 'life' | 'readings' | 'memories';

export interface MobileRecordsSnapshotsV1 {
  readonly life: MobileRecordsCollectionSnapshotV1<LifeRecordFactV1>;
  readonly readings: MobileRecordsCollectionSnapshotV1<ReadingHistoryItemV1>;
  readonly memories: MobileRecordsCollectionSnapshotV1<MemoryItemV1>;
}

export interface MobileRecordsControllerV1 {
  getSnapshots(): MobileRecordsSnapshotsV1;
  reset(): MobileRecordsSnapshotsV1;
  loadInitial(
    key: MobileRecordsCollectionKeyV1,
    options?: Readonly<{ force?: boolean }>,
  ): Promise<MobileRecordsSnapshotsV1>;
  loadMore(key: MobileRecordsCollectionKeyV1): Promise<MobileRecordsSnapshotsV1>;
  loadInitialAll(options?: Readonly<{ force?: boolean }>): Promise<MobileRecordsSnapshotsV1>;
  loadMoreAll(): Promise<MobileRecordsSnapshotsV1>;
}

export function createMobileRecordsControllerV1(input: {
  readonly repositories: Readonly<{
    life: MobileRecordsCollectionRepositoryV1<LifeRecordFactV1>;
    readings: MobileRecordsCollectionRepositoryV1<ReadingHistoryItemV1>;
    memories: MobileRecordsCollectionRepositoryV1<MemoryItemV1>;
  }>;
  readonly cacheTtlMs?: number;
  readonly nowEpochMs?: () => number;
}): MobileRecordsControllerV1 {
  const cacheTtlMs = input.cacheTtlMs ?? 60_000;
  if (!Number.isSafeInteger(cacheTtlMs) || cacheTtlMs < 0) {
    throw new RangeError('Records cache TTL must be a non-negative integer.');
  }
  const nowEpochMs = input.nowEpochMs ?? Date.now;
  const loadedAt: Partial<Record<MobileRecordsCollectionKeyV1, number>> = {};
  let generation = 0;

  function reset(): MobileRecordsSnapshotsV1 {
    generation += 1;
    delete loadedAt.life;
    delete loadedAt.readings;
    delete loadedAt.memories;
    input.repositories.life.reset();
    input.repositories.readings.reset();
    input.repositories.memories.reset();
    return getSnapshots();
  }

  function getSnapshots(): MobileRecordsSnapshotsV1 {
    return Object.freeze({
      life: input.repositories.life.getSnapshot(),
      readings: input.repositories.readings.getSnapshot(),
      memories: input.repositories.memories.getSnapshot(),
    });
  }

  function repository(key: MobileRecordsCollectionKeyV1) {
    switch (key) {
      case 'life':
        return input.repositories.life;
      case 'readings':
        return input.repositories.readings;
      case 'memories':
        return input.repositories.memories;
    }
  }

  function cacheFresh(key: MobileRecordsCollectionKeyV1): boolean {
    const loaded = loadedAt[key];
    const snapshot = repository(key).getSnapshot();
    return (
      loaded !== undefined &&
      snapshot.status === 'ready' &&
      nowEpochMs() - loaded <= cacheTtlMs
    );
  }

  async function loadInitial(
    key: MobileRecordsCollectionKeyV1,
    options: Readonly<{ force?: boolean }> = {},
  ): Promise<MobileRecordsSnapshotsV1> {
    if (!options.force && cacheFresh(key)) return getSnapshots();
    const requestGeneration = generation;
    try {
      await repository(key).loadInitial();
      if (requestGeneration === generation) loadedAt[key] = nowEpochMs();
    } catch {
      // Repository snapshot owns the section-level failure state.
    }
    return getSnapshots();
  }

  async function loadMore(key: MobileRecordsCollectionKeyV1): Promise<MobileRecordsSnapshotsV1> {
    const requestGeneration = generation;
    try {
      await repository(key).loadMore();
      if (requestGeneration === generation) loadedAt[key] = nowEpochMs();
    } catch {
      // Repository snapshot owns the section-level failure state.
    }
    return getSnapshots();
  }

  async function loadInitialAll(
    options: Readonly<{ force?: boolean }> = {},
  ): Promise<MobileRecordsSnapshotsV1> {
    await Promise.all([
      loadInitial('life', options),
      loadInitial('readings', options),
      loadInitial('memories', options),
    ]);
    return getSnapshots();
  }

  async function loadMoreAll(): Promise<MobileRecordsSnapshotsV1> {
    const snapshots = getSnapshots();
    const pending: Promise<MobileRecordsSnapshotsV1>[] = [];
    if (snapshots.life.hasMore) pending.push(loadMore('life'));
    if (snapshots.readings.hasMore) pending.push(loadMore('readings'));
    if (snapshots.memories.hasMore) pending.push(loadMore('memories'));
    await Promise.all(pending);
    return getSnapshots();
  }

  return Object.freeze({
    getSnapshots,
    reset,
    loadInitial,
    loadMore,
    loadInitialAll,
    loadMoreAll,
  });
}
