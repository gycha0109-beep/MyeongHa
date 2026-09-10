import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRecordsRuntimeClient } from '../apps/web/records-runtime-client.js';
import {
  PRODUCT_AUTH_STORAGE_V1,
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
  accessToken: 'header.payload.signature',
  refreshToken: 'refresh-token',
  expiresAt: '2099-01-01T00:00:00.000Z',
  tokenType: 'bearer',
  user: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'member@example.com',
  },
});

function successEnvelope(data: object) {
  return Response.json({
    ok: true,
    data,
    meta: {
      apiContractVersion: 'records-auth-test-v1',
      requestId: crypto.randomUUID(),
      serverTime: '2026-09-06T00:00:00.000Z',
    },
  });
}

function seedMemberSession() {
  localStorage.setItem(PRODUCT_AUTH_STORAGE_V1.memberSession, JSON.stringify(memberSession));
  sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, memberSession.accessToken);
}

function recordsFetch(calls: Array<{ endpoint: string; authorization: string | null }>) {
  return vi.fn(async (endpoint: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({ endpoint, authorization: headers.get('Authorization') });
    if (endpoint === '/api/me') {
      return successEnvelope({
        subjectKind: 'member',
        subjectStatus: 'active',
        profile: {
          displayName: '회원',
          locale: 'ko-KR',
          timezone: 'Asia/Seoul',
          onboardingState: 'completed',
          updatedAt: '2026-09-06T00:00:00.000Z',
        },
      });
    }
    if (endpoint === '/api/life-record') return successEnvelope({ facts: [] });
    if (endpoint === '/api/readings') return successEnvelope({ readings: [] });
    if (endpoint === '/api/memories') return successEnvelope({ memories: [] });
    return Response.json({ ok: false }, { status: 404 });
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

describe('Records active bearer binding', () => {
  it('uses one resolved Member bearer for the canonical profile gate and all Records reads', async () => {
    const calls: Array<{ endpoint: string; authorization: string | null }> = [];
    const resolveBearer = vi.fn(async () => ({ kind: 'member', token: memberSession.accessToken }));
    const client = createRecordsRuntimeClient({ fetchImpl: recordsFetch(calls), resolveBearer });

    await expect(client.readRecords()).resolves.toMatchObject({
      profile: { subjectKind: 'member' },
      lifeFacts: { facts: [] },
      readings: { readings: [] },
      memories: { memories: [] },
    });

    expect(resolveBearer).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(4);
    expect(calls.map((call) => call.endpoint)).toEqual([
      '/api/me',
      '/api/life-record',
      '/api/readings',
      '/api/memories',
    ]);
    expect(calls[0]).toEqual({ endpoint: '/api/me', authorization: `Bearer ${memberSession.accessToken}` });
    expect(calls.slice(1).map((call) => call.authorization)).toEqual([
      `Bearer ${memberSession.accessToken}`,
      `Bearer ${memberSession.accessToken}`,
      `Bearer ${memberSession.accessToken}`,
    ]);
  });

  it('binds an opaque Guest bearer instead of issuing unauthenticated Records requests', async () => {
    const calls: Array<{ endpoint: string; authorization: string | null }> = [];
    const client = createRecordsRuntimeClient({
      fetchImpl: recordsFetch(calls),
      resolveBearer: async () => ({ kind: 'guest', token: 'opaque-guest-session' }),
    });

    await client.readRecords();

    expect(calls).toHaveLength(4);
    expect(calls.every((call) => call.authorization === 'Bearer opaque-guest-session')).toBe(true);
  });

  it('fails closed without making an API request when no active bearer can be resolved', async () => {
    const fetchImpl = vi.fn();
    const client = createRecordsRuntimeClient({
      fetchImpl,
      resolveBearer: async () => null,
    });

    await expect(client.readRecords()).rejects.toMatchObject({ code: 'WEB_RECORDS_SESSION_REQUIRED' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('propagates bearer preparation failure without falling through to unauthenticated Records requests', async () => {
    const fetchImpl = vi.fn();
    const client = createRecordsRuntimeClient({
      fetchImpl,
      resolveBearer: async () => {
        throw new Error('refresh temporarily unavailable');
      },
    });

    await expect(client.readRecords()).rejects.toMatchObject({ code: 'WEB_RECORDS_SESSION_PREPARE_FAILED' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('invalidates a stale Member before reading Records when canonical /api/me returns 401', async () => {
    seedMemberSession();
    const fetchImpl = vi.fn(async () => Response.json({
      ok: false,
      error: { code: 'AUTH_REQUIRED', messageKey: 'auth.required', retryable: false },
      meta: {
        apiContractVersion: 'records-auth-test-v1',
        requestId: 'records-auth-required',
        serverTime: '2026-09-06T00:00:00.000Z',
      },
    }, { status: 401 }));
    const client = createRecordsRuntimeClient({
      fetchImpl,
      resolveBearer: async () => ({ kind: 'member', token: memberSession.accessToken }),
    });

    await expect(client.readRecords()).rejects.toMatchObject({ code: 'WEB_RECORDS_SESSION_REQUIRED' });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(readMemberSession()).toBeNull();
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBeNull();
    expect(globalThis.dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it('does not globally invalidate Member credentials on canonical profile 403', async () => {
    seedMemberSession();
    const fetchImpl = vi.fn(async () => Response.json({ ok: false }, { status: 403 }));
    const client = createRecordsRuntimeClient({
      fetchImpl,
      resolveBearer: async () => ({ kind: 'member', token: memberSession.accessToken }),
    });

    await expect(client.readRecords()).rejects.toMatchObject({ code: 'WEB_RECORDS_SESSION_REQUIRED' });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(readMemberSession()).toMatchObject({ accessToken: memberSession.accessToken });
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(memberSession.accessToken);
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });
});