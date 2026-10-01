import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type {
  MobileMyBirthViewV1,
  MobileMyProfileViewV1,
} from '@/features/my/my-view-model';
import { mobileColors } from '@/ui/mobile-colors';

export function MyProfileCard({
  profile,
}: {
  profile: MobileMyProfileViewV1;
}) {
  return (
    <View style={styles.profileCard}>
      <View style={styles.profileMark}>
        <Text style={styles.profileMarkText}>之</Text>
      </View>
      <View style={styles.profileCopy}>
        <Text style={styles.profileName}>{profile.displayName}</Text>
        <Text style={styles.profileMeta}>{profile.subjectLabel}</Text>
        <Text style={styles.profileStatus}>{profile.statusLabel}</Text>
      </View>
    </View>
  );
}

export function MyMemberAuthCard({
  subjectKind,
  email,
  password,
  pending,
  errorMessage,
  onEmailChange,
  onPasswordChange,
  onSignIn,
  onSignOut,
}: {
  subjectKind: 'guest' | 'member';
  email: string;
  password: string;
  pending: boolean;
  errorMessage: string | null;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSignIn: () => void;
  onSignOut: () => void;
}) {
  if (subjectKind === 'member') {
    return (
      <View style={styles.card}>
        <Text style={styles.kicker}>ACCOUNT</Text>
        <Text style={styles.sectionTitle}>회원으로 이용 중</Text>
        <Text style={styles.body}>
          이 기기에서는 회원 세션을 우선 사용합니다.
        </Text>
        {errorMessage !== null ? <Text style={styles.error}>{errorMessage}</Text> : null}
        <Pressable
          accessibilityRole="button"
          disabled={pending}
          onPress={onSignOut}
          style={[styles.secondaryAction, pending && styles.disabledAction]}
        >
          <Text style={styles.secondaryActionText}>
            {pending ? '처리 중…' : '로그아웃'}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>MEMBER LOGIN</Text>
      <Text style={styles.sectionTitle}>기존 계정으로 로그인</Text>
      <Text style={styles.body}>
        로그인하면 회원 계정의 기록과 출생정보를 기준으로 앱을 이어서 사용합니다.
      </Text>
      <TextInput
        accessibilityLabel="이메일"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!pending}
        keyboardType="email-address"
        onChangeText={onEmailChange}
        placeholder="이메일"
        placeholderTextColor={mobileColors.muted}
        style={styles.authInput}
        value={email}
      />
      <TextInput
        accessibilityLabel="비밀번호"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!pending}
        onChangeText={onPasswordChange}
        onSubmitEditing={onSignIn}
        placeholder="비밀번호"
        placeholderTextColor={mobileColors.muted}
        secureTextEntry
        style={styles.authInput}
        value={password}
      />
      {errorMessage !== null ? <Text style={styles.error}>{errorMessage}</Text> : null}
      <Pressable
        accessibilityRole="button"
        disabled={pending || email.trim().length === 0 || password.length === 0}
        onPress={onSignIn}
        style={[
          styles.primaryAction,
          (pending || email.trim().length === 0 || password.length === 0) &&
            styles.disabledAction,
        ]}
      >
        <Text style={styles.primaryActionText}>
          {pending ? '로그인 중…' : '로그인'}
        </Text>
      </Pressable>
      <Text style={styles.caption}>
        신규 회원가입과 게스트 기록의 기존 계정 병합은 모바일에서 아직 제공하지 않습니다.
      </Text>
    </View>
  );
}

export function MySectionError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.error}>{message}</Text>
      <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}>
        <Text style={styles.retryText}>다시 시도</Text>
      </Pressable>
    </View>
  );
}

export function MyBirthCard({
  birth,
}: {
  birth: MobileMyBirthViewV1;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>TODAY</Text>
      <Text style={styles.sectionTitle}>오늘의 나</Text>
      <View style={styles.birthGrid}>
        <View style={styles.birthFact}>
          <Text style={styles.factLabel}>생년월일</Text>
          <Text style={styles.factValue}>{birth.birthDate}</Text>
        </View>
        <View style={styles.birthFact}>
          <Text style={styles.factLabel}>태어난 시간</Text>
          <Text style={styles.factValue}>{birth.birthTime}</Text>
        </View>
        <View style={styles.birthFact}>
          <Text style={styles.factLabel}>기준</Text>
          <Text style={styles.factValue}>{birth.basis} · {birth.sex}</Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/reading')}
        style={styles.primaryAction}
      >
        <Text style={styles.primaryActionText}>내 사주 보기 →</Text>
      </Pressable>
      <View style={styles.pendingAction}>
        <Text style={styles.pendingText}>출생 정보 수정 · 준비 중</Text>
      </View>
      <Text style={styles.caption}>{birth.revisionLabel}</Text>
    </View>
  );
}

export function MyBirthEmptyCard() {
  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>TODAY</Text>
      <Text style={styles.sectionTitle}>오늘의 나</Text>
      <Text style={styles.body}>저장된 본인 출생정보가 없습니다.</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/birth')}
        style={styles.primaryAction}
      >
        <Text style={styles.primaryActionText}>출생정보 입력하기 →</Text>
      </Pressable>
    </View>
  );
}

const flowItems = Object.freeze([
  { route: '/reading', symbol: '命', kicker: 'SAJU', title: '내 사주', body: '현재 명식 계산을 확인합니다.' },
  { route: '/records', symbol: '▤', kicker: 'RECORDS', title: '기록', body: '현세록, 지난 읽기와 기억을 확인합니다.' },
  { route: '/chat', symbol: '◌', kicker: 'CHAT', title: '대화', body: '대화 허브로 이동합니다.' },
] as const);

export function MyFlowCards() {
  return (
    <View style={styles.section}>
      <View style={styles.sectionIntro}>
        <Text style={styles.kicker}>MY FLOW</Text>
        <Text style={styles.sectionTitle}>내 흐름</Text>
      </View>
      {flowItems.map((item) => (
        <Pressable
          key={item.route}
          accessibilityRole="button"
          onPress={() => router.push(item.route)}
          style={styles.flowCard}
        >
          <Text style={styles.flowSymbol}>{item.symbol}</Text>
          <View style={styles.flowCopy}>
            <Text style={styles.flowKicker}>{item.kicker}</Text>
            <Text style={styles.flowTitle}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </View>
          <Text style={styles.flowArrow}>→</Text>
        </Pressable>
      ))}
    </View>
  );
}

const pendingSettings = Object.freeze([
  '알림 설정',
  '이용권 · 결제',
  '회원가입 · 계정 관리',
  '고객지원',
] as const);

export function MyPendingSettings() {
  return (
    <View style={styles.section}>
      <View style={styles.sectionIntro}>
        <Text style={styles.kicker}>SETTINGS</Text>
        <Text style={styles.sectionTitle}>설정</Text>
      </View>
      <View style={styles.settingsCard}>
        {pendingSettings.map((title) => (
          <View key={title} style={styles.settingRow}>
            <Text style={styles.settingTitle}>{title}</Text>
            <Text style={styles.pendingBadge}>준비 중</Text>
          </View>
        ))}
      </View>
      <Text style={styles.caption}>
        연결되지 않은 알림·결제·계정·지원 상태는 임의로 표시하지 않습니다.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  sectionIntro: { gap: 5 },
  card: {
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 18,
    backgroundColor: mobileColors.surface,
    padding: 20,
    gap: 12,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 20,
    backgroundColor: mobileColors.surface,
    padding: 20,
  },
  profileMark: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 29,
    borderWidth: 1,
    borderColor: mobileColors.gold,
  },
  profileMarkText: { color: mobileColors.navy, fontSize: 26, fontWeight: '800' },
  profileCopy: { flex: 1, gap: 4 },
  profileName: { color: mobileColors.ink, fontSize: 21, fontWeight: '800' },
  profileMeta: { color: mobileColors.muted, fontSize: 14 },
  profileStatus: { color: mobileColors.navy, fontSize: 12, fontWeight: '700' },
  kicker: { color: mobileColors.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  sectionTitle: { color: mobileColors.ink, fontSize: 20, fontWeight: '800' },
  birthGrid: { gap: 9 },
  birthFact: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  factLabel: { color: mobileColors.muted, fontSize: 13 },
  factValue: { color: mobileColors.ink, fontSize: 14, fontWeight: '800' },
  body: { color: mobileColors.muted, fontSize: 14, lineHeight: 20 },
  primaryAction: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: mobileColors.navy,
  },
  primaryActionText: { color: mobileColors.surface, fontSize: 14, fontWeight: '800' },
  secondaryAction: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: mobileColors.navy,
    borderRadius: 12,
  },
  secondaryActionText: { color: mobileColors.navy, fontSize: 14, fontWeight: '800' },
  disabledAction: { opacity: 0.5 },
  authInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 12,
    backgroundColor: mobileColors.canvas,
    color: mobileColors.ink,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  pendingAction: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 12,
  },
  pendingText: { color: mobileColors.muted, fontSize: 13, fontWeight: '700' },
  caption: { color: mobileColors.muted, fontSize: 11, lineHeight: 17 },
  flowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 16,
    backgroundColor: mobileColors.surface,
    padding: 16,
  },
  flowSymbol: { width: 30, color: mobileColors.gold, fontSize: 22, fontWeight: '800' },
  flowCopy: { flex: 1, gap: 2 },
  flowKicker: { color: mobileColors.gold, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  flowTitle: { color: mobileColors.ink, fontSize: 16, fontWeight: '800' },
  flowArrow: { color: mobileColors.navy, fontSize: 18, fontWeight: '800' },
  settingsCard: {
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 18,
    backgroundColor: mobileColors.surface,
    overflow: 'hidden',
  },
  settingRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: mobileColors.border,
  },
  settingTitle: { color: mobileColors.ink, fontSize: 14, fontWeight: '700' },
  pendingBadge: { color: mobileColors.muted, fontSize: 12, fontWeight: '700' },
  error: { color: mobileColors.seal, fontSize: 14, lineHeight: 20 },
  retry: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 4 },
  retryText: { color: mobileColors.navy, fontSize: 13, fontWeight: '800' },
});
