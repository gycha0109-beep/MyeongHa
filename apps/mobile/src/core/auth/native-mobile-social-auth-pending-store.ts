import * as SecureStore from 'expo-secure-store';

import { createMobileSocialAuthPendingStoreV1 } from '@/core/auth/mobile-social-auth-pending-store';

export const mobileSocialAuthPendingStoreV1 =
  createMobileSocialAuthPendingStoreV1({
    getItemAsync: (key) => SecureStore.getItemAsync(key),
    setItemAsync: (key, value) => SecureStore.setItemAsync(key, value),
    deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
  });
