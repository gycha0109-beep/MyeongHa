import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import type { BirthProfileCreateRequestV1 } from '@myeongha/api-client';

import { getMobileApiClientV1 } from '@/core/api/mobile-api-client';
import { mobileGuestCredentialStoreV1 } from '@/core/auth/native-guest-credential-store';
import { ReadingSubnav } from '@/features/reading/ReadingSubnav';
import {
  createMobileBirthAndSajuV1,
  loadMobileSajuV1,
  type MobileSajuLoadStateV1,
} from '@/features/saju/mobile-saju-runtime';
import { BirthProfileForm } from '@/features/saju/BirthProfileForm';
import { SajuCalculationCard } from '@/features/saju/SajuCalculationCard';
import { MobileScreen } from '@/ui/MobileScreen';
import { mobileColors } from '@/ui/mobile-colors';

type ViewState =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'loaded'; data: MobileSajuLoadStateV1 }>
  | Readonly<{ kind: 'error'; message: string }>;

function publicErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (code === 'SAJU_TEMPORARILY_UNAVAILABLE') {
      return '현재 사주 계산 서비스를 잠시 사용할 수 없습니다. 잠시 뒤 다시 시도해 주세요.';
    }
    if (code === 'AUTH_REQUIRED') {
      return '현재 세션을 확인할 수 없습니다. 다시 시도해 주세요.';
    }
    if (code === 'INVALID_REQUEST') {
      return '입력한 출생 정보를 처리하지 못했습니다. 내용을 확인해 주세요.';
    }
  }
  return '현재 사주 정보를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.';
}

export function SajuScreen() {
  const [state, setState] = useState<ViewState>({ kind: 'loading' });
  const [submitting, setSubmitting] = useState(false);

  const reload = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const data = await loadMobileSajuV1({
        client: getMobileApiClientV1(),
        store: mobileGuestCredentialStoreV1,
      });
      setState({ kind: 'loaded', data });
    } catch (error) {
      setState({ kind: 'error', message: publicErrorMessage(error) });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const createBirth = useCallback(async (request: BirthProfileCreateRequestV1) => {
    setSubmitting(true);
    try {
      const data = await createMobileBirthAndSajuV1({
        client: getMobileApiClientV1(),
        store: mobileGuestCredentialStoreV1,
        request,
      });
      setState({ kind: 'loaded', data });
    } catch (error) {
      setState({ kind: 'error', message: publicErrorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  }, []);

  return (
    <MobileScreen
      eyebrow="READING"
      title="사주"
      description="사주 탭의 기본 화면입니다. 관상은 같은 하단 탭 안에서 별도로 이동합니다."
    >
      <ReadingSubnav />

      {state.kind === 'loading' ? (
        <Text style={styles.status}>현재 명식과 계산 상태를 확인하는 중입니다…</Text>
      ) : null}

      {state.kind === 'loaded' && state.data.kind === 'needs_birth' ? (
        <BirthProfileForm busy={submitting} onSubmit={createBirth} />
      ) : null}

      {state.kind === 'loaded' && state.data.kind === 'ready' ? (
        <SajuCalculationCard
          birthProfile={state.data.birthProfile}
          calculation={state.data.calculation}
        />
      ) : null}

      {state.kind === 'error' ? (
        <>
          <Text style={styles.error}>{state.message}</Text>
          <Pressable style={styles.retry} onPress={() => void reload()}>
            <Text style={styles.retryText}>다시 확인</Text>
          </Pressable>
        </>
      ) : null}
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  status: { color: mobileColors.muted, fontSize: 15, lineHeight: 22 },
  error: { color: mobileColors.seal, fontSize: 14, lineHeight: 21 },
  retry: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: mobileColors.navy,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { color: mobileColors.navy, fontSize: 15, fontWeight: '700' },
});
