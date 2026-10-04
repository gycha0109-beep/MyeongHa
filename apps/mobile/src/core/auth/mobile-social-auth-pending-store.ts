import type { SocialAuthProviderV1 } from '@myeongha/api-client';

import type { SecureKeyValueStoreV1 } from '@/core/auth/guest-credential-store';

export const MOBILE_SOCIAL_AUTH_PENDING_KEY_V1 =
  'myeongha.mobile.socialAuthPending.v1' as const;

export interface MobileSocialAuthPendingV1 {
  readonly provider: SocialAuthProviderV1;
  readonly state: string;
  readonly guestSubjectId: string;
  readonly guestSessionId: string;
  readonly expiresAt: string;
}

export type MobileSocialAuthPendingStoreErrorCodeV1 =
  | 'MOBILE_SOCIAL_AUTH_PENDING_READ_FAILED'
  | 'MOBILE_SOCIAL_AUTH_PENDING_INVALID'
  | 'MOBILE_SOCIAL_AUTH_PENDING_WRITE_FAILED'
  | 'MOBILE_SOCIAL_AUTH_PENDING_PERSIST_FAILED'
  | 'MOBILE_SOCIAL_AUTH_PENDING_CLEAR_FAILED';

export class MobileSocialAuthPendingStoreErrorV1 extends Error {
  constructor(
    readonly code: MobileSocialAuthPendingStoreErrorCodeV1,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'MobileSocialAuthPendingStoreErrorV1';
  }
}

function parsePending(value: unknown): MobileSocialAuthPendingV1 {
  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed) as unknown;
    } catch (error) {
      throw new MobileSocialAuthPendingStoreErrorV1(
        'MOBILE_SOCIAL_AUTH_PENDING_INVALID',
        '저장된 소셜 로그인 이어가기 상태가 올바르지 않습니다.',
        { cause: error },
      );
    }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new MobileSocialAuthPendingStoreErrorV1(
      'MOBILE_SOCIAL_AUTH_PENDING_INVALID',
      '저장된 소셜 로그인 이어가기 상태가 올바르지 않습니다.',
    );
  }

  const record = parsed as Record<string, unknown>;
  const provider = record.provider;
  if (provider !== 'google' && provider !== 'kakao' && provider !== 'naver') {
    throw new MobileSocialAuthPendingStoreErrorV1(
      'MOBILE_SOCIAL_AUTH_PENDING_INVALID',
      '저장된 소셜 로그인 공급자가 올바르지 않습니다.',
    );
  }
  if (
    typeof record.state !== 'string' ||
    !/^[A-Za-z0-9_-]{16,128}$/u.test(record.state) ||
    typeof record.guestSubjectId !== 'string' ||
    record.guestSubjectId.length === 0 ||
    typeof record.guestSessionId !== 'string' ||
    record.guestSessionId.length === 0 ||
    typeof record.expiresAt !== 'string' ||
    !Number.isFinite(Date.parse(record.expiresAt))
  ) {
    throw new MobileSocialAuthPendingStoreErrorV1(
      'MOBILE_SOCIAL_AUTH_PENDING_INVALID',
      '저장된 소셜 로그인 이어가기 상태가 올바르지 않습니다.',
    );
  }

  return Object.freeze({
    provider,
    state: record.state,
    guestSubjectId: record.guestSubjectId,
    guestSessionId: record.guestSessionId,
    expiresAt: record.expiresAt,
  });
}

export interface MobileSocialAuthPendingStoreV1 {
  read(): Promise<MobileSocialAuthPendingV1 | null>;
  write(input: MobileSocialAuthPendingV1): Promise<MobileSocialAuthPendingV1>;
  clear(expectedState?: string): Promise<boolean>;
}

export function createMobileSocialAuthPendingStoreV1(
  secureStore: SecureKeyValueStoreV1,
): MobileSocialAuthPendingStoreV1 {
  async function readRaw(): Promise<string | null> {
    try {
      return await secureStore.getItemAsync(MOBILE_SOCIAL_AUTH_PENDING_KEY_V1);
    } catch (error) {
      throw new MobileSocialAuthPendingStoreErrorV1(
        'MOBILE_SOCIAL_AUTH_PENDING_READ_FAILED',
        '소셜 로그인 이어가기 상태를 읽지 못했습니다.',
        { cause: error },
      );
    }
  }

  async function read(): Promise<MobileSocialAuthPendingV1 | null> {
    const raw = await readRaw();
    return raw === null ? null : parsePending(raw);
  }

  async function write(
    input: MobileSocialAuthPendingV1,
  ): Promise<MobileSocialAuthPendingV1> {
    const normalized = parsePending(input);
    const serialized = JSON.stringify(normalized);
    try {
      await secureStore.setItemAsync(MOBILE_SOCIAL_AUTH_PENDING_KEY_V1, serialized);
    } catch (error) {
      throw new MobileSocialAuthPendingStoreErrorV1(
        'MOBILE_SOCIAL_AUTH_PENDING_WRITE_FAILED',
        '소셜 로그인 이어가기 상태를 저장하지 못했습니다.',
        { cause: error },
      );
    }
    if ((await readRaw()) !== serialized) {
      throw new MobileSocialAuthPendingStoreErrorV1(
        'MOBILE_SOCIAL_AUTH_PENDING_PERSIST_FAILED',
        '소셜 로그인 이어가기 상태 저장 결과를 확인하지 못했습니다.',
      );
    }
    return normalized;
  }

  async function clear(expectedState?: string): Promise<boolean> {
    const current = await read();
    if (current === null) return true;
    if (expectedState !== undefined && current.state !== expectedState) return false;

    try {
      await secureStore.deleteItemAsync(MOBILE_SOCIAL_AUTH_PENDING_KEY_V1);
    } catch (error) {
      throw new MobileSocialAuthPendingStoreErrorV1(
        'MOBILE_SOCIAL_AUTH_PENDING_CLEAR_FAILED',
        '소셜 로그인 이어가기 상태를 제거하지 못했습니다.',
        { cause: error },
      );
    }
    return (await readRaw()) === null;
  }

  return Object.freeze({ read, write, clear });
}
