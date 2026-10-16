import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { FORTUNE_COOKIE_MESSAGES_V1, pickFortuneCookieIndexV1 } from '@/features/home/mobile-fortune-cookie';
import { mobileColors } from '@/ui/mobile-colors';

/** Recreational random notes, not a birth-based or AI-generated Saju prediction. */
export function MobileFortuneCookie() {
  const [revealed, setRevealed] = useState(false);
  const [index, setIndex] = useState(-1);

  function draw() {
    setIndex((previous) => pickFortuneCookieIndexV1(previous));
    setRevealed(true);
  }

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text style={styles.kicker}>A LITTLE FORTUNE</Text>
        <Text style={styles.title}>오늘의 운세</Text>
        <Text style={styles.description}>가볍게 뽑아 보는 오늘의 포춘쿠키</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={draw} style={styles.card}>
        <View style={styles.symbol}>
          <Text style={styles.symbolText}>✦</Text>
        </View>
        <View style={styles.copy}>
          <Text style={styles.callToAction}>행운의 쪽지 열기</Text>
          <Text style={styles.note}>오늘의 작은 행운을 한 장 뽑아보세요.</Text>
        </View>
        <Text style={styles.arrow}>→</Text>
      </Pressable>
      <Text style={styles.disclaimer}>재미로 보는 무작위 메시지입니다. 개인 사주 풀이가 아닙니다.</Text>
      <Modal
        visible={revealed}
        animationType="fade"
        transparent
        onRequestClose={() => setRevealed(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.dialog} accessibilityLabel="오늘의 포춘쿠키 쪽지">
            <View style={styles.dialogTop}>
              <Text style={styles.kicker}>A LITTLE FORTUNE</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="쪽지 닫기"
                onPress={() => setRevealed(false)} style={styles.closeButton}>
                <Text style={styles.closeText}>✕</Text>
              </Pressable>
            </View>
            <Text style={styles.dialogTitle}>오늘의 쪽지</Text>
            <Text style={styles.ornament}>✦</Text>
            <Text style={styles.message}>
              {index < 0 ? '' : FORTUNE_COOKIE_MESSAGES_V1[index]}
            </Text>
            <Text style={styles.ornament}>◇</Text>
            <Pressable accessibilityRole="button" onPress={draw} style={styles.redraw}>
              <Text style={styles.redrawText}>다른 쪽지 뽑기 ↻</Text>
            </Pressable>
            <Text style={styles.disclaimer}>이 쪽지는 재미로 읽는 메시지입니다.</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 11 },
  head: { gap: 5 },
  kicker: { color: mobileColors.gold, fontSize: 11, letterSpacing: 1.1, fontWeight: '900' },
  title: { color: mobileColors.ink, fontSize: 23, fontWeight: '900' },
  description: { color: mobileColors.muted, fontSize: 13 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 15,
    borderRadius: 19, backgroundColor: mobileColors.surface,
    borderWidth: 1, borderColor: mobileColors.border,
    padding: 18, minHeight: 106,
  },
  symbol: {
    width: 61, height: 61, borderRadius: 31,
    backgroundColor: mobileColors.canvas,
    borderWidth: 1, borderColor: mobileColors.gold,
    alignItems: 'center', justifyContent: 'center',
  },
  symbolText: { color: mobileColors.gold, fontSize: 32 },
  copy: { flex: 1, gap: 7 },
  callToAction: { color: mobileColors.ink, fontSize: 16, fontWeight: '900' },
  note: { color: mobileColors.muted, fontSize: 12, lineHeight: 18 },
  arrow: { color: mobileColors.navy, fontSize: 22, fontWeight: '700' },
  disclaimer: { color: mobileColors.muted, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  overlay: {
    flex: 1, justifyContent: 'center', padding: 22,
    backgroundColor: 'rgba(20, 30, 42, 0.67)',
  },
  dialog: {
    borderRadius: 22, borderWidth: 1, borderColor: mobileColors.gold,
    backgroundColor: mobileColors.surface,
    paddingHorizontal: 23, paddingVertical: 21,
    gap: 13, alignItems: 'center',
  },
  dialogTop: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  closeButton: { minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: mobileColors.ink, fontSize: 17 },
  dialogTitle: { color: mobileColors.ink, fontSize: 23, fontWeight: '900' },
  ornament: { color: mobileColors.gold, fontSize: 28, fontWeight: '800' },
  message: {
    color: mobileColors.ink, fontSize: 21, fontWeight: '700',
    lineHeight: 32, textAlign: 'center', paddingHorizontal: 7, paddingVertical: 18,
  },
  redraw: {
    alignSelf: 'stretch', borderRadius: 12, backgroundColor: mobileColors.navy,
    alignItems: 'center', paddingVertical: 14,
  },
  redrawText: { color: mobileColors.surface, fontWeight: '800', fontSize: 14 },
});
