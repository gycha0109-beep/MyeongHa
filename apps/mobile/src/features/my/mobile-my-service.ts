import {
  readCurrentBirthProfileV1,
  readCurrentSubjectProfileV1,
  type CurrentBirthProfileV1,
  type CurrentSubjectProfileV1,
  type MyeongHaApiClientV1,
} from '@myeongha/api-client';

import type { MobileSubjectSessionCoordinatorV1 } from '@/core/session/mobile-subject-session';

export interface MobileMyServiceV1 {
  readProfile(): Promise<CurrentSubjectProfileV1>;
  readBirth(): Promise<CurrentBirthProfileV1 | null>;
}

export function createMobileMyServiceV1(input: {
  readonly client: MyeongHaApiClientV1;
  readonly session: Pick<MobileSubjectSessionCoordinatorV1, 'withActiveBearer'>;
}): MobileMyServiceV1 {
  return Object.freeze({
    readProfile() {
      return input.session.withActiveBearer((bearer) =>
        readCurrentSubjectProfileV1(input.client, bearer),
      );
    },
    readBirth() {
      return input.session.withActiveBearer((bearer) =>
        readCurrentBirthProfileV1(input.client, bearer),
      );
    },
  });
}
