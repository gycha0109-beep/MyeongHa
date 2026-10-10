import type {
  LifeRecordFactV1,
  MemoryItemV1,
  ReadingHistoryItemV1,
} from '@myeongha/api-client';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import {
  mobileRecordsControllerV1,
} from '@/features/records/native-mobile-records-controller';
import type {
  MobileRecordsCollectionKeyV1,
  MobileRecordsSnapshotsV1,
} from '@/features/records/mobile-records-controller';
import type { RecordsTabV1 } from '@/features/records/records-view-model';

const EMPTY_SECTION = Object.freeze({
  status: 'idle' as const,
  items: Object.freeze([]),
  hasMore: true,
  nextCursor: null,
  errorCode: null,
});
const EMPTY_RECORDS: MobileRecordsSnapshotsV1 = Object.freeze({
  life: EMPTY_SECTION,
  readings: EMPTY_SECTION,
  memories: EMPTY_SECTION,
});

function sync() {
  return mobileRecordsControllerV1.getSnapshots();
}

export function useMobileRecordsV1() {
  // A module-global controller may retain a previous Subject's history.
  // Never paint its initial snapshot before the current focus revalidates it.
  const [snapshots, setSnapshots] = useState<MobileRecordsSnapshotsV1>(() => EMPTY_RECORDS);
  const focused = useRef(false);
  const focusEpoch = useRef(0);

  const run = useCallback(async (
    operation: () => Promise<MobileRecordsSnapshotsV1>,
  ) => {
    const epoch = focusEpoch.current;
    if (!focused.current) return sync();
    const pending = operation();
    if (focused.current && epoch === focusEpoch.current) setSnapshots(sync());
    const result = await pending;
    if (focused.current && epoch === focusEpoch.current) setSnapshots(result);
    return result;
  }, []);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      const epoch = ++focusEpoch.current;
      // Re-entry after login/logout must not reuse an unscoped 60s cache.
      setSnapshots(mobileRecordsControllerV1.reset());
      const pending = mobileRecordsControllerV1.loadInitialAll({ force: true });
      setSnapshots(sync());
      void pending.then((result) => {
        if (focused.current && epoch === focusEpoch.current) setSnapshots(result);
      });
      return () => {
        focused.current = false;
        focusEpoch.current += 1;
        // Suppress both cached rows and in-flight pages after tab blur.
        setSnapshots(mobileRecordsControllerV1.reset());
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
    // Each run publishes only to the focus epoch that started it.
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
