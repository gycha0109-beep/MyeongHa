import { nativeMobileRuntimeV1 } from '@/core/runtime/native-mobile-runtime';
import { createMobileChatTurnSendServiceV1 } from '@/features/chat/mobile-chat-turn-send-service';

export const mobileChatTurnSendServiceV1 = createMobileChatTurnSendServiceV1({
  client: nativeMobileRuntimeV1.apiClient,
  memberSession: nativeMobileRuntimeV1.memberSession,
});
