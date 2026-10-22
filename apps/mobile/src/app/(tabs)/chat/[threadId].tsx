import { parseChatThreadIdV1 } from '@myeongha/api-client';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef } from 'react';
import {
  ImageBackground, KeyboardAvoidingView, Platform, Pressable, RefreshControl,
  SafeAreaView, ScrollView, StyleSheet, Text, View,
} from 'react-native';

import {
  ChatComposer,
  ChatReadHeader,
  ChatReadMessages,
  ChatReadMore,
} from '@/features/chat/ChatReadComponents';
import { useMobileChatThreadV1 } from '@/features/chat/use-mobile-chat-thread';
import { mobileColors } from '@/ui/mobile-colors';
import { MobileUiText } from '@/ui/MobileUiText';
import { useMobileThemedStyles } from '@/ui/use-mobile-themed-styles';
import { useMobileTheme } from '@/ui/mobile-theme';
import { useMobileUiLocale } from '@/ui/mobile-ui-locale';
import { projectMobileSourceLanguageNoticeV1 } from '@/ui/mobile-source-language-notice-v1';
import { useMobilePullRefreshV1 } from '@/ui/use-mobile-pull-refresh';

const SEYEON_CHAT_THEME_BACKGROUND = require('../../../../assets/characters/chat-themes/seyeon-chat-theme-mobile-v1.webp');

function resolveThreadId(value: string | string[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  try {
    return parseChatThreadIdV1(candidate);
  } catch {
    return null;
  }
}

function ValidChatThread({ threadId }: { threadId: string }) {
  const styles = useMobileThemedStyles(staticStyles);
  const { theme, colors } = useMobileTheme();
  const { locale } = useMobileUiLocale();
  const sourceNotice = projectMobileSourceLanguageNoticeV1(locale, 'chat');
  const { snapshot, refresh, loadMore, draft, setDraft, sending, sendStatus, send } =
    useMobileChatThreadV1(threadId);
  const { refreshing, onRefresh } = useMobilePullRefreshV1(refresh);
  const scrollRef = useRef<ScrollView>(null);
  const isSeyeonTheme = snapshot.characterId === 'seyeon';

  const threadContent = (
    <KeyboardAvoidingView
      style={styles.room}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.stream}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            enabled={!sending}
            tintColor={colors.navy}
            colors={[colors.navy]}
          />
        )}
        onContentSizeChange={() => {
          if (!snapshot.hasMore) scrollRef.current?.scrollToEnd({ animated: true });
        }}
      >
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
          <MobileUiText style={styles.backText}>‹ 대화로 돌아가기</MobileUiText>
        </Pressable>
        <ChatReadHeader snapshot={snapshot} />
        {sourceNotice.visible ? (
          <Text style={styles.sourceLanguageNotice}>{sourceNotice.text}</Text>
        ) : null}
        <ChatReadMessages snapshot={snapshot} />
        <ChatReadMore snapshot={snapshot} onLoadMore={() => void loadMore()} onRetry={() => void refresh()} />
      </ScrollView>
      <ChatComposer
        snapshot={snapshot}
        draft={draft}
        onChangeDraft={setDraft}
        onSend={() => void send()}
        sending={sending}
        status={sendStatus}
      />
    </KeyboardAvoidingView>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      {isSeyeonTheme ? (
        <ImageBackground
          source={SEYEON_CHAT_THEME_BACKGROUND}
          resizeMode="cover"
          style={styles.seyeonThemeBackground}
          imageStyle={styles.seyeonThemeImage}
        >
          <View style={[styles.seyeonThemeWash, theme === 'dark' && styles.seyeonThemeWashDark]}>{threadContent}</View>
        </ImageBackground>
      ) : threadContent}
    </SafeAreaView>
  );
}

export default function ChatThreadScreen() {
  const styles = useMobileThemedStyles(staticStyles);
  const { threadId: routeThreadId } = useLocalSearchParams<{ threadId?: string | string[] }>();
  const threadId = resolveThreadId(routeThreadId);

  if (threadId !== null) return <ValidChatThread threadId={threadId} />;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.invalidContent}>
        <MobileUiText style={styles.invalidTitle}>대화 링크를 확인할 수 없습니다</MobileUiText>
        <MobileUiText style={styles.invalidBody}>올바른 기존 대화 링크로 다시 들어와 주세요.</MobileUiText>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace('/chat')}
          style={styles.invalidAction}
        >
          <MobileUiText style={styles.invalidActionText}>대화로 돌아가기</MobileUiText>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: mobileColors.canvas },
  room: { flex: 1 },
  stream: { flex: 1 },
  seyeonThemeBackground: { flex: 1 },
  seyeonThemeImage: { opacity: 0.98 },
  seyeonThemeWash: { flex: 1, backgroundColor: 'rgba(255, 249, 240, 0.25)' },
  seyeonThemeWashDark: { backgroundColor: 'rgba(7, 15, 25, 0.66)' },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 23, gap: 20 },
  back: { alignSelf: 'flex-start', minHeight: 48, justifyContent: 'center', paddingHorizontal: 4 },
  sourceLanguageNotice: { color: mobileColors.muted, backgroundColor: mobileColors.surface, fontSize: 12, lineHeight: 19, borderRadius: 10, borderWidth: 1, borderColor: mobileColors.border, padding: 12 },
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
const staticStyles = styles;
