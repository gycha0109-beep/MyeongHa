import {
  parseStoredMemberSessionV1,
  sameMemberSessionGenerationV1,
  serializeMemberSessionV1,
  type MemberSessionV1,
} from '@myeongha/api-client';

import type { SecureKeyValueStoreV1 } from '@/core/auth/guest-credential-store';

export const MOBILE_MEMBER_SESSION_KEY_V1 =
  'myeongha.mobile.memberSession.v1' as const;

export type MobileMemberSessionStoreErrorCodeV1 =
  | 'MOBILE_MEMBER_SESSION_READ_FAILED'
  | 'MOBILE_MEMBER_SESSION_INVALID'
  | 'MOBILE_MEMBER_SESSION_WRITE_FAILED'
  | 'MOBILE_MEMBER_SESSION_PERSIST_FAILED'
  | 'MOBILE_MEMBER_SESSION_CLEAR_FAILED';

export class MobileMemberSessionStoreErrorV1 extends Error {
  constructor(
    readonly code: MobileMemberSessionStoreErrorCodeV1,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'MobileMemberSessionStoreErrorV1';
  }
}

export interface MobileMemberSessionStoreV1 {
  read(): Promise<MemberSessionV1 | null>;
  write(session: MemberSessionV1): Promise<MemberSessionV1>;
  replace(
    expected: MemberSessionV1,
    next: MemberSessionV1,
  ): Promise<MemberSessionV1 | null>;
  clear(expected?: MemberSessionV1): Promise<boolean>;
}

export function createMobileMemberSessionStoreV1(
  secureStore: SecureKeyValueStoreV1,
): MobileMemberSessionStoreV1 {
  async function readRaw(): Promise<string | null> {
    try {
      return await secureStore.getItemAsync(MOBILE_MEMBER_SESSION_KEY_V1);
    } catch (error) {
      throw new MobileMemberSessionStoreErrorV1(
        'MOBILE_MEMBER_SESSION_READ_FAILED',
        '모바일 회원 세션을 안전하게 읽지 못했습니다.',
        { cause: error },
      );
    }
  }

  async function read(): Promise<MemberSessionV1 | null> {
    const raw = await readRaw();
    if (raw === null) return null;
    try {
      return parseStoredMemberSessionV1(raw);
    } catch (error) {
      throw new MobileMemberSessionStoreErrorV1(
        'MOBILE_MEMBER_SESSION_INVALID',
        '저장된 모바일 회원 세션이 올바르지 않습니다.',
        { cause: error },
      );
    }
  }

  async function write(session: MemberSessionV1): Promise<MemberSessionV1> {
    const serialized = serializeMemberSessionV1(session);
    try {
      await secureStore.setItemAsync(MOBILE_MEMBER_SESSION_KEY_V1, serialized);
    } catch (error) {
      throw new MobileMemberSessionStoreErrorV1(
        'MOBILE_MEMBER_SESSION_WRITE_FAILED',
        '모바일 회원 세션을 안전하게 저장하지 못했습니다.',
        { cause: error },
      );
    }

    const observed = await readRaw();
    if (observed !== serialized) {
      throw new MobileMemberSessionStoreErrorV1(
        'MOBILE_MEMBER_SESSION_PERSIST_FAILED',
        '모바일 회원 세션 저장 결과를 확인하지 못했습니다.',
      );
    }
    return parseStoredMemberSessionV1(observed);
  }

  async function replace(
    expected: MemberSessionV1,
    next: MemberSessionV1,
  ): Promise<MemberSessionV1 | null> {
    const current = await read();
    if (current === null || !sameMemberSessionGenerationV1(current, expected)) {
      return current;
    }
    return write(next);
  }

  async function clear(expected?: MemberSessionV1): Promise<boolean> {
    const current = await read();
    if (current === null) return true;
    if (
      expected !== undefined &&
      !sameMemberSessionGenerationV1(current, expected)
    ) {
      return false;
    }

    try {
      await secureStore.deleteItemAsync(MOBILE_MEMBER_SESSION_KEY_V1);
    } catch (error) {
      throw new MobileMemberSessionStoreErrorV1(
        'MOBILE_MEMBER_SESSION_CLEAR_FAILED',
        '모바일 회원 세션을 안전하게 제거하지 못했습니다.',
        { cause: error },
      );
    }
    return (await readRaw()) === null;
  }

  return Object.freeze({ read, write, replace, clear });
}
