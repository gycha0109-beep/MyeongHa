import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMyRuntimeClient } from '../apps/web/my-runtime-client.js';
import { createRecordsRuntimeClient } from '../apps/web/records-runtime-client.js';
import {
  PRODUCT_AUTH_STORAGE_V1,
  readGuestBearer,
  readMemberSession,
} from '../apps/web/product-auth.js';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }
}

const memberSession = Object.freeze({
  accessToken: 'reject.payload.signature',
  refreshToken: 'reject-refresh-token',
  expiresAt: '2099-01-01T00:00:00.000Z',
  tokenType: 'bearer',
  user: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'reject-member@example.com',
  },
});
const guestBearer = 'reject-opaque-guest';

function seedMember() {
  localStorage.setItem(PRODUCT_AUTH_STORAGE_V1.memberSession, JSON.stringify(memberSession));
  sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, memberSession.accessToken);
}

function seedGuest() {
  sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, guestBearer);
}

function successEnvelope(data: object) {
  return Response.json({
    ok: true,
    data,
    meta: {
      apiContractVersion: 'auth-rejection-test-v1',
      requestId: crypto.randomUUID(),
      serverTime: '2026-09-08T00:00:00.000Z',
    },
  });
}

function profileEnvelope(kind: 'member' | 'guest') {
  return successEnvelope({
    subjectKind: kind,
    subjectStatus: 'active',
    profile: {
      displayName: kind === 'member' ? '회원' : null,
      locale: 'ko-KR',
      timezone: 'Asia/Seoul',
      onboardingState: 'completed',
      updatedAt: '2026-09-08T00:00:00.000Z',
    },
  });
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
  vi.stubGlobal('sessionStorage', new MemoryStorage());
  vi.stubGlobal('CustomEvent', class {
    readonly type: string;

    constructor(type: string) {
      this.type = type;
    }
  });
  vi.stubGlobal('dispatchEvent', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('My and Records authoritative bearer rejection', () => {
  it('invalidates a Member when My Birth returns 401 after the canonical profile already succeeded', async () => {
    seedMember();
    const fetchImpl = vi.fn(async (endpoint: string) => {
      if (endpoint === '/api/me') return profileEnvelope('member');
      if (endpoint === '/api/me/birth-profile') return Response.json({ ok: false }, { status: 401 });
      return Response.json({ ok: false }, { status: 404 });
    });
    const resolveBearer = async () => ({ kind: 'member' as const, token: memberSession.accessToken });
    const client = createMyRuntimeClient({ fetchImpl, resolveBearer });

    await expect(client.readProfile()).resolves.toMatchObject({ subjectKind: 'member' });
    await expect(client.readBirthProfile()).rejects.toMatchObject({ code: 'WEB_MY_SESSION_REQUIRED' });

    expect(readMemberSession()).toBeNull();
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBeNull();
    expect(globalThis.dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it('invalidates an opaque Guest when My profile returns 401', async () => {
    seedGuest();
    const client = createMyRuntimeClient({
      fetchImpl: vi.fn(async () => Response.json({ ok: false }, { status: 401 })),
      resolveBearer: async () => ({ kind: 'guest', token: guestBearer }),
    });

    await expect(client.readProfile()).rejects.toMatchObject({ code: 'WEB_MY_SESSION_REQUIRED' });

    expect(readGuestBearer()).toBeNull();
    expect(globalThis.dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it('preserves a Member when My Birth returns 403', async () => {
    seedMember();
    const client = createMyRuntimeClient({
      fetchImpl: vi.fn(async () => Response.json({ ok: false }, { status: 403 })),
      resolveBearer: async () => ({ kind: 'member', token: memberSession.accessToken }),
    });

    await expect(client.readBirthProfile()).rejects.toMatchObject({ code: 'WEB_MY_SESSION_REQUIRED' });

    expect(readMemberSession()).toMatchObject({ accessToken: memberSession.accessToken });
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(memberSession.accessToken);
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });

  it('invalidates a Member when a Records ledger returns 401 after /api/me already succeeded', async () => {
    seedMember();
    const fetchImpl = vi.fn(async (endpoint: string) => {
      if (endpoint === '/api/me') return profileEnvelope('member');
      if (endpoint === '/api/life-record') return Response.json({ ok: false }, { status: 401 });
      if (endpoint === '/api/readings') return successEnvelope({ readings: [] });
      if (endpoint === '/api/memories') return successEnvelope({ memories: [] });
      return Response.json({ ok: false }, { status: 404 });
    });
    const client = createRecordsRuntimeClient({
      fetchImpl,
      resolveBearer: async () => ({ kind: 'member', token: memberSession.accessToken }),
    });

    await expect(client.readRecords()).rejects.toMatchObject({ code: 'WEB_RECORDS_SESSION_REQUIRED' });

    expect(readMemberSession()).toBeNull();
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBeNull();
    expect(globalThis.dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it('invalidates an opaque Guest when a Records ledger returns 401', async () => {
    seedGuest();
    const fetchImpl = vi.fn(async (endpoint: string) => {
      if (endpoint === '/api/me') return profileEnvelope('guest');
      if (endpoint === '/api/life-record') return successEnvelope({ facts: [] });
      if (endpoint === '/api/readings') return successEnvelope({ readings: [] });
      if (endpoint === '/api/memories') return Response.json({ ok: false }, { status: 401 });
      return Response.json({ ok: false }, { status: 404 });
    });
    const client = createRecordsRuntimeClient({
      fetchImpl,
      resolveBearer: async () => ({ kind: 'guest', token: guestBearer }),
    });

    await expect(client.readRecords()).rejects.toMatchObject({ code: 'WEB_RECORDS_SESSION_REQUIRED' });

    expect(readGuestBearer()).toBeNull();
    expect(globalThis.dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it('preserves a Member when a Records ledger returns 403', async () => {
    seedMember();
    const fetchImpl = vi.fn(async (endpoint: string) => {
      if (endpoint === '/api/me') return profileEnvelope('member');
      if (endpoint === '/api/life-record') return Response.json({ ok: false }, { status: 403 });
      if (endpoint === '/api/readings') return successEnvelope({ readings: [] });
      if (endpoint === '/api/memories') return successEnvelope({ memories: [] });
      return Response.json({ ok: false }, { status: 404 });
    });
    const client = createRecordsRuntimeClient({
      fetchImpl,
      resolveBearer: async () => ({ kind: 'member', token: memberSession.accessToken }),
    });

    await expect(client.readRecords()).rejects.toMatchObject({ code: 'WEB_RECORDS_SESSION_REQUIRED' });

    expect(readMemberSession()).toMatchObject({ accessToken: memberSession.accessToken });
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(memberSession.accessToken);
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });
});