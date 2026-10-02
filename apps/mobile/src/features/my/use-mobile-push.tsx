import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import {
  nativeMobilePushServiceV1,
} from '@/core/push/native-mobile-push-service';
import type { MobilePushStatusV1 } from '@/core/push/mobile-push-service';

export type MobilePushUiStateV1 =
  | Readonly<{ kind: 'loading'; status: null; errorMessage: null }>
  | Readonly<{
      kind: 'ready';
      status: MobilePushStatusV1;
      errorMessage: null;
    }>
  | Readonly<{
      kind: 'submitting';
      status: MobilePushStatusV1 | null;
      errorMessage: null;
    }>
  | Readonly<{
      kind: 'error';
      status: MobilePushStatusV1 | null;
      errorMessage: string;
    }>;

function failureMessage(error: unknown): string {
  if (error instanceof Error && error.message.includes('EAS')) {
    return '현재 빌드에 Push 프로젝트 연결 정보가 없습니다.';
  }
  return '이 기기의 알림 연결을 완료하지 못했습니다.';
}

export function useMobilePushV1() {
  const [state, setState] = useState<MobilePushUiStateV1>({
    kind: 'loading',
    status: null,
    errorMessage: null,
  });

  const refresh = useCallback(async () => {
    try {
      const status = await nativeMobilePushServiceV1.readStatus();
      setState({ kind: 'ready', status, errorMessage: null });
    } catch (error) {
      setState({
        kind: 'error',
        status: null,
        errorMessage: failureMessage(error),
      });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      return undefined;
    }, [refresh]),
  );

  const enable = useCallback(async () => {
    const previous = state.kind === 'ready' ? state.status : null;
    setState({ kind: 'submitting', status: previous, errorMessage: null });
    try {
      const status = await nativeMobilePushServiceV1.enable();
      setState({ kind: 'ready', status, errorMessage: null });
    } catch (error) {
      setState({
        kind: 'error',
        status: previous,
        errorMessage: failureMessage(error),
      });
    }
  }, [state]);

  const disable = useCallback(async () => {
    const previous = state.kind === 'ready' ? state.status : null;
    setState({ kind: 'submitting', status: previous, errorMessage: null });
    try {
      const status = await nativeMobilePushServiceV1.disable();
      setState({ kind: 'ready', status, errorMessage: null });
    } catch (error) {
      setState({
        kind: 'error',
        status: previous,
        errorMessage: failureMessage(error),
      });
    }
  }, [state]);

  const retry = useCallback(async () => {
    const previous =
      state.kind === 'ready' || state.kind === 'error' ? state.status : null;
    setState({ kind: 'submitting', status: previous, errorMessage: null });
    try {
      const status = await nativeMobilePushServiceV1.syncEnabledNoPrompt();
      setState({ kind: 'ready', status, errorMessage: null });
    } catch (error) {
      setState({
        kind: 'error',
        status: previous,
        errorMessage: failureMessage(error),
      });
    }
  }, [state]);

  return Object.freeze({ state, enable, disable, retry, refresh });
}
