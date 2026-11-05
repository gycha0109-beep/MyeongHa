import { MyeongHaApiClientErrorV1 } from '@myeongha/api-client';
import type { SeyeonChatTurnSendRequestV1 } from '@myeongha/api-client';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';

import { nativeMobileRuntimeV1 } from '@/core/runtime/native-mobile-runtime';
import { subscribeMobileSubjectCredentialChangesV1 } from '@/core/session/mobile-subject-credential-changes';
import { MobileMemberSessionErrorV1 } from '@/core/session/mobile-member-session';
import { mobileChatPendingTurnStoreV1 } from '@/features/chat/native-mobile-chat-pending-turn-store';
import { mobileChatTurnSendServiceV1 } from '@/features/chat/native-mobile-chat-turn-send-service';
import { createNativeMobileChatReadControllerV1 } from '@/features/chat/native-mobile-chat-read-controller';
import { createMobileChatTurnIdV1 } from '@/features/chat/mobile-chat-turn-id';

function sendErrorMessage(error: unknown): string {
  if (error instanceof MobileMemberSessionErrorV1) {
    return '세연과 대화하려면 마이에서 로그인해 주세요.';
  }
  if (error instanceof MyeongHaApiClientErrorV1) {
    switch (error.code) {
      case 'AUTH_REQUIRED':
      case 'SESSION_EXPIRED':
        return '로그인이 만료되었습니다. 다시 로그인해 주세요.';
      case 'FORBIDDEN':
        return '회원만 메시지를 보낼 수 있습니다.';
      case 'NOT_FOUND':
        return '이 대화방에 접근할 수 없습니다.';
      case 'CAPABILITY_UNAVAILABLE':
      case 'CONTENT_INCOMPATIBLE':
        return '현재 세연 대화 콘텐츠를 사용할 수 없습니다.';
      case 'TURN_IN_FLIGHT':
        return '이전 메시지가 처리 중입니다. 잠시 후 다시 보내 주세요.';
      case 'IDEMPOTENCY_CONFLICT':
        return '전송 식별자가 충돌했습니다. 다시 보내 주세요.';
      case 'AI_TEMPORARILY_UNAVAILABLE':
        return '세연의 답변 생성이 지연되고 있습니다. 다시 시도해 주세요.';
    }
  }
  if (error instanceof Error && error.message === 'CHAT_REREAD_PENDING') {
    return '답변 처리 후 기록을 확인하지 못했습니다. 같은 문장으로 다시 보내 확인할 수 있습니다.';
  }
  return '메시지를 보내지 못했습니다. 문장을 보존했습니다. 다시 시도해 주세요.';
}

export function useMobileChatThreadV1(threadId: string) {
  const controller = useMemo(
    () => createNativeMobileChatReadControllerV1(threadId),
    [threadId],
  );
  const [snapshot, setSnapshot] = useState(() => controller.getSnapshot());
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<string | null>(null);
  const pendingTurn = useRef<SeyeonChatTurnSendRequestV1 | null>(null);
  const sendingRef = useRef(false);
  const focused = useRef(false);
  const subjectEpoch = useRef(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      focused.current = true;
      const epoch = ++subjectEpoch.current;
      const unsubscribe = subscribeMobileSubjectCredentialChangesV1(() => {
        // The detail screen also closes on this event. Clear local Owner
        // data immediately, before its route replacement is painted.
        subjectEpoch.current += 1;
        pendingTurn.current = null;
        setDraft('');
        setSendStatus(null);
        setSending(false);
        sendingRef.current = false;
      });
      setSendStatus(null);
      const loading = controller.loadInitial();
      setSnapshot(controller.getSnapshot());
      void loading.then((next) => {
        if (active && epoch === subjectEpoch.current) setSnapshot(next);
      });

      void nativeMobileRuntimeV1.memberSession.read()
        .then(async (member) => {
          const ownerId = member?.user.id;
          if (!ownerId) return;
          const saved = await mobileChatPendingTurnStoreV1.read(threadId, ownerId);
          if (!active || epoch !== subjectEpoch.current || saved === null) return;
          pendingTurn.current = saved;
          setDraft((current) => current.trim().length > 0 ? current : saved.text);
          setSendStatus('완료되지 않은 메시지를 복원했습니다. 다시 보내면 중복 없이 이어집니다.');
        })
        .catch(() => {
          if (active && epoch === subjectEpoch.current) setSendStatus('이전 전송 내용을 확인할 수 없습니다.');
        });

      return () => {
        unsubscribe();
        active = false;
        focused.current = false;
        subjectEpoch.current += 1;
      };
    }, [controller, threadId]),
  );

  const refresh = useCallback(async () => {
    if (!focused.current || sendingRef.current) return;
    const epoch = subjectEpoch.current;
    // Re-read only the authoritative transcript; keep any unsent draft and
    // preserved pending turn ID untouched for idempotent retry.
    const pending = controller.loadInitial();
    setSnapshot(controller.getSnapshot());
    const next = await pending;
    if (focused.current && epoch === subjectEpoch.current) setSnapshot(next);
  }, [controller]);

  const loadMore = useCallback(async () => {
    if (!focused.current) return;
    const epoch = subjectEpoch.current;
    const pending = controller.loadMore();
    setSnapshot(controller.getSnapshot());
    const next = await pending;
    if (focused.current && epoch === subjectEpoch.current) setSnapshot(next);
  }, [controller]);

  const send = useCallback(async () => {
    if (!focused.current || sendingRef.current) return;
    const epoch = subjectEpoch.current;
    const stillCurrent = () => focused.current && epoch === subjectEpoch.current;
    const current = controller.getSnapshot();
    const text = draft.trim();
    if (current.status !== 'ready' || current.characterId !== 'seyeon') return;
    if (text.length === 0 || text.length > 8000) {
      setSendStatus('메시지는 1~8,000자로 입력해 주세요.');
      return;
    }
    sendingRef.current = true;
    setSending(true);
    setSendStatus('세연이 답하고 있습니다…');
    try {
      const member = await nativeMobileRuntimeV1.memberSession.read();
      if (!stillCurrent()) return;
      const ownerId = member?.user.id;
      const request = pendingTurn.current?.text === text
        ? pendingTurn.current
        : Object.freeze({ clientTurnId: createMobileChatTurnIdV1(), text });
      pendingTurn.current = request;
      // Durable replay requires a stable Member id. If unavailable, keep the
      // request in memory and rely on the server-side Member gate.
      if (ownerId) await mobileChatPendingTurnStoreV1.write(threadId, ownerId, request);
      if (!stillCurrent()) return;
      const result = await mobileChatTurnSendServiceV1.send({
        threadId,
        characterId: current.characterId,
        request,
      });

      if (!stillCurrent()) return;
      // Server-owned forward cursor: the thread may have >30 messages.
      // Only committed records, never speculative assistant text, are rendered.
      let next = controller.getSnapshot();
      if (!next.messages.some((message) => message.messageId === result.assistantMessageId)) {
        if (!next.hasMore) {
          next = await controller.loadInitial();
          if (!stillCurrent()) return;
          setSnapshot(next);
        }
        for (let page = 0; page < 200 &&
          !next.messages.some((message) => message.messageId === result.assistantMessageId) &&
          next.hasMore; page++) {
          next = await controller.loadMore();
          if (!stillCurrent()) return;
          setSnapshot(next);
          if (next.status !== 'ready') break;
        }
      }
      if (!next.messages.some((message) => message.messageId === result.assistantMessageId)) {
        throw new Error('CHAT_REREAD_PENDING');
      }
      if (!stillCurrent()) return;
      pendingTurn.current = null;
      if (ownerId) await mobileChatPendingTurnStoreV1.clear(threadId, ownerId).catch(() => undefined);
      if (!stillCurrent()) return;
      setDraft('');
      setSendStatus('세연의 답변이 도착했습니다.');
    } catch (error) {
      if (!stillCurrent()) return;
      if (error instanceof MyeongHaApiClientErrorV1 && error.code === 'IDEMPOTENCY_CONFLICT') {
        pendingTurn.current = null;
        const member = await nativeMobileRuntimeV1.memberSession.read().catch(() => null);
        if (member?.user.id) {
          await mobileChatPendingTurnStoreV1.clear(threadId, member.user.id).catch(() => undefined);
        }
      }
      if (stillCurrent()) setSendStatus(sendErrorMessage(error));
    } finally {
      if (stillCurrent()) {
        sendingRef.current = false;
        setSending(false);
      }
    }
  }, [controller, draft, threadId]);

  return Object.freeze({ snapshot, refresh, loadMore, draft, setDraft, sending, sendStatus, send });
}
