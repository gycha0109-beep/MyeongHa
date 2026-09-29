import { createMobileRecordsControllerV1 } from '@/features/records/mobile-records-controller';
import { createMobileRecordsRepositoriesV1 } from '@/features/records/mobile-records-repository';
import { mobileRecordsServiceV1 } from '@/features/records/native-mobile-records-service';

export const mobileRecordsControllerV1 = createMobileRecordsControllerV1({
  repositories: createMobileRecordsRepositoriesV1(mobileRecordsServiceV1, 20),
  cacheTtlMs: 60_000,
});
