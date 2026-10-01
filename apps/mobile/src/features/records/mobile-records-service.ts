import {
  readLifeRecordPageV1,
  readMemoryPageV1,
  readReadingHistoryPageV1,
  type LifeRecordPageV1,
  type MemoryPageV1,
  type MyeongHaApiClientV1,
  type ReadingHistoryPageV1,
  type RecordsPageOptionsV1,
} from '@myeongha/api-client';

import type { MobileSubjectSessionCoordinatorV1 } from '@/core/session/mobile-subject-session';

export interface MobileRecordsServiceV1 {
  readLifeRecordPage(options?: RecordsPageOptionsV1): Promise<LifeRecordPageV1>;
  readReadingPage(options?: RecordsPageOptionsV1): Promise<ReadingHistoryPageV1>;
  readMemoryPage(options?: RecordsPageOptionsV1): Promise<MemoryPageV1>;
}

export function createMobileRecordsServiceV1(input: {
  readonly client: MyeongHaApiClientV1;
  readonly session: Pick<MobileSubjectSessionCoordinatorV1, 'withActiveBearer'>;
}): MobileRecordsServiceV1 {
  return Object.freeze({
    readLifeRecordPage(options = {}) {
      return input.session.withActiveBearer((bearer) =>
        readLifeRecordPageV1(input.client, bearer, options),
      );
    },
    readReadingPage(options = {}) {
      return input.session.withActiveBearer((bearer) =>
        readReadingHistoryPageV1(input.client, bearer, options),
      );
    },
    readMemoryPage(options = {}) {
      return input.session.withActiveBearer((bearer) =>
        readMemoryPageV1(input.client, bearer, options),
      );
    },
  });
}
