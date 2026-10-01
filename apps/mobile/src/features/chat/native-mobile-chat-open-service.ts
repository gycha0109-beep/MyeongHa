import { nativeMobileRuntimeV1 } from '@/core/runtime/native-mobile-runtime';
import { createMobileChatOpenServiceV1 } from '@/features/chat/mobile-chat-open-service';

export const mobileChatOpenServiceV1 = createMobileChatOpenServiceV1({
  client: nativeMobileRuntimeV1.apiClient,
  memberSession: nativeMobileRuntimeV1.memberSession,
});
