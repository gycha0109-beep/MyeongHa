import {
  MyeongHaApiClientErrorV1,
  readReaderInterpretationPreviewV1,
  type ReaderInterpretationPreviewRequestV1,
  type ReaderInterpretationPreviewResultV1,
  type MyeongHaApiClientV1,
} from '@myeongha/api-client';

import type { MobileSubjectSessionCoordinatorV1 } from '@/core/session/mobile-subject-session';

export interface MobileReaderInterpretationServiceV1 {
  read(request: ReaderInterpretationPreviewRequestV1): Promise<ReaderInterpretationPreviewResultV1>;
}

export function createMobileReaderInterpretationServiceV1(input: {
  readonly client: MyeongHaApiClientV1;
  readonly session: Pick<MobileSubjectSessionCoordinatorV1, 'withActiveBearer'>;
  /**
   * Do not set to true until the server-owned Reader public route and
   * approved release policy are deployed and verified.
   */
  readonly publicRouteActivated?: boolean;
}): MobileReaderInterpretationServiceV1 {
  return Object.freeze({
    read(request: ReaderInterpretationPreviewRequestV1) {
      if (input.publicRouteActivated !== true) {
        return Promise.reject(new MyeongHaApiClientErrorV1(
          'http', 'CLIENT_READER_SCENE_UNAVAILABLE',
          'Reader Interpretation public route has not been activated.',
        ));
      }
      return input.session.withActiveBearer((bearer) =>
        readReaderInterpretationPreviewV1(input.client, bearer, request, {
          publicRouteActivated: true,
        }),
      );
    },
  });
}
