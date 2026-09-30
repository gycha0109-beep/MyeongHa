import {
  MyeongHaApiClientErrorV1,
  isMemberSessionExpiredV1,
  isMemberSessionRefreshDueV1,
  refreshMemberSessionV1,
  sameMemberSessionGenerationV1,
  signInMemberV1,
  signOutMemberV1,
  type MemberSessionV1,
  type MyeongHaApiClientV1,
} from '@myeongha/api-client';

import type { MobileMemberSessionStoreV1 } from '@/core/auth/member-session-store';

export type MobileMemberSessionErrorCodeV1 =
  | 'MOBILE_MEMBER_SESSION_REQUIRED'
  | 'MOBILE_MEMBER_SESSION_REPLACED'
  | 'MOBILE_MEMBER_SESSION_CLEAR_FAILED';

export class MobileMemberSessionErrorV1 extends Error {
  constructor(
    readonly code: MobileMemberSessionErrorCodeV1,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'MobileMemberSessionErrorV1';
  }
}

export interface MobileMemberSessionCoordinatorV1 {
  readSession(): Promise<MemberSessionV1 | null>;
  signIn(input: Readonly<{ email: string; password: string }>): Promise<MemberSessionV1>;
  getAccessToken(): Promise<string | null>;
  withMemberBearer<T>(operation: (bearer: string) => Promise<T>): Promise<T>;
  signOut(): Promise<void>;
}

function isSessionExpiredError(error: unknown): boolean {
  return (
    error instanceof MyeongHaApiClientErrorV1 &&
    error.kind === 'http' &&
    error.status === 401 &&
    error.code === 'SESSION_EXPIRED'
  );
}

function isUnauthorized(error: unknown): boolean {
  return (
    error instanceof MyeongHaApiClientErrorV1 &&
    error.kind === 'http' &&
    error.status === 401
  );
}

export function createMobileMemberSessionCoordinatorV1(input: {
  readonly client: MyeongHaApiClientV1;
  readonly store: MobileMemberSessionStoreV1;
  readonly nowEpochMs?: () => number;
  readonly refreshSkewMs?: number;
}): MobileMemberSessionCoordinatorV1 {
  const nowEpochMs = input.nowEpochMs ?? Date.now;
  const refreshSkewMs = input.refreshSkewMs ?? 60_000;
  let refreshInFlight: Promise<MemberSessionV1 | null> | null = null;
  let mutationQueue: Promise<void> = Promise.resolve();

  function withMemberMutationLock<T>(operation: () => Promise<T>): Promise<T> {
    const pending = mutationQueue.then(operation, operation);
    mutationQueue = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  }

  async function refreshExact(
    current: MemberSessionV1,
  ): Promise<MemberSessionV1 | null> {
    return withMemberMutationLock(async () => {
      const latest = await input.store.read();
      if (
        latest === null ||
        !sameMemberSessionGenerationV1(latest, current)
      ) {
        return latest;
      }

      try {
        const refreshed = await refreshMemberSessionV1(
          input.client,
          current.refreshToken,
        );
        return input.store.replace(current, refreshed);
      } catch (error) {
        if (isSessionExpiredError(error)) {
          await input.store.clear(current);
        }
        throw error;
      }
    });
  }

  async function refreshCurrent(
    current: MemberSessionV1,
  ): Promise<MemberSessionV1 | null> {
    if (refreshInFlight !== null) return refreshInFlight;
    const pending = refreshExact(current);
    refreshInFlight = pending;
    try {
      return await pending;
    } finally {
      if (refreshInFlight === pending) refreshInFlight = null;
    }
  }

  async function getAccessToken(): Promise<string | null> {
    const current = await input.store.read();
    if (current === null) return null;

    const now = nowEpochMs();
    if (!isMemberSessionRefreshDueV1(current, now, refreshSkewMs)) {
      return current.accessToken;
    }

    try {
      const refreshed = await refreshCurrent(current);
      if (refreshed !== null) return refreshed.accessToken;

      const replacement = await input.store.read();
      return replacement?.accessToken ?? null;
    } catch (error) {
      const latest = await input.store.read();
      if (latest !== null && latest.accessToken !== current.accessToken) {
        return getAccessToken();
      }
      if (
        !isSessionExpiredError(error) &&
        !isMemberSessionExpiredV1(current, now)
      ) {
        return current.accessToken;
      }
      throw error;
    }
  }

  async function signIn(
    credentials: Readonly<{ email: string; password: string }>,
  ): Promise<MemberSessionV1> {
    return withMemberMutationLock(async () => {
      const result = await signInMemberV1(input.client, credentials);
      return input.store.write(result.session);
    });
  }

  async function forceRefreshForRejectedBearer(
    rejectedBearer: string,
  ): Promise<MemberSessionV1 | null> {
    const current = await input.store.read();
    if (current === null) return null;
    if (current.accessToken !== rejectedBearer) return current;
    return refreshCurrent(current);
  }

  async function withMemberBearer<T>(
    operation: (bearer: string) => Promise<T>,
  ): Promise<T> {
    const first = await getAccessToken();
    if (first === null) {
      throw new MobileMemberSessionErrorV1(
        'MOBILE_MEMBER_SESSION_REQUIRED',
        '로그인이 필요한 기능입니다.',
      );
    }

    try {
      return await operation(first);
    } catch (error) {
      if (!isUnauthorized(error)) throw error;
    }

    const replacement = await forceRefreshForRejectedBearer(first);
    if (replacement === null) {
      throw new MobileMemberSessionErrorV1(
        'MOBILE_MEMBER_SESSION_REQUIRED',
        '회원 세션이 만료되었습니다.',
      );
    }

    try {
      return await operation(replacement.accessToken);
    } catch (error) {
      if (isUnauthorized(error)) {
        await input.store.clear(replacement);
      }
      throw error;
    }
  }

  async function signOut(): Promise<void> {
    return withMemberMutationLock(async () => {
      const current = await input.store.read();
      if (current !== null) {
        try {
          await signOutMemberV1(input.client, current.accessToken);
        } catch {
          // Local sign-out remains authoritative for this device when local authority can be cleared.
        }
      }

      const cleared = await input.store.clear(current ?? undefined);
      if (!cleared) {
        throw new MobileMemberSessionErrorV1(
          'MOBILE_MEMBER_SESSION_CLEAR_FAILED',
          '로그인 세션을 기기에서 안전하게 제거하지 못했습니다.',
        );
      }
    });
  }

  return Object.freeze({
    readSession: () => input.store.read(),
    signIn,
    getAccessToken,
    withMemberBearer,
    signOut,
  });
}
