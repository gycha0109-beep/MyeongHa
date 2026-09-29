import {
  calculateCurrentSajuV1,
  readCurrentBirthProfileV1,
  readCurrentSubjectProfileV1,
  readReadingHistoryPageV1,
  type CurrentBirthProfileV1,
  type CurrentSajuCalculationV1,
  type CurrentSubjectProfileV1,
  type MyeongHaApiClientV1,
  type ReadingHistoryItemV1,
} from '@myeongha/api-client';

import type { MobileSubjectSessionCoordinatorV1 } from '@/core/session/mobile-subject-session';

export interface MobileHomeServiceV1 {
  readProfile(): Promise<CurrentSubjectProfileV1>;
  readBirth(): Promise<CurrentBirthProfileV1 | null>;
  readLatestReading(): Promise<ReadingHistoryItemV1 | null>;
  calculateCurrentSaju(): Promise<CurrentSajuCalculationV1>;
}

export function createMobileHomeServiceV1(input: {
  readonly client: MyeongHaApiClientV1;
  readonly session: Pick<MobileSubjectSessionCoordinatorV1, 'withGuestBearer'>;
}): MobileHomeServiceV1 {
  return Object.freeze({
    readProfile() {
      return input.session.withGuestBearer((bearer) =>
        readCurrentSubjectProfileV1(input.client, bearer),
      );
    },
    readBirth() {
      return input.session.withGuestBearer((bearer) =>
        readCurrentBirthProfileV1(input.client, bearer),
      );
    },
    async readLatestReading() {
      return input.session.withGuestBearer(async (bearer) => {
        const page = await readReadingHistoryPageV1(input.client, bearer, { pageSize: 1 });
        return page.readings[0] ?? null;
      });
    },
    calculateCurrentSaju() {
      return input.session.withGuestBearer((bearer) =>
        calculateCurrentSajuV1(input.client, bearer),
      );
    },
  });
}
