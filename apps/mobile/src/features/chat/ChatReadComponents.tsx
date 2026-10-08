import type { MobileChatThreadSnapshotV1 } from '@/features/chat/mobile-chat-read-repository';
import { createMobileChatMessageViewV1 } from '@/features/chat/chat-view-model';
import { resolveMobileChatCharacterPresentationV1 } from '@/features/chat/chat-character-presentation';
import { MOBILE_CHAT_LAUNCH_ROSTER_V1 } from '@/features/chat/chat-launch-roster';
import { mobileColors } from '@/ui/mobile-colors';
import {
  ActivityIndicator,
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
  const character = snapshot.characterId === null
    ? null
    : MOBILE_CHAT_LAUNCH_ROSTER_V1.find(
        (entry) => entry.characterId === snapshot.characterId,
      ) ?? null;
  const presentation = character === null
    ? null
    : resolveMobileChatCharacterPresentationV1(character.characterId);
  const displayName = character?.displayName ?? '대화 상대';
  const isSeyeonTheme = snapshot.characterId === 'seyeon';
  const meta = presentation === null
    ? '서버가 확인한 대화방'
    : `${presentation.title} · ${isSeyeonTheme ? '실시간 대화' : '대화 기록'}`;

  return (
    <View style={[styles.headerCard, isSeyeonTheme && styles.seyeonSurface]}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {character === null ? '明' : displayName.slice(0, 1)}
        </Text>
      </View>
      <View style={styles.headerCopy}>
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
  const isSeyeonTheme = snapshot.characterId === 'seyeon';
  if (snapshot.status === 'loading_initial' || snapshot.status === 'idle') {
    return (
      <View style={[styles.stateCard, isSeyeonTheme && styles.seyeonSurface]}>
        <ActivityIndicator color={mobileColors.navy} />
        <Text style={styles.stateText}>대화 기록을 불러오는 중입니다…</Text>
      </View>
    );
  }

  if (snapshot.status === 'error' && snapshot.messages.length === 0) {
    return (
      <View style={[styles.stateCard, isSeyeonTheme && styles.seyeonSurface]}>
        <Text style={styles.errorTitle}>대화를 불러오지 못했습니다</Text>
        <Text style={styles.stateText}>
          이 대화가 현재 계정에 속하지 않거나 더 이상 사용할 수 없을 수 있습니다.
        </Text>
      </View>
    );
  }

  if (snapshot.messages.length === 0) {
    return (
      <View style={[styles.stateCard, isSeyeonTheme && styles.seyeonSurface]}>
        <Text style={styles.emptyMark}>◇</Text>
        <Text style={styles.errorTitle}>아직 표시할 메시지가 없습니다</Text>
      </View>
    );
  }

  return (
    <View style={styles.messages}>
      {snapshot.messages.map((message) => {
        const view = createMobileChatMessageViewV1(message);
        const user = view.role === 'user';
        const system = view.role === 'system';
        return (
          <View
            key={view.id}
            style={[
              styles.messageRow,
              user && styles.messageRowUser,
              system && styles.messageRowSystem,
            ]}
          >
            <View
              style={[
                styles.bubble,
                user && styles.userBubble,
                system && styles.systemBubble,
                view.redacted && styles.redactedBubble,
              ]}
            >
              <Text style={styles.messageLabel}>{view.label}</Text>
              <Text style={[styles.messageBody, user && styles.userMessageBody]}>
                {view.body}
              </Text>
              <Text style={styles.messageTime}>{view.timeLabel}</Text>
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
}: {
  snapshot: MobileChatThreadSnapshotV1;
  onLoadMore: () => void;
}) {
  if (!snapshot.hasMore) {
    return <Text style={styles.endText}>현재 확인할 수 있는 기록의 끝입니다.</Text>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      disabled={snapshot.status === 'loading_more'}
      onPress={onLoadMore}
      style={[styles.loadMore, snapshot.characterId === 'seyeon' && styles.seyeonSurface]}
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
    <View style={[styles.composerCard, styles.seyeonSurface]}>
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
    gap: 13,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 18,
    backgroundColor: mobileColors.surface,
    padding: 16,
  },
  avatar: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: mobileColors.gold,
  },
  avatarText: { color: mobileColors.navy, fontSize: 20, fontWeight: '900' },
  seyeonSurface: {
    backgroundColor: 'rgba(255, 250, 242, 0.90)',
    borderColor: 'rgba(181, 132, 94, 0.24)',
  },
  seyeonBubble: {
    backgroundColor: 'rgba(255, 252, 246, 0.92)',
    borderColor: 'rgba(181, 132, 94, 0.20)',
  },
  headerCopy: { flex: 1, gap: 3 },
  headerTitle: { color: mobileColors.ink, fontSize: 18, fontWeight: '800' },
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
  errorTitle: { color: mobileColors.ink, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  emptyMark: { color: mobileColors.gold, fontSize: 24, fontWeight: '800' },
  messages: { gap: 12 },
  messageRow: { alignItems: 'flex-start' },
  messageRowUser: { alignItems: 'flex-end' },
  messageRowSystem: { alignItems: 'center' },
  bubble: {
    maxWidth: '84%',
    minWidth: 110,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 16,
    backgroundColor: mobileColors.surface,
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 5,
  },
  userBubble: { backgroundColor: mobileColors.navy, borderColor: mobileColors.navy },
  systemBubble: { maxWidth: '94%', backgroundColor: mobileColors.canvas },
  redactedBubble: { opacity: 0.7 },
  messageLabel: { color: mobileColors.gold, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  messageBody: { color: mobileColors.ink, fontSize: 15, lineHeight: 22 },
  userMessageBody: { color: mobileColors.surface },
  messageTime: { color: mobileColors.muted, fontSize: 10 },
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
  composerCard: { paddingHorizontal: 14, paddingVertical: 12, gap: 7, borderTopWidth: 1, borderColor: mobileColors.border },
  composerRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  composerInput: { flex: 1, maxHeight: 130, minHeight: 44, color: mobileColors.ink, fontSize: 14, lineHeight: 20, borderRadius: 13, borderWidth: 1, borderColor: mobileColors.border, backgroundColor: mobileColors.surface, paddingHorizontal: 12, paddingVertical: 10, textAlignVertical: 'top' },
  sendAction: { minWidth: 58, minHeight: 44, paddingHorizontal: 12, borderRadius: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: mobileColors.navy },
  sendDisabled: { opacity: 0.48 },
  sendActionText: { color: mobileColors.surface, fontSize: 13, fontWeight: '800' },
  composerHelp: { fontSize: 11, color: mobileColors.muted, lineHeight: 16 },
});
