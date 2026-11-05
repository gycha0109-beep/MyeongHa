import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { subscribeMobileSubjectCredentialChangesV1 } from '@/core/session/mobile-subject-credential-changes';
import { MOBILE_HOME_BLANK_SNAPSHOT_V1 } from '@/features/home/mobile-home-controller';
import { mobileHomeControllerV1 } from '@/features/home/native-mobile-home-controller';

/** Home must never briefly paint cached facts from a previous Subject. */
export function useMobileHomeV1() {
  const [snapshot, setSnapshot] = useState(() => MOBILE_HOME_BLANK_SNAPSHOT_V1);
  const focused = useRef(false);
  const focusEpoch = useRef(0);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;

      const restartForCurrentSubject = () => {
        const epoch = ++focusEpoch.current;
        setSnapshot(mobileHomeControllerV1.reset());
        const pending = mobileHomeControllerV1.load({ force: true });
        setSnapshot(mobileHomeControllerV1.getSnapshot());
        void pending.then((next) => {
          if (focused.current && epoch === focusEpoch.current) setSnapshot(next);
        });
      };

      // The emitter runs after verified credential persistence. No owner data
      // crosses the Member/Guest boundary, including when a request races it.
      const unsubscribe = subscribeMobileSubjectCredentialChangesV1(restartForCurrentSubject);
      restartForCurrentSubject();

      return () => {
        unsubscribe();
        focused.current = false;
        focusEpoch.current += 1;
        setSnapshot(mobileHomeControllerV1.reset());
      };
    }, []),
  );

  const refresh = useCallback(async () => {
    if (!focused.current) return;
    const epoch = focusEpoch.current;
    const pending = mobileHomeControllerV1.load({ force: true });
    setSnapshot(mobileHomeControllerV1.getSnapshot());
    const next = await pending;
    if (focused.current && epoch === focusEpoch.current) setSnapshot(next);
  }, []);

  return Object.freeze({ snapshot, refresh });
}
