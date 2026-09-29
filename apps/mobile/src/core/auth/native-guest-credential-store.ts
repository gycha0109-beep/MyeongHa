import * as SecureStore from 'expo-secure-store';

import { createMobileGuestCredentialStoreV1 } from './guest-credential-store';

export const mobileGuestCredentialStoreV1 = createMobileGuestCredentialStoreV1({
  getItemAsync: (key) => SecureStore.getItemAsync(key),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
});
