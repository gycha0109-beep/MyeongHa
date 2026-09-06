import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMyRuntimeClient } from '../apps/web/my-runtime-client.js';
import {
  PRODUCT_AUTH_STORAGE_V1,
  ensureActiveBearer,
  getActiveBearer,
  getMemberAccessToken,
  invalidateGuestSession,
  readMemberSession,
  refreshMemberSession,
  signOutMember,
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

function seedMemberSession({
  withPendingGuest = true,
  session = memberSession,
}: {
  withPendingGuest?: boolean;
  session?: {
    accessToken: string;
    refreshToken: string;
    expiresAt: string;
    tokenType: string;
    user: { id: string; email: string };
  };
} = {}) {
  localStorage.setItem(PRODUCT_AUTH_STORAGE_V1.memberSession, JSON.stringify(session));
  sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, session.accessToken);
  if (withPendingGuest) {
    sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer, 'guest-before-member');
  }
}

function createRejectedClient(status: number) {
  return createMyRuntimeClient({
    fetchImpl: async () => ({ status, ok: false }),
    resolveBearer: async () => ({ kind: 'member', token: memberSession.accessToken }),
  });
}

function authErrorResponse(code: string, status: number) {
  return Response.json({
    ok: false,
    error: {
      code,
      messageKey: `auth.${code.toLowerCase()}`,
      retryable: status >= 500,
    },
  }, { status });
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

describe('Member session invalidation at the canonical current-subject boundary', () => {
  it('drops stale member credentials when /api/me returns canonical AUTH_REQUIRED 401', async () => {
    seedMemberSession();

    await expect(createRejectedClient(401).readProfile()).rejects.toMatchObject({
      code: 'WEB_MY_SESSION_REQUIRED',
    });

    expect(readMemberSession()).toBeNull();
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe('guest-before-member');
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBeNull();
    expect(globalThis.dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it('does not treat a /api/me 403 as canonical authentication invalidation', async () => {
    seedMemberSession({ withPendingGuest: false });

    await expect(createRejectedClient(403).readProfile()).rejects.toMatchObject({
      code: 'WEB_MY_SESSION_REQUIRED',
    });

    expect(readMemberSession()).toMatchObject({
      accessToken: memberSession.accessToken,
      refreshToken: memberSession.refreshToken,
    });
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(memberSession.accessToken);
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });

  it('does not discard the whole member session for a resource-level birth-profile 403', async () => {
    seedMemberSession({ withPendingGuest: false });

    await expect(createRejectedClient(403).readBirthProfile()).rejects.toMatchObject({
      code: 'WEB_MY_SESSION_REQUIRED',
    });

    expect(readMemberSession()).toMatchObject({
      accessToken: memberSession.accessToken,
      refreshToken: memberSession.refreshToken,
    });
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(memberSession.accessToken);
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });

  it('keeps browser-local sign-out authoritative when the remote sign-out request fails', async () => {
    seedMemberSession();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    await signOutMember();

    expect(readMemberSession()).toBeNull();
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe('guest-before-member');
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBeNull();
    expect(globalThis.dispatchEvent).toHaveBeenCalledTimes(1);
  });
});

describe('Guest session invalidation authority', () => {
  it('discards active and pending Guest credentials after canonical Guest rejection', () => {
    sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, 'expired-guest');
    sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer, 'pending-guest');

    invalidateGuestSession();

    expect(readMemberSession()).toBeNull();
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBeNull();
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBeNull();
    expect(globalThis.dispatchEvent).toHaveBeenCalledTimes(1);
  });
});

describe('Member session refresh failure authority', () => {
  it('discards member credentials only when refresh returns authoritative SESSION_EXPIRED', async () => {
    seedMemberSession();
    vi.stubGlobal('fetch', vi.fn(async () => authErrorResponse('SESSION_EXPIRED', 401)));

    await expect(refreshMemberSession()).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });

    expect(readMemberSession()).toBeNull();
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe('guest-before-member');
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBeNull();
    expect(globalThis.dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it('preserves member credentials when refresh upstream is temporarily unavailable', async () => {
    seedMemberSession();
    vi.stubGlobal('fetch', vi.fn(async () => authErrorResponse('AUTH_UPSTREAM_UNAVAILABLE', 503)));

    await expect(refreshMemberSession()).rejects.toMatchObject({ code: 'AUTH_UPSTREAM_UNAVAILABLE' });

    expect(readMemberSession()).toMatchObject({
      accessToken: memberSession.accessToken,
      refreshToken: memberSession.refreshToken,
    });
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(memberSession.accessToken);
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBe('guest-before-member');
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });

  it('preserves member credentials on a refresh network failure', async () => {
    seedMemberSession();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    await expect(refreshMemberSession()).rejects.toMatchObject({ code: 'WEB_AUTH_NETWORK_FAILED' });

    expect(readMemberSession()).toMatchObject({
      accessToken: memberSession.accessToken,
      refreshToken: memberSession.refreshToken,
    });
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(memberSession.accessToken);
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBe('guest-before-member');
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });

  it('continues using the still-valid access token when proactive refresh fails transiently', async () => {
    const nearExpirySession = Object.freeze({
      ...memberSession,
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
    });
    seedMemberSession({ session: nearExpirySession });
    vi.stubGlobal('fetch', vi.fn(async () => authErrorResponse('AUTH_UPSTREAM_UNAVAILABLE', 503)));

    await expect(getMemberAccessToken()).resolves.toBe(nearExpirySession.accessToken);

    expect(readMemberSession()).toMatchObject({
      accessToken: nearExpirySession.accessToken,
      refreshToken: nearExpirySession.refreshToken,
    });
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(nearExpirySession.accessToken);
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });

  it('stops using an actually expired access token after transient refresh failure without deleting the session', async () => {
    const expiredSession = Object.freeze({
      ...memberSession,
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    });
    seedMemberSession({ session: expiredSession });
    vi.stubGlobal('fetch', vi.fn(async () => authErrorResponse('AUTH_UPSTREAM_UNAVAILABLE', 503)));

    await expect(getMemberAccessToken()).rejects.toMatchObject({ code: 'AUTH_UPSTREAM_UNAVAILABLE' });

    expect(readMemberSession()).toMatchObject({
      accessToken: expiredSession.accessToken,
      refreshToken: expiredSession.refreshToken,
    });
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(expiredSession.accessToken);
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });

  it('persists rotated credentials after a successful refresh', async () => {
    seedMemberSession();
    const refreshedSession = {
      ...memberSession,
      accessToken: 'newheader.newpayload.newsignature',
      refreshToken: 'rotated-refresh-token',
      expiresAt: '2099-01-02T00:00:00.000Z',
    };
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      ok: true,
      data: { status: 'authenticated', session: refreshedSession },
    })));

    await expect(refreshMemberSession()).resolves.toMatchObject({
      accessToken: refreshedSession.accessToken,
      refreshToken: refreshedSession.refreshToken,
    });

    expect(readMemberSession()).toMatchObject({
      accessToken: refreshedSession.accessToken,
      refreshToken: refreshedSession.refreshToken,
    });
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(refreshedSession.accessToken);
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBe('guest-before-member');
    expect(globalThis.dispatchEvent).toHaveBeenCalledTimes(1);
  });
});

describe('Recoverable Member identity must not downgrade to Guest', () => {
  it('propagates transient refresh failure instead of returning the staged Guest bearer', async () => {
    const expiredSession = Object.freeze({
      ...memberSession,
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    });
    seedMemberSession({ session: expiredSession });
    const fetchMock = vi.fn(async () => authErrorResponse('AUTH_UPSTREAM_UNAVAILABLE', 503));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getActiveBearer()).rejects.toMatchObject({ code: 'AUTH_UPSTREAM_UNAVAILABLE' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(readMemberSession()).toMatchObject({
      accessToken: expiredSession.accessToken,
      refreshToken: expiredSession.refreshToken,
    });
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(expiredSession.accessToken);
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBe('guest-before-member');
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });

  it('does not bootstrap a Guest while a recoverable Member session still exists', async () => {
    const expiredSession = Object.freeze({
      ...memberSession,
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    });
    seedMemberSession({ session: expiredSession });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/auth/refresh') {
        return authErrorResponse('AUTH_UPSTREAM_UNAVAILABLE', 503);
      }
      return Response.json({
        ok: true,
        data: { kind: 'guest', guestSession: { bearerToken: 'unexpected-guest' } },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(ensureActiveBearer()).rejects.toMatchObject({ code: 'AUTH_UPSTREAM_UNAVAILABLE' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(readMemberSession()).not.toBeNull();
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBe('guest-before-member');
  });

  it('allows Guest fallback only after authoritative SESSION_EXPIRED removes the Member session', async () => {
    const expiredSession = Object.freeze({
      ...memberSession,
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    });
    seedMemberSession({ session: expiredSession });
    const fetchMock = vi.fn(async () => authErrorResponse('SESSION_EXPIRED', 401));
    vi.stubGlobal('fetch', fetchMock);

    await expect(ensureActiveBearer()).resolves.toEqual({
      kind: 'guest',
      token: 'guest-before-member',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(readMemberSession()).toBeNull();
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe('guest-before-member');
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBeNull();
  });
});
