import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import {
  loadMobileMyV1,
  MOBILE_MY_LOADING_STATE_V1,
  reloadMobileMyBirthV1,
  reloadMobileMyProfileV1,
  type MobileMyStateV1,
} from '@/features/my/mobile-my-loader';
import { mobileMyServiceV1 } from '@/features/my/native-mobile-my-service';

export function useMobileMyV1() {
  const [state, setState] = useState<MobileMyStateV1>(MOBILE_MY_LOADING_STATE_V1);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setState(MOBILE_MY_LOADING_STATE_V1);
      void loadMobileMyV1(mobileMyServiceV1).then((next) => {
        if (active) setState(next);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const retryProfile = useCallback(async () => {
    setState((current) => Object.freeze({
      ...current,
      profile: Object.freeze({ kind: 'loading' as const }),
    }));
    const profile = await reloadMobileMyProfileV1(mobileMyServiceV1);
    setState((current) => Object.freeze({ ...current, profile }));
  }, []);

  const retryBirth = useCallback(async () => {
    setState((current) => Object.freeze({
      ...current,
      birth: Object.freeze({ kind: 'loading' as const }),
    }));
    const birth = await reloadMobileMyBirthV1(mobileMyServiceV1);
    setState((current) => Object.freeze({ ...current, birth }));
  }, []);

  return Object.freeze({ state, retryProfile, retryBirth });
}
