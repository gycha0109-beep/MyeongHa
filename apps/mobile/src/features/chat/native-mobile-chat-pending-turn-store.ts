import * as SecureStore from 'expo-secure-store';

import { createMobileChatPendingTurnStoreV1 } from '@/features/chat/mobile-chat-pending-turn-store';

export const mobileChatPendingTurnStoreV1 = createMobileChatPendingTurnStoreV1({
  getItemAsync: (key) => SecureStore.getItemAsync(key),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
});
