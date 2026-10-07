import { parseChatThreadIdV1 } from '@myeongha/api-client';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  ChatReadHeader,
  ChatReadMessages,
  ChatReadMore,
  ChatSendPending,
} from '@/features/chat/ChatReadComponents';
import { useMobileChatThreadV1 } from '@/features/chat/use-mobile-chat-thread';
import { mobileColors } from '@/ui/mobile-colors';

function resolveThreadId(value: string | string[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  try {
    return parseChatThreadIdV1(candidate);
  } catch {
    return null;
  }
}

function ValidChatThread({ threadId }: { threadId: string }) {
  const { snapshot, loadMore } = useMobileChatThreadV1(threadId);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>‹ 대화로 돌아가기</Text>
        </Pressable>
        <ChatReadHeader snapshot={snapshot} />
        <ChatReadMessages snapshot={snapshot} />
        <ChatReadMore snapshot={snapshot} onLoadMore={() => void loadMore()} />
        <ChatSendPending />
      </ScrollView>
    </SafeAreaView>
  );
}

export default function ChatThreadScreen() {
  const { threadId: routeThreadId } = useLocalSearchParams<{ threadId?: string | string[] }>();
  const threadId = resolveThreadId(routeThreadId);

  if (threadId !== null) return <ValidChatThread threadId={threadId} />;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.invalidContent}>
        <Text style={styles.invalidTitle}>대화 링크를 확인할 수 없습니다</Text>
        <Text style={styles.invalidBody}>올바른 기존 대화 링크로 다시 들어와 주세요.</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace('/chat')}
          style={styles.invalidAction}
        >
          <Text style={styles.invalidActionText}>대화로 돌아가기</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: mobileColors.canvas },
  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 38, gap: 18 },
  back: { alignSelf: 'flex-start', paddingVertical: 6 },
  backText: { color: mobileColors.navy, fontSize: 14, fontWeight: '800' },
  invalidContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 12,
  },
  invalidTitle: { color: mobileColors.ink, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  invalidBody: { color: mobileColors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  invalidAction: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderRadius: 13,
    backgroundColor: mobileColors.navy,
  },
  invalidActionText: { color: mobileColors.surface, fontSize: 14, fontWeight: '800' },
});
