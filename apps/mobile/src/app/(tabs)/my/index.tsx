import { MobilePlannedUiQaSwitcherV1 } from '@/ui/MobilePlannedUiQaSwitcherV1';
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { plannedMobileUiPreviewLocaleV1, previewMobileAuthoredUiLabelV1 } from '@/ui/mobile-planned-ui-screen-preview-v1';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import {
  MyBirthCard,
  MyBirthEmptyCard,
  MyFlowCards,
  MyMemberAuthCard,
  MyPendingSettings,
  MyProfileCard,
  MySectionError,
} from '@/features/my/MyComponents';
import { MyEditorialWelcome } from '@/features/my/MyEditorialWelcome';
import { nativeMobileRuntimeV1 } from '@/core/runtime/native-mobile-runtime';
import { useMobileMemberAuthV1 } from '@/features/my/use-mobile-member-auth';
import { useMobileMyV1 } from '@/features/my/use-mobile-my';
import {
  createMobileMyBirthViewV1,
  createMobileMyProfileViewV1,
} from '@/features/my/my-view-model';
import { MobileScreen } from '@/ui/MobileScreen';
import { useMobileUiLocale } from '@/ui/mobile-ui-locale';
import { MobileUiText } from '@/ui/MobileUiText';
import { mobileColors } from '@/ui/mobile-colors';
import { useMobileThemedStyles } from '@/ui/use-mobile-themed-styles';
import { useMobileTheme } from '@/ui/mobile-theme';
import { useMobilePullRefreshV1 } from '@/ui/use-mobile-pull-refresh';

export default function MyScreen() {
  const styles = useMobileThemedStyles(staticStyles);
  const { t } = useMobileUiLocale();
  const { uiPreview } = useLocalSearchParams<{ uiPreview?: string | string[] }>();
  const previewLocale = plannedMobileUiPreviewLocaleV1(uiPreview, __DEV__);
  const previewText = (source: string) => previewMobileAuthoredUiLabelV1(source, previewLocale, t);
  const { colors } = useMobileTheme();
  const {
    state,
    retryProfile,
    retryBirth,
  } = useMobileMyV1();
  const memberAuth = useMobileMemberAuthV1();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [memberSessionPresent, setMemberSessionPresent] = useState<boolean | null>(null);

  useFocusEffect(useCallback(() => {
    let active = true;
    void nativeMobileRuntimeV1.memberSession.read()
      .then((session) => {
        if (active) setMemberSessionPresent(session !== null);
      })
      .catch(() => {
        if (active) setMemberSessionPresent(null);
      });
    return () => { active = false; };
  }, []));

  const reloadOwnerProjection = useCallback(async () => {
    await Promise.all([retryProfile(), retryBirth()]);
  }, [retryProfile, retryBirth]);

  const refreshCurrentAccount = useCallback(async () => {
    await reloadOwnerProjection();
    const session = await nativeMobileRuntimeV1.memberSession.read().catch(() => null);
    setMemberSessionPresent(session !== null);
  }, [reloadOwnerProjection]);
  const { refreshing, onRefresh } = useMobilePullRefreshV1(refreshCurrentAccount);

  useEffect(() => {
    if (memberAuth.authRevision === 0) return;
    void Promise.all([retryProfile(), retryBirth()]);
    void nativeMobileRuntimeV1.memberSession.read()
      .then((session) => setMemberSessionPresent(session !== null))
      .catch(() => setMemberSessionPresent(null));
  }, [
    memberAuth.authRevision,
    retryProfile,
    retryBirth,
  ]);

  async function handleSignIn() {
    const signedIn = await memberAuth.signIn(email, password);
    if (!signedIn) return;
    setPassword('');
    setMemberSessionPresent(true);
    await reloadOwnerProjection();
  }

  async function handleSignUp() {
    const result = await memberAuth.signUp(email, password);
    if (result === false) return;
    setPassword('');
    if (result === 'authenticated') {
      setMemberSessionPresent(true);
      await reloadOwnerProjection();
    }
  }

  async function handleCompleteSignUp() {
    if (memberAuth.state.kind !== 'verification_required') return;
    const completed = await memberAuth.completeSignUp(
      memberAuth.state.email,
      password,
    );
    if (!completed) return;
    setPassword('');
    setMemberSessionPresent(true);
    await reloadOwnerProjection();
  }

  async function handleCancelSignUp() {
    await memberAuth.cancelSignUp();
    setPassword('');
  }

  async function handleSignOut() {
    const signedOut = await memberAuth.signOut();
    if (!signedOut) return;
    setPassword('');
    setMemberSessionPresent(false);
    await reloadOwnerProjection();
  }

  const currentAccount = state.profile.kind === 'ready'
    ? state.profile.profile.subjectKind
    : memberSessionPresent === true
      ? 'member'
      : memberSessionPresent === false ? 'guest' : 'checking';

  return (
    <MobileScreen
      eyebrow="MY MYEONGHA"
      title={previewText('마이')}
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
      description={previewText('나의 계정과 이야기, 설정을 살펴보세요.')}
    >
      <MobilePlannedUiQaSwitcherV1 />
      <MyEditorialWelcome account={currentAccount} previewLocale={previewLocale} />
      <MyMemberAuthCard
          previewLocale={previewLocale}
          subjectKind={state.profile.kind === 'ready'
            ? state.profile.profile.subjectKind
            : memberSessionPresent === true ? 'member' : 'guest'}
          email={email}
          password={password}
          pending={
            memberAuth.state.kind === 'submitting' ||
            memberAuth.state.kind === 'social_pending'
          }
          socialPendingProvider={
            memberAuth.state.kind === 'social_pending'
              ? memberAuth.state.provider
              : null
          }
          errorMessage={
            memberAuth.state.kind === 'error'
              ? memberAuth.state.message
              : memberAuth.state.kind === 'verification_required'
                ? memberAuth.state.errorMessage
                : null
          }
          verificationRequired={
            memberAuth.state.kind === 'verification_required'
              ? {
                  email: memberAuth.state.email,
                  message: memberAuth.state.message,
                }
              : null
          }
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onSignIn={() => void handleSignIn()}
          onSignUp={() => void handleSignUp()}
          onCompleteSignUp={() => void handleCompleteSignUp()}
          onCancelSignUp={() => void handleCancelSignUp()}
          onSignOut={() => void handleSignOut()}
          onSocialSignIn={(provider) => void memberAuth.signInWithSocial(provider)}
          onCancelSocialSignIn={() => void memberAuth.cancelSocialSignIn()}
        />


      {state.profile.kind === 'loading' ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator color={colors.navy} />
          <MobileUiText style={styles.loadingText}>{previewText('내 정보를 불러오는 중입니다…')}</MobileUiText>
        </View>
      ) : state.profile.kind === 'error' ? (
        <MySectionError
          message="현재 내 정보를 불러올 수 없습니다."
          onRetry={() => void retryProfile()}
        />
      ) : (
        <MyProfileCard profile={createMobileMyProfileViewV1(state.profile.profile)} />
      )}

      {state.birth.kind === 'loading' ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator color={colors.navy} />
          <MobileUiText style={styles.loadingText}>출생정보를 확인하는 중입니다…</MobileUiText>
        </View>
      ) : state.birth.kind === 'error' ? (
        <MySectionError
          message="현재 출생정보를 불러올 수 없습니다."
          onRetry={() => void retryBirth()}
        />
      ) : state.birth.kind === 'empty' ? (
        <MyBirthEmptyCard />
      ) : (
        <MyBirthCard birth={createMobileMyBirthViewV1(state.birth.birth)} />
      )}

      <MyFlowCards />
      <MyPendingSettings />
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  loadingCard: {
    minHeight: 88,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 18,
    backgroundColor: mobileColors.surface,
  },
  loadingText: { color: mobileColors.muted, fontSize: 13 },
});
const staticStyles = styles;
