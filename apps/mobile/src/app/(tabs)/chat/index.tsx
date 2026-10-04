import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { MOBILE_CHAT_LAUNCH_ROSTER_V1 } from '@/features/chat/chat-launch-roster';
import { useMobileChatOpenV1 } from '@/features/chat/use-mobile-chat-open';
import { MobileScreen } from '@/ui/MobileScreen';
import { mobileColors } from '@/ui/mobile-colors';

export default function ChatHubScreen() {
  const { state, openCharacter } = useMobileChatOpenV1();

  async function handleOpen(
    characterId: (typeof MOBILE_CHAT_LAUNCH_ROSTER_V1)[number]['characterId'],
  ) {
    const result = await openCharacter(characterId);
    if (result !== null) router.push(`/chat/${result.threadId}`);
  }

  return (
    <MobileScreen
      eyebrow="CONVERSATION"
      title="대화"
      description="회원은 승인된 출시 캐릭터와의 대화를 열거나 이어갈 수 있습니다."
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
        <Text style={styles.title}>대화 상대 선택</Text>
        <Text style={styles.body}>
          승인된 출시 9명의 ID와 공식 이름만 표시합니다. 실제 사용 가능 여부와 대화방 생성·재사용은 서버가 결정합니다.
        </Text>

        {state.access === 'checking' ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={mobileColors.navy} />
            <Text style={styles.note}>회원 상태를 확인하는 중입니다…</Text>
          </View>
        ) : state.access === 'guest' ? (
          <View style={styles.guestBox}>
            <Text style={styles.note}>
              새 대화 시작은 회원 전용입니다. 기존 계정으로 로그인한 뒤 이용해 주세요.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/my')}
              style={styles.loginAction}
            >
              <Text style={styles.loginActionText}>마이에서 로그인</Text>
            </Pressable>
          </View>
        ) : state.access === 'error' ? (
          <Text style={styles.errorText}>{state.errorMessage}</Text>
        ) : (
          <View style={styles.roster}>
            {MOBILE_CHAT_LAUNCH_ROSTER_V1.map((character) => {
              const opening = state.openingCharacterId === character.characterId;
              const disabled = state.openingCharacterId !== null;
              return (
                <Pressable
                  key={character.characterId}
                  accessibilityRole="button"
                  disabled={disabled}
                  onPress={() => void handleOpen(character.characterId)}
                  style={[styles.characterRow, disabled && styles.disabled]}
                >
                  <View style={styles.characterMark}>
                    <Text style={styles.characterMarkText}>明</Text>
                  </View>
                  <Text style={styles.characterName}>{character.displayName}</Text>
                  <Text style={styles.characterAction}>
                    {opening ? '여는 중…' : '대화 열기'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {state.errorMessage !== null && state.access !== 'error' ? (
          <Text style={styles.errorText}>{state.errorMessage}</Text>
        ) : null}
      </View>

      <View style={styles.memoryNote}>
        <Text style={styles.memoryMark}>◇</Text>
        <Text style={styles.memoryCopy}>
          메시지 보내기는 아직 열지 않습니다. 새 대화를 열어도 현재 모바일 화면은 서버 기록을 읽는 범위만 제공합니다.
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
    gap: 10,
  },
  kicker: { color: mobileColors.gold, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  title: { color: mobileColors.ink, fontSize: 19, fontWeight: '800' },
  body: { color: mobileColors.muted, fontSize: 14, lineHeight: 21 },
  note: { color: mobileColors.muted, fontSize: 12, lineHeight: 18 },
  centerState: { minHeight: 76, alignItems: 'center', justifyContent: 'center', gap: 8 },
  guestBox: { gap: 10, paddingTop: 4 },
  loginAction: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: mobileColors.navy,
  },
  loginActionText: { color: mobileColors.surface, fontSize: 13, fontWeight: '800' },
  roster: { gap: 8, paddingTop: 2 },
  characterRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    backgroundColor: mobileColors.canvas,
  },
  disabled: { opacity: 0.55 },
  characterMark: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: mobileColors.gold,
    borderRadius: 16,
  },
  characterMarkText: { color: mobileColors.navy, fontSize: 13, fontWeight: '900' },
  characterName: { flex: 1, color: mobileColors.ink, fontSize: 15, fontWeight: '800' },
  characterAction: { color: mobileColors.navy, fontSize: 12, fontWeight: '800' },
  errorText: { color: mobileColors.seal, fontSize: 12, lineHeight: 18 },
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
