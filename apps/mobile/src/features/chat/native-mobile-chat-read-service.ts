import { nativeMobileRuntimeV1 } from '@/core/runtime/native-mobile-runtime';
import { createMobileChatReadServiceV1 } from '@/features/chat/mobile-chat-read-service';

export const mobileChatReadServiceV1 = createMobileChatReadServiceV1({
  client: nativeMobileRuntimeV1.apiClient,
  session: nativeMobileRuntimeV1.subjectSession,
});
