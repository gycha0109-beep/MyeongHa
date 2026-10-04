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
import { MobileMemberSessionErrorV1 } from '../apps/mobile/src/core/session/mobile-member-session.js';

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


  it('single-flights concurrent acquisition when SecureStore is empty', async () => {
    let bootstrapCount = 0;
    let releaseBootstrap!: () => void;
    let markStarted!: () => void;
    const bootstrapGate = new Promise<void>((resolve) => { releaseBootstrap = resolve; });
    const bootstrapStarted = new Promise<void>((resolve) => { markStarted = resolve; });

    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () => {
        bootstrapCount += 1;
        markStarted();
        await bootstrapGate;
        return json({
          subjectId: 'subject-fresh',
          kind: 'guest',
          guestSession: {
            guestSessionId: 'guest-fresh',
            expiresAt: '2026-10-10T00:00:00.000Z',
            bearerToken: 'opaque-fresh-token',
          },
        });
      },
    });
    const store = createMobileGuestCredentialStoreV1(createMemorySecureStore());
    const coordinator = createMobileSubjectSessionCoordinatorV1({
      client,
      store,
      nowEpochMs: () => Date.parse('2026-09-29T00:00:00.000Z'),
    });

    const pending = [
      coordinator.acquireGuestCredential(),
      coordinator.acquireGuestCredential(),
      coordinator.acquireGuestCredential(),
    ];
    await bootstrapStarted;
    expect(bootstrapCount).toBe(1);

    releaseBootstrap();
    const credentials = await Promise.all(pending);
    expect(bootstrapCount).toBe(1);
    expect(credentials.map((item) => item.bearerToken)).toEqual([
      'opaque-fresh-token',
      'opaque-fresh-token',
      'opaque-fresh-token',
    ]);
  });

  it('single-flights concurrent 401 recovery to one replacement bootstrap', async () => {
    let bootstrapCount = 0;
    let freshBootstrapCount = 0;
    let releaseFresh!: () => void;
    let markFreshStarted!: () => void;
    const freshGate = new Promise<void>((resolve) => { releaseFresh = resolve; });
    const freshStarted = new Promise<void>((resolve) => { markFreshStarted = resolve; });

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

        freshBootstrapCount += 1;
        markFreshStarted();
        await freshGate;
        return json({
          subjectId: 'subject-replacement',
          kind: 'guest',
          guestSession: {
            guestSessionId: 'guest-replacement',
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

    const attempts: string[] = [];
    const run = () => coordinator.withGuestBearer(async (bearer) => {
      attempts.push(bearer);
      if (bearer === existing.bearerToken) {
        throw new MyeongHaApiClientErrorV1(
          'http',
          'AUTH_REQUIRED',
          'unauthorized',
          401,
          false,
        );
      }
      return bearer;
    });

    const first = run();
    const second = run();
    await freshStarted;
    expect(freshBootstrapCount).toBe(1);
    releaseFresh();

    await expect(Promise.all([first, second])).resolves.toEqual([
      'opaque-replacement-token',
      'opaque-replacement-token',
    ]);
    expect(bootstrapCount).toBe(2);
    expect(freshBootstrapCount).toBe(1);
    expect(attempts.filter((bearer) => bearer === existing.bearerToken)).toHaveLength(2);
    expect(attempts.filter((bearer) => bearer === 'opaque-replacement-token')).toHaveLength(2);
  });

  it('reuses an already-written replacement for a late 401 without another bootstrap', async () => {
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
          subjectId: 'subject-replacement',
          kind: 'guest',
          guestSession: {
            guestSessionId: 'guest-replacement',
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

    let releaseLate!: () => void;
    const lateGate = new Promise<void>((resolve) => { releaseLate = resolve; });
    let firstAttempts = 0;
    let lateAttempts = 0;

    const first = coordinator.withGuestBearer(async (bearer) => {
      firstAttempts += 1;
      if (firstAttempts === 1) {
        throw new MyeongHaApiClientErrorV1(
          'http',
          'AUTH_REQUIRED',
          'unauthorized',
          401,
          false,
        );
      }
      return bearer;
    });
    const late = coordinator.withGuestBearer(async (bearer) => {
      lateAttempts += 1;
      if (lateAttempts === 1) {
        await lateGate;
        throw new MyeongHaApiClientErrorV1(
          'http',
          'AUTH_REQUIRED',
          'unauthorized',
          401,
          false,
        );
      }
      return bearer;
    });

    await expect(first).resolves.toBe('opaque-replacement-token');
    releaseLate();
    await expect(late).resolves.toBe('opaque-replacement-token');

    expect(firstAttempts).toBe(2);
    expect(lateAttempts).toBe(2);
    expect(bootstrapCount).toBe(2);
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


describe('mobile active subject bearer selection', () => {
  it('prefers a stored Member bearer over the Guest path', async () => {
    let guestBootstraps = 0;
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () => {
        guestBootstraps += 1;
        return json({
          subjectId: 'unexpected-guest',
          kind: 'guest',
          guestSession: {
            guestSessionId: 'unexpected-session',
            expiresAt: '2026-10-10T00:00:00.000Z',
            bearerToken: 'unexpected-token',
          },
        });
      },
    });
    const store = createMobileGuestCredentialStoreV1(createMemorySecureStore());
    const coordinator = createMobileSubjectSessionCoordinatorV1({
      client,
      store,
      memberSession: {
        async read() {
          return {
            accessToken: 'member-token',
            refreshToken: 'member-refresh',
            expiresAt: '2026-10-10T00:00:00.000Z',
            tokenType: 'bearer',
            user: { id: null, email: null },
          };
        },
        async withMemberBearer(operation) {
          return operation('member-token');
        },
      },
    });

    await expect(
      coordinator.withActiveBearer(async (bearer) => bearer),
    ).resolves.toBe('member-token');
    expect(guestBootstraps).toBe(0);
  });

  it('does not downgrade a recoverable Member to Guest on a transient failure', async () => {
    let guestBootstraps = 0;
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () => {
        guestBootstraps += 1;
        return json({
          subjectId: 'unexpected-guest',
          kind: 'guest',
          guestSession: {
            guestSessionId: 'unexpected-session',
            expiresAt: '2026-10-10T00:00:00.000Z',
            bearerToken: 'unexpected-token',
          },
        });
      },
    });
    const store = createMobileGuestCredentialStoreV1(createMemorySecureStore());
    const member = {
      accessToken: 'member-token',
      refreshToken: 'member-refresh',
      expiresAt: '2026-10-10T00:00:00.000Z',
      tokenType: 'bearer' as const,
      user: { id: null, email: null },
    };
    const coordinator = createMobileSubjectSessionCoordinatorV1({
      client,
      store,
      memberSession: {
        async read() {
          return member;
        },
        async withMemberBearer() {
          throw new MyeongHaApiClientErrorV1(
            'http',
            'AUTH_UPSTREAM_UNAVAILABLE',
            'temporary',
            503,
            true,
          );
        },
      },
    });

    await expect(
      coordinator.withActiveBearer(async () => 'unexpected'),
    ).rejects.toMatchObject({ code: 'AUTH_UPSTREAM_UNAVAILABLE' });
    expect(guestBootstraps).toBe(0);
  });

  it('falls back to Guest only after authoritative Member expiry clears the Member', async () => {
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () =>
        json({
          subjectId: 'guest-after-expiry',
          kind: 'guest',
          guestSession: {
            guestSessionId: 'guest-session-after-expiry',
            expiresAt: '2026-10-10T00:00:00.000Z',
            bearerToken: 'guest-after-expiry-token',
          },
        }),
    });
    const store = createMobileGuestCredentialStoreV1(createMemorySecureStore());
    let memberPresent = true;
    const coordinator = createMobileSubjectSessionCoordinatorV1({
      client,
      store,
      memberSession: {
        async read() {
          return memberPresent
            ? {
                accessToken: 'expired-member',
                refreshToken: 'expired-refresh',
                expiresAt: '2026-09-30T00:00:00.000Z',
                tokenType: 'bearer',
                user: { id: null, email: null },
              }
            : null;
        },
        async withMemberBearer() {
          memberPresent = false;
          throw new MobileMemberSessionErrorV1(
            'MOBILE_MEMBER_REQUIRED',
            'expired',
          );
        },
      },
    });

    await expect(
      coordinator.withActiveBearer(async (bearer) => bearer),
    ).resolves.toBe('guest-after-expiry-token');
  });
});
