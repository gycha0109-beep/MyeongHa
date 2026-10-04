import { nativeMobileRuntimeV1 } from '@/core/runtime/native-mobile-runtime';
import { createMobileSajuPreviewServiceV1 } from '@/features/saju/mobile-saju-preview-service';

export const mobileSajuPreviewServiceV1 = createMobileSajuPreviewServiceV1({
  client: nativeMobileRuntimeV1.apiClient,
  session: nativeMobileRuntimeV1.subjectSession,
});
