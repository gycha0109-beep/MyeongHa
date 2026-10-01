import {
  calculateCurrentSajuV1,
  type CurrentSajuCalculationV1,
  type MyeongHaApiClientV1,
} from '@myeongha/api-client';

import type { MobileSubjectSessionCoordinatorV1 } from '@/core/session/mobile-subject-session';

export interface MobileSajuServiceV1 {
  calculateCurrent(): Promise<CurrentSajuCalculationV1>;
}

export function createMobileSajuServiceV1(input: {
  readonly client: MyeongHaApiClientV1;
  readonly session: Pick<MobileSubjectSessionCoordinatorV1, 'withActiveBearer'>;
}): MobileSajuServiceV1 {
  return Object.freeze({
    calculateCurrent() {
      return input.session.withActiveBearer((bearer) =>
        calculateCurrentSajuV1(input.client, bearer),
      );
    },
  });
}
