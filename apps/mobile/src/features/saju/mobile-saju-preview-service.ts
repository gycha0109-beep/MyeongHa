import {
  readCurrentSajuPreviewReadingV1,
  type MyeongHaApiClientV1,
  type SajuPreviewReadingResultV1,
  type SajuPreviewReadingTextV1,
} from '@myeongha/api-client';

import type { MobileSubjectSessionCoordinatorV1 } from '@/core/session/mobile-subject-session';

export interface MobileSajuPreviewServiceV1 {
  read(readingText: SajuPreviewReadingTextV1): Promise<SajuPreviewReadingResultV1>;
}

export function createMobileSajuPreviewServiceV1(input: {
  readonly client: MyeongHaApiClientV1;
  readonly session: Pick<MobileSubjectSessionCoordinatorV1, 'withActiveBearer'>;
}): MobileSajuPreviewServiceV1 {
  return Object.freeze({
    read(readingText: SajuPreviewReadingTextV1) {
      return input.session.withActiveBearer((bearer) =>
        readCurrentSajuPreviewReadingV1(input.client, bearer, readingText),
      );
    },
  });
}
