import { StyleSheet, Text, View } from 'react-native';

import { useMobileTheme } from '@/ui/mobile-theme';
import { useMobileUiLocale } from '@/ui/mobile-ui-locale';
import { MobileUiText } from '@/ui/MobileUiText';

type MyAccountPresentation = 'guest' | 'member' | 'checking';

/**
 * Visual account introduction only. The parent resolves account state from
 * the existing profile/session sources; this component grants no authority.
 */
export function MyEditorialWelcome({ account }: { account: MyAccountPresentation }) {
  const { theme } = useMobileTheme();
  const { t } = useMobileUiLocale();
  const accountStatus = account === 'member'
    ? '회원 계정으로 이용 중'
    : account === 'guest'
      ? '게스트로 이용 중'
      : '계정 상태 확인 중';

  return (
    <View style={[styles.hero, theme === 'dark' && styles.heroDark]}>
      <View pointerEvents="none" style={styles.innerFrame} />
      <View pointerEvents="none" style={styles.ornament}>
        <Text style={styles.ornamentText}>命</Text>
      </View>
      <View style={styles.copy}>
        <MobileUiText style={styles.eyebrow}>MY MYEONGHA · 나의 공간</MobileUiText>
        <Text style={styles.title}>{t('나의 이야기를')}{'\n'}{t('이어가는 공간')}</Text>
        <MobileUiText style={styles.subtitle}>
          계정, 출생정보와 명하에서 이어지는 길을 한곳에서 살펴보세요.
        </MobileUiText>
      </View>
      <View style={styles.statusRow}>
        <View style={styles.statusDot} />
        <Text style={styles.statusText}>{t(accountStatus)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    minHeight: 246,
    borderRadius: 23,
    backgroundColor: '#152B40',
    borderWidth: 1,
    borderColor: '#BE9967',
    paddingHorizontal: 23,
    paddingVertical: 24,
    overflow: 'hidden',
    justifyContent: 'space-between',
    gap: 16,
  },
  heroDark: { backgroundColor: '#101F2D', borderColor: '#D2AE78' },
  innerFrame: {
    position: 'absolute',
    top: 8, right: 8, bottom: 8, left: 8,
    borderWidth: 1, borderRadius: 16, borderColor: 'rgba(224,191,143,0.31)',
  },
  ornament: {
    position: 'absolute',
    right: -27,
    top: 23,
    width: 174,
    height: 174,
    borderRadius: 87,
    borderWidth: 1,
    borderColor: 'rgba(224,191,143,0.27)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ornamentText: { fontSize: 97, color: 'rgba(225,189,135,0.12)', fontWeight: '700' },
  copy: { gap: 10, zIndex: 1, maxWidth: '92%' },
  eyebrow: { color: '#E8C895', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: '#FFF9F0', fontSize: 28, fontWeight: '800', lineHeight: 38, letterSpacing: -0.6 },
  subtitle: { color: '#F1E7DA', fontSize: 13, lineHeight: 21, maxWidth: 266 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 9, zIndex: 1 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#E8C895' },
  statusText: { color: '#F9EADA', fontSize: 12, fontWeight: '700' },
});
