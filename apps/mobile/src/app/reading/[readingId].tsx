import {
  MyeongHaApiClientErrorV1,
  type OfficialReadingRecordV1,
} from '@myeongha/api-client';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

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

  const load = useCallback(async () => {
    setState(Object.freeze({ kind: 'loading' as const }));
    try {
      const record = await mobileRecordsServiceV1.readOfficialReading(readingId);
      setState(Object.freeze({ kind: 'ready' as const, record }));
    } catch (error) {
      setState(errorState(error));
    }
  }, [readingId]);

  useEffect(() => {
    void load();
  }, [load]);

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
