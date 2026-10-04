import { useEffect, useState } from 'react';
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
import {
  MyTargetPersonCreateCard,
  MyTargetPersonsEmpty,
  MyTargetPersonsSection,
} from '@/features/my/MyTargetPersons';
import { MyPushNotifications } from '@/features/my/MyPushNotifications';
import { useMobileMemberAuthV1 } from '@/features/my/use-mobile-member-auth';
import { useMobilePushV1 } from '@/features/my/use-mobile-push';
import { useMobileMyV1 } from '@/features/my/use-mobile-my';
import {
  createMobileMyBirthViewV1,
  createMobileMyProfileViewV1,
} from '@/features/my/my-view-model';
import { MobileScreen } from '@/ui/MobileScreen';
import { mobileColors } from '@/ui/mobile-colors';

export default function MyScreen() {
  const {
    state,
    retryProfile,
    retryBirth,
    retryTargetPersons,
    targetPersonCreate,
    createTargetPerson,
  } = useMobileMyV1();
  const memberAuth = useMobileMemberAuthV1();
  const mobilePush = useMobilePushV1();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function reloadOwnerProjection() {
    await Promise.all([
      retryProfile(),
      retryBirth(),
      retryTargetPersons(),
    ]);
  }

  useEffect(() => {
    if (memberAuth.authRevision === 0) return;
    void Promise.all([
      retryProfile(),
      retryBirth(),
      retryTargetPersons(),
    ]);
  }, [
    memberAuth.authRevision,
    retryProfile,
    retryBirth,
    retryTargetPersons,
  ]);

  async function handleSignIn() {
    const signedIn = await memberAuth.signIn(email, password);
    if (!signedIn) return;
    setPassword('');
    await reloadOwnerProjection();
  }

  async function handleSignUp() {
    const result = await memberAuth.signUp(email, password);
    if (result === false) return;
    setPassword('');
    if (result === 'authenticated') await reloadOwnerProjection();
  }

  async function handleCompleteSignUp() {
    if (memberAuth.state.kind !== 'verification_required') return;
    const completed = await memberAuth.completeSignUp(
      memberAuth.state.email,
      password,
    );
    if (!completed) return;
    setPassword('');
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

      {state.targetPersons.kind === 'loading' ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator color={mobileColors.navy} />
          <Text style={styles.loadingText}>등록된 대상을 확인하는 중입니다…</Text>
        </View>
      ) : state.targetPersons.kind === 'error' ? (
        <MySectionError
          message="현재 등록된 대상을 불러올 수 없습니다."
          onRetry={() => void retryTargetPersons()}
        />
      ) : state.targetPersons.kind === 'empty' ? (
        <MyTargetPersonsEmpty />
      ) : (
        <MyTargetPersonsSection items={state.targetPersons.items} />
      )}

      <MyTargetPersonCreateCard
        submitting={targetPersonCreate.kind === 'submitting'}
        errorMessage={
          targetPersonCreate.kind === 'error' ? targetPersonCreate.message : null
        }
        onCreate={createTargetPerson}
      />

      <MyPushNotifications
        status={
          mobilePush.state.kind === 'loading'
            ? null
            : mobilePush.state.status
        }
        pending={
          mobilePush.state.kind === 'loading' ||
          mobilePush.state.kind === 'submitting'
        }
        errorMessage={
          mobilePush.state.kind === 'error'
            ? mobilePush.state.errorMessage
            : null
        }
        onEnable={() => void mobilePush.enable()}
        onDisable={() => void mobilePush.disable()}
        onRetry={() => void mobilePush.retry()}
      />

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
