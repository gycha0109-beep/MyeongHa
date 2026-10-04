import type { SecureKeyValueStoreV1 } from '@/core/auth/guest-credential-store';

export const MOBILE_NEW_MEMBER_ENROLLMENT_KEY_V1 =
  'myeongha.mobile.newMemberEnrollment.v1' as const;

export interface PendingNewMemberEnrollmentV1 {
  readonly email: string;
  readonly guestSubjectId: string;
  readonly guestSessionId: string;
}

export interface MobileNewMemberEnrollmentStoreV1 {
  read(): Promise<PendingNewMemberEnrollmentV1 | null>;
  write(value: PendingNewMemberEnrollmentV1): Promise<PendingNewMemberEnrollmentV1>;
  clear(): Promise<void>;
}

function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Pending enrollment email is invalid.');
  const normalized = value.trim().toLowerCase();
  if (normalized.length < 3 || normalized.length > 320 || !normalized.includes('@')) {
    throw new Error('Pending enrollment email is invalid.');
  }
  return normalized;
}

function requireId(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Pending enrollment ${name} is invalid.`);
  }
  return value;
}

function parse(value: unknown): PendingNewMemberEnrollmentV1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Pending enrollment payload is invalid.');
  }
  const record = value as Record<string, unknown>;
  return Object.freeze({
    email: normalizeEmail(record.email),
    guestSubjectId: requireId('guest subject id', record.guestSubjectId),
    guestSessionId: requireId('guest session id', record.guestSessionId),
  });
}

export function createMobileNewMemberEnrollmentStoreV1(
  secureStore: SecureKeyValueStoreV1,
): MobileNewMemberEnrollmentStoreV1 {
  return Object.freeze({
    async read() {
      const raw = await secureStore.getItemAsync(MOBILE_NEW_MEMBER_ENROLLMENT_KEY_V1);
      if (raw === null) return null;
      return parse(JSON.parse(raw) as unknown);
    },
    async write(value: PendingNewMemberEnrollmentV1) {
      const parsed = parse(value);
      await secureStore.setItemAsync(
        MOBILE_NEW_MEMBER_ENROLLMENT_KEY_V1,
        JSON.stringify(parsed),
      );
      return parsed;
    },
    async clear() {
      await secureStore.deleteItemAsync(MOBILE_NEW_MEMBER_ENROLLMENT_KEY_V1);
    },
  });
}
