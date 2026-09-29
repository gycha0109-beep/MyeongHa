import {
  MyeongHaApiClientErrorV1,
  bootstrapSessionV1,
  isGuestCredentialExpiredV1,
  resolveGuestCredentialFromBootstrapV1,
  type GuestCredentialV1,
  type MyeongHaApiClientV1,
} from '@myeongha/api-client';

import type { MobileGuestCredentialStoreV1 } from '@/core/auth/guest-credential-store';

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
  readonly nowEpochMs?: () => number;
}): MobileSubjectSessionCoordinatorV1 {
  const nowEpochMs = input.nowEpochMs ?? Date.now;

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

  async function acquireGuestCredential(): Promise<GuestCredentialV1> {
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

  async function withGuestBearer<T>(
    operation: (bearer: string) => Promise<T>,
  ): Promise<T> {
    const first = await acquireGuestCredential();

    try {
      return await operation(first.bearerToken);
    } catch (error) {
      if (!isUnauthorized(error)) throw error;
    }

    const cleared = await input.store.clear(first.bearerToken);
    const replacement = cleared
      ? await bootstrapFresh()
      : await acquireGuestCredential();

    try {
      return await operation(replacement.bearerToken);
    } catch (error) {
      if (isUnauthorized(error)) {
        await input.store.clear(replacement.bearerToken);
      }
      throw error;
    }
  }

  return Object.freeze({ acquireGuestCredential, withGuestBearer });
}
