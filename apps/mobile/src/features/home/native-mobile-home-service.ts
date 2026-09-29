import { nativeMobileRuntimeV1 } from '@/core/runtime/native-mobile-runtime';
import { createMobileHomeServiceV1 } from '@/features/home/mobile-home-service';

export const mobileHomeServiceV1 = createMobileHomeServiceV1({
  client: nativeMobileRuntimeV1.apiClient,
  session: nativeMobileRuntimeV1.subjectSession,
});
