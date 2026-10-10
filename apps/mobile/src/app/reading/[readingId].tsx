import {
  MyeongHaApiClientErrorV1,
  type OfficialReadingRecordV1,
} from '@myeongha/api-client';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { MobileOfficialReadingReaderEntry } from '@/features/reading/MobileOfficialReadingReaderEntry';
import { subscribeMobileSubjectCredentialChangesV1 } from '@/core/session/mobile-subject-credential-changes';
import { mobileRecordsServiceV1 } from '@/features/records/native-mobile-records-service';
import {
  formatRecordDateV1,
  readingReaderLabelV1,
  readingTitleV1,
} from '@/features/records/records-view-model';
import { mobileColors } from '@/ui/mobile-colors';

type DetailStateV1 =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'ready'; record: OfficialReadingRecordV1 }>
  | Readonly<{ kind: 'error'; message: string; retryable: boolean }>;

function errorState(error: unknown): Extract<DetailStateV1, { kind: 'error' }> {
  if (error instanceof MyeongHaApiClientErrorV1) {
    if (error.code === 'CLIENT_RECORDS_SESSION_CHANGED') {
      return Object.freeze({
        kind: 'error' as const,
        message: '로그인 상태가 변경되어 이전 계정의 공식 풀이를 표시하지 않았습니다.',
        retryable: false,
      });
    }
    if (
      error.code === 'CLIENT_OFFICIAL_READING_ID_INVALID' ||
      error.code === 'NOT_FOUND'
    ) {
      return Object.freeze({
        kind: 'error' as const,
        message: '현재 기록에서 이 저장된 풀이를 찾을 수 없습니다.',
        retryable: false,
      });
    }
    if (
      error.code === 'API_RECORDS_RESPONSE_INVALID' ||
      error.code === 'API_PRODUCT_READING_RESPONSE_INVALID'
    ) {
      return Object.freeze({
        kind: 'error' as const,
        message: '저장된 공식 풀이를 안전하게 표시할 수 없습니다.',
        retryable: false,
      });
    }
    if (error.kind === 'network' || error.retryable) {
      return Object.freeze({
        kind: 'error' as const,
        message: '저장된 풀이를 불러오지 못했습니다.',
        retryable: true,
      });
    }
  }
  return Object.freeze({
    kind: 'error' as const,
    message: '저장된 풀이를 불러오지 못했습니다.',
    retryable: false,
  });
}

export default function OfficialReadingDetailScreen() {
  const params = useLocalSearchParams<{ readingId?: string | string[] }>();
  const readingId = typeof params.readingId === 'string' ? params.readingId : '';
  const [state, setState] = useState<DetailStateV1>({ kind: 'loading' });
  const focused = useRef(false);
  const requestEpoch = useRef(0);

  const load = useCallback(async () => {
    const epoch = ++requestEpoch.current;
    setState(Object.freeze({ kind: 'loading' as const }));
    try {
      const record = await mobileRecordsServiceV1.readOfficialReading(readingId);
      if (focused.current && epoch === requestEpoch.current) {
        setState(Object.freeze({ kind: 'ready' as const, record }));
      }
    } catch (error) {
      if (focused.current && epoch === requestEpoch.current) {
        setState(errorState(error));
      }
    }
  }, [readingId]);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    const unsubscribe = subscribeMobileSubjectCredentialChangesV1(() => {
      // A verified credential mutation immediately hides the old archived
      // Reading, including while this route remains focused.
      requestEpoch.current += 1;
      setState(Object.freeze({ kind: 'loading' as const }));
      void load();
    });
    void load();
    return () => {
      unsubscribe();
      focused.current = false;
      requestEpoch.current += 1;
      // Archive content must not remain on a blurred or replaced route.
      setState(Object.freeze({ kind: 'loading' as const }));
    };
  }, [load]));

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text style={styles.backText}>← 기록으로 돌아가기</Text>
        </Pressable>

        {state.kind === 'loading' ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color={mobileColors.navy} />
            <Text style={styles.muted}>저장된 공식 풀이를 불러오는 중입니다…</Text>
          </View>
        ) : null}

        {state.kind === 'error' ? (
          <View style={styles.stateCard}>
            <Text style={styles.error}>{state.message}</Text>
            {state.retryable ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void load()}
                style={styles.retryButton}
              >
                <Text style={styles.retryText}>다시 시도</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {state.kind === 'ready' ? (
          <>
            <View style={styles.headerCard}>
              <Text style={styles.eyebrow}>OFFICIAL READING ARCHIVE</Text>
              <Text style={styles.title}>{readingTitleV1(state.record.sajuDomain)}</Text>
              <Text style={styles.meta}>
                {formatRecordDateV1(state.record.completedAt)} · {readingReaderLabelV1(state.record.readerCharacterIds)}
              </Text>
              <Text style={styles.authority}>
                기록 · 당시 저장된 공식 사주 풀이를 그대로 다시 읽고 있습니다.
              </Text>
            </View>

            <View style={styles.readerCard}>
              <Text style={styles.readerCardTitle}>이 공식 Reading과 Reader</Text>
              <Text style={styles.readerCardText}>
                {state.record.readerCharacterIds.length > 0
                  ? `공식 기록에 연결된 Reader 정보: ${state.record.readerCharacterIds.length}명`
                  : '이 공식 기록에 연결된 Reader 정보가 없습니다.'}
              </Text>
              <Text style={styles.readerCardText}>
                Reader 연결 정보는 해설 구매·열람 권한 또는 해설 완료의 증명이 아닙니다.
                Reader별 해설 다시 보기와 후속 대화는 별도의 서버 권한·기록 계약이 승인된 뒤 제공됩니다.
              </Text>
            </View>

            {state.record.display.notices.length > 0 ? (
              <View style={styles.noticeCard}>
                <Text style={styles.noticeTitle}>읽기 범위 안내</Text>
                {state.record.display.notices.map((notice, index) => (
                  <Text key={`${String(index)}:${notice}`} style={styles.noticeText}>
                    {notice}
                  </Text>
                ))}
              </View>
            ) : null}

            {state.record.display.steps.map((step, index) => (
              <View key={`${String(index)}:${step.title}`} style={styles.readingCard}>
                <Text style={styles.stepIndex}>읽기 {index + 1}</Text>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.primaryText}>{step.primary}</Text>

                {step.structure.length > 0 ? (
                  <View style={styles.supportBlock}>
                    <Text style={styles.supportTitle}>이 해석의 사주 근거</Text>
                    {step.structure.map((text, itemIndex) => (
                      <Text key={`structure:${String(itemIndex)}:${text}`} style={styles.supportText}>
                        {text}
                      </Text>
                    ))}
                  </View>
                ) : null}

                {step.supporting.length > 0 ? (
                  <View style={styles.supportBlock}>
                    <Text style={styles.supportTitle}>함께 볼 포인트</Text>
                    {step.supporting.map((text, itemIndex) => (
                      <Text key={`support:${String(itemIndex)}:${text}`} style={styles.supportText}>
                        {text}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
            ))}

            <MobileOfficialReadingReaderEntry record={state.record} />
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: mobileColors.canvas },
  content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 36, gap: 12 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 8 },
  backText: { color: mobileColors.navy, fontSize: 14, fontWeight: '800' },
  stateCard: {
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 18,
    backgroundColor: mobileColors.surface,
    padding: 22,
    gap: 12,
  },
  headerCard: {
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 18,
    backgroundColor: mobileColors.surface,
    padding: 20,
    gap: 9,
  },
  eyebrow: { color: mobileColors.gold, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  title: { color: mobileColors.ink, fontSize: 27, fontWeight: '800' },
  meta: { color: mobileColors.muted, fontSize: 13, lineHeight: 19 },
  authority: { color: mobileColors.navy, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  muted: { color: mobileColors.muted, fontSize: 14, lineHeight: 21 },
  error: { color: mobileColors.seal, fontSize: 14, lineHeight: 20 },
  retryButton: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 12,
  },
  retryText: { color: mobileColors.navy, fontSize: 13, fontWeight: '800' },
  readerCard: {
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 16,
    backgroundColor: mobileColors.surface,
    padding: 16,
    gap: 8,
  },
  readerCardTitle: { color: mobileColors.navy, fontSize: 15, fontWeight: '800' },
  readerCardText: { color: mobileColors.muted, fontSize: 13, lineHeight: 19 },
  noticeCard: {
    borderWidth: 1,
    borderColor: mobileColors.gold,
    borderRadius: 16,
    backgroundColor: mobileColors.surface,
    padding: 16,
    gap: 7,
  },
  noticeTitle: { color: mobileColors.navy, fontSize: 14, fontWeight: '800' },
  noticeText: { color: mobileColors.muted, fontSize: 13, lineHeight: 19 },
  readingCard: {
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 18,
    backgroundColor: mobileColors.surface,
    padding: 20,
    gap: 10,
  },
  stepIndex: { color: mobileColors.gold, fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  stepTitle: { color: mobileColors.ink, fontSize: 19, fontWeight: '800' },
  primaryText: { color: mobileColors.navy, fontSize: 16, lineHeight: 24, fontWeight: '700' },
  supportBlock: {
    borderTopWidth: 1,
    borderTopColor: mobileColors.border,
    paddingTop: 10,
    gap: 6,
  },
  supportTitle: { color: mobileColors.ink, fontSize: 13, fontWeight: '800' },
  supportText: { color: mobileColors.muted, fontSize: 13, lineHeight: 20 },
});
