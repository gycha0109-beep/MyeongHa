import {
  MyeongHaApiClientErrorV1,
  type SajuPreviewReadingResultV1,
} from '@myeongha/api-client';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  MOBILE_SAJU_TOPIC_SECTIONS_V1,
  type MobileSajuTopicV1,
} from './mobile-saju-topic-catalog';
import { mobileSajuPreviewServiceV1 } from './native-mobile-saju-preview-service';
import { mobileColors } from '@/ui/mobile-colors';
import { MobileUiText } from '@/ui/MobileUiText';
import { useMobileThemedStyles } from '@/ui/use-mobile-themed-styles';
import { useMobileUiLocale } from '@/ui/mobile-ui-locale';
import { formatMobileUiCopy } from '@/ui/mobile-ui-copy';

type PreviewReadingTextV1 = Extract<
  MobileSajuTopicV1['availability'],
  { kind: 'preview' }
>['readingText'];

type PreviewStateV1 =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'blocked'; topic: MobileSajuTopicV1; message: string }>
  | Readonly<{
      kind: 'loading';
      topic: MobileSajuTopicV1;
      readingText: PreviewReadingTextV1;
    }>
  | Readonly<{
      kind: 'ready';
      topic: MobileSajuTopicV1;
      readingText: PreviewReadingTextV1;
      result: Extract<SajuPreviewReadingResultV1, { kind: 'delivered' }>;
    }>
  | Readonly<{
      kind: 'not_delivered';
      topic: MobileSajuTopicV1;
      readingText: PreviewReadingTextV1;
      result: Extract<SajuPreviewReadingResultV1, { kind: 'not_delivered' }>;
    }>
  | Readonly<{
      kind: 'error';
      topic: MobileSajuTopicV1;
      readingText: PreviewReadingTextV1;
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

export function SajuPreviewReadingView({ onOpenPreview }: { onOpenPreview?: (topic: MobileSajuTopicV1) => void }) {
  const styles = useMobileThemedStyles(staticStyles);
  const { t, locale } = useMobileUiLocale();
  const [state, setState] = useState<PreviewStateV1>({ kind: 'idle' });

  async function load(
    topic: MobileSajuTopicV1,
    readingText: PreviewReadingTextV1,
  ) {
    setState(Object.freeze({ kind: 'loading', topic, readingText }));
    try {
      const result = await mobileSajuPreviewServiceV1.read(readingText);
      if (result.kind === 'delivered') {
        setState(Object.freeze({
          kind: 'ready',
          topic,
          readingText,
          result,
        }));
      } else {
        setState(Object.freeze({
          kind: 'not_delivered',
          topic,
          readingText,
          result,
        }));
      }
    } catch (error) {
      const mapped = errorCopy(error);
      setState(Object.freeze({
        kind: 'error',
        topic,
        readingText,
        message: mapped.message,
        retryable: mapped.retryable,
      }));
    }
  }

  function selectTopic(topic: MobileSajuTopicV1) {
    const availability = topic.availability;
    if (availability.kind === 'preview') {
      if (onOpenPreview !== undefined) {
        onOpenPreview(topic);
        return;
      }
      void load(topic, availability.readingText);
      return;
    }
    setState(Object.freeze({
      kind: 'blocked',
      topic,
      message: availability.message,
    }));
  }

  const selectedKey = state.kind === 'idle' ? null : state.topic.key;
  const pending = state.kind === 'loading';

  return (
    <View style={styles.section}>
      <View style={styles.headerCard}>
        <MobileUiText style={styles.eyebrow}>DISCOVER YOUR STORY · 사주</MobileUiText>
        <MobileUiText style={styles.title}>사주 읽기</MobileUiText>
        <MobileUiText style={styles.body}>
          궁금한 주제를 선택해 더 깊이 살펴보세요. 준비된 풀이만 연결되며,
          아직 확인이 필요한 주제는 현재 상태를 안내합니다.
        </MobileUiText>
        <MobileUiText style={styles.authorityNote}>
          다른 주제의 풀이로 자동 대체하지 않습니다.
        </MobileUiText>
      </View>

      {MOBILE_SAJU_TOPIC_SECTIONS_V1.map((section) => (
        <View key={section.key} style={styles.topicSection}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>{t(section.title)}</Text>
            {section.support ? (
              <Text style={styles.sectionSupport}>{t(section.support)}</Text>
            ) : null}
          </View>

          <View style={styles.topicList}>
            {section.topics.map((topic) => {
              const active = selectedKey === topic.key;
              return (
                <Pressable
                  key={topic.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active, disabled: pending }}
                  disabled={pending}
                  onPress={() => selectTopic(topic)}
                  style={[
                    styles.topicCard,
                    active && styles.topicCardActive,
                    pending && styles.disabled,
                  ]}
                >
                  <View style={[styles.topicIcon, active && styles.topicIconActive]}>
                    <Text style={[styles.topicIconText, active && styles.topicIconTextActive]}>
                      {topic.icon}
                    </Text>
                  </View>

                  <View style={styles.topicCopy}>
                    <View style={styles.topicTitleRow}>
                      <Text style={styles.topicTitle}>{t(topic.label)}</Text>
                      <View
                        style={[
                          styles.statusBadge,
                          topic.availability.kind === 'preview'
                            ? styles.statusBadgeReady
                            : styles.statusBadgeBlocked,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusBadgeText,
                            topic.availability.kind === 'preview'
                              ? styles.statusBadgeTextReady
                              : styles.statusBadgeTextBlocked,
                          ]}
                        >
                          {t(topic.availability.statusLabel)}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.topicDescription}>{t(topic.description)}</Text>
                  </View>

                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}

      {state.kind === 'blocked' ? (
        <View style={styles.stateCard}>
          <MobileUiText style={styles.stateKicker}>현재 실행 범위</MobileUiText>
          <Text style={styles.stateTitle}>{t(state.topic.label)}</Text>
          <Text style={styles.muted}>{t(state.message)}</Text>
          <MobileUiText style={styles.authorityNote}>
            웹과 동일하게 권한이 열리기 전에는 다른 풀이를 대신 실행하지 않습니다.
          </MobileUiText>
        </View>
      ) : null}

      {state.kind === 'loading' ? (
        <View style={styles.stateCard}>
          <ActivityIndicator color={mobileColors.navy} />
          <Text style={styles.muted}>{t('{topic} 프리뷰를 준비하고 있습니다…').replace('{topic}', t(state.topic.label))}</Text>
        </View>
      ) : null}

      {state.kind === 'not_delivered' ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>{t(state.topic.label)}</Text>
          <Text style={styles.muted}>{t(notDeliveredCopy(state.result.responseState))}</Text>
          {state.result.responseState === 'temporarily_unavailable' ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void load(state.topic, state.readingText)}
              style={styles.retryButton}
            >
              <MobileUiText style={styles.retryButtonText}>다시 시도</MobileUiText>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {state.kind === 'error' ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>{t(state.topic.label)}</Text>
          <Text style={styles.error}>{t(state.message)}</Text>
          {state.retryable ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void load(state.topic, state.readingText)}
              style={styles.retryButton}
            >
              <MobileUiText style={styles.retryButtonText}>다시 시도</MobileUiText>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {state.kind === 'ready' ? (
        <>
          <View style={styles.resultHeading}>
            <Text style={styles.resultTitle}>{t(state.topic.label)}</Text>
            <MobileUiText style={styles.authorityNote}>
              Preview · 연구 검증 중인 원국 해석이며 확정적 미래 예측은 포함하지 않습니다.
            </MobileUiText>
          </View>

          {state.result.notices.length > 0 ? (
            <View style={styles.noticeCard}>
              <MobileUiText style={styles.noticeTitle}>읽기 범위 안내</MobileUiText>
              {state.result.notices.map((notice, index) => (
                <Text key={`${String(index)}:${notice}`} style={styles.noticeText}>
                  {notice}
                </Text>
              ))}
            </View>
          ) : null}

          {state.result.steps.map((step, index) => (
            <View key={`${String(index)}:${step.title}`} style={styles.readingCard}>
              <Text style={styles.stepIndex}>{formatMobileUiCopy('읽기 {index}', { index: index + 1 }, locale)}</Text>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.primaryText}>{step.primary}</Text>

              {step.structure.length > 0 ? (
                <View style={styles.supportBlock}>
                  <MobileUiText style={styles.supportTitle}>이 해석의 사주 근거</MobileUiText>
                  {step.structure.map((text, itemIndex) => (
                    <Text key={`structure:${String(itemIndex)}:${text}`} style={styles.supportText}>
                      {text}
                    </Text>
                  ))}
                </View>
              ) : null}

              {step.supporting.length > 0 ? (
                <View style={styles.supportBlock}>
                  <MobileUiText style={styles.supportTitle}>함께 볼 포인트</MobileUiText>
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
  section: { gap: 18 },
  headerCard: {
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 14,
    backgroundColor: mobileColors.surface,
    padding: 22,
    gap: 10,
  },
  eyebrow: {
    color: mobileColors.gold,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  title: { color: mobileColors.ink, fontSize: 24, fontWeight: '900', letterSpacing: -0.4 },
  body: { color: mobileColors.muted, fontSize: 14, lineHeight: 21 },
  authorityNote: { color: mobileColors.muted, fontSize: 11, lineHeight: 17 },
  topicSection: { gap: 10 },
  sectionHeading: { gap: 3, paddingHorizontal: 2 },
  sectionTitle: { color: mobileColors.ink, fontSize: 19, fontWeight: '800' },
  sectionSupport: { color: mobileColors.muted, fontSize: 12, lineHeight: 18 },
  topicList: { gap: 10 },
  topicCard: {
    minHeight: 90,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 17,
    backgroundColor: mobileColors.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  topicCardActive: {
    borderColor: mobileColors.navy,
  },
  topicIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: mobileColors.canvas,
  },
  topicIconActive: { backgroundColor: mobileColors.navy },
  topicIconText: { color: mobileColors.gold, fontSize: 18, fontWeight: '800' },
  topicIconTextActive: { color: mobileColors.surface },
  topicCopy: { flex: 1, gap: 5 },
  topicTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  topicTitle: { color: mobileColors.ink, fontSize: 17, fontWeight: '800' },
  topicDescription: { color: mobileColors.muted, fontSize: 12, lineHeight: 19 },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  statusBadgeReady: {
    borderColor: mobileColors.navy,
    backgroundColor: mobileColors.navy,
  },
  statusBadgeBlocked: {
    borderColor: mobileColors.border,
    backgroundColor: mobileColors.canvas,
  },
  statusBadgeText: { fontSize: 10, fontWeight: '800' },
  statusBadgeTextReady: { color: mobileColors.surface },
  statusBadgeTextBlocked: { color: mobileColors.muted },
  chevron: { color: mobileColors.gold, fontSize: 24, fontWeight: '500' },
  disabled: { opacity: 0.55 },
  stateCard: {
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 16,
    backgroundColor: mobileColors.surface,
    padding: 18,
    gap: 10,
  },
  stateKicker: {
    color: mobileColors.gold,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  stateTitle: { color: mobileColors.ink, fontSize: 18, fontWeight: '800' },
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
  resultHeading: { gap: 5, paddingHorizontal: 2 },
  resultTitle: { color: mobileColors.ink, fontSize: 20, fontWeight: '800' },
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
  stepIndex: {
    color: mobileColors.gold,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
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
const staticStyles = styles;
