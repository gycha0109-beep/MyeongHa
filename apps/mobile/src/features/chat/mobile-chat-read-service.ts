import {
  readChatThreadPageV1,
  type ChatReadPageOptionsV1,
  type ChatThreadPageV1,
  type MyeongHaApiClientV1,
} from '@myeongha/api-client';

import type { MobileSubjectSessionCoordinatorV1 } from '@/core/session/mobile-subject-session';

export interface MobileChatReadServiceV1 {
  readThreadPage(
    threadId: string,
    options?: ChatReadPageOptionsV1,
  ): Promise<ChatThreadPageV1>;
}

export function createMobileChatReadServiceV1(input: {
  readonly client: MyeongHaApiClientV1;
  readonly session: Pick<MobileSubjectSessionCoordinatorV1, 'withGuestBearer'>;
}): MobileChatReadServiceV1 {
  return Object.freeze({
    readThreadPage(threadId, options = {}) {
      return input.session.withGuestBearer((bearer) =>
        readChatThreadPageV1(input.client, bearer, threadId, options),
      );
    },
  });
}
