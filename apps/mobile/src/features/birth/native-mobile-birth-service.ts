import { nativeMobileRuntimeV1 } from '../../core/runtime/native-mobile-runtime.js';
import { createMobileBirthServiceV1 } from './mobile-birth-service.js';

export const mobileBirthServiceV1 = createMobileBirthServiceV1({
  client: nativeMobileRuntimeV1.apiClient,
  session: nativeMobileRuntimeV1.subjectSession,
});
