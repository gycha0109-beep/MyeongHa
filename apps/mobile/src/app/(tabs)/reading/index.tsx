import type { CurrentBirthProfileV1 } from '@myeongha/api-client';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { mobileBirthServiceV1 } from '@/features/birth/mobile-birth-service';
import { ReadingSubnav } from '@/features/reading/ReadingSubnav';
import { MobileScreen } from '@/ui/MobileScreen';
import { mobileColors } from '@/ui/mobile-colors';

type ScreenState =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'birth_required' }>
  | Readonly<{ kind: 'ready'; profile: CurrentBirthProfileV1 }>
  | Readonly<{ kind: 'error'; message: string }>;

function formatBirthSummary(profile: CurrentBirthProfileV1): string {
  const input = profile.currentRevision.input;
  const date = input.birthDate.replaceAll('-', '.');
  const time = input.timeKnown && input.birthTime !== null
    ? input.birthTime.slice(0, 5)
    : '시간 모름';
  const calendar = input.calendarType === 'lunar' ? '음력' : '양력';
  return `${date} · ${time} · ${calendar}`;
}

export default function SajuScreen() {
  const [state, setState] = useState<ScreenState>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const profile = await mobileBirthServiceV1.readCurrent();
      setState(profile === null ? { kind: 'birth_required' } : { kind: 'ready', profile });
    } catch {
      setState({
        kind: 'error',
        message: '현재 출생정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <MobileScreen
      eyebrow="READING"
      title="사주"
      description="현재 자기 Birth Profile을 기준으로 명식을 이어갑니다."
    >
      <ReadingSubnav />

      {state.kind === 'loading' ? (
        <View style={styles.stateCard}>
          <ActivityIndicator color={mobileColors.navy} />
          <Text style={styles.muted}>현재 출생정보를 확인하는 중입니다…</Text>
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

      {state.kind === 'ready' ? (
        <View style={styles.stateCard}>
          <Text style={styles.cardEyebrow}>CURRENT BIRTH PROFILE</Text>
          <Text style={styles.cardTitle}>내 출생정보</Text>
          <Text style={styles.birthSummary}>{formatBirthSummary(state.profile)}</Text>
          <Text style={styles.muted}>
            현재 revision {state.profile.currentRevision.revisionNo}에 연결되어 있습니다.
            실제 명식 계산과 사주 카드 표시는 M3-C에서 이 authority를 그대로 사용합니다.
          </Text>
        </View>
      ) : null}

      {state.kind === 'error' ? (
        <View style={styles.stateCard}>
          <Text style={styles.error}>{state.message}</Text>
          <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>다시 시도</Text>
          </Pressable>
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
  cardEyebrow: { color: mobileColors.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  cardTitle: { color: mobileColors.ink, fontSize: 20, fontWeight: '800' },
  birthSummary: { color: mobileColors.navy, fontSize: 18, fontWeight: '700' },
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
