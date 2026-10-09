import {
  MyeongHaApiClientErrorV1,
  readReaderInterpretationPreviewV1,
  readChatThreadPageV1,
  parseChatThreadIdV1,
  parseOfficialReadingIdV1,
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
      // Public OFF rejects before resolving the active Subject or doing I/O.
      if (input.publicRouteActivated !== true) {
        return read({
          threadId: request.threadId,
          officialReadingId: request.officialReading.readingId,
        });
      }

      const threadId = parseChatThreadIdV1(request.threadId);
      const officialReadingId = parseOfficialReadingIdV1(request.officialReading.readingId);
      return input.session.withActiveBearer(async (bearer) => {
        // Fresh authenticated server read: verify the Thread's pinned Reader
        // before requesting any paid/privileged interpretation. The server
        // still owns exact Reading/Thread/Grant/Product/release admission.
        const thread = await readChatThreadPageV1(input.client, bearer, threadId, {
          pageSize: 1,
        });
        if (thread.threadId !== threadId ||
          thread.characterId !== request.expectedReaderId) {
          throw new MyeongHaApiClientErrorV1(
            'malformed_response',
            'CLIENT_READER_THREAD_BINDING_MISMATCH',
            'Reader thread identity does not match the requested Reader.',
          );
        }

        const result = await readReaderInterpretationPreviewV1(
          input.client,
          bearer,
          Object.freeze({ threadId, officialReadingId }),
          { publicRouteActivated: true },
        );
        assertMobileReaderResponseBindingV1(request, result);
        return result;
      });
    },
  });
}
