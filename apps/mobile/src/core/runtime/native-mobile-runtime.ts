import { createMobileApiClientV1 } from '@/core/api/mobile-api-client';
import { mobileGuestCredentialStoreV1 } from '@/core/auth/native-guest-credential-store';
import { readMobileRuntimeConfigV1 } from '@/core/config/mobile-runtime-config';
import { createMobileSubjectSessionCoordinatorV1 } from '@/core/session/mobile-subject-session';

const config = readMobileRuntimeConfigV1();
const apiClient = createMobileApiClientV1(config.apiOrigin);
const subjectSession = createMobileSubjectSessionCoordinatorV1({
  client: apiClient,
  store: mobileGuestCredentialStoreV1,
});

export const nativeMobileRuntimeV1 = Object.freeze({
  config,
  apiClient,
  subjectSession,
});
