import { useCallback, useRef, useState } from 'react';

/**
 * Reusable pull-to-refresh state for a concrete screen-level read operation.
 * Re-entrant gestures share the same in-flight request. The caller decides
 * whether a screen has any remote data to refresh; no auth/session reset occurs.
 */
export function useMobilePullRefreshV1(onReload: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef<Promise<void> | null>(null);

  const onRefresh = useCallback((): Promise<void> => {
    if (inFlight.current !== null) return inFlight.current;
    setRefreshing(true);
    const pending = Promise.resolve()
      .then(onReload)
      .then(() => undefined, () => undefined)
      .finally(() => {
        if (inFlight.current === pending) inFlight.current = null;
        setRefreshing(false);
      });
    inFlight.current = pending;
    return pending;
  }, [onReload]);

  return { refreshing, onRefresh } as const;
}
