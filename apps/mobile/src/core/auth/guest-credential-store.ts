import {
  parseStoredGuestCredentialV1,
  serializeGuestCredentialV1,
  type GuestCredentialV1,
} from '@myeongha/api-client';

import { emitMobileSubjectCredentialChangedV1 } from '@/core/session/mobile-subject-credential-changes';

export const MOBILE_GUEST_CREDENTIAL_KEY_V1 =
  'myeongha.mobile.guestCredential.v1' as const;

export interface SecureKeyValueStoreV1 {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export type MobileGuestCredentialStoreErrorCodeV1 =
  | 'MOBILE_GUEST_CREDENTIAL_READ_FAILED'
  | 'MOBILE_GUEST_CREDENTIAL_INVALID'
  | 'MOBILE_GUEST_CREDENTIAL_WRITE_FAILED'
  | 'MOBILE_GUEST_CREDENTIAL_PERSIST_FAILED'
  | 'MOBILE_GUEST_CREDENTIAL_CLEAR_FAILED';

export class MobileGuestCredentialStoreErrorV1 extends Error {
  constructor(
    readonly code: MobileGuestCredentialStoreErrorCodeV1,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'MobileGuestCredentialStoreErrorV1';
  }
}

export interface MobileGuestCredentialStoreV1 {
  read(): Promise<GuestCredentialV1 | null>;
  write(credential: GuestCredentialV1): Promise<GuestCredentialV1>;
  clear(expectedBearerToken?: string): Promise<boolean>;
}

export function createMobileGuestCredentialStoreV1(
  secureStore: SecureKeyValueStoreV1,
): MobileGuestCredentialStoreV1 {
  async function readRaw(): Promise<string | null> {
    try {
      return await secureStore.getItemAsync(MOBILE_GUEST_CREDENTIAL_KEY_V1);
    } catch (error) {
      throw new MobileGuestCredentialStoreErrorV1(
        'MOBILE_GUEST_CREDENTIAL_READ_FAILED',
        '모바일 게스트 세션을 안전하게 읽지 못했습니다.',
        { cause: error },
      );
    }
  }

  async function read(): Promise<GuestCredentialV1 | null> {
    const raw = await readRaw();
    if (raw === null) return null;

    try {
      return parseStoredGuestCredentialV1(raw);
    } catch (error) {
      throw new MobileGuestCredentialStoreErrorV1(
        'MOBILE_GUEST_CREDENTIAL_INVALID',
        '저장된 모바일 게스트 세션이 올바르지 않습니다.',
        { cause: error },
      );
    }
  }

  async function write(credential: GuestCredentialV1): Promise<GuestCredentialV1> {
    const serialized = serializeGuestCredentialV1(credential);
    const previousRaw = await readRaw().catch(() => null);
    try {
      await secureStore.setItemAsync(MOBILE_GUEST_CREDENTIAL_KEY_V1, serialized);
    } catch (error) {
      throw new MobileGuestCredentialStoreErrorV1(
        'MOBILE_GUEST_CREDENTIAL_WRITE_FAILED',
        '모바일 게스트 세션을 안전하게 저장하지 못했습니다.',
        { cause: error },
      );
    }

    const observed = await readRaw();
    if (observed !== serialized) {
      throw new MobileGuestCredentialStoreErrorV1(
        'MOBILE_GUEST_CREDENTIAL_PERSIST_FAILED',
        '모바일 게스트 세션 저장 결과를 확인하지 못했습니다.',
      );
    }

    const persisted = parseStoredGuestCredentialV1(observed);
    let sameSubject = false;
    if (previousRaw !== null) {
      try {
        const previous = parseStoredGuestCredentialV1(previousRaw);
        sameSubject =
          previous.subjectId === persisted.subjectId &&
          previous.guestSessionId === persisted.guestSessionId;
      } catch {
        // Old malformed credentials do not justify reusing old archive data.
      }
    }
    if (!sameSubject) emitMobileSubjectCredentialChangedV1();
    return persisted;
  }

  async function clear(expectedBearerToken?: string): Promise<boolean> {
    const current = await read();
    if (current === null) return true;
    if (
      expectedBearerToken !== undefined &&
      current.bearerToken !== expectedBearerToken
    ) {
      return false;
    }

    try {
      await secureStore.deleteItemAsync(MOBILE_GUEST_CREDENTIAL_KEY_V1);
    } catch (error) {
      throw new MobileGuestCredentialStoreErrorV1(
        'MOBILE_GUEST_CREDENTIAL_CLEAR_FAILED',
        '모바일 게스트 세션을 안전하게 제거하지 못했습니다.',
        { cause: error },
      );
    }

    const cleared = (await readRaw()) === null;
    if (cleared) emitMobileSubjectCredentialChangedV1();
    return cleared;
  }

  return Object.freeze({ read, write, clear });
}
