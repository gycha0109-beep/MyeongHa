import { createMobileChatReadControllerV1 } from '@/features/chat/mobile-chat-read-controller';
import { createMobileChatReadRepositoryV1 } from '@/features/chat/mobile-chat-read-repository';
import { mobileChatReadServiceV1 } from '@/features/chat/native-mobile-chat-read-service';

export function createNativeMobileChatReadControllerV1(threadId: string) {
  return createMobileChatReadControllerV1(
    createMobileChatReadRepositoryV1({
      threadId,
      service: mobileChatReadServiceV1,
      pageSize: 30,
    }),
  );
}
