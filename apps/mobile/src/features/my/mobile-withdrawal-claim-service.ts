import {
  MyeongHaApiClientErrorV1,
  readDigitalReadingWithdrawalClaimStatusV1,
  submitDigitalReadingWithdrawalClaimV1,
  type DigitalReadingWithdrawalClaimStatusResponseV1,
  type MyeongHaApiClientV1,
  type SubmitDigitalReadingWithdrawalRequestV1,
  type SubmittedDigitalReadingWithdrawalClaimV1,
} from '@myeongha/api-client';

import type { MobileMemberSessionCoordinatorV1 } from '@/core/session/mobile-member-session';

/** Mobile client-only gate. Server and schema gates remain independently OFF. */
export const MOBILE_WITHDRAWAL_CLAIM_RELEASE_V1 = Object.freeze({
  enabledByDefault: false,
  automaticRefund: false,
  browserCookieFallback: false,
  accountSwitchClearsResult: true,
});

export interface MobileWithdrawalClaimServiceV1 {
  submit(request: SubmitDigitalReadingWithdrawalRequestV1):
    Promise<SubmittedDigitalReadingWithdrawalClaimV1>;
  readStatus(claimId: string): Promise<DigitalReadingWithdrawalClaimStatusResponseV1>;
}

/**
 * Member-only operations. Never fall back to Guest, never send a cookie and
 * never display an old account's result after a credentials switch.
 */
export function createMobileWithdrawalClaimServiceV1(input: Readonly<{
  client: MyeongHaApiClientV1;
  memberSession: Pick<MobileMemberSessionCoordinatorV1, 'read' | 'withMemberBearer'>;
  enabled?: boolean;
}>): MobileWithdrawalClaimServiceV1 {
  async function memberRequest<T>(operation: (bearer: string) => Promise<T>): Promise<T> {
    if (input.enabled !== true) {
      throw new MyeongHaApiClientErrorV1(
        'http', 'CLIENT_WITHDRAWAL_CLAIM_UNAVAILABLE',
        'The withdrawal claim service is not released.',
      );
    }
    return input.memberSession.withMemberBearer(async (bearer) => {
      const result = await operation(bearer);
      const current = await input.memberSession.read();
      if (!current || current.accessToken !== bearer) {
        throw new MyeongHaApiClientErrorV1(
          'malformed_response', 'CLIENT_WITHDRAWAL_SESSION_CHANGED',
          'The withdrawal response belongs to a superseded member session.',
        );
      }
      return result;
    });
  }
  return Object.freeze({
    submit: (request: SubmitDigitalReadingWithdrawalRequestV1) => memberRequest((bearer) =>
      submitDigitalReadingWithdrawalClaimV1(input.client, bearer, request)),
    readStatus: (claimId: string) => memberRequest((bearer) =>
      readDigitalReadingWithdrawalClaimStatusV1(input.client, bearer, claimId)),
  });
}
