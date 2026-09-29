import { nativeMobileRuntimeV1 } from '@/core/runtime/native-mobile-runtime';
import { createMobileBirthServiceV1 } from '@/features/birth/mobile-birth-service';

export const mobileBirthServiceV1 = createMobileBirthServiceV1({
  client: nativeMobileRuntimeV1.apiClient,
  session: nativeMobileRuntimeV1.subjectSession,
});
