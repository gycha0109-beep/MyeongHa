import { nativeMobileRuntimeV1 } from '@/core/runtime/native-mobile-runtime';
import { mobileColors } from '@/ui/mobile-colors';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const VERSION = 'official-reader-paid-chat-message-v1';

function messageForStatus(status: number): string {
  if (status === 401) return '해설 열람에는 회원 로그인이 필요합니다.';
  if (status === 403 || status === 404) return '현재 유효한 해설 구매권을 확인할 수 없습니다.';
  if (status === 503) return '유료 해설 열람 서비스가 준비 중입니다.';
  return '해설을 불러오지 못했습니다. 다시 시도해 주세요.';
}

export function MobilePaidReaderChatRevealV1({
  threadId, safeMessageId,
}: {
  threadId: string;
  safeMessageId: string;
}) {
  const [body, setBody] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const currentRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    setBody(null);
    setStatus('');
    currentRequest.current?.abort();
    currentRequest.current = null;
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        currentRequest.current?.abort();
        currentRequest.current = null;
        setBody(null);
        setStatus('');
        setLoading(false);
      }
    });
    return () => {
      currentRequest.current?.abort();
      currentRequest.current = null;
      subscription.remove();
    };
  }, [threadId, safeMessageId]);

  async function toggle() {
    if (body !== null) {
      setBody(null);
      setStatus('');
      return;
    }
    if (loading || !UUID.test(threadId) || !UUID.test(safeMessageId)) return;

    currentRequest.current?.abort();
    const controller = new AbortController();
    currentRequest.current = controller;
    setLoading(true);
    setStatus('현재 이용권을 확인하고 있습니다…');

    try {
      const origin = nativeMobileRuntimeV1.config.apiOrigin.replace(/\/$/u, '');
      const result = await nativeMobileRuntimeV1.memberSession.withMemberBearer(
        async (bearer) => {
          const response = await fetch(
            `${origin}/api/chat/${encodeURIComponent(threadId)}/paid-readings/${encodeURIComponent(safeMessageId)}`,
            {
              method: 'GET',
              cache: 'no-store',
              headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${bearer}`,
              },
              signal: controller.signal,
            },
          );
          let envelope: unknown;
          try { envelope = await response.json(); } catch { envelope = null; }
          return { response, envelope };
        },
      );
      if (currentRequest.current !== controller || controller.signal.aborted) return;
      if (!result.response.ok) {
        setStatus(messageForStatus(result.response.status));
        return;
      }
      const envelope = result.envelope as {
        ok?: boolean;
        data?: Record<string, unknown>;
      } | null;
      const data = envelope?.ok === true ? envelope.data : undefined;
      if (!data || data.schemaVersion !== VERSION
          || data.threadId !== threadId || data.safeMessageId !== safeMessageId
          || typeof data.officialReadingId !== 'string'
          || !UUID.test(data.officialReadingId)
          || typeof data.body !== 'string'
          || data.body.length === 0 || data.body.length > 262144) {
        setStatus('서버에서 확인된 해설을 표시할 수 없습니다.');
        return;
      }
      setBody(data.body);
      setStatus('현재 구매권으로 확인한 해설입니다.');
    } catch {
      if (currentRequest.current === controller && !controller.signal.aborted) {
        setStatus('해설을 불러오지 못했습니다. 다시 시도해 주세요.');
      }
    } finally {
      if (currentRequest.current === controller) {
        currentRequest.current = null;
        setLoading(false);
      }
    }
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
      {status.length > 0 && <Text style={styles.status}>{status}</Text>}
      {body !== null && <Text style={styles.body}>{body}</Text>}
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
  body: {
    color: mobileColors.ink, fontSize: 15, lineHeight: 25,
    backgroundColor: mobileColors.surface, padding: 12,
    borderRadius: 9,
  },
});
