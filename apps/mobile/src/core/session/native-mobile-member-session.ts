import { nativeMobileRuntimeV1 } from '@/core/runtime/native-mobile-runtime';
import { mobileMemberSessionStoreV1 } from '@/core/auth/native-member-session-store';
import { createMobileMemberSessionCoordinatorV1 } from '@/core/session/mobile-member-session';

export const mobileMemberSessionV1 = createMobileMemberSessionCoordinatorV1({
  client: nativeMobileRuntimeV1.apiClient,
  store: mobileMemberSessionStoreV1,
});
