// Existing product-auth JS API surfaced to typed client code.
export interface MemberSessionV1 {
  readonly accessToken?: string;
  readonly user?: { readonly id?: string | null; readonly email?: string | null };
}
export function readMemberSession(): MemberSessionV1 | null;
export function invalidateMemberSession(expectedAccessToken?: string | null): void;
export function getActiveBearer(): Promise<Readonly<{
  kind: 'member' | 'guest';
  token: string;
}> | null>;
export function signOutMember(): Promise<void>;
export const PRODUCT_AUTH_STORAGE_V1: Readonly<{
  memberSession: string;
  guestBearer: string;
  pendingGuestBearer: string;
  changedEvent: string;
}>;
