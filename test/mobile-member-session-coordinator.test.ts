import { describe, expect, it } from 'vitest';

import { createMobileMemberSessionStoreV1 } from '../apps/mobile/src/core/auth/member-session-store.js';
import type { SecureKeyValueStoreV1 } from '../apps/mobile/src/core/auth/guest-credential-store.js';
import {
  createMobileMemberSessionCoordinatorV1,
  MobileMemberSessionErrorV1,
} from '../apps/mobile/src/core/session/mobile-member-session.js';
import {
  MyeongHaApiClientErrorV1,
  MyeongHaApiClientV1,
  type MemberSessionV1,
} from '../packages/api-client/src/index.js';

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

function session(input: {
  access?: string;
  refresh?: string;
  expiresAt?: string;
} = {}): MemberSessionV1 {
  return Object.freeze({
    accessToken: input.access ?? 'access-1',
    refreshToken: input.refresh ?? 'refresh-1',
    expiresAt: input.expiresAt ?? '2026-10-01T00:00:00.000Z',
    tokenType: 'bearer',
    user: Object.freeze({ id: 'member-1', email: 'member@example.com' }),
  });
}

function success(data: unknown): Response {
  return Response.json({ ok: true, data }, { status: 200 });
}

function failure(status: number, code: string): Response {
  return Response.json(
    { ok: false, error: { code, retryable: false } },
    { status },
  );
}

describe('mobile existing-Member session coordinator', () => {
  it('signs in and persists the returned Member session', async () => {
    const store = createMobileMemberSessionStoreV1(createMemorySecureStore());
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () => success({
        status: 'authenticated',
        session: session(),
        passwordCompromiseCheck: 'safe',
      }),
    });
    const coordinator = createMobileMemberSessionCoordinatorV1({ client, store });

    await expect(
      coordinator.signIn({ email: 'member@example.com', password: 'secret' }),
    ).resolves.toEqual(session());
    await expect(coordinator.readSession()).resolves.toEqual(session());
  });

  it('single-flights refresh for a near-expiry Member session', async () => {
    const store = createMobileMemberSessionStoreV1(createMemorySecureStore());
    await store.write(session({ expiresAt: '2026-09-30T01:00:30.000Z' }));

    let refreshCalls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async (input) => {
        const path = new URL(String(input)).pathname;
        if (path !== '/api/auth/refresh') throw new Error('unexpected path');
        refreshCalls += 1;
        await gate;
        return success({
          status: 'authenticated',
          session: session({
            access: 'access-2',
            refresh: 'refresh-2',
            expiresAt: '2026-09-30T02:00:00.000Z',
          }),
        });
      },
    });
    const coordinator = createMobileMemberSessionCoordinatorV1({
      client,
      store,
      nowEpochMs: () => Date.parse('2026-09-30T01:00:00.000Z'),
    });

    const first = coordinator.getAccessToken();
    const second = coordinator.getAccessToken();
    release();

    await expect(Promise.all([first, second])).resolves.toEqual(['access-2', 'access-2']);
    expect(refreshCalls).toBe(1);
  });

  it('uses a still-valid access token when a transient proactive refresh fails', async () => {
    const current = session({ expiresAt: '2026-09-30T01:00:30.000Z' });
    const store = createMobileMemberSessionStoreV1(createMemorySecureStore());
    await store.write(current);

    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () => {
        throw new TypeError('offline');
      },
    });
    const coordinator = createMobileMemberSessionCoordinatorV1({
      client,
      store,
      nowEpochMs: () => Date.parse('2026-09-30T01:00:00.000Z'),
    });

    await expect(coordinator.getAccessToken()).resolves.toBe(current.accessToken);
    await expect(coordinator.readSession()).resolves.toEqual(current);
  });

  it('clears an expired Member generation after authoritative refresh rejection', async () => {
    const current = session({ expiresAt: '2026-09-30T00:59:00.000Z' });
    const store = createMobileMemberSessionStoreV1(createMemorySecureStore());
    await store.write(current);

    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () => failure(401, 'SESSION_EXPIRED'),
    });
    const coordinator = createMobileMemberSessionCoordinatorV1({
      client,
      store,
      nowEpochMs: () => Date.parse('2026-09-30T01:00:00.000Z'),
    });

    await expect(coordinator.getAccessToken()).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
    });
    await expect(coordinator.readSession()).resolves.toBeNull();
  });

  it('refreshes once and retries an owner-scoped operation after a 401', async () => {
    const store = createMobileMemberSessionStoreV1(createMemorySecureStore());
    await store.write(session({ expiresAt: '2026-09-30T02:00:00.000Z' }));

    let refreshCalls = 0;
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async (input) => {
        const path = new URL(String(input)).pathname;
        if (path === '/api/auth/refresh') {
          refreshCalls += 1;
          return success({
            status: 'authenticated',
            session: session({
              access: 'access-2',
              refresh: 'refresh-2',
              expiresAt: '2026-09-30T03:00:00.000Z',
            }),
          });
        }
        throw new Error('unexpected network call');
      },
    });
    const coordinator = createMobileMemberSessionCoordinatorV1({
      client,
      store,
      nowEpochMs: () => Date.parse('2026-09-30T01:00:00.000Z'),
    });

    const seen: string[] = [];
    const result = await coordinator.withMemberBearer(async (bearer) => {
      seen.push(bearer);
      if (bearer === 'access-1') {
        throw new MyeongHaApiClientErrorV1(
          'http',
          'AUTH_REQUIRED',
          'rejected',
          401,
        );
      }
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(seen).toEqual(['access-1', 'access-2']);
    expect(refreshCalls).toBe(1);
  });

  it('signs out locally even when remote sign-out is unavailable', async () => {
    const store = createMobileMemberSessionStoreV1(createMemorySecureStore());
    await store.write(session());

    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () => {
        throw new TypeError('offline');
      },
    });
    const coordinator = createMobileMemberSessionCoordinatorV1({ client, store });

    await expect(coordinator.signOut()).resolves.toBeUndefined();
    await expect(coordinator.readSession()).resolves.toBeNull();
  });

  it('requires an existing Member session for Member-only bearer work', async () => {
    const store = createMobileMemberSessionStoreV1(createMemorySecureStore());
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () => {
        throw new Error('network must not run');
      },
    });
    const coordinator = createMobileMemberSessionCoordinatorV1({ client, store });

    await expect(
      coordinator.withMemberBearer(async () => 'unexpected'),
    ).rejects.toBeInstanceOf(MobileMemberSessionErrorV1);
    await expect(
      coordinator.withMemberBearer(async () => 'unexpected'),
    ).rejects.toMatchObject({ code: 'MOBILE_MEMBER_SESSION_REQUIRED' });
  });
});
