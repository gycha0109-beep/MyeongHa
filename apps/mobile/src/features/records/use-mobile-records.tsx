import type {
  LifeRecordFactV1,
  MemoryItemV1,
  ReadingHistoryItemV1,
} from '@myeongha/api-client';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import {
  mobileRecordsControllerV1,
} from '@/features/records/native-mobile-records-controller';
import type {
  MobileRecordsCollectionKeyV1,
  MobileRecordsSnapshotsV1,
} from '@/features/records/mobile-records-controller';
import type { RecordsTabV1 } from '@/features/records/records-view-model';

function sync() {
  return mobileRecordsControllerV1.getSnapshots();
}

export function useMobileRecordsV1() {
  const [snapshots, setSnapshots] = useState<MobileRecordsSnapshotsV1>(() => sync());

  const run = useCallback(async (
    operation: () => Promise<MobileRecordsSnapshotsV1>,
  ) => {
    const pending = operation();
    setSnapshots(sync());
    const result = await pending;
    setSnapshots(result);
    return result;
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const pending = mobileRecordsControllerV1.loadInitialAll();
      setSnapshots(sync());
      void pending.then((result) => {
        if (active) setSnapshots(result);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const retryFailed = useCallback(async (tab: RecordsTabV1) => {
    const keys: readonly MobileRecordsCollectionKeyV1[] = tab === 'all'
      ? ['life', 'readings', 'memories']
      : [tab];
    await Promise.all(
      keys
        .filter((key) => snapshots[key].status === 'error')
        .map((key) => run(() => mobileRecordsControllerV1.loadInitial(key, { force: true }))),
    );
    setSnapshots(sync());
  }, [run, snapshots]);

  const loadMore = useCallback(async (tab: RecordsTabV1) => {
    if (tab === 'all') {
      await run(() => mobileRecordsControllerV1.loadMoreAll());
      return;
    }
    await run(() => mobileRecordsControllerV1.loadMore(tab));
  }, [run]);

  return Object.freeze({
    snapshots,
    retryFailed,
    loadMore,
  });
}

export type MobileRecordsVisibleItemV1 =
  | LifeRecordFactV1
  | ReadingHistoryItemV1
  | MemoryItemV1;
