import * as SecureStore from 'expo-secure-store';

import { createMobileNewMemberEnrollmentStoreV1 } from '@/core/auth/new-member-enrollment-store';

export const mobileNewMemberEnrollmentStoreV1 =
  createMobileNewMemberEnrollmentStoreV1({
    getItemAsync: (key) => SecureStore.getItemAsync(key),
    setItemAsync: (key, value) => SecureStore.setItemAsync(key, value),
    deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
  });
