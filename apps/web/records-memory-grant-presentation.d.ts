export type SeyeonMemoryGrantPresentationV1 = Readonly<{
  kind: 'withdrawal_pending' | 'granted' | 'no_access';
  revokeAvailable: boolean;
  message: string;
}>;

export function presentSeyeonMemoryGrantStatusV1(
  currentlyGranted: boolean,
  withdrawalPending: boolean,
): SeyeonMemoryGrantPresentationV1;
