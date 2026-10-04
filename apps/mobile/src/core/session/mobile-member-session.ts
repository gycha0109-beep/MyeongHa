import {
  MyeongHaApiClientErrorV1,
  isMemberSessionExpiredV1,
  refreshMemberSessionV1,
  signInMemberV1,
  signOutMemberV1,
  type MemberSessionV1,
  type MyeongHaApiClientV1,
} from '@myeongha/api-client';

import type { MobileMemberSessionStoreV1 } from '@/core/auth/member-session-store';

export type MobileMemberSessionErrorCodeV1 =
  | 'MOBILE_MEMBER_REQUIRED';

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
  read(): Promise<MemberSessionV1 | null>;
  signIn(email: string, password: string): Promise<MemberSessionV1>;
  withMemberBearer<T>(
    operation: (bearer: string) => Promise<T>,
  ): Promise<T>;
  signOut(): Promise<void>;
}

function isUnauthorized(error: unknown): boolean {
  return (
    error instanceof MyeongHaApiClientErrorV1 &&
    error.kind === 'http' &&
    error.status === 401
  );
}

function isAuthoritativeSessionExpiry(error: unknown): boolean {
  return (
    error instanceof MyeongHaApiClientErrorV1 &&
    error.kind === 'http' &&
    error.status === 401 &&
    error.code === 'SESSION_EXPIRED'
  );
}

export function createMobileMemberSessionCoordinatorV1(input: {
  readonly client: MyeongHaApiClientV1;
  readonly store: MobileMemberSessionStoreV1;
  readonly nowEpochMs?: () => number;
}): MobileMemberSessionCoordinatorV1 {
  const nowEpochMs = input.nowEpochMs ?? Date.now;
  let refreshInFlight: Readonly<{
    accessToken: string;
    promise: Promise<MemberSessionV1 | null>;
  }> | null = null;

  async function read(): Promise<MemberSessionV1 | null> {
    return input.store.read();
  }

  async function signIn(email: string, password: string): Promise<MemberSessionV1> {
    const session = await signInMemberV1(input.client, email, password);
    return input.store.write(session);
  }

  async function refresh(
    current: MemberSessionV1,
  ): Promise<MemberSessionV1 | null> {
    if (
      refreshInFlight !== null &&
      refreshInFlight.accessToken === current.accessToken
    ) {
      return refreshInFlight.promise;
    }

    const pending = (async () => {
      const observed = await input.store.read();
      if (observed === null) return null;
      if (observed.accessToken !== current.accessToken) return observed;

      try {
        const replacement = await refreshMemberSessionV1(
          input.client,
          observed.refreshToken,
        );
        return input.store.write(replacement);
      } catch (error) {
        if (!isAuthoritativeSessionExpiry(error)) throw error;
        await input.store.clear(observed.accessToken);
        return null;
      }
    })();

    refreshInFlight = Object.freeze({
      accessToken: current.accessToken,
      promise: pending,
    });

    try {
      return await pending;
    } finally {
      if (refreshInFlight?.promise === pending) refreshInFlight = null;
    }
  }

  async function requireCurrent(): Promise<MemberSessionV1> {
    const stored = await input.store.read();
    if (stored === null) {
      throw new MobileMemberSessionErrorV1(
        'MOBILE_MEMBER_REQUIRED',
        '로그인이 필요한 기능입니다.',
      );
    }

    if (!isMemberSessionExpiredV1(stored, nowEpochMs())) return stored;

    const replacement = await refresh(stored);
    if (replacement === null) {
      throw new MobileMemberSessionErrorV1(
        'MOBILE_MEMBER_REQUIRED',
        '회원 세션이 만료되었습니다.',
      );
    }
    return replacement;
  }

  async function withMemberBearer<T>(
    operation: (bearer: string) => Promise<T>,
  ): Promise<T> {
    const first = await requireCurrent();

    try {
      return await operation(first.accessToken);
    } catch (error) {
      if (!isUnauthorized(error)) throw error;
    }

    const replacement = await refresh(first);
    if (replacement === null) {
      throw new MobileMemberSessionErrorV1(
        'MOBILE_MEMBER_REQUIRED',
        '회원 세션이 만료되었습니다.',
      );
    }

    try {
      return await operation(replacement.accessToken);
    } catch (error) {
      if (isUnauthorized(error)) {
        await input.store.clear(replacement.accessToken);
      }
      throw error;
    }
  }

  async function signOut(): Promise<void> {
    const current = await input.store.read();
    if (current === null) return;

    try {
      await signOutMemberV1(input.client, current.accessToken);
    } catch {
      // Local sign-out remains authoritative for this device.
    }

    await input.store.clear(current.accessToken);
  }

  return Object.freeze({
    read,
    signIn,
    withMemberBearer,
    signOut,
  });
}
