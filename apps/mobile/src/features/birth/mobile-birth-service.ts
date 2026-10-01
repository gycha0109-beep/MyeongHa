import {
  createBirthProfileV1,
  readCurrentBirthProfileV1,
  type BirthProfileCreateReceiptV1,
  type BirthProfileCreateRequestV1,
  type CurrentBirthProfileV1,
  type MyeongHaApiClientV1,
} from '@myeongha/api-client';

import type { MobileSubjectSessionCoordinatorV1 } from '@/core/session/mobile-subject-session';
export interface MobileBirthServiceV1 {
  readCurrent(): Promise<CurrentBirthProfileV1 | null>;
  create(request: BirthProfileCreateRequestV1): Promise<BirthProfileCreateReceiptV1>;
}

export function createMobileBirthServiceV1(input: {
  readonly client: MyeongHaApiClientV1;
  readonly session: Pick<MobileSubjectSessionCoordinatorV1, 'withActiveBearer'>;
}): MobileBirthServiceV1 {
  return Object.freeze({
    readCurrent() {
      return input.session.withActiveBearer((bearer) =>
        readCurrentBirthProfileV1(input.client, bearer),
      );
    },
    create(request: BirthProfileCreateRequestV1) {
      return input.session.withActiveBearer((bearer) =>
        createBirthProfileV1(input.client, bearer, request),
      );
    },
  });
}

