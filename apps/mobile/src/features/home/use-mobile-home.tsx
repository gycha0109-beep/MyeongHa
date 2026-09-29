import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import {
  mobileHomeControllerV1,
} from '@/features/home/native-mobile-home-controller';

export function useMobileHomeV1() {
  const [snapshot, setSnapshot] = useState(() => mobileHomeControllerV1.getSnapshot());

  const syncLoad = useCallback(async (force = false) => {
    const pending = mobileHomeControllerV1.load({ force });
    setSnapshot(mobileHomeControllerV1.getSnapshot());
    const next = await pending;
    setSnapshot(next);
    return next;
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const pending = mobileHomeControllerV1.load();
      setSnapshot(mobileHomeControllerV1.getSnapshot());
      void pending.then((next) => {
        if (active) setSnapshot(next);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  return Object.freeze({
    snapshot,
    refresh: () => syncLoad(true),
  });
}
