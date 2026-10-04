import { mobileGuestCredentialStoreV1 } from '@/core/auth/native-guest-credential-store';
import { mobileMemberSessionStoreV1 } from '@/core/auth/native-member-session-store';
import { mobileNewMemberEnrollmentStoreV1 } from '@/core/auth/native-new-member-enrollment-store';
import { nativeMobileRuntimeV1 } from '@/core/runtime/native-mobile-runtime';
import { createMobileNewMemberEnrollmentServiceV1 } from '@/features/my/mobile-new-member-enrollment';

export const mobileNewMemberEnrollmentServiceV1 =
  createMobileNewMemberEnrollmentServiceV1({
    client: nativeMobileRuntimeV1.apiClient,
    subjectSession: nativeMobileRuntimeV1.subjectSession,
    guestStore: mobileGuestCredentialStoreV1,
    memberStore: mobileMemberSessionStoreV1,
    pendingStore: mobileNewMemberEnrollmentStoreV1,
  });
