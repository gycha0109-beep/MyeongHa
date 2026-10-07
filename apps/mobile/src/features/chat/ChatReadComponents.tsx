import type { MobileChatThreadSnapshotV1 } from '@/features/chat/mobile-chat-read-repository';
import { createMobileChatMessageViewV1 } from '@/features/chat/chat-view-model';
import { resolveMobileChatCharacterPresentationV1 } from '@/features/chat/chat-character-presentation';
import { MOBILE_CHAT_LAUNCH_ROSTER_V1 } from '@/features/chat/chat-launch-roster';
import { mobileColors } from '@/ui/mobile-colors';
import {
  ActivityIndicator,
  Pressable,
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
  const meta = presentation === null
    ? '서버가 확인한 기존 대화 · 읽기 전용'
    : `${presentation.title} · 서버가 확인한 기존 대화 · 읽기 전용`;

  return (
    <View style={styles.headerCard}>
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
  if (snapshot.status === 'loading_initial' || snapshot.status === 'idle') {
    return (
      <View style={styles.stateCard}>
        <ActivityIndicator color={mobileColors.navy} />
        <Text style={styles.stateText}>대화 기록을 불러오는 중입니다…</Text>
      </View>
    );
  }

  if (snapshot.status === 'error' && snapshot.messages.length === 0) {
    return (
      <View style={styles.stateCard}>
        <Text style={styles.errorTitle}>대화를 불러오지 못했습니다</Text>
        <Text style={styles.stateText}>
          이 대화가 현재 계정에 속하지 않거나 더 이상 사용할 수 없을 수 있습니다.
        </Text>
      </View>
    );
  }

  if (snapshot.messages.length === 0) {
    return (
      <View style={styles.stateCard}>
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
      style={styles.loadMore}
    >
      {snapshot.status === 'loading_more' ? (
        <ActivityIndicator color={mobileColors.navy} />
      ) : (
        <Text style={styles.loadMoreText}>다음 메시지 불러오기</Text>
      )}
    </Pressable>
  );
}

export function ChatSendPending() {
  return (
    <View style={styles.pendingCard}>
      <Text style={styles.pendingTitle}>메시지 보내기는 아직 열리지 않았습니다</Text>
      <Text style={styles.stateText}>
        현재 모바일에서는 서버가 확인한 기존 대화 기록만 읽을 수 있습니다.
      </Text>
      <Text style={styles.pendingBadge}>읽기 전용</Text>
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
  pendingBadge: { alignSelf: 'flex-start', color: mobileColors.muted, fontSize: 11, fontWeight: '800' },
});
