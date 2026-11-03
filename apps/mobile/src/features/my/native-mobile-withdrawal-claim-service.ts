import { nativeMobileRuntimeV1 } from '@/core/runtime/native-mobile-runtime';
import { createMobileWithdrawalClaimServiceV1 } from './mobile-withdrawal-claim-service';

/** UI and API activation are separate. This is OFF in every default build. */
export const MOBILE_WITHDRAWAL_CLAIM_UI_ENABLED_V1 =
  process.env.EXPO_PUBLIC_MYEONGHA_WITHDRAWAL_REQUEST_ENABLED === '1';

export const nativeMobileWithdrawalClaimServiceV1 =
  createMobileWithdrawalClaimServiceV1({
    client: nativeMobileRuntimeV1.apiClient,
    memberSession: nativeMobileRuntimeV1.memberSession,
    enabled: MOBILE_WITHDRAWAL_CLAIM_UI_ENABLED_V1,
  });
