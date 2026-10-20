import type { SocialAuthProviderV1 } from '@myeongha/api-client';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type {
  MobileMyBirthViewV1,
  MobileMyProfileViewV1,
} from '@/features/my/my-view-model';
import { mobileColors } from '@/ui/mobile-colors';
import { MobileUiText } from '@/ui/MobileUiText';
import { useMobileTheme } from '@/ui/mobile-theme';
import { useMobileThemedStyles } from '@/ui/use-mobile-themed-styles';
import { useMobileUiLocale } from '@/ui/mobile-ui-locale';

export function MyProfileCard({
  profile,
}: {
  profile: MobileMyProfileViewV1;
}) {
  const themedStyles = useMobileThemedStyles(styles);
  return (
    <View style={themedStyles.profileCard}>
      <View style={themedStyles.profileMark}>
        <Text style={themedStyles.profileMarkText}>之</Text>
      </View>
      <View style={themedStyles.profileCopy}>
        <Text style={themedStyles.profileName}>{profile.displayName}</Text>
        <Text style={themedStyles.profileMeta}>{profile.subjectLabel}</Text>
        <Text style={themedStyles.profileStatus}>{profile.statusLabel}</Text>
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
  verificationRequired,
  socialPendingProvider,
  onEmailChange,
  onPasswordChange,
  onSignIn,
  onSignUp,
  onCompleteSignUp,
  onCancelSignUp,
  onSignOut,
  onSocialSignIn,
  onCancelSocialSignIn,
}: {
  subjectKind: 'guest' | 'member';
  email: string;
  password: string;
  pending: boolean;
  errorMessage: string | null;
  verificationRequired: Readonly<{
    email: string;
    message: string;
  }> | null;
  socialPendingProvider: SocialAuthProviderV1 | null;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSignIn: () => void;
  onSignUp: () => void;
  onCompleteSignUp: () => void;
  onCancelSignUp: () => void;
  onSignOut: () => void;
  onSocialSignIn: (provider: SocialAuthProviderV1) => void;
  onCancelSocialSignIn: () => void;
}) {
  const themedStyles = useMobileThemedStyles(styles);
  if (subjectKind === 'member') {
    return (
      <View style={themedStyles.card}>
        <Text style={themedStyles.kicker}>ACCOUNT</Text>
        <MobileUiText style={themedStyles.sectionTitle}>회원으로 이용 중</MobileUiText>
        <MobileUiText style={themedStyles.body}>
          이 기기에서는 회원 세션을 우선 사용합니다.
        </MobileUiText>
        {errorMessage !== null ? <Text style={themedStyles.error}>{errorMessage}</Text> : null}
        <Pressable
          accessibilityRole="button"
          disabled={pending}
          onPress={onSignOut}
          style={[themedStyles.secondaryAction, pending && themedStyles.disabledAction]}
        >
          <Text style={themedStyles.secondaryActionText}>
            {pending ? '처리 중…' : '로그아웃'}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={themedStyles.card}>
      <Text style={themedStyles.kicker}>ACCOUNT</Text>
      <MobileUiText style={themedStyles.sectionTitle}>계정으로 이어가기</MobileUiText>
      <MobileUiText style={themedStyles.body}>
        기존 계정으로 로그인하거나, 현재 게스트 기록을 그대로 이어받는 새 계정을 만들 수 있습니다.
      </MobileUiText>

      {verificationRequired === null ? (
        <>

          <View style={themedStyles.socialActions}>
            {([
              ['google', 'Google로 계속'],
              ['kakao', '카카오로 계속'],
              ['naver', '네이버로 계속'],
            ] as const).map(([provider, label]) => (
              <Pressable
                key={provider}
                accessibilityRole="button"
                disabled={pending}
                onPress={() => onSocialSignIn(provider)}
                style={[themedStyles.socialAction, pending && themedStyles.disabledAction]}
              >
                <Text style={themedStyles.socialActionText}>
                  {socialPendingProvider === provider ? '확인 중…' : label}
                </Text>
              </Pressable>
            ))}
          </View>
          {socialPendingProvider !== null ? (
            <>
              <MobileUiText style={themedStyles.caption}>
                외부 로그인 화면에서 확인을 마치면 자동으로 돌아옵니다.
              </MobileUiText>
              <Pressable
                accessibilityRole="button"
                onPress={onCancelSocialSignIn}
                style={themedStyles.pendingAction}
              >
                <MobileUiText style={themedStyles.pendingText}>소셜 로그인 취소</MobileUiText>
              </Pressable>
            </>
          ) : null}
          <View style={themedStyles.authDivider}>
            <View style={themedStyles.authDividerLine} />
            <MobileUiText style={themedStyles.authDividerText}>또는 이메일로 계속</MobileUiText>
            <View style={themedStyles.authDividerLine} />
          </View>
          <TextInput
            accessibilityLabel="이메일"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!pending}
            keyboardType="email-address"
            onChangeText={onEmailChange}
            placeholder="이메일"
            placeholderTextColor={mobileColors.muted}
            style={themedStyles.authInput}
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
            style={themedStyles.authInput}
            value={password}
          />
          {errorMessage !== null ? <Text style={themedStyles.error}>{errorMessage}</Text> : null}
          <Pressable
            accessibilityRole="button"
            disabled={pending || email.trim().length === 0 || password.length === 0}
            onPress={onSignIn}
            style={[
              themedStyles.primaryAction,
              (pending || email.trim().length === 0 || password.length === 0) &&
                themedStyles.disabledAction,
            ]}
          >
            <Text style={themedStyles.primaryActionText}>
              {pending ? '처리 중…' : '기존 계정으로 로그인'}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={pending || email.trim().length === 0 || password.length === 0}
            onPress={onSignUp}
            style={[
              themedStyles.secondaryAction,
              (pending || email.trim().length === 0 || password.length === 0) &&
                themedStyles.disabledAction,
            ]}
          >
            <MobileUiText style={themedStyles.secondaryActionText}>새 계정 만들기</MobileUiText>
          </Pressable>
          <MobileUiText style={themedStyles.caption}>
            새 계정은 현재 게스트 주체를 그대로 회원으로 승격합니다. 기존 회원 계정과의 게스트 기록 병합은 아직 지원하지 않습니다.
          </MobileUiText>
        </>
      ) : (
        <>
          <Text style={themedStyles.body}>{verificationRequired.message}</Text>
          <Text style={themedStyles.verificationEmail}>{verificationRequired.email}</Text>
          <MobileUiText style={themedStyles.caption}>
            확인 링크는 현재 Web 확인 화면으로 열립니다. 이메일 확인을 마친 뒤 앱으로 돌아와 비밀번호를 다시 입력해 주세요.
          </MobileUiText>
          <TextInput
            accessibilityLabel="비밀번호"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!pending}
            onChangeText={onPasswordChange}
            onSubmitEditing={onCompleteSignUp}
            placeholder="비밀번호 다시 입력"
            placeholderTextColor={mobileColors.muted}
            secureTextEntry
            style={themedStyles.authInput}
            value={password}
          />
          {errorMessage !== null ? <Text style={themedStyles.error}>{errorMessage}</Text> : null}
          <Pressable
            accessibilityRole="button"
            disabled={pending || password.length === 0}
            onPress={onCompleteSignUp}
            style={[
              themedStyles.primaryAction,
              (pending || password.length === 0) && themedStyles.disabledAction,
            ]}
          >
            <Text style={themedStyles.primaryActionText}>
              {pending ? '처리 중…' : '가입 완료 후 이어가기'}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={pending}
            onPress={onCancelSignUp}
            style={[themedStyles.secondaryAction, pending && themedStyles.disabledAction]}
          >
            <MobileUiText style={themedStyles.secondaryActionText}>가입 흐름 취소</MobileUiText>
          </Pressable>
        </>
      )}
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
  const themedStyles = useMobileThemedStyles(styles);
  return (
    <View style={themedStyles.card}>
      <Text style={themedStyles.error}>{message}</Text>
      <Pressable accessibilityRole="button" onPress={onRetry} style={themedStyles.retry}>
        <MobileUiText style={themedStyles.retryText}>다시 시도</MobileUiText>
      </Pressable>
    </View>
  );
}

export function MyBirthCard({
  birth,
}: {
  birth: MobileMyBirthViewV1;
}) {
  const themedStyles = useMobileThemedStyles(styles);
  return (
    <View style={themedStyles.card}>
      <Text style={themedStyles.kicker}>TODAY</Text>
      <MobileUiText style={themedStyles.sectionTitle}>오늘의 나</MobileUiText>
      <View style={themedStyles.birthGrid}>
        <View style={themedStyles.birthFact}>
          <MobileUiText style={themedStyles.factLabel}>생년월일</MobileUiText>
          <Text style={themedStyles.factValue}>{birth.birthDate}</Text>
        </View>
        <View style={themedStyles.birthFact}>
          <MobileUiText style={themedStyles.factLabel}>태어난 시간</MobileUiText>
          <Text style={themedStyles.factValue}>{birth.birthTime}</Text>
        </View>
        <View style={themedStyles.birthFact}>
          <MobileUiText style={themedStyles.factLabel}>기준</MobileUiText>
          <Text style={themedStyles.factValue}>{birth.basis} · {birth.sex}</Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/reading')}
        style={themedStyles.primaryAction}
      >
        <MobileUiText style={themedStyles.primaryActionText}>내 사주 보기 →</MobileUiText>
      </Pressable>
      <View style={themedStyles.pendingAction}>
        <MobileUiText style={themedStyles.pendingText}>출생 정보 수정 · 준비 중</MobileUiText>
      </View>
      <Text style={themedStyles.caption}>{birth.revisionLabel}</Text>
    </View>
  );
}

export function MyBirthEmptyCard() {
  const themedStyles = useMobileThemedStyles(styles);
  return (
    <View style={themedStyles.card}>
      <Text style={themedStyles.kicker}>TODAY</Text>
      <MobileUiText style={themedStyles.sectionTitle}>오늘의 나</MobileUiText>
      <MobileUiText style={themedStyles.body}>저장된 본인 출생정보가 없습니다.</MobileUiText>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/birth')}
        style={themedStyles.primaryAction}
      >
        <MobileUiText style={themedStyles.primaryActionText}>출생정보 입력하기 →</MobileUiText>
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
  const themedStyles = useMobileThemedStyles(styles);
  return (
    <View style={themedStyles.section}>
      <View style={themedStyles.sectionIntro}>
        <Text style={themedStyles.kicker}>MY FLOW</Text>
        <MobileUiText style={themedStyles.sectionTitle}>내 흐름</MobileUiText>
      </View>
      {flowItems.map((item) => (
        <Pressable
          key={item.route}
          accessibilityRole="button"
          onPress={() => router.push(item.route)}
          style={themedStyles.flowCard}
        >
          <Text style={themedStyles.flowSymbol}>{item.symbol}</Text>
          <View style={themedStyles.flowCopy}>
            <Text style={themedStyles.flowKicker}>{item.kicker}</Text>
            <Text style={themedStyles.flowTitle}>{item.title}</Text>
            <Text style={themedStyles.body}>{item.body}</Text>
          </View>
          <Text style={themedStyles.flowArrow}>→</Text>
        </Pressable>
      ))}
    </View>
  );
}

const pendingSettings = Object.freeze([
  '이용권 · 결제',
  '계정 관리',
  '고객지원',
] as const);


const localeChoices = [
  { value: 'ko-KR', label: '한국어' },
  { value: 'ja-JP', label: '日本語' },
  { value: 'zh-TW', label: '繁體中文' },
] as const;

function MyLocaleSelector() {
  const themedStyles = useMobileThemedStyles(styles);
  const { locale, setLocale, t } = useMobileUiLocale();
  const { colors } = useMobileTheme();
  return (
    <View style={themedStyles.localeSection}>
      <Text style={[themedStyles.settingTitle, { color: colors.ink }]}>{t('언어 선택')}</Text>
      <View style={themedStyles.localeChoices}>
        {localeChoices.map((choice) => {
          const selected = locale === choice.value;
          return (
            <Pressable
              key={choice.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={choice.label}
              onPress={() => setLocale(choice.value)}
              style={[
                themedStyles.localeChoice,
                {
                  backgroundColor: selected ? colors.navy : colors.surface,
                  borderColor: selected ? colors.navy : colors.border,
                },
              ]}
            >
              <Text style={{ color: selected ? colors.canvas : colors.ink, fontSize: 13, fontWeight: '800' }}>
                {choice.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={themedStyles.caption}>
        {locale === 'ja-JP'
          ? '画面の固定ラベルのみを翻訳します。会話・個人情報・公式鑑定は変更しません。'
          : locale === 'zh-TW'
            ? '只翻譯介面的固定文字，不改動對話、個人資料或正式解讀。'
            : '화면에 고정된 안내 문구만 번역합니다. 대화·개인정보·공식 해석은 변경하지 않습니다.'}
      </Text>
    </View>
  );
}

function MyThemeSelector() {
  const themedStyles = useMobileThemedStyles(styles);
  const { theme, setTheme, colors } = useMobileTheme();
  return (
    <View style={themedStyles.themeSection}>
      <MobileUiText style={[themedStyles.settingTitle, { color: colors.ink }]}>화면 테마</MobileUiText>
      <View style={themedStyles.themeChoices}>
        {(['light', 'dark'] as const).map((option) => (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityState={{ selected: theme === option }}
            accessibilityLabel={option === 'light' ? '라이트 모드' : '다크 모드'}
            onPress={() => setTheme(option)}
            style={{
              flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, borderRadius: 12,
              backgroundColor: theme === option ? colors.navy : colors.surface,
              borderColor: theme === option ? colors.navy : colors.border,
            }}
          >
            <Text style={{ color: theme === option ? colors.canvas : colors.ink, fontWeight: '700' }}>
              {option === 'light' ? '☀ 라이트' : '☾ 다크'}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function MyPendingSettings() {
  const themedStyles = useMobileThemedStyles(styles);
  const { colors } = useMobileTheme();
  const { t } = useMobileUiLocale();
  return (
    <View style={themedStyles.section}>
      <View style={themedStyles.sectionIntro}>
        <Text style={themedStyles.kicker}>SETTINGS</Text>
        <MobileUiText style={themedStyles.sectionTitle}>설정</MobileUiText>
      </View>
      <View style={[themedStyles.settingsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <MyThemeSelector />
        <MyLocaleSelector />
        {pendingSettings.map((title) => (
          <View key={title} style={themedStyles.settingRow}>
            <Text style={[themedStyles.settingTitle, { color: colors.ink }]}>{t(title)}</Text>
            <MobileUiText style={themedStyles.pendingBadge}>준비 중</MobileUiText>
          </View>
        ))}
      </View>
      <MobileUiText style={themedStyles.caption}>
        연결되지 않은 결제·상세 계정관리·지원 상태는 임의로 표시하지 않습니다.
      </MobileUiText>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  sectionIntro: { gap: 6 },
  card: {
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 20,
    backgroundColor: mobileColors.surface,
    padding: 22,
    gap: 14,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 21,
    backgroundColor: mobileColors.surface,
    padding: 22,
  },
  profileMark: {
    width: 67,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: mobileColors.gold,
  },
  profileMarkText: { color: mobileColors.navy, fontSize: 26, fontWeight: '800' },
  profileCopy: { flex: 1, gap: 4 },
  profileName: { color: mobileColors.ink, fontSize: 23, fontWeight: '900', letterSpacing: -0.4 },
  profileMeta: { color: mobileColors.muted, fontSize: 14 },
  profileStatus: { color: mobileColors.navy, fontSize: 12, fontWeight: '700' },
  kicker: { color: mobileColors.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  sectionTitle: { color: mobileColors.ink, fontSize: 22, fontWeight: '900' },
  birthGrid: { gap: 12, paddingVertical: 6 },
  birthFact: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 14, minHeight: 32 },
  factLabel: { color: mobileColors.muted, fontSize: 13 },
  factValue: { color: mobileColors.ink, fontSize: 14, fontWeight: '800', flexShrink: 1, textAlign: 'right' },
  body: { color: mobileColors.muted, fontSize: 14, lineHeight: 20 },
  primaryAction: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: mobileColors.navy,
  },
  primaryActionText: { color: mobileColors.surface, fontSize: 14, fontWeight: '800' },
  secondaryAction: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: mobileColors.navy,
    borderRadius: 12,
  },
  secondaryActionText: { color: mobileColors.navy, fontSize: 14, fontWeight: '800' },
  socialActions: { gap: 8 },
  socialAction: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 12,
    backgroundColor: mobileColors.canvas,
  },
  socialActionText: { color: mobileColors.ink, fontSize: 14, fontWeight: '800' },
  authDivider: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  authDividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: mobileColors.border,
  },
  authDividerText: { color: mobileColors.muted, fontSize: 11, fontWeight: '700' },
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
  verificationEmail: { color: mobileColors.ink, fontSize: 14, fontWeight: '800' },
  flowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 18,
    backgroundColor: mobileColors.surface,
    padding: 18,
    minHeight: 96,
  },
  flowSymbol: { width: 30, color: mobileColors.gold, fontSize: 22, fontWeight: '800' },
  flowCopy: { flex: 1, gap: 2 },
  flowKicker: { color: mobileColors.gold, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  flowTitle: { color: mobileColors.ink, fontSize: 17, fontWeight: '900' },
  flowArrow: { color: mobileColors.navy, fontSize: 18, fontWeight: '800' },
  themeSection: { paddingHorizontal: 17, paddingTop: 18, paddingBottom: 12, gap: 12 },
  themeChoices: { flexDirection: 'row', gap: 10 },
  localeSection: { paddingHorizontal: 17, paddingTop: 12, paddingBottom: 18, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: mobileColors.border },
  localeChoices: { flexDirection: 'row', gap: 8 },
  localeChoice: { flex: 1, minHeight: 49, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  settingsCard: {
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 20,
    backgroundColor: mobileColors.surface,
    overflow: 'hidden',
  },
  settingRow: {
    minHeight: 57,
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
