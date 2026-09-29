import { describe, expect, it } from 'vitest';

import {
  MyeongHaApiClientErrorV1,
  MyeongHaApiClientV1,
  type GuestCredentialV1,
} from '../packages/api-client/src/index.js';
import {
  createMobileGuestCredentialStoreV1,
  type SecureKeyValueStoreV1,
} from '../apps/mobile/src/core/auth/guest-credential-store.js';
import {
  MobileSubjectSessionErrorV1,
  createMobileSubjectSessionCoordinatorV1,
} from '../apps/mobile/src/core/session/mobile-subject-session.js';

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

function json(data: unknown, status = 200): Response {
  return Response.json(
    status >= 200 && status < 300
      ? { ok: true, data, meta: { apiContractVersion: 'v0.9', requestId: 'req-1' } }
      : {
          ok: false,
          error: { code: 'AUTH_REQUIRED', messageKey: 'auth.required', retryable: false },
          meta: { apiContractVersion: 'v0.9', requestId: 'req-1' },
        },
    { status },
  );
}

const existing: GuestCredentialV1 = Object.freeze({
  kind: 'guest',
  subjectId: 'subject-1',
  guestSessionId: 'guest-1',
  bearerToken: 'opaque-existing-token',
  expiresAt: '2026-10-06T00:00:00.000Z',
});

describe('mobile subject session coordinator', () => {
  it('reuses a valid stored Guest through authoritative bootstrap', async () => {
    let authorization: string | null = null;
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async (_input, init) => {
        authorization = new Headers(init?.headers).get('Authorization');
        return json({
          subjectId: existing.subjectId,
          kind: 'guest',
          guestSession: {
            guestSessionId: existing.guestSessionId,
            expiresAt: existing.expiresAt,
            bearerToken: null,
          },
        });
      },
    });
    const store = createMobileGuestCredentialStoreV1(createMemorySecureStore());
    await store.write(existing);

    const coordinator = createMobileSubjectSessionCoordinatorV1({
      client,
      store,
      nowEpochMs: () => Date.parse('2026-09-29T00:00:00.000Z'),
    });

    await expect(coordinator.acquireGuestCredential()).resolves.toEqual(existing);
    expect(authorization).toBe('Bearer opaque-existing-token');
  });

  it('drops an expired Guest before fresh bootstrap', async () => {
    const authorizations: Array<string | null> = [];
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async (_input, init) => {
        authorizations.push(new Headers(init?.headers).get('Authorization'));
        return json({
          subjectId: 'subject-2',
          kind: 'guest',
          guestSession: {
            guestSessionId: 'guest-2',
            expiresAt: '2026-10-10T00:00:00.000Z',
            bearerToken: 'opaque-fresh-token',
          },
        });
      },
    });
    const store = createMobileGuestCredentialStoreV1(createMemorySecureStore());
    await store.write({ ...existing, expiresAt: '2026-09-28T00:00:00.000Z' });

    const coordinator = createMobileSubjectSessionCoordinatorV1({
      client,
      store,
      nowEpochMs: () => Date.parse('2026-09-29T00:00:00.000Z'),
    });

    const result = await coordinator.acquireGuestCredential();
    expect(result.bearerToken).toBe('opaque-fresh-token');
    expect(authorizations).toEqual([null]);
  });

  it('rebootstraps once after a protected operation returns 401', async () => {
    let bootstrapCount = 0;
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async (_input, init) => {
        bootstrapCount += 1;
        const auth = new Headers(init?.headers).get('Authorization');
        if (auth === 'Bearer opaque-existing-token') {
          return json({
            subjectId: existing.subjectId,
            kind: 'guest',
            guestSession: {
              guestSessionId: existing.guestSessionId,
              expiresAt: existing.expiresAt,
              bearerToken: null,
            },
          });
        }
        return json({
          subjectId: 'subject-2',
          kind: 'guest',
          guestSession: {
            guestSessionId: 'guest-2',
            expiresAt: '2026-10-10T00:00:00.000Z',
            bearerToken: 'opaque-replacement-token',
          },
        });
      },
    });
    const store = createMobileGuestCredentialStoreV1(createMemorySecureStore());
    await store.write(existing);
    const coordinator = createMobileSubjectSessionCoordinatorV1({
      client,
      store,
      nowEpochMs: () => Date.parse('2026-09-29T00:00:00.000Z'),
    });

    const observed: string[] = [];
    const result = await coordinator.withGuestBearer(async (bearer) => {
      observed.push(bearer);
      if (observed.length === 1) {
        throw new MyeongHaApiClientErrorV1(
          'http',
          'AUTH_REQUIRED',
          'unauthorized',
          401,
          false,
        );
      }
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(observed).toEqual([
      'opaque-existing-token',
      'opaque-replacement-token',
    ]);
    expect(bootstrapCount).toBe(2);
  });

  it('never retries a protected operation more than once', async () => {
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async (_input, init) => {
        const auth = new Headers(init?.headers).get('Authorization');
        if (auth === 'Bearer opaque-existing-token') {
          return json({
            subjectId: existing.subjectId,
            kind: 'guest',
            guestSession: {
              guestSessionId: existing.guestSessionId,
              expiresAt: existing.expiresAt,
              bearerToken: null,
            },
          });
        }
        return json({
          subjectId: 'subject-2',
          kind: 'guest',
          guestSession: {
            guestSessionId: 'guest-2',
            expiresAt: '2026-10-10T00:00:00.000Z',
            bearerToken: 'opaque-replacement-token',
          },
        });
      },
    });
    const store = createMobileGuestCredentialStoreV1(createMemorySecureStore());
    await store.write(existing);
    const coordinator = createMobileSubjectSessionCoordinatorV1({
      client,
      store,
      nowEpochMs: () => Date.parse('2026-09-29T00:00:00.000Z'),
    });

    let attempts = 0;
    await expect(
      coordinator.withGuestBearer(async () => {
        attempts += 1;
        throw new MyeongHaApiClientErrorV1(
          'http',
          'AUTH_REQUIRED',
          'unauthorized',
          401,
          false,
        );
      }),
    ).rejects.toMatchObject({ status: 401 });
    expect(attempts).toBe(2);
  });

  it('fails closed when bootstrap unexpectedly resolves a Member subject', async () => {
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () =>
        json({ subjectId: 'member-1', kind: 'member', guestSession: null }),
    });
    const store = createMobileGuestCredentialStoreV1(createMemorySecureStore());
    const coordinator = createMobileSubjectSessionCoordinatorV1({ client, store });

    await expect(coordinator.acquireGuestCredential()).rejects.toBeInstanceOf(
      MobileSubjectSessionErrorV1,
    );
    await expect(coordinator.acquireGuestCredential()).rejects.toMatchObject({
      code: 'MOBILE_MEMBER_AUTH_NOT_AVAILABLE',
    });
  });
});
