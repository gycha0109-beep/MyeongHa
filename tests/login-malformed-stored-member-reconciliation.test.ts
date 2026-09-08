import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PRODUCT_AUTH_STORAGE_V1,
  ProductAuthError,
  readGuestBearer,
  readMemberSession,
  signInWithPassword,
} from '../apps/web/product-auth.js';

class MemoryStorage {
  private readonly values = new Map<string, string>();
  readonly failSetOnce = new Set<string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    const normalized = String(value);
    const faultKey = `${key}:${normalized}`;
    if (this.failSetOnce.delete(faultKey)) {
      throw new Error(`set blocked once: ${faultKey}`);
    }
    this.values.set(key, normalized);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

const stagedGuest = 'guest-before-malformed-member';
const staleMemberJwt = 'stale.member.signature';
let local: MemoryStorage;
let session: MemoryStorage;

function seedBrowserAuthority(memberRaw: string, activeBearer: string) {
  localStorage.setItem(PRODUCT_AUTH_STORAGE_V1.memberSession, memberRaw);
  sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, activeBearer);
  sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer, stagedGuest);
}

beforeEach(() => {
  local = new MemoryStorage();
  session = new MemoryStorage();
  vi.stubGlobal('localStorage', local);
  vi.stubGlobal('sessionStorage', session);
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
    seedBrowserAuthority('{not-json', staleMemberJwt);

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

  it('propagates a malformed Member cleanup rollback failure without running a second discard', () => {
    seedBrowserAuthority(JSON.stringify({
      accessToken: 'opaque-member-token',
      refreshToken: 'refresh-token',
      expiresAt: '2099-01-01T00:00:00.000Z',
      tokenType: 'bearer',
      user: { id: '11111111-1111-4111-8111-111111111111', email: 'member@example.com' },
    }), staleMemberJwt);
    session.failSetOnce.add(`${PRODUCT_AUTH_STORAGE_V1.guestBearer}:${stagedGuest}`);
    session.failSetOnce.add(`${PRODUCT_AUTH_STORAGE_V1.guestBearer}:${staleMemberJwt}`);

    let failure: unknown = null;
    try {
      readMemberSession();
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({
      name: 'ProductAuthError',
      code: 'WEB_AUTH_MEMBER_COMPAT_DISCARD_ROLLBACK_FAILED',
    } satisfies Partial<ProductAuthError>);
    expect(localStorage.getItem(PRODUCT_AUTH_STORAGE_V1.memberSession)).toBeNull();
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBeNull();
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBe(stagedGuest);
    expect(readGuestBearer()).toBe(stagedGuest);
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
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