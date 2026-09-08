import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PRODUCT_AUTH_STORAGE_V1,
  ProductAuthError,
  invalidateMemberSession,
  readGuestBearer,
  readMemberSession,
  signOutMember,
} from '../apps/web/product-auth.js';

class FaultingStorage {
  private readonly values = new Map<string, string>();
  failSets = new Set<string>();
  failRemovals = new Set<string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    if (this.failSets.has(`${key}:${String(value)}`) || this.failSets.has(key)) {
      throw new Error(`set blocked: ${key}`);
    }
    this.values.set(key, String(value));
  }

  removeItem(key: string) {
    if (this.failRemovals.has(key)) throw new Error(`remove blocked: ${key}`);
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }
}

const MEMBER_ACCESS = 'discard.member.payload';
const MEMBER_REFRESH = 'discard-member-refresh';
const PENDING_GUEST = 'guest-before-member-discard';
const MEMBER_SESSION = Object.freeze({
  accessToken: MEMBER_ACCESS,
  refreshToken: MEMBER_REFRESH,
  expiresAt: '2099-01-01T00:00:00.000Z',
  tokenType: 'bearer',
  user: Object.freeze({ id: 'auth-user-discard', email: 'discard@example.com' }),
});

let local: FaultingStorage;
let session: FaultingStorage;

function seedMemberWithPendingGuest() {
  local.setItem(PRODUCT_AUTH_STORAGE_V1.memberSession, JSON.stringify(MEMBER_SESSION));
  session.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, MEMBER_ACCESS);
  session.setItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer, PENDING_GUEST);
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

describe('Member compatibility discard authority', () => {
  it('rolls back local Member plus compatibility state when pending Guest restoration cannot be written', async () => {
    seedMemberWithPendingGuest();
    session.failSets.add(`${PRODUCT_AUTH_STORAGE_V1.guestBearer}:${PENDING_GUEST}`);
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(remoteSignOutFailureResponse())));

    await expect(signOutMember()).rejects.toMatchObject({
      name: 'ProductAuthError',
      code: 'WEB_AUTH_MEMBER_CLEAR_FAILED',
    } satisfies Partial<ProductAuthError>);

    expect(readMemberSession()?.accessToken).toBe(MEMBER_ACCESS);
    expect(session.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(MEMBER_ACCESS);
    expect(session.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBe(PENDING_GUEST);
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });

  it('rolls back the entire local discard when pending Guest removal cannot be verified', () => {
    seedMemberWithPendingGuest();
    session.failRemovals.add(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer);

    expect(invalidateMemberSession(MEMBER_ACCESS)).toBe(false);

    expect(readMemberSession()?.accessToken).toBe(MEMBER_ACCESS);
    expect(session.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(MEMBER_ACCESS);
    expect(session.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBe(PENDING_GUEST);
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });

  it('never resurrects Member authority when a cross-tab removal already won but compatibility convergence fails', () => {
    session.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, MEMBER_ACCESS);
    session.setItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer, PENDING_GUEST);
    session.failSets.add(`${PRODUCT_AUTH_STORAGE_V1.guestBearer}:${PENDING_GUEST}`);

    expect(invalidateMemberSession()).toBe(false);

    expect(readMemberSession()).toBeNull();
    expect(session.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(MEMBER_ACCESS);
    expect(session.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBe(PENDING_GUEST);
    expect(readGuestBearer()).toBe(PENDING_GUEST);
    expect(globalThis.dispatchEvent).toHaveBeenCalledTimes(1);

    session.failSets.clear();
    expect(invalidateMemberSession()).toBe(true);
    expect(readMemberSession()).toBeNull();
    expect(session.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(PENDING_GUEST);
    expect(session.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBeNull();
    expect(globalThis.dispatchEvent).toHaveBeenCalledTimes(2);
  });

  it('raises a distinct hard failure if a local Member rollback itself cannot be verified', () => {
    seedMemberWithPendingGuest();
    session.failSets.add(`${PRODUCT_AUTH_STORAGE_V1.guestBearer}:${PENDING_GUEST}`);
    local.failSets.add(PRODUCT_AUTH_STORAGE_V1.memberSession);

    let failure: unknown = null;
    try {
      invalidateMemberSession(MEMBER_ACCESS);
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({
      name: 'ProductAuthError',
      code: 'WEB_AUTH_MEMBER_COMPAT_DISCARD_ROLLBACK_FAILED',
    } satisfies Partial<ProductAuthError>);
    expect(readMemberSession()).toBeNull();
    expect(session.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(MEMBER_ACCESS);
    expect(session.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBe(PENDING_GUEST);
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });
});