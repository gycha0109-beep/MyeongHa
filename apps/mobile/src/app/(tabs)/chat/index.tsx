import { StyleSheet, Text, View } from 'react-native';

import { MobileScreen } from '@/ui/MobileScreen';
import { mobileColors } from '@/ui/mobile-colors';

export default function ChatHubScreen() {
  return (
    <MobileScreen
      eyebrow="CONVERSATION"
      title="대화"
      description="서버가 확인한 기존 대화는 다시 읽을 수 있습니다."
    >
      <View style={styles.card}>
        <Text style={styles.kicker}>CONTINUE</Text>
        <Text style={styles.title}>기존 대화 읽기</Text>
        <Text style={styles.body}>
          기존 대화로 연결되는 링크가 있으면 해당 대화의 메시지 기록을 읽기 전용으로 엽니다.
        </Text>
        <Text style={styles.note}>
          최근 대화 목록은 아직 서버에서 제공하지 않아 이 화면에서 임의로 만들지 않습니다.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.kicker}>MEET</Text>
        <Text style={styles.title}>새 대화 시작</Text>
        <Text style={styles.body}>
          사람 선택과 새 대화 시작은 모바일 회원 연결과 캐릭터 목록이 함께 준비된 뒤 열립니다.
        </Text>
        <Text style={styles.pending}>준비 중</Text>
      </View>

      <View style={styles.memoryNote}>
        <Text style={styles.memoryMark}>◇</Text>
        <Text style={styles.memoryCopy}>
          메시지 보내기는 아직 열지 않습니다. 현재 단계는 기존 대화의 서버 기록을 안전하게 읽는 범위입니다.
        </Text>
      </View>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 18,
    backgroundColor: mobileColors.surface,
    padding: 20,
    gap: 8,
  },
  kicker: { color: mobileColors.gold, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  title: { color: mobileColors.ink, fontSize: 19, fontWeight: '800' },
  body: { color: mobileColors.muted, fontSize: 14, lineHeight: 21 },
  note: { color: mobileColors.muted, fontSize: 12, lineHeight: 18 },
  pending: { alignSelf: 'flex-start', color: mobileColors.navy, fontSize: 12, fontWeight: '800' },
  memoryNote: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    borderTopWidth: 1,
    borderTopColor: mobileColors.border,
    paddingTop: 18,
  },
  memoryMark: { color: mobileColors.gold, fontSize: 18, fontWeight: '800' },
  memoryCopy: { flex: 1, color: mobileColors.muted, fontSize: 13, lineHeight: 20 },
});
