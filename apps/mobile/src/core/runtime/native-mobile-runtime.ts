import { createMobileApiClientV1 } from '@/core/api/mobile-api-client';
import { mobileGuestCredentialStoreV1 } from '@/core/auth/native-guest-credential-store';
import { mobileMemberSessionStoreV1 } from '@/core/auth/native-member-session-store';
import { readMobileRuntimeConfigV1 } from '@/core/config/mobile-runtime-config';
import { createMobileMemberSessionCoordinatorV1 } from '@/core/session/mobile-member-session';
import { createMobileSubjectSessionCoordinatorV1 } from '@/core/session/mobile-subject-session';

const config = readMobileRuntimeConfigV1();
const apiClient = createMobileApiClientV1(config.apiOrigin);
const memberSession = createMobileMemberSessionCoordinatorV1({
  client: apiClient,
  store: mobileMemberSessionStoreV1,
});
const subjectSession = createMobileSubjectSessionCoordinatorV1({
  client: apiClient,
  store: mobileGuestCredentialStoreV1,
  memberSession,
});

export const nativeMobileRuntimeV1 = Object.freeze({
  config,
  apiClient,
  memberSession,
  subjectSession,
});
