import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { MobilePushStatusV1 } from '@/core/push/mobile-push-service';
import { mobileColors } from '@/ui/mobile-colors';

function copyFor(status: MobilePushStatusV1 | null): Readonly<{
  title: string;
  body: string;
}> {
  switch (status?.kind) {
    case 'enabled':
      return {
        title: '이 기기 알림 연결됨',
        body: '현재 주체에 Expo Push 수신 기기가 등록되어 있습니다.',
      };
    case 'needs_sync':
      return {
        title: '알림 연결 확인 필요',
        body: '기기 권한은 유지 중이며 서버 등록을 다시 확인해야 합니다.',
      };
    case 'permission_denied':
      return {
        title: '기기 알림 권한 꺼짐',
        body: 'OS 설정에서 알림 권한을 허용한 뒤 다시 연결해 주세요.',
      };
    case 'unavailable':
      return {
        title: '현재 빌드에서는 준비 중',
        body: 'EAS projectId가 연결된 네이티브 빌드에서 Push 등록을 활성화합니다.',
      };
    case 'disabled':
    default:
      return {
        title: '알림 받기',
        body: '사용자가 허용하면 이 기기를 현재 주체의 Push 수신 기기로 등록합니다.',
      };
  }
}

export function MyPushNotifications({
  status,
  pending,
  errorMessage,
  onEnable,
  onDisable,
  onRetry,
}: {
  readonly status: MobilePushStatusV1 | null;
  readonly pending: boolean;
  readonly errorMessage: string | null;
  readonly onEnable: () => void;
  readonly onDisable: () => void;
  readonly onRetry: () => void;
}) {
  const copy = copyFor(status);
  const enabled = status?.kind === 'enabled';

  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>NOTIFICATIONS</Text>
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.body}>{copy.body}</Text>

      {errorMessage !== null ? (
        <Text style={styles.error}>{errorMessage}</Text>
      ) : null}

      {pending ? (
        <View style={styles.pending}>
          <ActivityIndicator color={mobileColors.navy} />
          <Text style={styles.pendingText}>알림 연결을 확인하는 중입니다…</Text>
        </View>
      ) : enabled ? (
        <Pressable
          accessibilityRole="button"
          onPress={onDisable}
          style={styles.secondary}
        >
          <Text style={styles.secondaryText}>이 기기 알림 끄기</Text>
        </Pressable>
      ) : status?.kind === 'needs_sync' ? (
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={styles.primary}
        >
          <Text style={styles.primaryText}>다시 연결</Text>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={onEnable}
          style={styles.primary}
        >
          <Text style={styles.primaryText}>알림 허용 및 기기 등록</Text>
        </Pressable>
      )}

      <Text style={styles.caption}>
        지금은 기기 등록·갱신·해제 기반만 활성화합니다. 자동 발송 시점과 빈도는 아직 적용하지 않습니다.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 18,
    backgroundColor: mobileColors.surface,
    padding: 20,
    gap: 12,
  },
  kicker: {
    color: mobileColors.gold,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  title: { color: mobileColors.ink, fontSize: 20, fontWeight: '800' },
  body: { color: mobileColors.muted, fontSize: 14, lineHeight: 20 },
  caption: { color: mobileColors.muted, fontSize: 11, lineHeight: 17 },
  error: { color: mobileColors.seal, fontSize: 13, lineHeight: 19 },
  pending: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  pendingText: { color: mobileColors.muted, fontSize: 13, fontWeight: '700' },
  primary: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: mobileColors.navy,
  },
  primaryText: { color: mobileColors.surface, fontSize: 14, fontWeight: '800' },
  secondary: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: mobileColors.navy,
    borderRadius: 12,
  },
  secondaryText: { color: mobileColors.navy, fontSize: 14, fontWeight: '800' },
});
