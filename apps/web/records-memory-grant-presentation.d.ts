export type SeyeonMemoryGrantStateV1 = 'active' | 'withdrawal_pending' | 'not_granted' | 'unknown';

export type SeyeonMemoryGrantPresentationV1 = Readonly<{
  kind: 'withdrawal_pending' | 'granted' | 'no_access' | 'unknown';
  revokeAvailable: boolean;
  message: string;
}>;

export function presentSeyeonMemoryGrantStatusV1(
  grantState: SeyeonMemoryGrantStateV1,
  withdrawalPending: boolean,
): SeyeonMemoryGrantPresentationV1;
