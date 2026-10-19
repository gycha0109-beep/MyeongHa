import { router } from 'expo-router';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { resolveMobileChatCharacterPresentationV1 } from '@/features/chat/chat-character-presentation';
import { resolveMobileChatPortraitV1 } from '@/features/chat/chat-character-portraits';
import {
  MOBILE_CHAT_LAUNCH_ROSTER_V1,
  MOBILE_CHAT_PENDING_ROSTER_V1,
} from '@/features/chat/chat-launch-roster';
import { useMobileChatOpenV1 } from '@/features/chat/use-mobile-chat-open';
import { MobileScreen } from '@/ui/MobileScreen';
import { mobileColors } from '@/ui/mobile-colors';
import { useMobileThemedStyles } from '@/ui/use-mobile-themed-styles';
import { useMobilePullRefreshV1 } from '@/ui/use-mobile-pull-refresh';

export default function ChatHubScreen() {
  const styles = useMobileThemedStyles(staticStyles);
  const { state, openCharacter, refreshAccess } = useMobileChatOpenV1();
  const { refreshing, onRefresh } = useMobilePullRefreshV1(refreshAccess);

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
      description="누구와 이야기를 시작해 볼까요? 마음이 가는 대리자를 선택해 주세요."
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
    >
      <View style={styles.intro}>
        <View style={styles.introHeading}>
          <Text style={styles.kicker}>MEET</Text>
          <Text style={styles.introCounter}>대리자 {MOBILE_CHAT_LAUNCH_ROSTER_V1.length}명</Text>
        </View>
        <Text style={styles.title}>대화 상대 선택</Text>
        <Text style={styles.body}>
          캐릭터별 분위기를 둘러보세요. 대화방과 기존 기록은 현재 회원 계정에 연결됩니다.
        </Text>
        <Text style={styles.note}>
          세연은 회원 로그인 후 AI 대화가 가능하며, 다른 대리자의 AI 답변은 준비 중입니다.
        </Text>
        <Text style={styles.note}>
          최근 대화 목록은 아직 서버에서 제공하지 않아 별도 목록으로 표시하지 않습니다.
        </Text>
        {state.access === 'checking' ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={mobileColors.navy} />
            <Text style={styles.note}>회원 상태를 확인하는 중입니다…</Text>
          </View>
        ) : state.access === 'guest' ? (
          <Pressable accessibilityRole="button" onPress={() => router.push('/my')} style={styles.loginAction}>
            <Text style={styles.loginActionText}>로그인 후 대화하기 →</Text>
          </Pressable>
        ) : state.access === 'error' ? (
          <Text style={styles.errorText}>{state.errorMessage}</Text>
        ) : null}
      </View>

      <View style={styles.roster}>
        {MOBILE_CHAT_LAUNCH_ROSTER_V1.map((character) => {
          const presentation = resolveMobileChatCharacterPresentationV1(character.characterId);
          const portrait = resolveMobileChatPortraitV1(character.characterId);
          const opening = state.openingCharacterId === character.characterId;
          const canOpen = state.access === 'member';
          const disabled = !canOpen || state.openingCharacterId !== null;
          return (
            <Pressable
              key={character.characterId}
              accessibilityRole="button"
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={() => void handleOpen(character.characterId)}
              accessibilityLabel={`${character.displayName}, ${presentation.title}, ${character.characterId === 'seyeon' ? 'AI 대화 가능' : 'AI 준비 중'}, ${canOpen ? '대화방 열기' : '로그인 필요'}`}
              style={[styles.characterCard, opening && styles.disabled]}
            >
              <View style={styles.cardMain}>
                <View style={styles.characterMark}>
                  {portrait === null ? (
                    <Text style={styles.characterMarkText}>{character.displayName.slice(0, 1)}</Text>
                  ) : (
                    <Image
                      source={portrait}
                      style={styles.characterPortrait}
                      resizeMode="cover"
                      accessibilityLabel={`${character.displayName} 대리자 초상화`}
                    />
                  )}
                </View>
                <View style={styles.characterCopy}>
                  <View style={styles.characterTitleRow}>
                    <Text style={styles.characterName}>{character.displayName}</Text>
                    <Text style={styles.characterTitle}>{presentation.title}</Text>
                  </View>
                  <Text style={styles.characterLine} numberOfLines={2}>{presentation.openingLine}</Text>
                  <Text style={[styles.characterStatus, character.characterId === 'seyeon' && styles.characterStatusAvailable]}>
                    {character.characterId === 'seyeon' ? '●  AI 대화 가능' : '◇  AI 답변 준비 중 · 기록 열람 가능'}
                  </Text>
                </View>
                <View style={styles.characterActionWrap}>
                  <Text style={[styles.characterAction, !canOpen && styles.actionUnavailable]}>
                    {opening ? '…' : canOpen ? '›' : '잠금'}
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        })}
        {state.errorMessage !== null && state.access !== 'error' ? (
          <Text style={styles.errorText}>{state.errorMessage}</Text>
        ) : null}
      </View>

      <View style={styles.pendingSection}>
        <Text style={styles.kicker}>COMING SOON</Text>
        <Text style={styles.pendingTitle}>대리자 등록 중</Text>
        <Text style={styles.note}>곧 만나볼 수 있는 대리자들입니다. 현재 대화는 열 수 없습니다.</Text>
        <View style={styles.pendingList}>
          {MOBILE_CHAT_PENDING_ROSTER_V1.map((character) => {
            const presentation = resolveMobileChatCharacterPresentationV1(character.characterId);
            return (
              <View key={character.characterId} style={styles.pendingRow}>
                <View style={styles.pendingMark}><Text style={styles.pendingMarkText}>◇</Text></View>
                <View style={styles.pendingCopy}>
                  <Text style={styles.pendingName}>{character.displayName} <Text style={styles.pendingRole}>· {presentation.title}</Text></Text>
                  <Text style={styles.note}>캐릭터 소개 준비 중</Text>
                </View>
                <Text style={styles.pendingPill}>등록 중</Text>
              </View>
            );
          })}
        </View>
      </View>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  intro: {
    paddingHorizontal: 4, gap: 9,
  },
  introHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker: { color: mobileColors.gold, fontSize: 11, fontWeight: '900', letterSpacing: 1.1 },
  introCounter: { color: mobileColors.muted, fontSize: 11, fontWeight: '700' },
  title: { color: mobileColors.ink, fontSize: 22, fontWeight: '900' },
  body: { color: mobileColors.muted, fontSize: 14, lineHeight: 21 },
  note: { color: mobileColors.muted, fontSize: 12, lineHeight: 18 },
  centerState: { flexDirection: 'row', gap: 9, alignItems: 'center', paddingVertical: 9 },
  loginAction: {
    borderRadius: 12, backgroundColor: mobileColors.navy,
    alignItems: 'center', paddingVertical: 13,
  },
  loginActionText: { color: mobileColors.surface, fontSize: 13, fontWeight: '800' },
  roster: { gap: 9 },
  characterCard: {
    borderWidth: 1, borderColor: mobileColors.border, borderRadius: 16,
    backgroundColor: mobileColors.surface, padding: 11,
  },
  cardMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  characterMark: {
    width: 76, height: 90, borderRadius: 12, overflow: 'hidden',
    borderWidth: 1, borderColor: mobileColors.gold, backgroundColor: mobileColors.canvas,
    alignItems: 'center', justifyContent: 'center',
  },
  characterPortrait: { width: '100%', height: '100%' },
  characterMarkText: { fontSize: 19, color: mobileColors.navy, fontWeight: '900' },
  characterCopy: { flex: 1, gap: 5 },
  characterTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' },
  characterName: { color: mobileColors.ink, fontSize: 18, fontWeight: '900' },
  characterTitle: { color: mobileColors.muted, fontSize: 12, fontWeight: '700' },
  characterLine: { color: mobileColors.ink, fontSize: 12, lineHeight: 18 },
  characterStatus: { color: mobileColors.muted, fontSize: 11, fontWeight: '700' },
  characterStatusAvailable: { color: mobileColors.navy },
  characterActionWrap: { minWidth: 32, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  characterAction: { color: mobileColors.navy, fontSize: 26, fontWeight: '700' },
  actionUnavailable: { color: mobileColors.muted, fontSize: 11 },
  disabled: { opacity: 0.55 },
  errorText: { color: mobileColors.seal, fontSize: 12, lineHeight: 18 },
  pendingSection: { gap: 10, paddingTop: 18, borderTopWidth: 1, borderTopColor: mobileColors.border },
  pendingTitle: { color: mobileColors.ink, fontSize: 20, fontWeight: '900' },
  pendingList: { gap: 9, paddingTop: 3 },
  pendingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    borderRadius: 14, borderWidth: 1, borderColor: mobileColors.border,
    padding: 12, backgroundColor: mobileColors.canvas,
  },
  pendingMark: {
    width: 45, height: 45, borderRadius: 11,
    borderWidth: 1, borderColor: mobileColors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  pendingMarkText: { color: mobileColors.gold, fontSize: 20 },
  pendingCopy: { flex: 1, gap: 3 },
  pendingName: { color: mobileColors.ink, fontSize: 15, fontWeight: '800' },
  pendingRole: { color: mobileColors.muted, fontSize: 11, fontWeight: '600' },
  pendingPill: { color: mobileColors.gold, fontSize: 11, fontWeight: '800' },
});
const staticStyles = styles;
