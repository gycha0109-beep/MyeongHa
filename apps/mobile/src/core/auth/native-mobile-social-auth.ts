import { Linking } from 'react-native';

import { mobileGuestCredentialStoreV1 } from '@/core/auth/native-guest-credential-store';
import { mobileMemberSessionStoreV1 } from '@/core/auth/native-member-session-store';
import { mobileSocialAuthPendingStoreV1 } from '@/core/auth/native-mobile-social-auth-pending-store';
import { createMobileSocialAuthServiceV1 } from '@/core/auth/mobile-social-auth';
import { nativeMobileRuntimeV1 } from '@/core/runtime/native-mobile-runtime';

export const nativeMobileSocialAuthServiceV1 =
  createMobileSocialAuthServiceV1({
    client: nativeMobileRuntimeV1.apiClient,
    subjectSession: nativeMobileRuntimeV1.subjectSession,
    guestStore: mobileGuestCredentialStoreV1,
    memberStore: mobileMemberSessionStoreV1,
    pendingStore: mobileSocialAuthPendingStoreV1,
    openAuthorizationUrl: (url) => Linking.openURL(url),
  });
