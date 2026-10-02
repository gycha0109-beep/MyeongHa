import * as SecureStore from 'expo-secure-store';

import { createMobilePushInstallationStoreV1 } from '@/core/push/mobile-push-installation-store';

function nextInstallationKey(): string {
  const cryptoLike = globalThis.crypto as
    | Readonly<{ randomUUID?: () => string }>
    | undefined;
  if (typeof cryptoLike?.randomUUID === 'function') {
    return cryptoLike.randomUUID();
  }

  const randomPart = () =>
    Math.floor(Math.random() * 0x1_0000_0000)
      .toString(16)
      .padStart(8, '0');
  return [
    'mobile',
    Date.now().toString(36),
    randomPart(),
    randomPart(),
    randomPart(),
    randomPart(),
  ].join('-');
}

export const mobilePushInstallationStoreV1 =
  createMobilePushInstallationStoreV1({
    storage: {
      getItemAsync: (key) => SecureStore.getItemAsync(key),
      setItemAsync: (key, value) => SecureStore.setItemAsync(key, value),
      deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
    },
    nextInstallationKey,
  });
