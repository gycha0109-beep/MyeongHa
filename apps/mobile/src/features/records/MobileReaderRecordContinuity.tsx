import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';

import { subscribeMobileSubjectCredentialChangesV1 } from '@/core/session/mobile-subject-credential-changes';
import {
  readMobileReaderRecordContinuityV1,
  type MobileReaderRecordContinuityStateV1,
} from '@/features/records/mobile-reader-record-continuity-service';
import { MOBILE_READER_PRESENTATIONS_V1 } from '@/features/reading/mobile-reader-presentation';
import { mobileColors } from '@/ui/mobile-colors';

const READER_ID = /^[a-z][a-z0-9_-]{0,63}$/u;

function nameForReader(id: string) {
  return MOBILE_READER_PRESENTATIONS_V1.find(x => x.key === id)?.name ?? '대리자';
}

function ReaderStatusAction({
  readingId, readerCharacterId,
}: Readonly<{
  readingId: string;
  readerCharacterId: string;
}>) {
  const [result, setResult] = useState<MobileReaderRecordContinuityStateV1 | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const active = useRef<AbortController | null>(null);
  const focused = useRef(false);

  const clear = useCallback(() => {
    active.current?.abort();
    active.current = null;
    setResult(null);
    setMessage('');
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    return () => {
      focused.current = false;
      clear();
    };
  }, [clear]));

  useEffect(() => {
    clear();
    const appSubscription = AppState.addEventListener('change', appState => {
      if (appState !== 'active') clear();
    });
    const credentialSubscription = subscribeMobileSubjectCredentialChangesV1(clear);
    return () => {
      appSubscription.remove();
      credentialSubscription();
      active.current?.abort();
      active.current = null;
    };
  }, [readingId, readerCharacterId, clear]);

  async function checkCurrentAccess() {
    if (loading || !focused.current || AppState.currentState !== 'active') return;
    const controller = new AbortController();
    active.current?.abort();
    active.current = controller;
    setLoading(true);
    setResult(null);
    setMessage('현재 이용권과 기존 Reader 대화방을 확인 중입니다…');

    try {
      const state = await readMobileReaderRecordContinuityV1({
        readingId, readerCharacterId, signal: controller.signal,
      });
      if (active.current !== controller || controller.signal.aborted
          || !focused.current || AppState.currentState !== 'active') return;
      setResult(state);
      if (state.kind === 'held') {
        setMessage('유료 Reader 연결은 준비 중입니다. 공식 사주 기록 열람과는 별개입니다.');
      } else if (state.kind === 'auth_required') {
        setMessage('Reader 이용권을 확인하려면 회원 로그인이 필요합니다.');
      } else if (state.kind === 'not_confirmed') {
        setMessage('현재 이용권을 확인할 수 없습니다. 이전 대리자 기록은 현재 구매권이 아닙니다.');
      } else if (state.kind === 'not_available') {
        setMessage('현재 이 Reader의 해설·후속 대화 권한 또는 기존 대화방이 확인되지 않았습니다. 환불·회수를 임의로 단정하지 않습니다.');
      } else {
        setMessage('기존 대화방이 확인되었습니다. 이동 후 서버에서 권한을 다시 확인합니다.');
      }
    } catch {
      if (active.current === controller && !controller.signal.aborted) {
        setMessage('Reader 접근 상태를 확인하지 못했습니다. 다시 시도할 수 있습니다.');
      }
    } finally {
      if (active.current === controller) {
        active.current = null;
        setLoading(false);
      }
    }
  }

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={nameForReader(readerCharacterId) + '의 현재 구매권 확인'}
        onPress={() => void checkCurrentAccess()}
        disabled={loading}
        style={[styles.check, loading && styles.disabled]}
      >
        <Text style={styles.checkText}>
          {loading ? '확인 중…' : nameForReader(readerCharacterId) + ' 권한 확인'}
        </Text>
      </Pressable>
      {message.length > 0 && (
        <Text accessibilityLiveRegion="polite" style={styles.status}>{message}</Text>
      )}
      {result?.kind === 'existing_thread_candidate' && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="기존 Reader 대화방으로 이동"
          style={styles.chatAction}
          onPress={() => {
            // Navigation does not authorize a Reader message or paid source.
            // The receiving Chat/Reader transaction must check again.
            router.push(`/chat/${result.threadId}`);
          }}
        >
          <Text style={styles.chatText}>기존 대화방으로 이동 →</Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * Reader names attached to an Official Record are historical provenance.
 * The only action here is an explicit fresh per-Reader lookup; no automatic
 * purchase, LLM execution, new Chat creation or cached permission.
 */
export function MobileReaderRecordContinuity({
  readingId, readerCharacterIds,
}: Readonly<{
  readingId: string;
  readerCharacterIds: readonly string[];
}>) {
  const known = [...new Set(readerCharacterIds)].filter(
    id => typeof id === 'string' && READER_ID.test(id),
  );
  if (known.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.note}>
        해설에 참여한 대리자의 이력입니다. 현재 이용권이 남아 있는지는 별도로 확인합니다.
      </Text>
      {known.map(id => (
        <ReaderStatusAction key={id} readingId={readingId} readerCharacterId={id} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 10, paddingHorizontal: 15, paddingVertical: 13,
    borderWidth: 1, borderColor: mobileColors.border,
    borderRadius: 12, backgroundColor: mobileColors.surface,
  },
  note: { color: mobileColors.muted, fontSize: 12, lineHeight: 19 },
  row: { gap: 7 },
  check: {
    minHeight: 40, alignSelf: 'flex-start', justifyContent: 'center',
    paddingHorizontal: 13, borderWidth: 1,
    borderColor: mobileColors.border, borderRadius: 10,
  },
  checkText: { color: mobileColors.navy, fontSize: 13, fontWeight: '700' },
  disabled: { opacity: .6 },
  status: { color: mobileColors.muted, fontSize: 12, lineHeight: 19 },
  chatAction: { minHeight: 40, alignSelf: 'flex-start', justifyContent: 'center' },
  chatText: { color: mobileColors.navy, fontSize: 13, fontWeight: '800' },
});
