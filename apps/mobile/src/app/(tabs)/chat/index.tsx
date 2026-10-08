import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { resolveMobileChatCharacterPresentationV1 } from '@/features/chat/chat-character-presentation';
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
        <Text style={styles.title}>이어지는 대화</Text>
        <Text style={styles.body}>
          웹과 앱에서 같은 회원 계정으로 대화방을 열면 서버에 보관된 대화를 이어서 볼 수 있습니다.
        </Text>
        <Text style={styles.note}>
          최근 대화 목록은 아직 서버에서 제공하지 않아 이 화면에서 임의로 만들지 않습니다.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.kicker}>MEET</Text>
        <Text style={styles.title}>대화 상대 선택</Text>
        <Text style={styles.body}>
          승인된 출시 9명을 한눈에 보고 대화 상대를 고를 수 있습니다. 실제 사용 가능 여부와 대화방 생성·재사용은 서버가 결정합니다.
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
              const presentation = resolveMobileChatCharacterPresentationV1(character.characterId);
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
                    <Text style={styles.characterMarkText}>
                      {character.displayName.slice(0, 1)}
                    </Text>
                  </View>
                  <View style={styles.characterCopy}>
                    <View style={styles.characterTitleRow}>
                      <Text style={styles.characterName}>{character.displayName}</Text>
                      <Text style={styles.characterTitle}>{presentation.title}</Text>
                    </View>
                    <Text style={styles.characterLine}>{presentation.openingLine}</Text>
                    <View style={styles.characterTags}>
                      {presentation.tags.map((tag) => (
                        <View key={tag} style={styles.characterTag}>
                          <Text style={styles.characterTagText}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
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
          9명 모두 캐릭터를 선택해 대화방을 열 수 있습니다. 세연은 실제 AI 대화가 가능하며, 다른 8명의 답변 기능은 준비 중입니다.
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
  roster: { gap: 10, paddingTop: 2 },
  characterRow: {
    minHeight: 116,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 16,
    padding: 14,
    backgroundColor: mobileColors.canvas,
  },
  disabled: { opacity: 0.55 },
  characterMark: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: mobileColors.gold,
    borderRadius: 20,
    backgroundColor: mobileColors.surface,
  },
  characterMarkText: { color: mobileColors.navy, fontSize: 16, fontWeight: '900' },
  characterCopy: { flex: 1, gap: 6 },
  characterTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  characterName: { color: mobileColors.ink, fontSize: 16, fontWeight: '900' },
  characterTitle: { color: mobileColors.muted, fontSize: 11, fontWeight: '700' },
  characterLine: { color: mobileColors.ink, fontSize: 13, lineHeight: 19 },
  characterTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  characterTag: {
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: mobileColors.surface,
  },
  characterTagText: { color: mobileColors.muted, fontSize: 10, fontWeight: '700' },
  characterAction: { color: mobileColors.navy, fontSize: 11, fontWeight: '800', paddingTop: 3 },
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
