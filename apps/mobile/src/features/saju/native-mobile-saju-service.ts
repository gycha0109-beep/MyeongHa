import { nativeMobileRuntimeV1 } from '../../core/runtime/native-mobile-runtime.js';
import { createMobileSajuServiceV1 } from './mobile-saju-service.js';

export const mobileSajuServiceV1 = createMobileSajuServiceV1({
  client: nativeMobileRuntimeV1.apiClient,
  session: nativeMobileRuntimeV1.subjectSession,
});
