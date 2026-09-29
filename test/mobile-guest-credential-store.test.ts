import { describe, expect, it } from 'vitest';

import {
  MOBILE_GUEST_CREDENTIAL_KEY_V1,
  MobileGuestCredentialStoreErrorV1,
  createMobileGuestCredentialStoreV1,
  type SecureKeyValueStoreV1,
} from '../apps/mobile/src/core/auth/guest-credential-store.js';
import type { GuestCredentialV1 } from '../packages/api-client/src/index.js';

function createMemorySecureStore(): SecureKeyValueStoreV1 & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    async getItemAsync(key) {
      return values.get(key) ?? null;
    },
    async setItemAsync(key, value) {
      values.set(key, value);
    },
    async deleteItemAsync(key) {
      values.delete(key);
    },
  };
}

const credential: GuestCredentialV1 = Object.freeze({
  kind: 'guest',
  subjectId: 'subject-1',
  guestSessionId: 'guest-session-1',
  bearerToken: 'opaque-guest-token',
  expiresAt: '2026-10-06T00:00:00.000Z',
});

describe('mobile Guest SecureStore adapter', () => {
  it('persists and reads back the exact normalized Guest credential', async () => {
    const secure = createMemorySecureStore();
    const store = createMobileGuestCredentialStoreV1(secure);

    await expect(store.write(credential)).resolves.toEqual(credential);
    await expect(store.read()).resolves.toEqual(credential);
    expect(secure.values.has(MOBILE_GUEST_CREDENTIAL_KEY_V1)).toBe(true);
  });

  it('does not clear a newer credential when an expected bearer no longer matches', async () => {
    const secure = createMemorySecureStore();
    const store = createMobileGuestCredentialStoreV1(secure);
    await store.write(credential);

    await expect(store.clear('older-token')).resolves.toBe(false);
    await expect(store.read()).resolves.toEqual(credential);
  });

  it('clears only the expected credential and verifies removal', async () => {
    const secure = createMemorySecureStore();
    const store = createMobileGuestCredentialStoreV1(secure);
    await store.write(credential);

    await expect(store.clear(credential.bearerToken)).resolves.toBe(true);
    await expect(store.read()).resolves.toBeNull();
  });

  it('fails closed on malformed persisted credential state', async () => {
    const secure = createMemorySecureStore();
    secure.values.set(MOBILE_GUEST_CREDENTIAL_KEY_V1, '{"kind":"guest","bearerToken":"aaa.bbb.ccc"}');
    const store = createMobileGuestCredentialStoreV1(secure);

    await expect(store.read()).rejects.toBeInstanceOf(MobileGuestCredentialStoreErrorV1);
    await expect(store.read()).rejects.toMatchObject({
      code: 'MOBILE_GUEST_CREDENTIAL_INVALID',
    });
  });
});
