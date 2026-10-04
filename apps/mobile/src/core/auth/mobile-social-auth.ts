import {
  MyeongHaApiClientErrorV1,
  isGuestCredentialExpiredV1,
  parseSocialAuthCallbackV1,
  promoteGuestToNewMemberV1,
  signOutMemberV1,
  startSocialAuthV1,
  type MyeongHaApiClientV1,
  type SocialAuthProviderV1,
} from '@myeongha/api-client';

import type { MobileGuestCredentialStoreV1 } from '@/core/auth/guest-credential-store';
import type { MobileMemberSessionStoreV1 } from '@/core/auth/member-session-store';
import type {
  MobileSocialAuthPendingStoreV1,
} from '@/core/auth/mobile-social-auth-pending-store';
import type { MobileSubjectSessionCoordinatorV1 } from '@/core/session/mobile-subject-session';

export const MOBILE_SOCIAL_AUTH_REDIRECT_URI_V1 =
  'myeongha://auth/callback' as const;

export type MobileSocialAuthCompletionV1 =
  | Readonly<{
      kind: 'authenticated';
      provider: SocialAuthProviderV1;
      accountState: 'promoted_guest' | 'existing_member';
    }>
  | Readonly<{
      kind: 'cancelled';
      provider: SocialAuthProviderV1;
      code: string;
      description: string | null;
    }>;

export type MobileSocialAuthErrorCodeV1 =
  | 'MOBILE_SOCIAL_AUTH_GUEST_CHANGED'
  | 'MOBILE_SOCIAL_AUTH_PENDING_EXPIRED'
  | 'MOBILE_SOCIAL_AUTH_OPEN_FAILED';

export class MobileSocialAuthErrorV1 extends Error {
  constructor(
    readonly code: MobileSocialAuthErrorCodeV1,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'MobileSocialAuthErrorV1';
  }
}

export interface MobileSocialAuthServiceV1 {
  start(provider: SocialAuthProviderV1): Promise<void>;
  canComplete(url: string): Promise<boolean>;
  complete(url: string): Promise<MobileSocialAuthCompletionV1>;
  cancelPending(): Promise<void>;
}

export function createMobileSocialAuthServiceV1(input: {
  readonly client: MyeongHaApiClientV1;
  readonly subjectSession: Pick<
    MobileSubjectSessionCoordinatorV1,
    'acquireGuestCredential'
  >;
  readonly guestStore: Pick<MobileGuestCredentialStoreV1, 'read' | 'clear'>;
  readonly memberStore: Pick<MobileMemberSessionStoreV1, 'write'>;
  readonly pendingStore: MobileSocialAuthPendingStoreV1;
  readonly openAuthorizationUrl: (url: string) => Promise<void>;
  readonly nowEpochMs?: () => number;
}): MobileSocialAuthServiceV1 {
  const nowEpochMs = input.nowEpochMs ?? Date.now;

  async function start(provider: SocialAuthProviderV1): Promise<void> {
    const guest = await input.subjectSession.acquireGuestCredential();
    const started = await startSocialAuthV1(
      input.client,
      provider,
      MOBILE_SOCIAL_AUTH_REDIRECT_URI_V1,
    );

    await input.pendingStore.write({
      provider,
      state: started.state,
      guestSubjectId: guest.subjectId,
      guestSessionId: guest.guestSessionId,
      expiresAt: started.expiresAt,
    });

    try {
      await input.openAuthorizationUrl(started.authorizationUrl);
    } catch (error) {
      await input.pendingStore.clear(started.state).catch(() => false);
      throw new MobileSocialAuthErrorV1(
        'MOBILE_SOCIAL_AUTH_OPEN_FAILED',
        '소셜 로그인 화면을 열지 못했습니다.',
        { cause: error },
      );
    }
  }

  async function canComplete(url: string): Promise<boolean> {
    const pending = await input.pendingStore.read();
    if (pending === null) return false;
    if (Date.parse(pending.expiresAt) <= nowEpochMs()) {
      await input.pendingStore.clear(pending.state).catch(() => false);
      return false;
    }

    try {
      const parsed = new URL(url);
      return (
        parsed.protocol === 'myeongha:' &&
        parsed.hostname === 'auth' &&
        parsed.pathname === '/callback' &&
        parsed.searchParams.get('state') === pending.state
      );
    } catch {
      return false;
    }
  }

  async function complete(url: string): Promise<MobileSocialAuthCompletionV1> {
    const pending = await input.pendingStore.read();
    if (pending === null) {
      throw new MobileSocialAuthErrorV1(
        'MOBILE_SOCIAL_AUTH_PENDING_EXPIRED',
        '이어갈 소셜 로그인 요청을 찾을 수 없습니다.',
      );
    }
    if (Date.parse(pending.expiresAt) <= nowEpochMs()) {
      await input.pendingStore.clear(pending.state).catch(() => false);
      throw new MobileSocialAuthErrorV1(
        'MOBILE_SOCIAL_AUTH_PENDING_EXPIRED',
        '소셜 로그인 요청 시간이 만료되었습니다.',
      );
    }

    const callback = parseSocialAuthCallbackV1(
      url,
      pending.state,
      nowEpochMs(),
    );
    if (callback.kind === 'cancelled') {
      await input.pendingStore.clear(pending.state);
      return Object.freeze({
        kind: 'cancelled' as const,
        provider: pending.provider,
        code: callback.code,
        description: callback.description,
      });
    }

    const guest = await input.guestStore.read();
    if (
      guest === null ||
      isGuestCredentialExpiredV1(guest, nowEpochMs()) ||
      guest.subjectId !== pending.guestSubjectId ||
      guest.guestSessionId !== pending.guestSessionId
    ) {
      await signOutMemberV1(input.client, callback.session.accessToken)
        .catch(() => undefined);
      await input.pendingStore.clear(pending.state).catch(() => false);
      throw new MobileSocialAuthErrorV1(
        'MOBILE_SOCIAL_AUTH_GUEST_CHANGED',
        '소셜 로그인을 시작한 게스트 세션과 현재 세션이 다릅니다.',
      );
    }

    let accountState: 'promoted_guest' | 'existing_member';
    try {
      await promoteGuestToNewMemberV1(
        input.client,
        callback.session.accessToken,
        guest,
      );
      accountState = 'promoted_guest';
    } catch (error) {
      if (
        error instanceof MyeongHaApiClientErrorV1 &&
        error.code === 'GUEST_MERGE_REQUIRED'
      ) {
        accountState = 'existing_member';
      } else {
        await signOutMemberV1(input.client, callback.session.accessToken)
          .catch(() => undefined);
        throw error;
      }
    }

    await input.memberStore.write(callback.session);

    if (accountState === 'promoted_guest') {
      await input.guestStore.clear(guest.bearerToken).catch(() => false);
    }
    await input.pendingStore.clear(pending.state).catch(() => false);

    return Object.freeze({
      kind: 'authenticated' as const,
      provider: pending.provider,
      accountState,
    });
  }

  async function cancelPending(): Promise<void> {
    const pending = await input.pendingStore.read();
    if (pending !== null) {
      await input.pendingStore.clear(pending.state);
    }
  }

  return Object.freeze({
    start,
    canComplete,
    complete,
    cancelPending,
  });
}
