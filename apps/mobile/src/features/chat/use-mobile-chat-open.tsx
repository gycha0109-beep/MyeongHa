import {
  MyeongHaApiClientErrorV1,
  type ChatLaunchCharacterIdV1,
  type ChatOpenResultV1,
} from '@myeongha/api-client';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import {
  MobileMemberSessionErrorV1,
} from '@/core/session/mobile-member-session';
import { nativeMobileRuntimeV1 } from '@/core/runtime/native-mobile-runtime';
import { mobileChatOpenServiceV1 } from '@/features/chat/native-mobile-chat-open-service';

export type MobileChatOpenAccessV1 = 'checking' | 'guest' | 'member' | 'error';

export interface MobileChatOpenStateV1 {
  readonly access: MobileChatOpenAccessV1;
  readonly openingCharacterId: ChatLaunchCharacterIdV1 | null;
  readonly errorMessage: string | null;
}

function messageFor(error: unknown): string {
  if (error instanceof MobileMemberSessionErrorV1) {
    return '대화를 시작하려면 마이 탭에서 로그인해 주세요.';
  }
  if (error instanceof MyeongHaApiClientErrorV1) {
    if (error.code === 'NOT_FOUND') {
      return '현재 이 대화 상대를 사용할 수 없습니다.';
    }
    if (error.code === 'CONTENT_INCOMPATIBLE') {
      return '기존 대화 상태를 안전하게 열 수 없습니다.';
    }
    if (error.code === 'CAPABILITY_UNAVAILABLE') {
      return '현재 대화 콘텐츠를 준비 중입니다.';
    }
    if (error.kind === 'network' || error.retryable) {
      return '대화 서버에 연결하지 못했습니다.';
    }
  }
  return '대화를 시작하지 못했습니다.';
}

export function useMobileChatOpenV1() {
  const [state, setState] = useState<MobileChatOpenStateV1>(
    Object.freeze({
      access: 'checking',
      openingCharacterId: null,
      errorMessage: null,
    }),
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setState((current) => Object.freeze({
        ...current,
        access: 'checking' as const,
        errorMessage: null,
      }));

      void nativeMobileRuntimeV1.memberSession.read()
        .then((session) => {
          if (!active) return;
          setState(Object.freeze({
            access: session === null ? 'guest' : 'member',
            openingCharacterId: null,
            errorMessage: null,
          }));
        })
        .catch(() => {
          if (!active) return;
          setState(Object.freeze({
            access: 'error',
            openingCharacterId: null,
            errorMessage: '회원 상태를 확인하지 못했습니다.',
          }));
        });

      return () => {
        active = false;
      };
    }, []),
  );

  const openCharacter = useCallback(async (
    characterId: ChatLaunchCharacterIdV1,
  ): Promise<ChatOpenResultV1 | null> => {
    setState((current) => Object.freeze({
      ...current,
      openingCharacterId: characterId,
      errorMessage: null,
    }));

    try {
      const result = await mobileChatOpenServiceV1.open(characterId);
      setState((current) => Object.freeze({
        ...current,
        access: 'member' as const,
        openingCharacterId: null,
        errorMessage: null,
      }));
      return result;
    } catch (error) {
      let access: MobileChatOpenAccessV1 = 'member';
      if (error instanceof MobileMemberSessionErrorV1) {
        access = (await nativeMobileRuntimeV1.memberSession.read()) === null
          ? 'guest'
          : 'member';
      }
      setState(Object.freeze({
        access,
        openingCharacterId: null,
        errorMessage: messageFor(error),
      }));
      return null;
    }
  }, []);

  return Object.freeze({ state, openCharacter });
}
