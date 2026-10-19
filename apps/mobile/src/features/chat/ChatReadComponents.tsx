import type { MobileChatThreadSnapshotV1 } from '@/features/chat/mobile-chat-read-repository';
import { groupMobileChatMessagesV1 } from '@/features/chat/chat-view-model';
import { isSeyeonHistoryRevealHoldV1 } from '@/features/chat/seyeon-history-hold-state';
import { resolveMobileChatCharacterPresentationV1 } from '@/features/chat/chat-character-presentation';
import { projectMobileChatEmptyGreetingV1 } from '@/features/chat/mobile-chat-empty-greeting';
import { MOBILE_CHAT_KNOWN_CHARACTERS_V1 } from '@/features/chat/chat-launch-roster';
import { resolveMobileChatPortraitV1 } from '@/features/chat/chat-character-portraits';
import { mobileColors } from '@/ui/mobile-colors';
import { useMobileThemedStyles } from '@/ui/use-mobile-themed-styles';
import { useMobileTheme } from '@/ui/mobile-theme';
import {
  ActivityIndicator,
  Image,
  Pressable,
  TextInput,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export function ChatReadHeader({
  snapshot,
}: {
  snapshot: MobileChatThreadSnapshotV1;
}) {
  const styles = useMobileThemedStyles(staticStyles);
  const { theme } = useMobileTheme();
  const character = snapshot.characterId === null
    ? null
    : MOBILE_CHAT_KNOWN_CHARACTERS_V1.find(
        (entry) => entry.characterId === snapshot.characterId,
      ) ?? null;
  const presentation = character === null
    ? null
    : resolveMobileChatCharacterPresentationV1(character.characterId);
  const displayName = character?.displayName ?? '대화 상대';
  const portrait = resolveMobileChatPortraitV1(snapshot.characterId);
  const isSeyeonTheme = snapshot.characterId === 'seyeon';
  const meta = presentation === null
    ? '서버가 확인한 대화방'
    : `${presentation.title} · 대화 기록`;

  return (
    <View style={[styles.headerCard, isSeyeonTheme && (theme === 'dark' ? styles.seyeonSurfaceDark : styles.seyeonSurface)]}>
      <View style={styles.avatar}>
        {portrait === null ? (
          <Text style={styles.avatarText}>
            {character === null ? '明' : displayName.slice(0, 1)}
          </Text>
        ) : (
          <Image
            source={portrait}
            style={styles.avatarPortrait}
            resizeMode="cover"
            accessibilityLabel={`${displayName} 대리자 초상화`}
          />
        )}
      </View>
      <View style={styles.headerCopy}>
        <Text style={styles.headerEyebrow}>THE CONVERSATION</Text>
        <Text style={styles.headerTitle}>{displayName}</Text>
        <Text style={styles.headerMeta}>{meta}</Text>
      </View>
    </View>
  );
}

export function ChatReadMessages({
  snapshot,
}: {
  snapshot: MobileChatThreadSnapshotV1;
}) {
  const styles = useMobileThemedStyles(staticStyles);
  const { theme } = useMobileTheme();
  const isSeyeonTheme = snapshot.characterId === 'seyeon';
  if (snapshot.status === 'loading_initial' || snapshot.status === 'idle') {
    return (
      <View style={[styles.stateCard, isSeyeonTheme && (theme === 'dark' ? styles.seyeonSurfaceDark : styles.seyeonSurface)]}>
        <ActivityIndicator color={mobileColors.navy} />
        <Text style={styles.stateText}>대화 기록을 불러오는 중입니다…</Text>
      </View>
    );
  }

  if (isSeyeonHistoryRevealHoldV1(snapshot)) {
    return (
      <View style={[styles.stateCard, styles.seyeonSurface]}>
        <Text style={styles.errorTitle}>세연 대화 기록을 현재 표시할 수 없습니다</Text>
        <Text style={styles.stateText}>
          개인정보 보호를 위한 서버 확인이 끝나지 않아 대화 기록을 표시할 수 없습니다.
          반복해서 불러와도 해제되지 않습니다.
        </Text>
        <Text style={styles.diagnosticText}>오류 코드: SEYEON_HISTORY_REVEAL_HOLD</Text>
      </View>
    );
  }

  if (snapshot.status === 'error' && snapshot.messages.length === 0) {
    return (
      <View style={[styles.stateCard, isSeyeonTheme && (theme === 'dark' ? styles.seyeonSurfaceDark : styles.seyeonSurface)]}>
        <Text style={styles.errorTitle}>대화를 불러오지 못했습니다</Text>
        <Text style={styles.stateText}>
          대화 기록을 확인하지 못했습니다. 아래에서 다시 불러올 수 있습니다.
        </Text>
        {snapshot.errorCode !== null ? (
          <Text style={styles.diagnosticText}>오류 코드: {snapshot.errorCode}</Text>
        ) : null}
      </View>
    );
  }

  if (snapshot.messages.length === 0) {
    // The server already opened/reused and verified this Thread. The web
    // room shows the Character's introduction only for confirmed empty history.
    // This line is presentation, not an invented stored Chat message.
    const greeting = projectMobileChatEmptyGreetingV1(snapshot);
    if (greeting !== null) {
      const portrait = resolveMobileChatPortraitV1(greeting.characterId);
      return (
        <View style={styles.messages}>
          <View style={styles.messageGroup}>
            <View style={styles.messageAvatar}>
              {portrait === null
                ? <Text style={styles.messageAvatarFallback}>{greeting.displayName.slice(0, 1)}</Text>
                : <Image source={portrait} style={styles.avatarPortrait} resizeMode="cover" accessibilityLabel={greeting.displayName + ' 프로필'} />}
            </View>
            <View style={styles.messageGroupStack}>
              <Text style={styles.messageGroupName}>{greeting.displayName}</Text>
              <View style={[styles.bubble, isSeyeonTheme && (theme === 'dark' ? styles.seyeonBubbleDark : styles.seyeonBubble)]}>
                <Text style={styles.messageBody}>{greeting.openingLine}</Text>
              </View>
            </View>
          </View>
        </View>
      );
    }
    return (
      <View style={[styles.stateCard, isSeyeonTheme && (theme === 'dark' ? styles.seyeonSurfaceDark : styles.seyeonSurface)]}>
        <Text style={styles.emptyMark}>◇</Text>
        <Text style={styles.errorTitle}>아직 표시할 메시지가 없습니다</Text>
      </View>
    );
  }

  const character = MOBILE_CHAT_KNOWN_CHARACTERS_V1.find(
    entry => entry.characterId === snapshot.characterId,
  );
  // The room's verified Character identity, not a guess from a message body.
  const displayName = character?.displayName ?? '대화 상대';
  const groups = groupMobileChatMessagesV1(snapshot.messages, displayName);

  return (
    <View style={styles.messages}>
      {groups.map(group => {
        const user = group.role === 'user';
        const system = group.role === 'system';
        const characterGroup = group.role === 'character';
        const portrait = characterGroup ? resolveMobileChatPortraitV1(group.characterId) : null;
        return (
          <View
            key={group.id}
            style={[
              styles.messageGroup,
              user && styles.messageGroupUser,
              system && styles.messageGroupSystem,
            ]}
          >
            {characterGroup ? (
              <View style={styles.messageAvatar}>
                {portrait === null ? (
                  <Text style={styles.messageAvatarFallback}>{displayName.slice(0, 1)}</Text>
                ) : (
                  <Image
                    source={portrait}
                    style={styles.avatarPortrait}
                    resizeMode="cover"
                    accessibilityLabel={displayName + ' 프로필'}
                  />
                )}
              </View>
            ) : null}
            <View style={[
              styles.messageGroupStack,
              user && styles.messageGroupStackUser,
              system && styles.messageGroupStackSystem,
            ]}>
              {!user ? (
                <Text style={[styles.messageGroupName, system && styles.systemGroupName]}>
                  {group.label}
                </Text>
              ) : null}
              {group.messages.map((message, index) => {
                const last = index === group.messages.length - 1;
                return (
                  <View
                    key={message.id}
                    style={[
                      styles.messageLine,
                      user && styles.messageLineUser,
                      system && styles.messageLineSystem,
                    ]}
                  >
                    {user && last && group.timeLabel !== '' ? (
                      <Text style={styles.messageTime}>{group.timeLabel}</Text>
                    ) : null}
                    <View style={[
                      styles.bubble,
                      user && styles.userBubble,
                      system && styles.systemBubble,
                      characterGroup && isSeyeonTheme && (theme === 'dark' ? styles.seyeonBubbleDark : styles.seyeonBubble),
                      message.redacted && styles.redactedBubble,
                    ]}>
                      <Text style={[styles.messageBody, user && styles.userMessageBody]}>
                        {message.body}
                      </Text>
                    </View>
                    {!user && last && group.timeLabel !== '' ? (
                      <Text style={styles.messageTime}>{group.timeLabel}</Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function ChatReadMore({
  snapshot,
  onLoadMore,
  onRetry,
}: {
  snapshot: MobileChatThreadSnapshotV1;
  onLoadMore: () => void;
  onRetry?: () => void;
}) {
  const styles = useMobileThemedStyles(staticStyles);
  const { theme } = useMobileTheme();
  if (isSeyeonHistoryRevealHoldV1(snapshot)) return null;
  if (snapshot.status === 'error' && snapshot.messages.length === 0) {
    return onRetry === undefined ? null : (
      <Pressable accessibilityRole="button" onPress={onRetry} style={styles.loadMore}>
        <Text style={styles.loadMoreText}>대화 다시 불러오기 ↻</Text>
      </Pressable>
    );
  }
  if (!snapshot.hasMore) {
    return <Text style={styles.endText}>현재 확인할 수 있는 기록의 끝입니다.</Text>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      disabled={snapshot.status === 'loading_more'}
      onPress={onLoadMore}
      style={[styles.loadMore, snapshot.characterId === 'seyeon' && (theme === 'dark' ? styles.seyeonSurfaceDark : styles.seyeonSurface)]}
    >
      {snapshot.status === 'loading_more' ? (
        <ActivityIndicator color={mobileColors.navy} />
      ) : (
        <Text style={styles.loadMoreText}>다음 메시지 불러오기</Text>
      )}
    </Pressable>
  );
}

export function ChatComposer({
  snapshot, draft, onChangeDraft, onSend, sending, status,
}: {
  snapshot: MobileChatThreadSnapshotV1;
  draft: string;
  onChangeDraft: (text: string) => void;
  onSend: () => void;
  sending: boolean;
  status: string | null;
}) {
  const styles = useMobileThemedStyles(staticStyles);
  const { theme } = useMobileTheme();
  if (isSeyeonHistoryRevealHoldV1(snapshot)) {
    return (
      <View style={[styles.pendingCard, theme === 'dark' ? styles.seyeonSurfaceDark : styles.seyeonSurface]}>
        <Text style={styles.pendingTitle}>세연 대화는 서버의 보호 조치로 잠시 중단되었습니다</Text>
        <Text style={styles.stateText}>
          대화 기록과 메시지 보내기는 개인정보 공개 권한 검증이 끝난 뒤 이용할 수 있습니다.
          앱을 다시 설치해도 이 제한은 해제되지 않습니다.
        </Text>
      </View>
    );
  }

  const ready = snapshot.status === 'ready' || snapshot.status === 'loading_more';
  const seyeon = snapshot.characterId === 'seyeon';
  const allowed = ready && seyeon;
  if (!allowed) {
    return (
      <View style={styles.pendingCard}>
        <Text style={styles.pendingTitle}>
          {snapshot.characterId === null
            ? '대화 상대를 확인하고 있습니다'
            : seyeon
              ? '대화 기록을 확인한 뒤 메시지를 보낼 수 있습니다'
              : '이 캐릭터의 AI 대화는 준비 중입니다'}
        </Text>
        <Text style={styles.stateText}>
          {seyeon
            ? '대화방 기록을 불러오지 못한 경우 다시 입장해 주세요.'
            : '캐릭터 대화방과 기록은 이용할 수 있으며, AI 답변 기능은 추후 열립니다.'}
        </Text>
      </View>
    );
  }
  return (
    <View style={[styles.composerCard, theme === 'dark' ? styles.seyeonSurfaceDark : styles.seyeonSurface]}>
      <View style={styles.composerRow}>
        <TextInput
          accessibilityLabel="세연에게 보낼 메시지"
          multiline
          maxLength={8000}
          value={draft}
          onChangeText={onChangeDraft}
          editable={!sending}
          placeholder="세연에게 하고 싶은 말을 적어주세요"
          placeholderTextColor={mobileColors.muted}
          style={styles.composerInput}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="메시지 보내기"
          disabled={sending || draft.trim().length === 0}
          onPress={onSend}
          style={[styles.sendAction, (sending || draft.trim().length === 0) && styles.sendDisabled]}
        >
          {sending
            ? <ActivityIndicator color={mobileColors.surface} />
            : <Text style={styles.sendActionText}>전송</Text>}
        </Pressable>
      </View>
      <Text style={styles.composerHelp}>{status ?? '회원 전용 · 세연과의 대화는 서버에 보관됩니다.'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 19,
    backgroundColor: mobileColors.surface,
    paddingHorizontal: 17,
    paddingVertical: 17,
  },
  avatar: {
    width: 64,
    height: 70,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: mobileColors.gold,
  },
  avatarText: { color: mobileColors.navy, fontSize: 20, fontWeight: '900' },
  avatarPortrait: { width: '100%', height: '100%' },
  seyeonSurface: {
    backgroundColor: 'rgba(255, 250, 242, 0.90)',
    borderColor: 'rgba(181, 132, 94, 0.24)',
  },
  seyeonBubble: {
    backgroundColor: 'rgba(255, 252, 246, 0.96)',
    borderColor: 'rgba(181, 132, 94, 0.24)',
  },
  seyeonSurfaceDark: {
    backgroundColor: 'rgba(17, 29, 40, 0.94)',
    borderColor: 'rgba(213, 177, 130, 0.35)',
  },
  seyeonBubbleDark: {
    backgroundColor: 'rgba(23, 36, 48, 0.96)',
    borderColor: 'rgba(213, 177, 130, 0.33)',
  },
  headerCopy: { flex: 1, gap: 5 },
  headerEyebrow: { color: mobileColors.gold, fontSize: 10, fontWeight: '900', letterSpacing: 1.35 },
  headerTitle: { color: mobileColors.ink, fontSize: 22, fontWeight: '900' },
  headerMeta: { color: mobileColors.muted, fontSize: 12, lineHeight: 18 },
  stateCard: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 18,
    backgroundColor: mobileColors.surface,
    padding: 22,
  },
  stateText: { color: mobileColors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  diagnosticText: { color: mobileColors.seal, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  errorTitle: { color: mobileColors.ink, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  emptyMark: { color: mobileColors.gold, fontSize: 24, fontWeight: '800' },
  messages: { gap: 16 },
  messageGroup: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, width: '100%' },
  messageGroupUser: { justifyContent: 'flex-end' },
  messageGroupSystem: { justifyContent: 'center' },
  messageAvatar: {
    width: 38, height: 38, borderRadius: 13, overflow: 'hidden',
    borderWidth: 1, borderColor: mobileColors.border,
    backgroundColor: mobileColors.surface, alignItems: 'center', justifyContent: 'center',
  },
  messageAvatarFallback: { color: mobileColors.navy, fontWeight: '800', fontSize: 15 },
  messageGroupStack: { flex: 1, gap: 5, minWidth: 0 },
  messageGroupStackUser: { alignItems: 'flex-end' },
  messageGroupStackSystem: { alignItems: 'center' },
  messageGroupName: { color: mobileColors.ink, fontWeight: '700', fontSize: 12, marginBottom: 1 },
  systemGroupName: { color: mobileColors.muted },
  messageLine: { flexDirection: 'row', alignItems: 'flex-end', width: '100%', gap: 5 },
  messageLineUser: { justifyContent: 'flex-end' },
  messageLineSystem: { justifyContent: 'center' },
  bubble: {
    maxWidth: '82%',
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 17,
    backgroundColor: mobileColors.surface,
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  userBubble: { backgroundColor: mobileColors.navy, borderColor: mobileColors.navy },
  systemBubble: { maxWidth: '88%', backgroundColor: mobileColors.canvas },
  redactedBubble: { opacity: 0.7 },
  messageBody: { color: mobileColors.ink, fontSize: 15, lineHeight: 24 },
  userMessageBody: { color: mobileColors.surface },
  messageTime: { color: mobileColors.muted, fontSize: 10, flexShrink: 0, paddingBottom: 2 },
  loadMore: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 13,
    backgroundColor: mobileColors.surface,
  },
  loadMoreText: { color: mobileColors.navy, fontSize: 13, fontWeight: '800' },
  endText: { color: mobileColors.muted, fontSize: 12, textAlign: 'center', paddingVertical: 8 },
  pendingCard: {
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 17,
    backgroundColor: mobileColors.surface,
    padding: 17,
    gap: 7,
  },
  pendingTitle: { color: mobileColors.ink, fontSize: 15, fontWeight: '800' },
  composerCard: { paddingHorizontal: 17, paddingVertical: 14, gap: 9, borderTopWidth: 1, borderColor: mobileColors.border },
  composerRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  composerInput: { flex: 1, maxHeight: 130, minHeight: 48, color: mobileColors.ink, fontSize: 14, lineHeight: 20, borderRadius: 13, borderWidth: 1, borderColor: mobileColors.border, backgroundColor: mobileColors.surface, paddingHorizontal: 12, paddingVertical: 10, textAlignVertical: 'top' },
  sendAction: { minWidth: 62, minHeight: 48, paddingHorizontal: 12, borderRadius: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: mobileColors.navy },
  sendDisabled: { opacity: 0.48 },
  sendActionText: { color: mobileColors.surface, fontSize: 13, fontWeight: '800' },
  composerHelp: { fontSize: 11, color: mobileColors.muted, lineHeight: 16 },
});
const staticStyles = styles;
