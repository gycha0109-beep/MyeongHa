import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMyRuntimeClient } from '../apps/web/my-runtime-client.js';
import {
  PRODUCT_AUTH_STORAGE_V1,
  readMemberSession,
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

function seedMemberSession({ withPendingGuest = true } = {}) {
  localStorage.setItem(PRODUCT_AUTH_STORAGE_V1.memberSession, JSON.stringify(memberSession));
  sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, memberSession.accessToken);
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
