import { useState } from 'react';
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
import { useMobileMemberAuthV1 } from '@/features/my/use-mobile-member-auth';
import { useMobileMyV1 } from '@/features/my/use-mobile-my';
import {
  createMobileMyBirthViewV1,
  createMobileMyProfileViewV1,
} from '@/features/my/my-view-model';
import { MobileScreen } from '@/ui/MobileScreen';
import { mobileColors } from '@/ui/mobile-colors';

export default function MyScreen() {
  const { state, retryProfile, retryBirth } = useMobileMyV1();
  const memberAuth = useMobileMemberAuthV1();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function reloadOwnerProjection() {
    await Promise.all([retryProfile(), retryBirth()]);
  }

  async function handleSignIn() {
    const signedIn = await memberAuth.signIn(email, password);
    if (!signedIn) return;
    setPassword('');
    await reloadOwnerProjection();
  }

  async function handleSignOut() {
    const signedOut = await memberAuth.signOut();
    if (!signedOut) return;
    setPassword('');
    await reloadOwnerProjection();
  }

  return (
    <MobileScreen
      eyebrow="MY MYEONGHA"
      title="마이"
      description="현재 주체와 출생정보를 기준으로 명하에서 이어지는 흐름을 확인합니다."
    >
      {state.profile.kind === 'loading' ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator color={mobileColors.navy} />
          <Text style={styles.loadingText}>내 정보를 불러오는 중입니다…</Text>
        </View>
      ) : state.profile.kind === 'error' ? (
        <MySectionError
          message="현재 내 정보를 불러올 수 없습니다."
          onRetry={() => void retryProfile()}
        />
      ) : (
        <MyProfileCard profile={createMobileMyProfileViewV1(state.profile.profile)} />
      )}

      {state.profile.kind === 'ready' ? (
        <MyMemberAuthCard
          subjectKind={state.profile.profile.subjectKind}
          email={email}
          password={password}
          pending={memberAuth.state.kind === 'submitting'}
          errorMessage={
            memberAuth.state.kind === 'error' ? memberAuth.state.message : null
          }
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onSignIn={() => void handleSignIn()}
          onSignOut={() => void handleSignOut()}
        />
      ) : null}

      {state.birth.kind === 'loading' ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator color={mobileColors.navy} />
          <Text style={styles.loadingText}>출생정보를 확인하는 중입니다…</Text>
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
