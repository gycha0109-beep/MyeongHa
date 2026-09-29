import { nativeMobileRuntimeV1 } from '@/core/runtime/native-mobile-runtime';
import { createMobileRecordsServiceV1 } from '@/features/records/mobile-records-service';

export const mobileRecordsServiceV1 = createMobileRecordsServiceV1({
  client: nativeMobileRuntimeV1.apiClient,
  session: nativeMobileRuntimeV1.subjectSession,
});
