import { nativeMobileRuntimeV1 } from '@/core/runtime/native-mobile-runtime';
import { createMobileMyServiceV1 } from '@/features/my/mobile-my-service';

export const mobileMyServiceV1 = createMobileMyServiceV1({
  client: nativeMobileRuntimeV1.apiClient,
  session: nativeMobileRuntimeV1.subjectSession,
});
