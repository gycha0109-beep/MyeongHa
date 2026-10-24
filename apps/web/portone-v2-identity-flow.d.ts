export const WEB_PORTONE_IDENTITY_FLOW_V1: Readonly<{
  activeByDefault: false;
  issueRoute: '/api/identity-verifications/attempts';
  completeRoute: '/api/identity-verifications/complete';
  pendingKey: 'myeongha.portoneIdentity.pending.v1';
  redirectPath: '/my.html';
  redirectMarker: 'identityVerification';
  redirectValue: 'callback';
}>;

export class WebPortOneIdentityFlowErrorV1 extends Error {
  readonly code: string;
  constructor(code: string);
}

export type WebPortOneIdentityFlowResultV1 =
  | Readonly<{ kind: 'redirect_pending' }>
  | Readonly<{ kind: 'verified'; ageBand: 'adult' | 'free_minor' }>;

export interface WebPortOneBrowserSdkPortV1 {
  requestIdentityVerification(input: Readonly<{
    storeId: string;
    channelKey: string;
    identityVerificationId: string;
    redirectUrl: string;
  }>): Promise<unknown>;
}

export interface WebPortOneIdentityPendingStorageV1 {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function createWebPortOneIdentityFlowV1(input?: Readonly<{
  sdk?: WebPortOneBrowserSdkPortV1 | null;
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>;
  pendingStore?: WebPortOneIdentityPendingStorageV1;
  resolveBearer?: () => Promise<Readonly<{
    kind: 'member' | 'guest';
    token: string;
  }> | null>;
  now?: () => number;
  origin?: string;
}>): Readonly<{
  start(): Promise<WebPortOneIdentityFlowResultV1>;
  resumeFromRedirect(query: URLSearchParams | string): Promise<Readonly<{
    kind: 'verified';
    ageBand: 'adult' | 'free_minor';
  }>>;
  discardPending(): void;
}>;
