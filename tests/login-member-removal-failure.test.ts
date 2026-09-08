import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PRODUCT_AUTH_STORAGE_V1,
  ProductAuthError,
  invalidateMemberSession,
  readGuestBearer,
  readMemberSession,
  refreshMemberSession,
  signOutMember,
} from '../apps/web/product-auth.js';

class FaultingStorage {
  private readonly values = new Map<string, string>();
  failMemberRemovals = false;

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }

  removeItem(key: string) {
    if (this.failMemberRemovals && key === PRODUCT_AUTH_STORAGE_V1.memberSession) {
      throw new Error('member removal blocked');
    }
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }
}

const MEMBER_ACCESS = 'clear.member.payload';
const MEMBER_REFRESH = 'clear-member-refresh';
const PENDING_GUEST = 'guest-before-member-clear';
const MEMBER_SESSION = Object.freeze({
  accessToken: MEMBER_ACCESS,
  refreshToken: MEMBER_REFRESH,
  expiresAt: '2099-01-01T00:00:00.000Z',
  tokenType: 'bearer',
  user: Object.freeze({ id: 'auth-user-clear', email: 'clear@example.com' }),
});

function sessionExpiredResponse() {
  return Response.json({
    ok: false,
    error: {
      code: 'SESSION_EXPIRED',
      messageKey: 'auth.session_expired',
      retryable: false,
    },
  }, { status: 401 });
}

function remoteSignOutFailureResponse() {
  return Response.json({
    ok: false,
    error: {
      code: 'AUTH_UPSTREAM_UNAVAILABLE',
      messageKey: 'auth.upstream_unavailable',
      retryable: true,
    },
  }, { status: 503 });
}

let local: FaultingStorage;
let session: FaultingStorage;

function seedMemberWithPendingGuest() {
  local.setItem(PRODUCT_AUTH_STORAGE_V1.memberSession, JSON.stringify(MEMBER_SESSION));
  session.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, MEMBER_ACCESS);
  session.setItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer, PENDING_GUEST);
}

beforeEach(() => {
  local = new FaultingStorage();
  session = new FaultingStorage();
  vi.stubGlobal('localStorage', local);
  vi.stubGlobal('sessionStorage', session);
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

describe('Member session removal authority', () => {
  it('rejects explicit sign-out when the Member session cannot be removed and preserves Member plus pending Guest state', async () => {
    seedMemberWithPendingGuest();
    local.failMemberRemovals = true;
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(remoteSignOutFailureResponse())));

    await expect(signOutMember()).rejects.toMatchObject({
      name: 'ProductAuthError',
      code: 'WEB_AUTH_MEMBER_CLEAR_FAILED',
    } satisfies Partial<ProductAuthError>);

    expect(readMemberSession()?.accessToken).toBe(MEMBER_ACCESS);
    expect(session.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(MEMBER_ACCESS);
    expect(session.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBe(PENDING_GUEST);
    expect(readGuestBearer()).toBe(PENDING_GUEST);
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });

  it('returns false from exact Member invalidation when removal fails without restoring Guest compatibility state', () => {
    seedMemberWithPendingGuest();
    local.failMemberRemovals = true;

    expect(invalidateMemberSession(MEMBER_ACCESS)).toBe(false);

    expect(readMemberSession()?.accessToken).toBe(MEMBER_ACCESS);
    expect(session.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(MEMBER_ACCESS);
    expect(session.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBe(PENDING_GUEST);
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });

  it('keeps the rejected Member generation authoritative when SESSION_EXPIRED cannot clear local storage', async () => {
    seedMemberWithPendingGuest();
    local.failMemberRemovals = true;
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(sessionExpiredResponse())));

    await expect(refreshMemberSession()).rejects.toMatchObject({
      name: 'ProductAuthError',
      code: 'SESSION_EXPIRED',
    } satisfies Partial<ProductAuthError>);

    expect(readMemberSession()?.accessToken).toBe(MEMBER_ACCESS);
    expect(session.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(MEMBER_ACCESS);
    expect(session.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBe(PENDING_GUEST);
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });
});
