import {
  MyeongHaApiClientErrorV1,
  SAJU_PREVIEW_READING_TEXTS_V1,
  type SajuPreviewReadingResultV1,
  type SajuPreviewReadingTextV1,
} from '@myeongha/api-client';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { mobileSajuPreviewServiceV1 } from './native-mobile-saju-preview-service';
import { mobileColors } from '@/ui/mobile-colors';

type PreviewStateV1 =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'loading'; readingText: SajuPreviewReadingTextV1 }>
  | Readonly<{
      kind: 'ready';
      readingText: SajuPreviewReadingTextV1;
      result: Extract<SajuPreviewReadingResultV1, { kind: 'delivered' }>;
    }>
  | Readonly<{
      kind: 'not_delivered';
      readingText: SajuPreviewReadingTextV1;
      result: Extract<SajuPreviewReadingResultV1, { kind: 'not_delivered' }>;
    }>
  | Readonly<{
      kind: 'error';
      readingText: SajuPreviewReadingTextV1;
      message: string;
      retryable: boolean;
    }>;

function notDeliveredCopy(
  state: Extract<SajuPreviewReadingResultV1, { kind: 'not_delivered' }>['responseState'],
): string {
  if (state === 'partial_evidence' || state === 'insufficient_evidence') {
    return '현재 이 주제를 표시할 만큼 검증된 해석 근거가 충분하지 않습니다.';
  }
  if (state === 'temporarily_unavailable') {
    return '현재 사주 프리뷰를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.';
  }
  if (state === 'clarification_required') {
    return '추가 확인이 필요한 응답이라 현재 모바일 프리뷰에서는 표시하지 않습니다.';
  }
  return '현재 승인된 프리뷰 범위에서는 이 결과를 표시할 수 없습니다.';
}

function errorCopy(error: unknown): Readonly<{ message: string; retryable: boolean }> {
  if (error instanceof MyeongHaApiClientErrorV1) {
    if (error.code === 'NOT_FOUND') {
      return Object.freeze({
        message: '현재 출생정보를 찾지 못했습니다. 출생정보를 다시 확인해 주세요.',
        retryable: false,
      });
    }
    if (error.code === 'SAJU_PREVIEW_READING_UNAVAILABLE') {
      return Object.freeze({
        message: '현재 승인된 사주 프리뷰 주제가 아닙니다.',
        retryable: false,
      });
    }
    if (error.code === 'API_SAJU_PREVIEW_RESPONSE_INVALID') {
      return Object.freeze({
        message: '검증된 사주 프리뷰 응답을 안전하게 표시할 수 없습니다.',
        retryable: false,
      });
    }
    if (error.kind === 'network' || error.retryable) {
      return Object.freeze({
        message: '사주 프리뷰 서비스에 연결하지 못했습니다.',
        retryable: true,
      });
    }
  }
  return Object.freeze({
    message: '사주 프리뷰를 불러오지 못했습니다.',
    retryable: false,
  });
}

export function SajuPreviewReadingView() {
  const [state, setState] = useState<PreviewStateV1>({ kind: 'idle' });

  async function load(readingText: SajuPreviewReadingTextV1) {
    setState(Object.freeze({ kind: 'loading', readingText }));
    try {
      const result = await mobileSajuPreviewServiceV1.read(readingText);
      if (result.kind === 'delivered') {
        setState(Object.freeze({
          kind: 'ready',
          readingText,
          result,
        }));
      } else {
        setState(Object.freeze({
          kind: 'not_delivered',
          readingText,
          result,
        }));
      }
    } catch (error) {
      const mapped = errorCopy(error);
      setState(Object.freeze({
        kind: 'error',
        readingText,
        message: mapped.message,
        retryable: mapped.retryable,
      }));
    }
  }

  const selected = state.kind === 'idle' ? null : state.readingText;
  const pending = state.kind === 'loading';

  return (
    <View style={styles.section}>
      <View style={styles.headerCard}>
        <Text style={styles.eyebrow}>PREVIEW READING</Text>
        <Text style={styles.title}>사주 프리뷰</Text>
        <Text style={styles.body}>
          현재 출생정보를 기준으로 서버에서 검증된 Product Reading을 불러옵니다.
          모바일은 결과를 새로 만들거나 보강하지 않습니다.
        </Text>
        <View style={styles.topicWrap}>
          {SAJU_PREVIEW_READING_TEXTS_V1.map((readingText) => {
            const active = selected === readingText;
            return (
              <Pressable
                key={readingText}
                accessibilityRole="button"
                disabled={pending}
                onPress={() => void load(readingText)}
                style={[
                  styles.topicButton,
                  active && styles.topicButtonActive,
                  pending && styles.disabled,
                ]}
              >
                <Text style={[
                  styles.topicButtonText,
                  active && styles.topicButtonTextActive,
                ]}>
                  {readingText}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.authorityNote}>
          Preview · 연구 검증 중인 원국 해석이며 확정적 미래 예측은 포함하지 않습니다.
        </Text>
      </View>

      {state.kind === 'loading' ? (
        <View style={styles.stateCard}>
          <ActivityIndicator color={mobileColors.navy} />
          <Text style={styles.muted}>{state.readingText} 프리뷰를 준비하고 있습니다…</Text>
        </View>
      ) : null}

      {state.kind === 'not_delivered' ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>{state.readingText}</Text>
          <Text style={styles.muted}>{notDeliveredCopy(state.result.responseState)}</Text>
          {state.result.responseState === 'temporarily_unavailable' ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void load(state.readingText)}
              style={styles.retryButton}
            >
              <Text style={styles.retryButtonText}>다시 시도</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {state.kind === 'error' ? (
        <View style={styles.stateCard}>
          <Text style={styles.error}>{state.message}</Text>
          {state.retryable ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void load(state.readingText)}
              style={styles.retryButton}
            >
              <Text style={styles.retryButtonText}>다시 시도</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {state.kind === 'ready' ? (
        <>
          {state.result.notices.length > 0 ? (
            <View style={styles.noticeCard}>
              <Text style={styles.noticeTitle}>읽기 범위 안내</Text>
              {state.result.notices.map((notice, index) => (
                <Text key={`${String(index)}:${notice}`} style={styles.noticeText}>
                  {notice}
                </Text>
              ))}
            </View>
          ) : null}

          {state.result.steps.map((step, index) => (
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
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  headerCard: {
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 18,
    backgroundColor: mobileColors.surface,
    padding: 20,
    gap: 10,
  },
  eyebrow: { color: mobileColors.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  title: { color: mobileColors.ink, fontSize: 20, fontWeight: '800' },
  body: { color: mobileColors.muted, fontSize: 14, lineHeight: 21 },
  topicWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 2 },
  topicButton: {
    minHeight: 38,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 999,
    paddingHorizontal: 13,
    backgroundColor: mobileColors.canvas,
  },
  topicButtonActive: {
    borderColor: mobileColors.navy,
    backgroundColor: mobileColors.navy,
  },
  topicButtonText: { color: mobileColors.navy, fontSize: 13, fontWeight: '800' },
  topicButtonTextActive: { color: mobileColors.surface },
  disabled: { opacity: 0.55 },
  authorityNote: { color: mobileColors.muted, fontSize: 11, lineHeight: 17 },
  stateCard: {
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 16,
    backgroundColor: mobileColors.surface,
    padding: 18,
    gap: 10,
  },
  stateTitle: { color: mobileColors.ink, fontSize: 17, fontWeight: '800' },
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
  retryButtonText: { color: mobileColors.navy, fontSize: 14, fontWeight: '800' },
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
