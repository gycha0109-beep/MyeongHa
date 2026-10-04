import {
  MyeongHaApiClientErrorV1,
  bootstrapSessionV1,
  isGuestCredentialExpiredV1,
  resolveGuestCredentialFromBootstrapV1,
  type GuestCredentialV1,
  type MyeongHaApiClientV1,
} from '@myeongha/api-client';

import type { MobileGuestCredentialStoreV1 } from '@/core/auth/guest-credential-store';
import {
  MobileMemberSessionErrorV1,
  type MobileMemberSessionCoordinatorV1,
} from '@/core/session/mobile-member-session';

export type MobileSubjectSessionErrorCodeV1 =
  | 'MOBILE_MEMBER_AUTH_NOT_AVAILABLE'
  | 'MOBILE_GUEST_BOOTSTRAP_FAILED';

export class MobileSubjectSessionErrorV1 extends Error {
  constructor(
    readonly code: MobileSubjectSessionErrorCodeV1,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'MobileSubjectSessionErrorV1';
  }
}

export interface MobileSubjectSessionCoordinatorV1 {
  acquireGuestCredential(): Promise<GuestCredentialV1>;
  withGuestBearer<T>(
    operation: (bearer: string) => Promise<T>,
  ): Promise<T>;
  withActiveBearer<T>(
    operation: (bearer: string) => Promise<T>,
  ): Promise<T>;
}

function isUnauthorized(error: unknown): boolean {
  return (
    error instanceof MyeongHaApiClientErrorV1 &&
    error.kind === 'http' &&
    error.status === 401
  );
}

export function createMobileSubjectSessionCoordinatorV1(input: {
  readonly client: MyeongHaApiClientV1;
  readonly store: MobileGuestCredentialStoreV1;
  readonly memberSession?: Pick<MobileMemberSessionCoordinatorV1, 'read' | 'withMemberBearer'>;
  readonly nowEpochMs?: () => number;
}): MobileSubjectSessionCoordinatorV1 {
  const nowEpochMs = input.nowEpochMs ?? Date.now;
  let acquireInFlight: Promise<GuestCredentialV1> | null = null;
  let replacementInFlight: Readonly<{
    failedBearer: string;
    promise: Promise<GuestCredentialV1>;
  }> | null = null;

  async function persistBootstrap(
    existing: GuestCredentialV1 | null,
    bearer?: string,
  ): Promise<GuestCredentialV1> {
    const bootstrap = await bootstrapSessionV1(input.client, bearer);
    if (bootstrap.kind !== 'guest') {
      throw new MobileSubjectSessionErrorV1(
        'MOBILE_MEMBER_AUTH_NOT_AVAILABLE',
        '모바일 Member 인증 경계가 아직 활성화되지 않았습니다.',
      );
    }

    let credential: GuestCredentialV1 | null;
    try {
      credential = resolveGuestCredentialFromBootstrapV1(bootstrap, existing);
    } catch (error) {
      throw new MobileSubjectSessionErrorV1(
        'MOBILE_GUEST_BOOTSTRAP_FAILED',
        '모바일 게스트 세션을 확정하지 못했습니다.',
        { cause: error },
      );
    }
    if (credential === null) {
      throw new MobileSubjectSessionErrorV1(
        'MOBILE_GUEST_BOOTSTRAP_FAILED',
        '모바일 게스트 세션 credential이 비어 있습니다.',
      );
    }

    if (credential === existing) return credential;
    return input.store.write(credential);
  }

  async function bootstrapFresh(): Promise<GuestCredentialV1> {
    return persistBootstrap(null);
  }

  async function acquireGuestCredentialUncoordinated(): Promise<GuestCredentialV1> {
    let existing = await input.store.read();

    if (existing !== null && isGuestCredentialExpiredV1(existing, nowEpochMs())) {
      const cleared = await input.store.clear(existing.bearerToken);
      existing = cleared ? null : await input.store.read();
    }

    if (existing === null) return bootstrapFresh();

    try {
      return await persistBootstrap(existing, existing.bearerToken);
    } catch (error) {
      if (!isUnauthorized(error)) throw error;

      const cleared = await input.store.clear(existing.bearerToken);
      if (cleared) return bootstrapFresh();

      const observed = await input.store.read();
      if (observed === null) return bootstrapFresh();
      if (isGuestCredentialExpiredV1(observed, nowEpochMs())) {
        await input.store.clear(observed.bearerToken);
        return bootstrapFresh();
      }

      try {
        return await persistBootstrap(observed, observed.bearerToken);
      } catch (replacementError) {
        if (!isUnauthorized(replacementError)) throw replacementError;
        await input.store.clear(observed.bearerToken);
        return bootstrapFresh();
      }
    }
  }

  async function acquireGuestCredential(): Promise<GuestCredentialV1> {
    if (replacementInFlight !== null) return replacementInFlight.promise;
    if (acquireInFlight !== null) return acquireInFlight;

    const pending = acquireGuestCredentialUncoordinated();
    acquireInFlight = pending;
    try {
      return await pending;
    } finally {
      if (acquireInFlight === pending) acquireInFlight = null;
    }
  }

  async function replaceUnauthorizedGuestCredential(
    failedBearer: string,
  ): Promise<GuestCredentialV1> {
    if (replacementInFlight !== null) {
      return replacementInFlight.promise;
    }

    const pending = (async () => {
      let observed = await input.store.read();

      if (
        observed !== null &&
        observed.bearerToken !== failedBearer &&
        !isGuestCredentialExpiredV1(observed, nowEpochMs())
      ) {
        return observed;
      }

      if (observed !== null && isGuestCredentialExpiredV1(observed, nowEpochMs())) {
        await input.store.clear(observed.bearerToken);
        observed = await input.store.read();
        if (
          observed !== null &&
          observed.bearerToken !== failedBearer &&
          !isGuestCredentialExpiredV1(observed, nowEpochMs())
        ) {
          return observed;
        }
      }

      await input.store.clear(failedBearer);

      const afterClear = await input.store.read();
      if (
        afterClear !== null &&
        afterClear.bearerToken !== failedBearer &&
        !isGuestCredentialExpiredV1(afterClear, nowEpochMs())
      ) {
        return afterClear;
      }

      return bootstrapFresh();
    })();

    replacementInFlight = Object.freeze({ failedBearer, promise: pending });
    try {
      return await pending;
    } finally {
      if (replacementInFlight?.promise === pending) replacementInFlight = null;
    }
  }

  async function withGuestBearer<T>(
    operation: (bearer: string) => Promise<T>,
  ): Promise<T> {
    const first = await acquireGuestCredential();

    try {
      return await operation(first.bearerToken);
    } catch (error) {
      if (!isUnauthorized(error)) throw error;
    }

    const replacement = await replaceUnauthorizedGuestCredential(first.bearerToken);

    try {
      return await operation(replacement.bearerToken);
    } catch (error) {
      if (isUnauthorized(error)) {
        await input.store.clear(replacement.bearerToken);
      }
      throw error;
    }
  }

  async function withActiveBearer<T>(
    operation: (bearer: string) => Promise<T>,
  ): Promise<T> {
    if (input.memberSession === undefined) {
      return withGuestBearer(operation);
    }

    const member = await input.memberSession.read();
    if (member === null) {
      return withGuestBearer(operation);
    }

    try {
      return await input.memberSession.withMemberBearer(operation);
    } catch (error) {
      if (
        error instanceof MobileMemberSessionErrorV1 &&
        error.code === 'MOBILE_MEMBER_REQUIRED' &&
        (await input.memberSession.read()) === null
      ) {
        return withGuestBearer(operation);
      }
      throw error;
    }
  }

  return Object.freeze({
    acquireGuestCredential,
    withGuestBearer,
    withActiveBearer,
  });
}
