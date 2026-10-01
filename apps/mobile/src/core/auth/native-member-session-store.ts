import * as SecureStore from 'expo-secure-store';

import { createMobileMemberSessionStoreV1 } from '@/core/auth/member-session-store';

export const mobileMemberSessionStoreV1 = createMobileMemberSessionStoreV1({
  getItemAsync: (key) => SecureStore.getItemAsync(key),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
});
