import { describe, expect, it } from 'vitest';

import {
  MyeongHaApiClientV1,
  type GuestCredentialV1,
  type MemberSessionV1,
} from '../packages/api-client/src/index.js';
import {
  createMobileGuestCredentialStoreV1,
  type SecureKeyValueStoreV1,
} from '../apps/mobile/src/core/auth/guest-credential-store.js';
import {
  createMobileMemberSessionStoreV1,
} from '../apps/mobile/src/core/auth/member-session-store.js';
import {
  createMobileNewMemberEnrollmentStoreV1,
} from '../apps/mobile/src/core/auth/new-member-enrollment-store.js';
import {
  createMobileNewMemberEnrollmentServiceV1,
} from '../apps/mobile/src/features/my/mobile-new-member-enrollment.js';

function memoryStore(): SecureKeyValueStoreV1 {
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

const guest: GuestCredentialV1 = Object.freeze({
  kind: 'guest',
  subjectId: '11111111-1111-4111-8111-111111111111',
  guestSessionId: '22222222-2222-4222-8222-222222222222',
  bearerToken: 'opaque-guest-bearer-ABCDEFGHIJKLMNOPQRSTUVWXYZ-0123456789',
  expiresAt: '2099-01-01T00:00:00.000Z',
});

const memberSession: MemberSessionV1 = Object.freeze({
  accessToken: 'header.payload.signature',
  refreshToken: 'refresh-token',
  expiresAt: '2099-01-01T00:00:00.000Z',
  tokenType: 'bearer',
  user: Object.freeze({
    id: '33333333-3333-4333-8333-333333333333',
    email: 'new@example.com',
  }),
});

function success(data: unknown): Response {
  return Response.json({ ok: true, data }, { status: 200 });
}

async function fixture(fetchImpl: typeof fetch) {
  const guestStore = createMobileGuestCredentialStoreV1(memoryStore());
  const memberStore = createMobileMemberSessionStoreV1(memoryStore());
  const pendingStore = createMobileNewMemberEnrollmentStoreV1(memoryStore());
  await guestStore.write(guest);
  const client = new MyeongHaApiClientV1({
    origin: 'https://myeongha.test',
    fetchImpl,
  });
  const service = createMobileNewMemberEnrollmentServiceV1({
    client,
    subjectSession: {
      async acquireGuestCredential() {
        const current = await guestStore.read();
        if (current === null) throw new Error('missing guest');
        return current;
      },
    },
    guestStore,
    memberStore,
    pendingStore,
    nowEpochMs: () => Date.parse('2026-10-01T00:00:00.000Z'),
  });
  return { service, guestStore, memberStore, pendingStore };
}

describe('mobile new Member enrollment', () => {
  it('persists Member only after same-subject promotion succeeds', async () => {
    const calls: string[] = [];
    const { service, guestStore, memberStore, pendingStore } = await fixture(
      async (input, init) => {
        const path = new URL(String(input)).pathname;
        calls.push(path);
        if (path === '/api/auth/sign-up') {
          return success({ status: 'authenticated', session: memberSession });
        }
        if (path === '/api/auth/promote-guest') {
          const headers = new Headers(init?.headers);
          expect(headers.get('Authorization')).toBe(
            `Bearer ${memberSession.accessToken}`,
          );
          expect(headers.get('x-myeongha-guest-bearer')).toBe(guest.bearerToken);
          return success({
            subjectId: guest.subjectId,
            kind: 'member',
            status: 'active',
            replayed: false,
          });
        }
        throw new Error(`unexpected path ${path}`);
      },
    );

    await expect(
      service.start('new@example.com', 'secret-password'),
    ).resolves.toMatchObject({
      status: 'authenticated',
      session: memberSession,
      promotion: { subjectId: guest.subjectId },
    });
    expect(calls).toEqual(['/api/auth/sign-up', '/api/auth/promote-guest']);
    await expect(memberStore.read()).resolves.toEqual(memberSession);
    await expect(guestStore.read()).resolves.toBeNull();
    await expect(pendingStore.read()).resolves.toBeNull();
  });

  it('keeps pending continuity when authenticated sign-up promotion fails', async () => {
    const { service, guestStore, memberStore, pendingStore } = await fixture(
      async (input) => {
        const path = new URL(String(input)).pathname;
        if (path === '/api/auth/sign-up') {
          return success({ status: 'authenticated', session: memberSession });
        }
        throw new Error('temporary promotion network failure');
      },
    );

    await expect(
      service.start('new@example.com', 'secret-password'),
    ).rejects.toMatchObject({ code: 'API_NETWORK_FAILED' });
    await expect(memberStore.read()).resolves.toBeNull();
    await expect(guestStore.read()).resolves.toEqual(guest);
    await expect(pendingStore.read()).resolves.toEqual({
      email: 'new@example.com',
      guestSubjectId: guest.subjectId,
      guestSessionId: guest.guestSessionId,
    });
  });

  it('persists verification state without persisting a Member session', async () => {
    const { service, guestStore, memberStore, pendingStore } = await fixture(
      async () => success({
        status: 'verification_required',
        email: 'new@example.com',
      }),
    );

    await expect(
      service.start('new@example.com', 'secret-password'),
    ).resolves.toEqual({
      status: 'verification_required',
      email: 'new@example.com',
    });
    await expect(memberStore.read()).resolves.toBeNull();
    await expect(guestStore.read()).resolves.toEqual(guest);
    await expect(pendingStore.read()).resolves.toEqual({
      email: 'new@example.com',
      guestSubjectId: guest.subjectId,
      guestSessionId: guest.guestSessionId,
    });
  });

  it('continues after verification using the exact pending Guest', async () => {
    const calls: string[] = [];
    const { service, guestStore, memberStore, pendingStore } = await fixture(
      async (input) => {
        const path = new URL(String(input)).pathname;
        calls.push(path);
        if (path === '/api/auth/sign-in') {
          return success({ status: 'authenticated', session: memberSession });
        }
        return success({
          subjectId: guest.subjectId,
          kind: 'member',
          status: 'active',
          replayed: false,
        });
      },
    );
    await pendingStore.write({
      email: 'new@example.com',
      guestSubjectId: guest.subjectId,
      guestSessionId: guest.guestSessionId,
    });

    await expect(
      service.continueAfterVerification('new@example.com', 'secret-password'),
    ).resolves.toMatchObject({ status: 'authenticated' });
    expect(calls).toEqual(['/api/auth/sign-in', '/api/auth/promote-guest']);
    await expect(memberStore.read()).resolves.toEqual(memberSession);
    await expect(guestStore.read()).resolves.toBeNull();
    await expect(pendingStore.read()).resolves.toBeNull();
  });

  it('does not persist an existing Member when server requires Guest merge', async () => {
    const { service, guestStore, memberStore, pendingStore } = await fixture(
      async (input) => {
        const path = new URL(String(input)).pathname;
        if (path === '/api/auth/sign-in') {
          return success({ status: 'authenticated', session: memberSession });
        }
        return Response.json({
          ok: false,
          error: {
            code: 'GUEST_MERGE_REQUIRED',
            messageKey: 'auth.guest_merge_required',
            retryable: false,
          },
        }, { status: 409 });
      },
    );
    await pendingStore.write({
      email: 'new@example.com',
      guestSubjectId: guest.subjectId,
      guestSessionId: guest.guestSessionId,
    });

    await expect(
      service.continueAfterVerification('new@example.com', 'secret-password'),
    ).rejects.toMatchObject({ code: 'GUEST_MERGE_REQUIRED' });
    await expect(memberStore.read()).resolves.toBeNull();
    await expect(guestStore.read()).resolves.toEqual(guest);
  });

  it('fails closed before sign-in when the Guest changed after enrollment started', async () => {
    let networkCalls = 0;
    const { service, guestStore, memberStore, pendingStore } = await fixture(
      async () => {
        networkCalls += 1;
        throw new Error('network should not execute');
      },
    );
    await pendingStore.write({
      email: 'new@example.com',
      guestSubjectId: guest.subjectId,
      guestSessionId: guest.guestSessionId,
    });
    await guestStore.write(Object.freeze({
      ...guest,
      subjectId: '44444444-4444-4444-8444-444444444444',
      guestSessionId: '55555555-5555-4555-8555-555555555555',
      bearerToken: 'replacement-guest-bearer-ABCDEFGHIJKLMNOPQRSTUVWXYZ-012345',
    }));

    await expect(
      service.continueAfterVerification('new@example.com', 'secret-password'),
    ).rejects.toMatchObject({ code: 'MOBILE_NEW_MEMBER_GUEST_CHANGED' });
    expect(networkCalls).toBe(0);
    await expect(memberStore.read()).resolves.toBeNull();
  });
});
