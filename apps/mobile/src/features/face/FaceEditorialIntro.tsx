import { Image, StyleSheet, Text, View } from 'react-native';

import { resolveMobileChatPortraitV1 } from '@/features/chat/chat-character-portraits';
import { findMobileReaderPresentationV1, type MobileReaderPresentationIdV1 } from '@/features/reading/mobile-reader-presentation';
import { useMobileTheme } from '@/ui/mobile-theme';
import { MobileUiText } from '@/ui/MobileUiText';

/**
 * Face-reading onboarding hero.
 * Uses the existing local Reader portrait only. This is a presentation
 * surface; it must never imply an active face-analysis engine or entitlement.
 */
export function FaceEditorialIntro({ readerId }: { readerId: MobileReaderPresentationIdV1 }) {
  const { theme } = useMobileTheme();
  const reader = findMobileReaderPresentationV1(readerId);
  const portrait = resolveMobileChatPortraitV1(readerId);

  return (
    <View style={[styles.hero, theme === 'dark' && styles.heroDark]}>
      <View pointerEvents="none" style={styles.portraitArea}>
        {portrait !== null ? (
          <Image source={portrait} resizeMode="cover" style={styles.portrait} accessible={false} />
        ) : null}
        <View style={styles.portraitVeil} />
      </View>
      <View pointerEvents="none" style={styles.innerFrame} />
      <View style={styles.content}>
        <Text style={styles.eyebrow}>FACE READING · 相</Text>
        <MobileUiText style={styles.title}>얼굴에 담긴 나의 이야기</MobileUiText>
        <Text style={styles.body}>
          정면 사진을 준비하고, {reader.name}과 함께할 관상 읽기의 시작을 만나보세요.
        </Text>
        <View style={styles.statusRow}>
          <View style={styles.statusDot} />
          <MobileUiText style={styles.statusText}>사진 촬영·미리보기 제공 · 분석 준비 중</MobileUiText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    height: 278,
    borderRadius: 23,
    backgroundColor: '#142B40',
    borderWidth: 1,
    borderColor: '#C6A273',
    overflow: 'hidden',
    position: 'relative',
  },
  heroDark: { backgroundColor: '#101E2E', borderColor: '#D9B581' },
  portraitArea: {
    position: 'absolute', top: 0, right: 0, bottom: 0, width: '54%',
    overflow: 'hidden',
  },
  portrait: { width: '100%', height: '100%', opacity: 0.86 },
  portraitVeil: {
    position: 'absolute', top: 0, bottom: 0, right: 0, left: 0,
    backgroundColor: 'rgba(9, 23, 39, 0.35)',
  },
  innerFrame: {
    position: 'absolute', top: 8, right: 8, bottom: 8, left: 8,
    borderColor: 'rgba(231,197,149,0.36)', borderWidth: 1, borderRadius: 16,
  },
  content: {
    flex: 1,
    paddingHorizontal: 22,
    paddingVertical: 24,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    maxWidth: '80%',
    zIndex: 1,
  },
  eyebrow: { color: '#E6C590', fontSize: 10, fontWeight: '900', letterSpacing: 1.45 },
  title: {
    color: '#FFF9F1', fontSize: 28, lineHeight: 38, fontWeight: '900',
    letterSpacing: -0.8,
    textShadowColor: 'rgba(4, 15, 26, 0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  body: {
    color: '#F7EBDD', fontSize: 12, lineHeight: 20, fontWeight: '600',
    textShadowColor: '#102235', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  statusRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#E6C590' },
  statusText: { color: '#F2DEBE', fontSize: 10, fontWeight: '800', maxWidth: '95%' },
});
