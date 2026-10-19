import { router } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { mobileDesign } from '@/ui/mobile-design-tokens';

/**
 * Editorial, character-led home entry. This is a navigation surface only:
 * it must never infer whether a character can answer or expose held history.
 * Uses the already-approved bundled SeYeon portrait, not a new identity.
 */
export function HomeCharacterFeature() {
  return (
    <View style={styles.card}>
      <View style={styles.textContent}>
        <Text style={styles.kicker}>MEET SEYEON · 세연</Text>
        <Text style={styles.title}>오늘은 어떤 이야기를 나눠볼까요?</Text>
        <Text style={styles.description}>
          당신의 이야기를 들어줄 대리자들을 만나보세요.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="대화 상대 선택 화면으로 이동"
          onPress={() => router.push('/chat')}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Text style={styles.actionText}>대화 상대 만나기</Text>
          <Text style={styles.actionArrow} accessibilityElementsHidden>›</Text>
        </Pressable>
      </View>
      <Image
        source={require('../../../assets/characters/seyeon-portrait.webp')}
        resizeMode="cover"
        style={styles.portrait}
        accessibilityIgnoresInvertColors
        accessible={false}
      />
      <View pointerEvents="none" style={styles.frameOuter} />
      <View pointerEvents="none" style={styles.bottomLine} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'relative',
    minHeight: 250,
    backgroundColor: mobileDesign.color.hero,
    borderWidth: 1,
    borderColor: mobileDesign.color.heroBorder,
    borderRadius: mobileDesign.radius.hero,
    overflow: 'hidden',
  },
  textContent: {
    zIndex: 2,
    width: '68%',
    minHeight: 250,
    paddingVertical: 25,
    paddingLeft: 20,
    paddingRight: 4,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  kicker: {
    color: mobileDesign.color.goldBright,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: {
    color: mobileDesign.color.heroText,
    fontSize: 23,
    fontWeight: '800',
    lineHeight: 32,
    letterSpacing: -0.6,
  },
  description: {
    color: mobileDesign.color.heroSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    minHeight: mobileDesign.touch.minimum,
    paddingHorizontal: 15,
    borderRadius: mobileDesign.radius.action,
    backgroundColor: mobileDesign.color.goldBright,
    marginTop: 4,
  },
  actionText: { color: mobileDesign.color.hero, fontSize: 12, fontWeight: '800' },
  actionArrow: { color: mobileDesign.color.hero, fontSize: 20, fontWeight: '700' },
  pressed: { opacity: 0.8 },
  portrait: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: '45%',
    height: '100%',
    opacity: 0.92,
  },
  frameOuter: {
    position: 'absolute',
    top: 7,
    right: 7,
    bottom: 7,
    left: 7,
    borderWidth: 1,
    borderColor: 'rgba(210,175,112,0.32)',
    borderRadius: 14,
  },
  bottomLine: {
    position: 'absolute',
    left: 18,
    bottom: 7,
    width: 38,
    height: 1,
    backgroundColor: mobileDesign.color.goldBright,
  },
});
