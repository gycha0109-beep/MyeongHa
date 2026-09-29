import { nativeMobileRuntimeV1 } from '@/core/runtime/native-mobile-runtime';
import { createMobileSajuServiceV1 } from '@/features/saju/mobile-saju-service';

export const mobileSajuServiceV1 = createMobileSajuServiceV1({
  client: nativeMobileRuntimeV1.apiClient,
  session: nativeMobileRuntimeV1.subjectSession,
});
