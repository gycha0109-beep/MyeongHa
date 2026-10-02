import {
  MyeongHaApiClientErrorV1,
  type TargetPersonCreateRequestV1,
} from '@myeongha/api-client';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import {
  loadMobileMyV1,
  MOBILE_MY_LOADING_STATE_V1,
  reloadMobileMyBirthV1,
  reloadMobileMyProfileV1,
  reloadMobileMyTargetPersonsV1,
  type MobileMyStateV1,
} from '@/features/my/mobile-my-loader';
import { mobileMyServiceV1 } from '@/features/my/native-mobile-my-service';

type TargetPersonCreateStateV1 =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'submitting' }>
  | Readonly<{ kind: 'error'; message: string }>;

export function useMobileMyV1() {
  const [state, setState] = useState<MobileMyStateV1>(MOBILE_MY_LOADING_STATE_V1);
  const [targetPersonCreate, setTargetPersonCreate] =
    useState<TargetPersonCreateStateV1>({ kind: 'idle' });

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

  const retryTargetPersons = useCallback(async () => {
    setState((current) => Object.freeze({
      ...current,
      targetPersons: Object.freeze({ kind: 'loading' as const }),
    }));
    const targetPersons = await reloadMobileMyTargetPersonsV1(mobileMyServiceV1);
    setState((current) => Object.freeze({ ...current, targetPersons }));
  }, []);

  const createTargetPerson = useCallback(
    async (request: TargetPersonCreateRequestV1): Promise<boolean> => {
      setTargetPersonCreate({ kind: 'submitting' });
      try {
        await mobileMyServiceV1.createTargetPerson(request);
        const targetPersons = await reloadMobileMyTargetPersonsV1(mobileMyServiceV1);
        setState((current) => Object.freeze({ ...current, targetPersons }));
        setTargetPersonCreate({ kind: 'idle' });
        return true;
      } catch (cause) {
        let message = '대상을 추가하지 못했습니다. 잠시 후 다시 시도해 주세요.';
        if (cause instanceof MyeongHaApiClientErrorV1) {
          if (cause.kind === 'network') {
            message = '서버에 연결하지 못했습니다. 네트워크를 확인해 주세요.';
          } else if (cause.kind === 'http' && cause.code === 'INVALID_REQUEST') {
            message = '입력한 출생정보를 확인해 주세요.';
          }
        }
        setTargetPersonCreate({ kind: 'error', message });
        return false;
      }
    },
    [],
  );

  return Object.freeze({
    state,
    retryProfile,
    retryBirth,
    retryTargetPersons,
    targetPersonCreate,
    createTargetPerson,
  });
}
