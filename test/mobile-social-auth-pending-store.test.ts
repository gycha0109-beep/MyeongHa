import { describe, expect, it } from 'vitest';

import {
  createMobileSocialAuthPendingStoreV1,
} from '../apps/mobile/src/core/auth/mobile-social-auth-pending-store.js';

function memoryStore() {
  const values = new Map<string, string>();
  return {
    getItemAsync: async (key: string) => values.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => {
      values.set(key, value);
    },
    deleteItemAsync: async (key: string) => {
      values.delete(key);
    },
  };
}

describe('mobile social auth pending store', () => {
  it('round-trips the provider, anti-login-CSRF state, and guest ownership proof', async () => {
    const store = createMobileSocialAuthPendingStoreV1(memoryStore());
    const pending = {
      provider: 'google' as const,
      state: '1234567890abcdef1234567890abcdef',
      guestSubjectId: 'subject-1',
      guestSessionId: 'session-1',
      expiresAt: '2026-10-04T00:10:00.000Z',
    };

    await expect(store.write(pending)).resolves.toEqual(pending);
    await expect(store.read()).resolves.toEqual(pending);
    await expect(store.clear(pending.state)).resolves.toBe(true);
    await expect(store.read()).resolves.toBeNull();
  });

  it('does not clear a different pending state', async () => {
    const store = createMobileSocialAuthPendingStoreV1(memoryStore());
    await store.write({
      provider: 'kakao',
      state: '1234567890abcdef1234567890abcdef',
      guestSubjectId: 'subject-1',
      guestSessionId: 'session-1',
      expiresAt: '2026-10-04T00:10:00.000Z',
    });
    await expect(store.clear('aaaaaaaaaaaaaaaa')).resolves.toBe(false);
    await expect(store.read()).resolves.not.toBeNull();
  });
});
