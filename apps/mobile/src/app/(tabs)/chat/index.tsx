import { router, useLocalSearchParams } from 'expo-router';
import { plannedMobileUiPreviewLocaleV1, previewMobileAuthoredUiLabelV1 } from '@/ui/mobile-planned-ui-screen-preview-v1';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { resolveMobileChatCharacterPresentationV1 } from '@/features/chat/chat-character-presentation';
import { resolveMobileChatPortraitV1 } from '@/features/chat/chat-character-portraits';
import {
  MOBILE_CHAT_LAUNCH_ROSTER_V1,
  MOBILE_CHAT_PENDING_ROSTER_V1,
} from '@/features/chat/chat-launch-roster';
import { useMobileChatOpenV1 } from '@/features/chat/use-mobile-chat-open';
import { MobileScreen } from '@/ui/MobileScreen';
import { useMobileUiLocale } from '@/ui/mobile-ui-locale';
import { MobileUiText } from '@/ui/MobileUiText';
import { mobileColors } from '@/ui/mobile-colors';
import { useMobileThemedStyles } from '@/ui/use-mobile-themed-styles';
import { useMobilePullRefreshV1 } from '@/ui/use-mobile-pull-refresh';

export default function ChatHubScreen() {
  const styles = useMobileThemedStyles(staticStyles);
  const { t } = useMobileUiLocale();
  const { uiPreview } = useLocalSearchParams<{ uiPreview?: string | string[] }>();
  const previewLocale = plannedMobileUiPreviewLocaleV1(uiPreview, __DEV__);
  const previewText = (source: string) => previewMobileAuthoredUiLabelV1(source, previewLocale, t);
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
      eyebrow="MEET THE CHARACTERS"
      title={previewText('대화')}
      description={t('저마다 다른 목소리로, 당신의 이야기를 들어줄 연결자들을 만나보세요.')}
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
    >
      <View style={styles.intro}>
        <View style={styles.introHeading}>
          <Text style={styles.kicker}>THE PEOPLE OF MYEONGHA</Text>
          <Text style={styles.introCounter}>{t('연결자 {count}명').replace('{count}', String(MOBILE_CHAT_LAUNCH_ROSTER_V1.length))}</Text>
        </View>
        <MobileUiText style={styles.title}>{previewText("당신은 누구와 이야기하고 싶으신가요?")}</MobileUiText>
        <MobileUiText style={styles.body}>
          {previewText("마음이 가는 인물을 고르세요. 각 연결자의 이야기와 분위기가 다릅니다.")}
        </MobileUiText>
        <MobileUiText style={styles.note}>대화 열기는 회원 로그인 후 가능합니다. 일부 AI 답변과 기존 기록은 현재 이용이 제한될 수 있습니다.</MobileUiText>
        {state.access === 'checking' ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={mobileColors.navy} />
            <MobileUiText style={styles.note}>{previewText("회원 상태를 확인하는 중입니다…")}</MobileUiText>
          </View>
        ) : state.access === 'guest' ? (
          <Pressable accessibilityRole="button" onPress={() => router.push('/my')} style={styles.loginAction}>
            <MobileUiText style={styles.loginActionText}>{previewText("로그인 후 대화하기  →")}</MobileUiText>
          </Pressable>
        ) : state.access === 'error' ? (
          <Text style={styles.errorText}>{state.errorMessage}</Text>
        ) : null}
      </View>

      <View style={styles.roster}>
        {MOBILE_CHAT_LAUNCH_ROSTER_V1.map((character) => {
          const presentation = resolveMobileChatCharacterPresentationV1(character.characterId);
          const portrait = resolveMobileChatPortraitV1(character.characterId);
          const featured = character.characterId === 'seyeon';
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
              accessibilityLabel={`${character.displayName}, ${t(presentation.title)}, ${previewText(featured ? 'AI 서비스 상태 확인 필요' : 'AI 답변 준비 중')}, ${previewText(canOpen ? '대화방 열기' : '로그인 필요')}`}
              style={({ pressed }) => [
                styles.characterCard,
                featured && styles.featuredCard,
                opening && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.cardMain}>
                <View style={[styles.characterMark, featured && styles.featuredMark]}>
                  {portrait === null ? (
                    <Text style={styles.characterMarkText}>{character.displayName.slice(0, 1)}</Text>
                  ) : (
                    <Image
                      source={portrait}
                      style={styles.characterPortrait}
                      resizeMode="cover"
                      accessibilityLabel={`${character.displayName} ${t('연결자 초상화')}`}
                      accessible={false}
                    />
                  )}
                  <View pointerEvents="none" style={[styles.portraitShade, featured && styles.featuredShade]} />
                  <View pointerEvents="none" style={styles.portraitLabel}>
                    <Text style={styles.portraitLabelText}>{featured ? 'FEATURED PERSON' : t(presentation.title)}</Text>
                  </View>
                  {featured ? (
                    <View pointerEvents="none" style={styles.featuredImageCopy}>
                      <MobileUiText style={styles.featuredCharacterName}>세연</MobileUiText>
                      <MobileUiText style={styles.featuredImageLine}>{previewText("오늘의 이야기를 함께할 연결자")}</MobileUiText>
                    </View>
                  ) : null}
                </View>
                <View style={[styles.characterCopy, featured && styles.featuredCopy]}>
                  <View style={styles.characterTitleRow}>
                    <Text style={[styles.characterName, featured && styles.featuredText]}>{character.displayName}</Text>
                    <Text style={[styles.characterTitle, featured && styles.featuredMutedText]}>{t(presentation.title)}</Text>
                  </View>
                  <Text style={[styles.characterLine, featured && styles.featuredText]} numberOfLines={2}>
                    {t(presentation.openingLine)}
                  </Text>
                  <Text style={[styles.characterStatus, featured && styles.featuredMutedText]}>
                    {previewText(featured ? '이용 상태는 대화방에서 확인' : 'AI 답변 준비 중 · 기록 열람 가능')}
                  </Text>
                  <View style={[styles.characterActionWrap, featured && styles.featuredActionWrap]}>
                    <Text style={[styles.characterAction, featured && styles.featuredActionText, !canOpen && styles.actionUnavailable]}>
                      {previewText(opening ? '여는 중…' : canOpen ? '대화방 열기  →' : '로그인 후 열기  →')}
                    </Text>
                  </View>
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>

      {state.errorMessage !== null && state.access !== 'error' ? (
        <View style={styles.errorPanel}><Text style={styles.errorText}>{state.errorMessage}</Text></View>
      ) : null}

      <View style={styles.pendingSection}>
        <Text style={styles.kicker}>COMING SOON</Text>
        <MobileUiText style={styles.pendingTitle}>{previewText("연결자 등록 중")}</MobileUiText>
        <MobileUiText style={styles.note}>{previewText("조금 더 준비가 필요한 인물들입니다. 현재 대화는 열 수 없습니다.")}</MobileUiText>
        <View style={styles.pendingList}>
          {MOBILE_CHAT_PENDING_ROSTER_V1.map((character) => {
            const presentation = resolveMobileChatCharacterPresentationV1(character.characterId);
            return (
              <View key={character.characterId} style={styles.pendingRow}>
                <View style={styles.pendingMark}><Text style={styles.pendingMarkText}>◇</Text></View>
                <View style={styles.pendingCopy}>
                  <Text style={styles.pendingName}>{character.displayName} <Text style={styles.pendingRole}>· {t(presentation.title)}</Text></Text>
                  <MobileUiText style={styles.note}>{previewText("캐릭터 소개 준비 중")}</MobileUiText>
                </View>
                <MobileUiText style={styles.pendingPill}>등록 중</MobileUiText>
              </View>
            );
          })}
        </View>
      </View>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: 10, paddingHorizontal: 2 },
  introHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  kicker: { color: mobileColors.gold, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  introCounter: { color: mobileColors.muted, fontSize: 11, fontWeight: '700' },
  title: { color: mobileColors.ink, fontSize: 23, lineHeight: 31, fontWeight: '800', letterSpacing: -0.5 },
  body: { color: mobileColors.ink, fontSize: 14, lineHeight: 21 },
  note: { color: mobileColors.muted, fontSize: 12, lineHeight: 19 },
  centerState: { flexDirection: 'row', gap: 9, alignItems: 'center', paddingVertical: 9 },
  loginAction: {
    minHeight: 48, borderRadius: 12, backgroundColor: mobileColors.navy,
    alignItems: 'center', justifyContent: 'center', marginTop: 6,
  },
  loginActionText: { color: mobileColors.surface, fontSize: 14, fontWeight: '800' },
  roster: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  characterCard: {
    width: '48%',
    minWidth: 0,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 18,
    backgroundColor: mobileColors.surface,
    overflow: 'hidden',
  },
  featuredCard: {
    width: '100%',
    borderColor: '#C49A65',
    backgroundColor: '#102235',
    borderRadius: 20,
  },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.9 },
  cardMain: { flexDirection: 'column' },
  characterMark: {
    width: '100%',
    height: 168,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#1F3240',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredMark: { height: 248 },
  characterPortrait: { width: '100%', height: '100%' },
  characterMarkText: { fontSize: 28, color: '#FAF5E9', fontWeight: '900' },
  portraitShade: {
    position: 'absolute',
    bottom: 0,
    top: 0,
    right: 0,
    left: 0,
    backgroundColor: 'rgba(11,25,39,0.12)',
  },
  featuredShade: { backgroundColor: 'rgba(8,22,38,0.32)' },
  portraitLabel: {
    position: 'absolute',
    top: 11,
    left: 11,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(11,26,43,0.87)',
    borderWidth: 1,
    borderColor: 'rgba(226,194,144,0.35)',
  },
  portraitLabelText: { color: '#F8E9D0', fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  featuredImageCopy: {
    position: 'absolute', left: 17, bottom: 14, right: 14, gap: 4,
  },
  featuredCharacterName: {
    color: '#FFFFFF', fontSize: 32, fontWeight: '900',
    textShadowColor: '#071422', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6,
  },
  featuredImageLine: {
    color: '#FFFFFF', fontSize: 12, fontWeight: '700',
    textShadowColor: '#071422', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  characterCopy: { padding: 13, gap: 9, minHeight: 150, justifyContent: 'space-between' },
  featuredCopy: { paddingHorizontal: 18, paddingVertical: 16, minHeight: 141 },
  characterTitleRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 7 },
  characterName: { color: mobileColors.ink, fontSize: 18, fontWeight: '900' },
  characterTitle: { color: mobileColors.muted, fontSize: 11, fontWeight: '700' },
  characterLine: { color: mobileColors.ink, fontSize: 12, lineHeight: 19 },
  characterStatus: { color: mobileColors.muted, fontSize: 11, lineHeight: 17, fontWeight: '600' },
  featuredText: { color: '#FFF8EC' },
  featuredMutedText: { color: '#E6D1B5' },
  characterActionWrap: {
    minHeight: 42, borderRadius: 10, alignItems: 'center',
    justifyContent: 'center', backgroundColor: mobileColors.canvas, paddingHorizontal: 8,
  },
  featuredActionWrap: { backgroundColor: '#E8C48D', minHeight: 48 },
  characterAction: { color: mobileColors.navy, fontSize: 12, fontWeight: '800' },
  featuredActionText: { color: '#102235', fontSize: 14 },
  actionUnavailable: { opacity: 0.85 },
  errorPanel: {
    borderRadius: 12, backgroundColor: mobileColors.surface, borderWidth: 1,
    borderColor: mobileColors.border, padding: 12,
  },
  errorText: { color: mobileColors.seal, fontSize: 12, lineHeight: 18 },
  pendingSection: { gap: 11, paddingTop: 20, borderTopWidth: 1, borderTopColor: mobileColors.border },
  pendingTitle: { color: mobileColors.ink, fontSize: 21, fontWeight: '800' },
  pendingList: { gap: 9, paddingTop: 3 },
  pendingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    borderRadius: 14, borderWidth: 1, borderColor: mobileColors.border,
    padding: 12, backgroundColor: mobileColors.surface,
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
