import { describe, expect, it } from 'vitest';

import {
  MOBILE_MEMBER_SESSION_KEY_V1,
  MobileMemberSessionStoreErrorV1,
  createMobileMemberSessionStoreV1,
} from '../apps/mobile/src/core/auth/member-session-store.js';
import type { SecureKeyValueStoreV1 } from '../apps/mobile/src/core/auth/guest-credential-store.js';
import type { MemberSessionV1 } from '../packages/api-client/src/index.js';

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

function session(suffix = '1'): MemberSessionV1 {
  return Object.freeze({
    accessToken: `access-${suffix}`,
    refreshToken: `refresh-${suffix}`,
    expiresAt: '2026-10-01T00:00:00.000Z',
    tokenType: 'bearer',
    user: Object.freeze({
      id: 'member-1',
      email: 'member@example.com',
    }),
  });
}

describe('mobile Member SecureStore adapter', () => {
  it('persists and reads back the exact normalized Member generation', async () => {
    const secure = createMemorySecureStore();
    const store = createMobileMemberSessionStoreV1(secure);

    await expect(store.write(session())).resolves.toEqual(session());
    await expect(store.read()).resolves.toEqual(session());
    expect(secure.values.has(MOBILE_MEMBER_SESSION_KEY_V1)).toBe(true);
  });

  it('replaces only the expected Member generation', async () => {
    const secure = createMemorySecureStore();
    const store = createMobileMemberSessionStoreV1(secure);
    await store.write(session('1'));

    await expect(store.replace(session('stale'), session('2'))).resolves.toEqual(session('1'));
    await expect(store.read()).resolves.toEqual(session('1'));

    await expect(store.replace(session('1'), session('2'))).resolves.toEqual(session('2'));
    await expect(store.read()).resolves.toEqual(session('2'));
  });

  it('does not clear a newer Member generation', async () => {
    const secure = createMemorySecureStore();
    const store = createMobileMemberSessionStoreV1(secure);
    await store.write(session('2'));

    await expect(store.clear(session('1'))).resolves.toBe(false);
    await expect(store.read()).resolves.toEqual(session('2'));
  });

  it('fails closed on malformed persisted Member state', async () => {
    const secure = createMemorySecureStore();
    secure.values.set(MOBILE_MEMBER_SESSION_KEY_V1, JSON.stringify({
      accessToken: 'access',
      refreshToken: '',
      expiresAt: 'bad',
      tokenType: 'bearer',
      user: {},
    }));
    const store = createMobileMemberSessionStoreV1(secure);

    await expect(store.read()).rejects.toBeInstanceOf(MobileMemberSessionStoreErrorV1);
    await expect(store.read()).rejects.toMatchObject({
      code: 'MOBILE_MEMBER_SESSION_INVALID',
    });
  });
});
