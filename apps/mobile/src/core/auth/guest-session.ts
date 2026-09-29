import {
  MyeongHaApiClientErrorV1,
  bootstrapSessionV1,
  isGuestCredentialExpiredV1,
  readCurrentSubjectProfileV1,
  resolveGuestCredentialFromBootstrapV1,
  type CurrentSubjectProfileV1,
  type GuestCredentialV1,
  type MyeongHaApiClientV1,
} from '@myeongha/api-client';

import type { MobileGuestCredentialStoreV1 } from './guest-credential-store.js';

export interface MobileGuestSessionV1 {
  readonly credential: GuestCredentialV1;
  readonly profile: CurrentSubjectProfileV1;
}

export class MobileGuestSessionErrorV1 extends Error {
  constructor(
    readonly code:
      | 'MOBILE_GUEST_SESSION_CLEAR_FAILED'
      | 'MOBILE_GUEST_SESSION_UNEXPECTED_MEMBER'
      | 'MOBILE_GUEST_SESSION_IDENTITY_MISMATCH',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'MobileGuestSessionErrorV1';
  }
}

async function clearExpiredCredential(
  store: MobileGuestCredentialStoreV1,
  credential: GuestCredentialV1,
): Promise<void> {
  const cleared = await store.clear(credential.bearerToken);
  if (!cleared) {
    throw new MobileGuestSessionErrorV1(
      'MOBILE_GUEST_SESSION_CLEAR_FAILED',
      '만료된 모바일 게스트 세션을 안전하게 정리하지 못했습니다.',
    );
  }
}

async function bootstrapGuest(
  client: MyeongHaApiClientV1,
  store: MobileGuestCredentialStoreV1,
  existing: GuestCredentialV1 | null,
): Promise<GuestCredentialV1> {
  let bootstrap;
  try {
    bootstrap = await bootstrapSessionV1(
      client,
      existing?.bearerToken,
    );
  } catch (error) {
    if (
      existing !== null &&
      error instanceof MyeongHaApiClientErrorV1 &&
      error.code === 'AUTH_REQUIRED'
    ) {
      const cleared = await store.clear(existing.bearerToken);
      if (!cleared) {
        throw new MobileGuestSessionErrorV1(
          'MOBILE_GUEST_SESSION_CLEAR_FAILED',
          '거부된 모바일 게스트 세션을 안전하게 정리하지 못했습니다.',
          { cause: error },
        );
      }
      bootstrap = await bootstrapSessionV1(client);
      existing = null;
    } else {
      throw error;
    }
  }

  if (bootstrap.kind !== 'guest') {
    throw new MobileGuestSessionErrorV1(
      'MOBILE_GUEST_SESSION_UNEXPECTED_MEMBER',
      '게스트 전용 모바일 세션 경계에서 회원 세션이 반환되었습니다.',
    );
  }

  const credential = resolveGuestCredentialFromBootstrapV1(bootstrap, existing);
  if (credential === null) {
    throw new MobileGuestSessionErrorV1(
      'MOBILE_GUEST_SESSION_UNEXPECTED_MEMBER',
      '게스트 세션 자격 증명을 확정하지 못했습니다.',
    );
  }

  if (credential !== existing) {
    return store.write(credential);
  }
  return credential;
}

export async function ensureMobileGuestSessionV1(input: {
  readonly client: MyeongHaApiClientV1;
  readonly store: MobileGuestCredentialStoreV1;
  readonly nowEpochMs?: number;
}): Promise<MobileGuestSessionV1> {
  let existing = await input.store.read();

  if (
    existing !== null &&
    isGuestCredentialExpiredV1(existing, input.nowEpochMs ?? Date.now())
  ) {
    await clearExpiredCredential(input.store, existing);
    existing = null;
  }

  const credential = await bootstrapGuest(input.client, input.store, existing);
  const profile = await readCurrentSubjectProfileV1(
    input.client,
    credential.bearerToken,
  );

  if (
    profile.subjectKind !== 'guest' ||
    profile.subjectId !== credential.subjectId
  ) {
    throw new MobileGuestSessionErrorV1(
      'MOBILE_GUEST_SESSION_IDENTITY_MISMATCH',
      '모바일 게스트 세션과 서버의 현재 주체가 일치하지 않습니다.',
    );
  }

  return Object.freeze({ credential, profile });
}
