import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { mobileBirthServiceV1 } from '@/features/birth/native-mobile-birth-service';
import { ReadingSubnav } from '@/features/reading/ReadingSubnav';
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
import { createMobileSajuViewModelV1 } from '@/features/saju/saju-view-model';
import { MobileScreen } from '@/ui/MobileScreen';
import { mobileColors } from '@/ui/mobile-colors';

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
  const [state, setState] = useState<ScreenState>({ kind: 'loading' });

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

  const viewModel = state.kind === 'ready'
    ? createMobileSajuViewModelV1({
        profile: state.profile,
        calculation: state.calculation,
      })
    : null;

  return (
    <MobileScreen
      eyebrow="READING"
      title="사주"
      description="현재 Birth revision의 계산 사실과 서버에서 검증된 사주 프리뷰를 확인합니다."
    >
      <ReadingSubnav />

      {state.kind === 'loading' ? (
        <View style={styles.stateCard}>
          <ActivityIndicator color={mobileColors.navy} />
          <Text style={styles.muted}>현재 출생정보와 명식을 확인하는 중입니다…</Text>
        </View>
      ) : null}

      {state.kind === 'birth_required' ? (
        <View style={styles.stateCard}>
          <Text style={styles.cardTitle}>출생정보가 필요합니다</Text>
          <Text style={styles.muted}>
            내 명식을 계산하려면 현재 자기 출생정보를 먼저 등록해 주세요.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/birth')}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>출생정보 입력하기</Text>
          </Pressable>
        </View>
      ) : null}

      {viewModel !== null ? (
        <>
          <BirthSummaryCard summary={viewModel.birthSummary} />
          <SajuPillarGrid pillars={viewModel.pillars} />
          <DayMasterCard dayMaster={viewModel.dayMaster} />
          <ElementBalance elementBalance={viewModel.elementBalance} />
          <CalculationCompleteness completeness={viewModel.completeness} />
          <SajuPreviewReadingView />
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
              <Text style={styles.secondaryButtonText}>다시 시도</Text>
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
