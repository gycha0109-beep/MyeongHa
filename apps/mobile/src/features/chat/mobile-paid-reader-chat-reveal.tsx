import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';

import { subscribeMobileSubjectCredentialChangesV1 } from '@/core/session/mobile-subject-credential-changes';
import {
  acknowledgeMobilePaidReaderChatDeliveryV1,
  readMobilePaidReaderChatMessageV1,
  type MobilePaidReaderDeliveryReceiptV1,
} from '@/features/chat/mobile-paid-reader-delivery-service';
import { mobileColors } from '@/ui/mobile-colors';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function messageForStatus(status: number): string {
  if (status === 401) return '해설 열람에는 회원 로그인이 필요합니다.';
  if (status === 403 || status === 404) {
    return '현재 이 해설을 열람할 수 있는 구매권이 확인되지 않았습니다.';
  }
  if (status === 503) return '유료 해설 열람 서비스가 준비 중입니다.';
  return '해설을 불러오지 못했습니다. 다시 시도해 주세요.';
}

/**
 * No native persistence, normal Chat mutation, Memory or telemetry.
 * Paid plaintext lives only in this mounted/focused card's React state,
 * while the receipt bearer lives only in a ref until it is acknowledged
 * or the card is closed/blurred/backgrounded/session-changed.
 */
export function MobilePaidReaderChatRevealV1({
  threadId, safeMessageId,
}: {
  threadId: string;
  safeMessageId: string;
}) {
  const [body, setBody] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [ackFailed, setAckFailed] = useState(false);
  const currentRequest = useRef<AbortController | null>(null);
  const pendingReceipt = useRef<MobilePaidReaderDeliveryReceiptV1 | null>(null);
  const ackAttempted = useRef(false);
  const isFocused = useRef(false);

  const clearProtected = useCallback(() => {
    currentRequest.current?.abort();
    currentRequest.current = null;
    pendingReceipt.current = null;
    ackAttempted.current = false;
    setBody(null);
    setStatus('');
    setLoading(false);
    setAckFailed(false);
  }, []);

  useFocusEffect(useCallback(() => {
    isFocused.current = true;
    return () => {
      isFocused.current = false;
      clearProtected();
    };
  }, [clearProtected]));

  useEffect(() => {
    clearProtected();
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') clearProtected();
    });
    const unsubscribe = subscribeMobileSubjectCredentialChangesV1(() => {
      clearProtected();
    });
    return () => {
      subscription.remove();
      unsubscribe();
      currentRequest.current?.abort();
      currentRequest.current = null;
      pendingReceipt.current = null;
      ackAttempted.current = false;
    };
  }, [threadId, safeMessageId, clearProtected]);

  async function toggle() {
    if (body !== null) {
      clearProtected();
      return;
    }
    if (loading || currentRequest.current !== null
        || !isFocused.current || AppState.currentState !== 'active'
        || !UUID.test(threadId) || !UUID.test(safeMessageId)) return;

    const controller = new AbortController();
    currentRequest.current = controller;
    setLoading(true);
    setStatus('현재 이용권을 확인하고 있습니다…');
    let opened = false;

    try {
      const result = await readMobilePaidReaderChatMessageV1({
        threadId, safeMessageId, signal: controller.signal,
      });
      if (currentRequest.current !== controller || controller.signal.aborted
          || !isFocused.current || AppState.currentState !== 'active') return;
      if (result.kind === 'unavailable') {
        setStatus(messageForStatus(result.status));
        return;
      }
      if (result.kind !== 'ready') {
        setStatus('서버에서 확인된 해설 정보를 표시할 수 없습니다.');
        return;
      }

      // The returned body is only held in the local card. Never insert it
      // into Chat snapshots, navigation, SecureStore, cache or client logs.
      opened = true;
      pendingReceipt.current = result.answer.delivery;
      ackAttempted.current = false;
      setAckFailed(false);
      setBody(result.answer.body);
      setStatus('현재 구매권으로 확인한 해설입니다. 기기 수신 확인 중…');
    } catch {
      if (currentRequest.current === controller && !controller.signal.aborted) {
        setStatus('해설을 불러오지 못했습니다. 다시 시도해 주세요.');
      }
    } finally {
      if (currentRequest.current === controller) {
        if (!opened) currentRequest.current = null;
        setLoading(false);
      }
    }
  }

  function acknowledgeAfterLayout() {
    const controller = currentRequest.current;
    const receipt = pendingReceipt.current;
    if (!controller || !receipt || controller.signal.aborted
        || ackAttempted.current || !isFocused.current
        || AppState.currentState !== 'active') return;
    ackAttempted.current = true;

    // Native Text has reported a layout. Wait until its paint frame before
    // sending the separate client-side callback. This is NOT evidence a
    // person read the answer and cannot mark S5 committed_at as delivered_at.
    requestAnimationFrame(() => {
      if (currentRequest.current !== controller || controller.signal.aborted
          || pendingReceipt.current !== receipt || !isFocused.current
          || AppState.currentState !== 'active') return;
      void (async () => {
        let acknowledged = false;
        try {
          const result = await acknowledgeMobilePaidReaderChatDeliveryV1({
            threadId, safeMessageId, receipt, signal: controller.signal,
          });
          acknowledged = result.kind === 'acknowledged';
        } catch {
          // The ACK may have been received even if its response was lost;
          // a manual retry replays the SAME token and original timestamp.
        }
        if (currentRequest.current !== controller || controller.signal.aborted
            || !isFocused.current || AppState.currentState !== 'active') return;
        if (acknowledged) {
          pendingReceipt.current = null;
          setAckFailed(false);
          setStatus('현재 구매권으로 확인한 해설입니다. 기기 수신 확인이 기록되었습니다.');
        } else {
          setAckFailed(true);
          setStatus('해설이 표시되었으나 기기 수신 확인은 기록되지 않았습니다.');
        }
      })();
    });
  }

  function retryAcknowledgement() {
    if (!ackFailed || pendingReceipt.current === null) return;
    ackAttempted.current = false;
    setAckFailed(false);
    setStatus('기기 수신 확인을 다시 요청하고 있습니다…');
    acknowledgeAfterLayout();
  }

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={body === null ? '구매권 확인 후 유료 해설 열기' : '유료 해설 닫기'}
        accessibilityState={{ disabled: loading, expanded: body !== null }}
        disabled={loading}
        onPress={() => { void toggle(); }}
        style={[styles.button, loading && styles.disabled]}
      >
        <Text style={styles.buttonText}>
          {body !== null ? '해설 닫기' : loading ? '구매권 확인 중…' : '구매권 확인 후 해설 열기'}
        </Text>
      </Pressable>
      {status.length > 0 && (
        <Text accessibilityRole="text" style={styles.status}>{status}</Text>
      )}
      {body !== null && (
        <View style={styles.revealArea}>
          <Text
            accessibilityLabel="현재 구매권으로 확인된 사주 해설"
            onLayout={acknowledgeAfterLayout}
            style={styles.body}
          >{body}</Text>
          {ackFailed && pendingReceipt.current !== null && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="기기 수신 확인 다시 시도하기"
              onPress={retryAcknowledgement}
              style={styles.retryAction}
            >
              <Text style={styles.retryText}>수신 확인 재시도</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8, marginTop: 6 },
  button: {
    minHeight: 42, paddingHorizontal: 12, paddingVertical: 9,
    borderRadius: 9, alignSelf: 'flex-start', justifyContent: 'center',
    backgroundColor: mobileColors.navy,
  },
  disabled: { opacity: 0.6 },
  buttonText: { color: mobileColors.surface, fontSize: 13, fontWeight: '700' },
  status: { color: mobileColors.muted, fontSize: 12, lineHeight: 19 },
  revealArea: { gap: 8 },
  body: {
    color: mobileColors.ink, fontSize: 15, lineHeight: 25,
    backgroundColor: mobileColors.surface, padding: 12,
    borderRadius: 9,
  },
  retryAction: {
    minHeight: 40, alignSelf: 'flex-start', justifyContent: 'center',
    borderWidth: 1, borderColor: mobileColors.border,
    borderRadius: 9, paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: mobileColors.surface,
  },
  retryText: { color: mobileColors.navy, fontSize: 12, fontWeight: '700' },
});
