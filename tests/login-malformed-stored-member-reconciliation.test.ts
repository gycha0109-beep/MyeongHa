import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PRODUCT_AUTH_STORAGE_V1,
  readGuestBearer,
  readMemberSession,
  signInWithPassword,
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
}

const stagedGuest = 'guest-before-malformed-member';

function seedBrowserAuthority(memberRaw: string, activeBearer: string) {
  localStorage.setItem(PRODUCT_AUTH_STORAGE_V1.memberSession, memberRaw);
  sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, activeBearer);
  sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer, stagedGuest);
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
  vi.stubGlobal('sessionStorage', new MemoryStorage());
  vi.stubGlobal('CustomEvent', class {
    readonly type: string;
    constructor(type: string) { this.type = type; }
  });
  vi.stubGlobal('dispatchEvent', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Malformed persisted Member reconciliation', () => {
  it('removes a stale staged Member JWT and restores the pending Guest when stored JSON is corrupt', () => {
    seedBrowserAuthority('{not-json', 'stale.member.signature');

    expect(readMemberSession()).toBeNull();
    expect(localStorage.getItem(PRODUCT_AUTH_STORAGE_V1.memberSession)).toBeNull();
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(stagedGuest);
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBeNull();
    expect(readGuestBearer()).toBe(stagedGuest);
    expect(globalThis.dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it('rejects a persisted Member session whose access token cannot satisfy the Member JWT classification invariant', () => {
    seedBrowserAuthority(JSON.stringify({
      accessToken: 'opaque-member-token',
      refreshToken: 'refresh-token',
      expiresAt: '2099-01-01T00:00:00.000Z',
      tokenType: 'bearer',
      user: { id: '11111111-1111-4111-8111-111111111111', email: 'member@example.com' },
    }), 'opaque-member-token');

    expect(readMemberSession()).toBeNull();
    expect(localStorage.getItem(PRODUCT_AUTH_STORAGE_V1.memberSession)).toBeNull();
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(stagedGuest);
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBeNull();
    expect(readGuestBearer()).toBe(stagedGuest);
  });

  it('rejects a non-JWT Member token returned by sign-in before mutating browser credential authority', async () => {
    sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, stagedGuest);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      ok: true,
      data: {
        status: 'authenticated',
        session: {
          accessToken: 'opaque-member-token',
          refreshToken: 'refresh-token',
          expiresAt: '2099-01-01T00:00:00.000Z',
          tokenType: 'bearer',
          user: { id: '11111111-1111-4111-8111-111111111111', email: 'member@example.com' },
        },
      },
    })));

    await expect(signInWithPassword('member@example.com', 'password')).rejects.toMatchObject({
      code: 'WEB_AUTH_MALFORMED_SESSION',
    });

    expect(localStorage.getItem(PRODUCT_AUTH_STORAGE_V1.memberSession)).toBeNull();
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(stagedGuest);
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBeNull();
  });
});
