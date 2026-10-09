import {
  MyeongHaApiClientErrorV1,
  readReaderInterpretationPreviewV1,
  type ReaderInterpretationPreviewRequestV1,
  type ReaderInterpretationPreviewResultV1,
  type MyeongHaApiClientV1,
} from '@myeongha/api-client';

import type { MobileSubjectSessionCoordinatorV1 } from '@/core/session/mobile-subject-session';
import {
  assertMobileReaderResponseBindingV1,
  type MobileReaderResponseBindingV1,
} from '@/features/reading/mobile-reader-response-binding';

export interface MobileReaderInterpretationServiceV1 {
  read(request: ReaderInterpretationPreviewRequestV1): Promise<ReaderInterpretationPreviewResultV1>;
  readForOfficialReading(request: MobileReaderResponseBindingV1 & {
    readonly threadId: string;
  }): Promise<ReaderInterpretationPreviewResultV1>;
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
  const read = (request: ReaderInterpretationPreviewRequestV1) => {
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
  };
  return Object.freeze({
    read,
    async readForOfficialReading(request: MobileReaderResponseBindingV1 & {
      readonly threadId: string;
    }) {
      // The Thread must come from a server-owned, approved context.
      // Never infer its identity from a Reader picker or archive provenance.
      const result = await read(Object.freeze({
        threadId: request.threadId,
        officialReadingId: request.officialReading.readingId,
      }));
      assertMobileReaderResponseBindingV1(request, result);
      return result;
    },
  });
}
