import { MobilePlannedUiQaSwitcherV1 } from '@/ui/MobilePlannedUiQaSwitcherV1';
import { useMobilePlannedUiPreviewSelectionV1, resolveMobilePlannedUiPreviewSelectionV1 } from '@/ui/mobile-planned-ui-preview-context-v1';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { plannedMobileUiPreviewLocaleV1, previewMobileAuthoredUiLabelV1 } from '@/ui/mobile-planned-ui-screen-preview-v1';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { mobileBirthServiceV1 } from '@/features/birth/native-mobile-birth-service';
import { ReadingSubnav } from '@/features/reading/ReadingSubnav';
import { MobileReaderPicker } from '@/features/reading/MobileReaderPicker';
import type { MobileReaderPresentationIdV1 } from '@/features/reading/mobile-reader-presentation';
import {
  BirthSummaryCard,
  CalculationCompleteness,
  DayMasterCard,
  ElementBalance,
  SajuPillarGrid,
} from '@/features/saju/SajuCalculationView';
import { loadMobileCurrentSajuV1, type MobileSajuLoadStateV1 } from '@/features/saju/mobile-saju-loader';
import { mobileSajuServiceV1 } from '@/features/saju/native-mobile-saju-service';
import { SajuPreviewReadingView } from '@/features/saju/SajuPreviewReadingView';
import { SajuEditorialSummary } from '@/features/saju/SajuEditorialSummary';
import { createMobileSajuViewModelV1 } from '@/features/saju/saju-view-model';
import { MobileScreen } from '@/ui/MobileScreen';
import { useMobileUiLocale } from '@/ui/mobile-ui-locale';
import { MobileUiText } from '@/ui/MobileUiText';
import { mobileColors } from '@/ui/mobile-colors';
import { useMobileThemedStyles } from '@/ui/use-mobile-themed-styles';
import { useMobilePullRefreshV1 } from '@/ui/use-mobile-pull-refresh';

type ScreenState =
  | Readonly<{ kind: 'loading' }>
  | MobileSajuLoadStateV1;

function errorCopy(state: Exclude<MobileSajuLoadStateV1, { kind: 'birth_required' | 'ready' }>) {
  switch (state.kind) {
    case 'auth_error':
      return '세션을 다시 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.';
    case 'saju_unavailable':
      return '현재 명식 계산 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.';
    case 'authority_mismatch':
      return '출생정보는 등록되어 있지만 현재 명식과 연결하지 못했습니다.';
    case 'error':
      return '현재 사주 정보를 불러오지 못했습니다.';
  }
}

export default function SajuScreen() {
  const styles = useMobileThemedStyles(staticStyles);
  const { t } = useMobileUiLocale();
  const { uiPreview } = useLocalSearchParams<{ uiPreview?: string | string[] }>();
  const sharedPreviewSelection = useMobilePlannedUiPreviewSelectionV1();
  const previewLocale = resolveMobilePlannedUiPreviewSelectionV1(
    plannedMobileUiPreviewLocaleV1(uiPreview, __DEV__), sharedPreviewSelection, __DEV__,
  );
  const previewText = (source: string) => previewMobileAuthoredUiLabelV1(source, previewLocale, t);
  const [state, setState] = useState<ScreenState>({ kind: 'loading' });
  const [presentationReader, setPresentationReader] = useState<MobileReaderPresentationIdV1>('seyeon');

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    setState(
      await loadMobileCurrentSajuV1({
        birthService: mobileBirthServiceV1,
        sajuService: mobileSajuServiceV1,
      }),
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const { refreshing, onRefresh } = useMobilePullRefreshV1(load);

  const viewModel = state.kind === 'ready'
    ? createMobileSajuViewModelV1({
        profile: state.profile,
        calculation: state.calculation,
      })
    : null;

  return (
    <MobileScreen
      eyebrow="READING"
      title={previewText('사주')}
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
      description={previewText('태어난 순간의 이야기를 바탕으로 나의 명식을 알아보세요.')}
    >
      <MobilePlannedUiQaSwitcherV1 />
      <ReadingSubnav />

      {state.kind === 'loading' ? (
        <View style={styles.stateCard}>
          <ActivityIndicator color={mobileColors.navy} />
          <MobileUiText style={styles.muted}>{previewText("현재 출생정보와 명식을 확인하는 중입니다…")}</MobileUiText>
        </View>
      ) : null}

      {state.kind === 'birth_required' ? (
        <View style={styles.stateCard}>
          <MobileUiText style={styles.cardTitle}>{previewText("출생정보가 필요합니다")}</MobileUiText>
          <MobileUiText style={styles.muted}>
            {previewText("내 명식을 계산하려면 현재 자기 출생정보를 먼저 등록해 주세요.")}
          </MobileUiText>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/birth')}
            style={styles.primaryButton}
          >
            <MobileUiText style={styles.primaryButtonText}>{previewText("출생정보 입력하기")}</MobileUiText>
          </Pressable>
        </View>
      ) : null}

      {viewModel !== null ? (
        <>
          <SajuEditorialSummary viewModel={viewModel} />
          <MobileReaderPicker selected={presentationReader} onChange={setPresentationReader} vertical="saju" />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('선택한 Reader와 전체 사주 읽기 시작')}
            onPress={() => router.push({
              pathname: '/reading/scene',
              params: { reader: presentationReader, topic: 'temperament' },
            })}
            style={styles.primaryButton}
          >
            <MobileUiText style={styles.primaryButtonText}>{previewText("선택한 연결자로 사주 읽기 시작 →")}</MobileUiText>
          </Pressable>
          <SajuPreviewReadingView
            onOpenPreview={(topic) => router.push({
              pathname: '/reading/scene',
              params: { reader: presentationReader, topic: topic.key },
            })}
          />
          <BirthSummaryCard summary={viewModel.birthSummary} />
          <SajuPillarGrid pillars={viewModel.pillars} />
          <DayMasterCard dayMaster={viewModel.dayMaster} />
          <ElementBalance elementBalance={viewModel.elementBalance} />
          <CalculationCompleteness completeness={viewModel.completeness} />
        </>
      ) : null}

      {state.kind === 'auth_error' ||
      state.kind === 'saju_unavailable' ||
      state.kind === 'authority_mismatch' ||
      state.kind === 'error' ? (
        <View style={styles.stateCard}>
          <Text style={styles.error}>{errorCopy(state)}</Text>
          {state.retryable ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void load()}
              style={styles.secondaryButton}
            >
              <MobileUiText style={styles.secondaryButtonText}>{previewText("다시 시도")}</MobileUiText>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  stateCard: {
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 18,
    backgroundColor: mobileColors.surface,
    padding: 20,
    gap: 12,
  },
  cardTitle: { color: mobileColors.ink, fontSize: 20, fontWeight: '800' },
  muted: { color: mobileColors.muted, fontSize: 15, lineHeight: 22 },
  error: { color: mobileColors.seal, fontSize: 14, lineHeight: 20 },
  primaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: mobileColors.navy,
  },
  primaryButtonText: { color: mobileColors.surface, fontSize: 15, fontWeight: '800' },
  secondaryButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 12,
  },
  secondaryButtonText: { color: mobileColors.navy, fontSize: 15, fontWeight: '700' },
});
const staticStyles = styles;
