import { createMobileApiClientV1 } from '../api/mobile-api-client.js';
import { mobileGuestCredentialStoreV1 } from '../auth/native-guest-credential-store.js';
import { readMobileRuntimeConfigV1 } from '../config/mobile-runtime-config.js';
import { createMobileSubjectSessionCoordinatorV1 } from '../session/mobile-subject-session.js';

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
