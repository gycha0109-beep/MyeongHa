import {
  MyeongHaApiClientErrorV1,
  readLifeRecordPageV1,
  readMemoryPageV1,
  readOfficialReadingRecordV1,
  readReadingHistoryPageV1,
  type LifeRecordPageV1,
  type MemoryPageV1,
  type MyeongHaApiClientV1,
  type OfficialReadingRecordV1,
  type ReadingHistoryPageV1,
  type RecordsPageOptionsV1,
} from '@myeongha/api-client';

import type { MobileSubjectSessionCoordinatorV1 } from '@/core/session/mobile-subject-session';

export interface MobileRecordsServiceV1 {
  readLifeRecordPage(options?: RecordsPageOptionsV1): Promise<LifeRecordPageV1>;
  readReadingPage(options?: RecordsPageOptionsV1): Promise<ReadingHistoryPageV1>;
  readOfficialReading(readingId: string): Promise<OfficialReadingRecordV1>;
  readMemoryPage(options?: RecordsPageOptionsV1): Promise<MemoryPageV1>;
}

export function createMobileRecordsServiceV1(input: {
  readonly client: MyeongHaApiClientV1;
  readonly session: Pick<MobileSubjectSessionCoordinatorV1, 'withActiveBearer'>;
}): MobileRecordsServiceV1 {
  /**
   * A server-owned Records response is valid for its original Subject only.
   * A Guest→Member promotion, Member sign-out/switch, or token replacement
   * while awaiting HTTP must never publish the old Subject's archive locally.
   *
   * This is a client display guard; it is not server-side authorization.
   */
  function readForCurrentSession<T>(
    operation: (bearer: string) => Promise<T>,
  ): Promise<T> {
    return input.session.withActiveBearer(async (originalBearer) => {
      const result = await operation(originalBearer);
      await input.session.withActiveBearer(async (currentBearer) => {
        if (currentBearer !== originalBearer) {
          throw new MyeongHaApiClientErrorV1(
            'malformed_response',
            'CLIENT_RECORDS_SESSION_CHANGED',
            'Records response belongs to a superseded mobile session.',
          );
        }
      });
      return result;
    });
  }

  return Object.freeze({
    readLifeRecordPage(options = {}) {
      return readForCurrentSession((bearer) =>
        readLifeRecordPageV1(input.client, bearer, options),
      );
    },
    readReadingPage(options = {}) {
      return readForCurrentSession((bearer) =>
        readReadingHistoryPageV1(input.client, bearer, options),
      );
    },
    readOfficialReading(readingId: string) {
      return readForCurrentSession((bearer) =>
        readOfficialReadingRecordV1(input.client, bearer, readingId),
      );
    },
    readMemoryPage(options = {}) {
      return readForCurrentSession((bearer) =>
        readMemoryPageV1(input.client, bearer, options),
      );
    },
  });
}
