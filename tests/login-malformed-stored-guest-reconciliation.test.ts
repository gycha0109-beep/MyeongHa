import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PRODUCT_AUTH_STORAGE_V1,
  ProductAuthError,
  readGuestBearer,
} from '../apps/web/product-auth.js';

class MemoryStorage {
  private readonly values = new Map<string, string>();
  readonly replaceAfterReadOnce = new Map<string, string>();

  getItem(key: string) {
    const current = this.values.get(key) ?? null;
    const replacement = this.replaceAfterReadOnce.get(key);
    if (replacement !== undefined) {
      this.replaceAfterReadOnce.delete(key);
      this.values.set(key, replacement);
    }
    return current;
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

let local: MemoryStorage;
let session: MemoryStorage;

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

describe('Malformed persisted Guest reconciliation', () => {
  it('preserves a newer valid pending Guest that replaces malformed pending authority after the stale read', () => {
    const replacement = 'guest-newer-pending-authority';
    sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer, '   ');
    sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, 'guest-older-active-authority');
    session.replaceAfterReadOnce.set(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer, replacement);

    expect(readGuestBearer()).toBe(replacement);
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBe(replacement);
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe('guest-older-active-authority');
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });

  it('preserves a newer valid active Guest that replaces malformed active authority after the stale read', () => {
    const replacement = 'guest-newer-active-authority';
    sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, '   ');
    session.replaceAfterReadOnce.set(PRODUCT_AUTH_STORAGE_V1.guestBearer, replacement);

    expect(readGuestBearer()).toBe(replacement);
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBeNull();
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(replacement);
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });

  it('fails closed without deleting a newer malformed pending replacement', () => {
    const replacement = '\t';
    sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer, '   ');
    session.replaceAfterReadOnce.set(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer, replacement);

    let failure: unknown = null;
    try {
      readGuestBearer();
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({
      name: 'ProductAuthError',
      code: 'WEB_AUTH_GUEST_CLEAR_FAILED',
    } satisfies Partial<ProductAuthError>);
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBe(replacement);
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });
});
