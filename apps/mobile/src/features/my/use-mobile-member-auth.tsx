import { useCallback, useEffect, useState } from 'react';

import { MyeongHaApiClientErrorV1 } from '@myeongha/api-client';

import { nativeMobileRuntimeV1 } from '@/core/runtime/native-mobile-runtime';
import {
  MobileNewMemberEnrollmentErrorV1,
} from '@/features/my/mobile-new-member-enrollment';
import { mobileNewMemberEnrollmentServiceV1 } from '@/features/my/native-mobile-new-member-enrollment';

export type MobileMemberAuthUiStateV1 =
  | Readonly<{ kind: 'idle'; message: null }>
  | Readonly<{ kind: 'submitting'; message: null }>
  | Readonly<{
      kind: 'verification_required';
      message: string;
      email: string;
      errorMessage: string | null;
    }>
  | Readonly<{ kind: 'error'; message: string }>;

function messageFor(error: unknown): string {
  if (error instanceof MobileNewMemberEnrollmentErrorV1) {
    if (error.code === 'MOBILE_NEW_MEMBER_GUEST_CHANGED') {
      return '가입을 시작한 게스트 세션이 만료되었거나 변경되어 기록을 안전하게 이어갈 수 없습니다.';
    }
    return '가입 이어가기 상태를 찾을 수 없습니다.';
  }
  if (error instanceof MyeongHaApiClientErrorV1) {
    if (error.code === 'INVALID_CREDENTIALS') {
      return '이메일 또는 비밀번호를 확인해 주세요.';
    }
    if (error.code === 'RATE_LIMITED') {
      return '계정 요청이 많습니다. 잠시 후 다시 시도해 주세요.';
    }
    if (error.code === 'COMPROMISED_PASSWORD') {
      return '유출된 비밀번호로 확인되어 사용할 수 없습니다.';
    }
    if (error.code === 'PASSWORD_SECURITY_UNAVAILABLE') {
      return '비밀번호 안전성 확인을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.';
    }
    if (error.code === 'SIGN_UP_REJECTED') {
      return '새 계정을 만들 수 없습니다. 이미 가입된 이메일인지 확인해 주세요.';
    }
    if (error.code === 'GUEST_MERGE_REQUIRED') {
      return '기존 회원 계정에는 게스트 기록을 자동 병합할 수 없습니다. 기존 계정 로그인으로 이용해 주세요.';
    }
    if (error.code === 'GUEST_SESSION_NOT_PROMOTABLE') {
      return '현재 게스트 세션을 새 회원 계정으로 이어갈 수 없습니다.';
    }
    if (error.kind === 'network' || error.retryable) {
      return '계정 서버에 연결하지 못했습니다.';
    }
  }
  return '계정 작업을 완료하지 못했습니다.';
}

const VERIFICATION_MESSAGE =
  '확인 메일을 보냈습니다. 이메일 확인 후 앱으로 돌아와 가입을 완료해 주세요.' as const;

export function useMobileMemberAuthV1() {
  const [state, setState] = useState<MobileMemberAuthUiStateV1>(
    Object.freeze({ kind: 'idle', message: null }),
  );

  useEffect(() => {
    let active = true;
    void mobileNewMemberEnrollmentServiceV1.readPending()
      .then((pending) => {
        if (!active || pending === null) return;
        setState((current) => current.kind === 'idle'
          ? Object.freeze({
              kind: 'verification_required' as const,
              email: pending.email,
              message: VERIFICATION_MESSAGE,
              errorMessage: null,
            })
          : current);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

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

  const signUp = useCallback(async (email: string, password: string) => {
    setState(Object.freeze({ kind: 'submitting', message: null }));
    try {
      const result = await mobileNewMemberEnrollmentServiceV1.start(email, password);
      if (result.status === 'verification_required') {
        setState(Object.freeze({
          kind: 'verification_required',
          email: result.email,
          message: VERIFICATION_MESSAGE,
          errorMessage: null,
        }));
        return 'verification_required' as const;
      }
      setState(Object.freeze({ kind: 'idle', message: null }));
      return 'authenticated' as const;
    } catch (error) {
      if (
        error instanceof MyeongHaApiClientErrorV1 &&
        error.code === 'GUEST_MERGE_REQUIRED'
      ) {
        try {
          await mobileNewMemberEnrollmentServiceV1.cancelPending();
        } catch {
        }
        setState(Object.freeze({ kind: 'error', message: messageFor(error) }));
        return false;
      }

      const pending = await mobileNewMemberEnrollmentServiceV1.readPending()
        .catch(() => null);
      if (pending !== null) {
        setState(Object.freeze({
          kind: 'verification_required',
          email: pending.email,
          message: '계정 생성 후 게스트 기록 연결을 마저 완료해 주세요.',
          errorMessage: messageFor(error),
        }));
        return false;
      }

      setState(Object.freeze({ kind: 'error', message: messageFor(error) }));
      return false;
    }
  }, []);

  const completeSignUp = useCallback(async (email: string, password: string) => {
    setState(Object.freeze({ kind: 'submitting', message: null }));
    try {
      await mobileNewMemberEnrollmentServiceV1.continueAfterVerification(
        email,
        password,
      );
      setState(Object.freeze({ kind: 'idle', message: null }));
      return true;
    } catch (error) {
      if (
        error instanceof MyeongHaApiClientErrorV1 &&
        error.code === 'GUEST_MERGE_REQUIRED'
      ) {
        try {
          await mobileNewMemberEnrollmentServiceV1.cancelPending();
        } catch {
        }
        setState(Object.freeze({ kind: 'error', message: messageFor(error) }));
        return false;
      }
      setState(Object.freeze({
        kind: 'verification_required',
        email,
        message: '이메일 확인 후 앱에서 가입 완료를 다시 시도해 주세요.',
        errorMessage: messageFor(error),
      }));
      return false;
    }
  }, []);

  const cancelSignUp = useCallback(async () => {
    try {
      await mobileNewMemberEnrollmentServiceV1.cancelPending();
    } finally {
      setState(Object.freeze({ kind: 'idle', message: null }));
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

  return Object.freeze({
    state,
    signIn,
    signUp,
    completeSignUp,
    cancelSignUp,
    signOut,
  });
}
