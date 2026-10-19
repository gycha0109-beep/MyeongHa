import { router } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { resolveMobileChatPortraitV1 } from '@/features/chat/chat-character-portraits';
import { mobileColors } from '@/ui/mobile-colors';
import { useMobileTheme } from '@/ui/mobile-theme';

/**
 * Product-only editorial entrance to the character hub.
 * Uses the bundled canonical character portrait. This never grants Chat
 * access, implies a working AI response, or exposes held thread history.
 */
export function HomeCharacterFeature() {
  const { colors, theme } = useMobileTheme();
  const portrait = resolveMobileChatPortraitV1('seyeon');
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <Text style={[styles.kicker, { color: colors.gold }]}>YOUR STORY, MYEONGHA</Text>
        <Text style={[styles.sectionTitle, { color: colors.ink }]}>이야기가 머무는 곳</Text>
      </View>
      <View style={styles.hero}>
        <View pointerEvents="none" style={styles.imageCrop}>
          {portrait !== null ? (
            <Image source={portrait} resizeMode="cover" style={styles.portrait} accessible={false} />
          ) : null}
          <View style={styles.imageShade} />
        </View>
        <View pointerEvents="none" style={styles.innerBorder} />
        <View style={styles.heroContent}>
          <Text style={styles.heroEyebrow}>MEET SEYEON · 세연</Text>
          <Text style={styles.heroTitle}>오늘은 어떤 이야기를 나눠볼까요?</Text>
          <Text style={styles.heroDescription}>여섯 대리자의 이야기를 만나보세요.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="캐릭터 선택 화면으로 이동"
            onPress={() => router.push('/chat')}
            style={({ pressed }) => [styles.heroAction, pressed && styles.actionPressed]}
          >
            <Text style={styles.heroActionText}>캐릭터 만나기</Text>
            <Text style={styles.heroActionArrow} accessible={false}>→</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.quickActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="내 사주 화면으로 이동"
          onPress={() => router.push('/reading')}
          style={({ pressed }) => [
            styles.quickAction,
            { backgroundColor: colors.surface, borderColor: colors.border },
            pressed && styles.actionPressed,
          ]}
        >
          <Text style={[styles.quickSymbol, { color: colors.gold }]}>命</Text>
          <View style={styles.quickCopy}>
            <Text style={[styles.quickTitle, { color: colors.ink }]}>내 사주</Text>
            <Text style={[styles.quickSubtitle, { color: colors.muted }]}>명식과 풀이 살펴보기</Text>
          </View>
          <Text style={[styles.quickArrow, { color: colors.navy }]}>›</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="지난 이야기 기록 화면으로 이동"
          onPress={() => router.push('/records')}
          style={({ pressed }) => [
            styles.quickAction,
            { backgroundColor: colors.surface, borderColor: colors.border },
            pressed && styles.actionPressed,
          ]}
        >
          <Text style={[styles.quickSymbol, { color: colors.gold }]}>錄</Text>
          <View style={styles.quickCopy}>
            <Text style={[styles.quickTitle, { color: colors.ink }]}>지난 이야기</Text>
            <Text style={[styles.quickSubtitle, { color: colors.muted }]}>저장된 기록 확인하기</Text>
          </View>
          <Text style={[styles.quickArrow, { color: colors.navy }]}>›</Text>
        </Pressable>
      </View>
      <Text style={[styles.accessNote, { color: colors.muted }]}>
        대화 가능 여부와 기록 접근은 로그인 및 현재 서비스 상태에 따라 달라집니다.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 13 },
  sectionHeading: { gap: 4 },
  kicker: { fontSize: 10, fontWeight: '800', letterSpacing: 1.7 },
  sectionTitle: { fontSize: 23, fontWeight: '800', letterSpacing: -0.5 },
  hero: {
    height: 350,
    borderRadius: 22,
    backgroundColor: '#0E2032',
    borderWidth: 1,
    borderColor: '#B89260',
    overflow: 'hidden',
    position: 'relative',
  },
  imageCrop: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  portrait: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: '100%',
    height: '100%',
    opacity: 0.88,
  },
  imageShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(9, 22, 36, 0.43)',
  },
  innerBorder: {
    position: 'absolute',
    top: 9,
    right: 9,
    bottom: 9,
    left: 9,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(230,194,137,0.38)',
  },
  heroContent: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    gap: 13,
    paddingHorizontal: 24,
    paddingBottom: 26,
    paddingTop: 22,
  },
  heroEyebrow: { fontSize: 10, color: '#F0CE91', fontWeight: '900', letterSpacing: 1.7 },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 29,
    fontWeight: '800',
    lineHeight: 39,
    letterSpacing: -0.8,
    maxWidth: 260,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  heroDescription: { color: '#FBF0DF', fontSize: 13, fontWeight: '600' },
  heroAction: {
    marginTop: 3,
    minHeight: 48,
    minWidth: 192,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#E8C48D',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 18,
  },
  heroActionText: { color: '#102337', fontSize: 14, fontWeight: '900' },
  heroActionArrow: { color: '#102337', fontSize: 18, fontWeight: '800' },
  actionPressed: { opacity: 0.78 },
  quickActions: { flexDirection: 'row', gap: 10 },
  quickAction: {
    flex: 1,
    minHeight: 124,
    borderWidth: 1,
    borderRadius: 17,
    paddingHorizontal: 14,
    paddingVertical: 14,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  quickSymbol: { fontSize: 20, fontWeight: '800' },
  quickCopy: { gap: 4, maxWidth: '100%' },
  quickTitle: { fontSize: 15, fontWeight: '800' },
  quickSubtitle: { fontSize: 11, lineHeight: 17 },
  quickArrow: { position: 'absolute', top: 13, right: 14, fontSize: 20, fontWeight: '700' },
  accessNote: { fontSize: 11, lineHeight: 17 },
});
