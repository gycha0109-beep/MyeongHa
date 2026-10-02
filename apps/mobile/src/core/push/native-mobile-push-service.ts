import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import {
  createMobilePushServiceV1,
  type MobilePushNativePortV1,
  type MobilePushPermissionV1,
} from '@/core/push/mobile-push-service';
import { mobilePushInstallationStoreV1 } from '@/core/push/native-mobile-push-installation-store';
import { nativeMobileRuntimeV1 } from '@/core/runtime/native-mobile-runtime';

function permissionStatus(
  permission: Notifications.NotificationPermissionsStatus,
): MobilePushPermissionV1 {
  if (permission.granted) return 'granted';
  return permission.status === 'undetermined' ? 'undetermined' : 'denied';
}

function projectId(): string | null {
  const extra = Constants.expoConfig?.extra as
    | Readonly<{ eas?: Readonly<{ projectId?: unknown }> }>
    | undefined;
  const configured = extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  return typeof configured === 'string' && configured.trim().length > 0
    ? configured.trim()
    : null;
}

const nativePort: MobilePushNativePortV1 = Object.freeze({
  platform() {
    if (Platform.OS === 'ios' || Platform.OS === 'android') return Platform.OS;
    return null;
  },
  projectId,
  appVersion() {
    const version = Constants.expoConfig?.version;
    return typeof version === 'string' && version.trim().length > 0
      ? version.trim()
      : null;
  },
  async ensureAndroidChannel() {
    if (Platform.OS !== 'android') return;
    await Notifications.setNotificationChannelAsync('default', {
      name: '기본 알림',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  },
  async getPermission() {
    return permissionStatus(await Notifications.getPermissionsAsync());
  },
  async requestPermission() {
    return permissionStatus(await Notifications.requestPermissionsAsync());
  },
  async getExpoPushToken(easProjectId: string) {
    const token = await Notifications.getExpoPushTokenAsync({
      projectId: easProjectId,
    });
    return token.data;
  },
  onNativePushTokenChanged(listener: () => void) {
    const subscription = Notifications.addPushTokenListener(() => listener());
    return () => subscription.remove();
  },
});

export const nativeMobilePushServiceV1 = createMobilePushServiceV1({
  client: nativeMobileRuntimeV1.apiClient,
  subjectSession: nativeMobileRuntimeV1.subjectSession,
  store: mobilePushInstallationStoreV1,
  native: nativePort,
});
