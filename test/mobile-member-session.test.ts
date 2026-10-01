import { describe, expect, it } from 'vitest';

import {
  MyeongHaApiClientV1,
  type MemberSessionV1,
} from '../packages/api-client/src/index.js';
import {
  createMobileMemberSessionStoreV1,
} from '../apps/mobile/src/core/auth/member-session-store.js';
import {
  MobileMemberSessionErrorV1,
  createMobileMemberSessionCoordinatorV1,
} from '../apps/mobile/src/core/session/mobile-member-session.js';
import type {
  SecureKeyValueStoreV1,
} from '../apps/mobile/src/core/auth/guest-credential-store.js';

function createMemorySecureStore(): SecureKeyValueStoreV1 {
  const values = new Map<string, string>();
  return {
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

const stored: MemberSessionV1 = Object.freeze({
  accessToken: 'header.payload.signature',
  refreshToken: 'refresh-token',
  expiresAt: '2026-10-02T00:00:00.000Z',
  tokenType: 'bearer',
  user: Object.freeze({
    id: '11111111-1111-4111-8111-111111111111',
    email: 'member@example.com',
  }),
});

function authSuccess(session: MemberSessionV1): Response {
  return Response.json({
    ok: true,
    data: { status: 'authenticated', session },
  });
}

describe('mobile Member session foundation', () => {
  it('persists sign-in and uses the stored Member bearer', async () => {
    const secureStore = createMemorySecureStore();
    const store = createMobileMemberSessionStoreV1(secureStore);
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () => authSuccess(stored),
    });
    const coordinator = createMobileMemberSessionCoordinatorV1({
      client,
      store,
      nowEpochMs: () => Date.parse('2026-10-01T00:00:00.000Z'),
    });

    await expect(
      coordinator.signIn('member@example.com', 'secret-password'),
    ).resolves.toEqual(stored);
    await expect(
      coordinator.withMemberBearer(async (bearer) => bearer),
    ).resolves.toBe(stored.accessToken);
    await expect(store.read()).resolves.toEqual(stored);
  });

  it('single-flights refresh of an expired session', async () => {
    const secureStore = createMemorySecureStore();
    const store = createMobileMemberSessionStoreV1(secureStore);
    const expired = Object.freeze({
      ...stored,
      expiresAt: '2026-09-30T00:00:00.000Z',
    });
    await store.write(expired);

    let refreshCalls = 0;
    let release!: () => void;
    let markRefreshStarted!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const refreshStarted = new Promise<void>((resolve) => {
      markRefreshStarted = resolve;
    });
    const replacement = Object.freeze({
      ...stored,
      accessToken: 'new.header.signature',
      refreshToken: 'rotated-refresh-token',
      expiresAt: '2026-10-03T00:00:00.000Z',
    });

    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () => {
        refreshCalls += 1;
        markRefreshStarted();
        await gate;
        return authSuccess(replacement);
      },
    });
    const coordinator = createMobileMemberSessionCoordinatorV1({
      client,
      store,
      nowEpochMs: () => Date.parse('2026-10-01T00:00:00.000Z'),
    });

    const first = coordinator.withMemberBearer(async (bearer) => bearer);
    const second = coordinator.withMemberBearer(async (bearer) => bearer);
    await refreshStarted;
    expect(refreshCalls).toBe(1);
    release();

    await expect(Promise.all([first, second])).resolves.toEqual([
      replacement.accessToken,
      replacement.accessToken,
    ]);
  });

  it('clears the Member session only on authoritative refresh expiry', async () => {
    const secureStore = createMemorySecureStore();
    const store = createMobileMemberSessionStoreV1(secureStore);
    const expired = Object.freeze({
      ...stored,
      expiresAt: '2026-09-30T00:00:00.000Z',
    });
    await store.write(expired);

    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () => Response.json({
        ok: false,
        error: {
          code: 'SESSION_EXPIRED',
          messageKey: 'auth.session_expired',
          retryable: false,
        },
      }, { status: 401 }),
    });
    const coordinator = createMobileMemberSessionCoordinatorV1({
      client,
      store,
      nowEpochMs: () => Date.parse('2026-10-01T00:00:00.000Z'),
    });

    await expect(
      coordinator.withMemberBearer(async () => 'unexpected'),
    ).rejects.toBeInstanceOf(MobileMemberSessionErrorV1);
    await expect(store.read()).resolves.toBeNull();
  });

  it('keeps the Member session on transient refresh failure', async () => {
    const secureStore = createMemorySecureStore();
    const store = createMobileMemberSessionStoreV1(secureStore);
    const expired = Object.freeze({
      ...stored,
      expiresAt: '2026-09-30T00:00:00.000Z',
    });
    await store.write(expired);

    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () => Response.json({
        ok: false,
        error: {
          code: 'AUTH_UPSTREAM_UNAVAILABLE',
          messageKey: 'auth.auth_upstream_unavailable',
          retryable: true,
        },
      }, { status: 503 }),
    });
    const coordinator = createMobileMemberSessionCoordinatorV1({
      client,
      store,
      nowEpochMs: () => Date.parse('2026-10-01T00:00:00.000Z'),
    });

    await expect(
      coordinator.withMemberBearer(async () => 'unexpected'),
    ).rejects.toMatchObject({ code: 'AUTH_UPSTREAM_UNAVAILABLE' });
    await expect(store.read()).resolves.toEqual(expired);
  });

  it('clears local Member state even when remote sign-out fails', async () => {
    const secureStore = createMemorySecureStore();
    const store = createMobileMemberSessionStoreV1(secureStore);
    await store.write(stored);
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () => {
        throw new Error('offline');
      },
    });
    const coordinator = createMobileMemberSessionCoordinatorV1({
      client,
      store,
    });

    await expect(coordinator.signOut()).resolves.toBeUndefined();
    await expect(store.read()).resolves.toBeNull();
  });
});
