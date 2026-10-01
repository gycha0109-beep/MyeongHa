import { useCallback, useState } from 'react';

import { MyeongHaApiClientErrorV1 } from '@myeongha/api-client';

import { nativeMobileRuntimeV1 } from '@/core/runtime/native-mobile-runtime';

export type MobileMemberAuthUiStateV1 =
  | Readonly<{ kind: 'idle'; message: null }>
  | Readonly<{ kind: 'submitting'; message: null }>
  | Readonly<{ kind: 'error'; message: string }>;

function messageFor(error: unknown): string {
  if (error instanceof MyeongHaApiClientErrorV1) {
    if (error.code === 'INVALID_CREDENTIALS') {
      return '이메일 또는 비밀번호를 확인해 주세요.';
    }
    if (error.code === 'RATE_LIMITED') {
      return '로그인 요청이 많습니다. 잠시 후 다시 시도해 주세요.';
    }
    if (error.kind === 'network' || error.retryable) {
      return '로그인 서버에 연결하지 못했습니다.';
    }
  }
  return '로그인을 완료하지 못했습니다.';
}

export function useMobileMemberAuthV1() {
  const [state, setState] = useState<MobileMemberAuthUiStateV1>(
    Object.freeze({ kind: 'idle', message: null }),
  );

  const signIn = useCallback(async (email: string, password: string) => {
    setState(Object.freeze({ kind: 'submitting', message: null }));
    try {
      await nativeMobileRuntimeV1.memberSession.signIn(email, password);
      setState(Object.freeze({ kind: 'idle', message: null }));
      return true;
    } catch (error) {
      setState(Object.freeze({ kind: 'error', message: messageFor(error) }));
      return false;
    }
  }, []);

  const signOut = useCallback(async () => {
    setState(Object.freeze({ kind: 'submitting', message: null }));
    try {
      await nativeMobileRuntimeV1.memberSession.signOut();
      setState(Object.freeze({ kind: 'idle', message: null }));
      return true;
    } catch {
      setState(Object.freeze({
        kind: 'error',
        message: '이 기기의 로그인 상태를 정리하지 못했습니다.',
      }));
      return false;
    }
  }, []);

  return Object.freeze({ state, signIn, signOut });
}
