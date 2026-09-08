import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PRODUCT_AUTH_STORAGE_V1,
  clearPromotedGuestBearer,
  invalidateGuestSession,
} from '../apps/web/product-auth.js';

class FaultingStorage {
  protected readonly values = new Map<string, string>();
  readonly failRemovals = new Set<string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }

  removeItem(key: string) {
    if (this.failRemovals.has(key)) {
      throw new Error(`remove blocked: ${key}`);
    }
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }
}

let session: FaultingStorage;

beforeEach(() => {
  session = new FaultingStorage();
  vi.stubGlobal('localStorage', new FaultingStorage());
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

describe('Guest credential removal persistence authority', () => {
  it('rejects exact active Guest invalidation when sessionStorage removal cannot be verified', () => {
    sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, 'guest-active-rejected');
    session.failRemovals.add(PRODUCT_AUTH_STORAGE_V1.guestBearer);

    expect(() => invalidateGuestSession('guest-active-rejected')).toThrowError(expect.objectContaining({
      code: 'WEB_AUTH_GUEST_CLEAR_FAILED',
    }));
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe('guest-active-rejected');
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();

    session.failRemovals.clear();
    expect(invalidateGuestSession('guest-active-rejected')).toBe(true);
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBeNull();
    expect(globalThis.dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it('rejects exact pending Guest invalidation without disturbing the active Member compatibility bearer', () => {
    sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, 'header.member.signature');
    sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer, 'guest-pending-rejected');
    session.failRemovals.add(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer);

    expect(() => invalidateGuestSession('guest-pending-rejected')).toThrowError(expect.objectContaining({
      code: 'WEB_AUTH_GUEST_CLEAR_FAILED',
    }));
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe('header.member.signature');
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBe('guest-pending-rejected');
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });

  it('rolls back sibling Guest removal when promoted Guest cleanup is only partially durable', () => {
    sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, 'guest-active-before-cleanup');
    sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer, 'guest-pending-before-cleanup');
    session.failRemovals.add(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer);

    expect(() => clearPromotedGuestBearer()).toThrowError(expect.objectContaining({
      code: 'WEB_AUTH_GUEST_CLEAR_FAILED',
    }));
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe('guest-active-before-cleanup');
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBe('guest-pending-before-cleanup');
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();

    session.failRemovals.clear();
    expect(clearPromotedGuestBearer()).toBe(true);
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBeNull();
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBeNull();
  });
});
