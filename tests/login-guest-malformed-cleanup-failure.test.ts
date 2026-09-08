import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PRODUCT_AUTH_STORAGE_V1,
  ensureGuestBearer,
  readGuestBearer,
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
}

function guestBootstrapResponse(token: string) {
  return Response.json({
    ok: true,
    data: {
      kind: 'guest',
      guestSession: {
        bearerToken: token,
        expiresAt: '2099-01-01T00:00:00.000Z',
      },
    },
  });
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

describe('Malformed Guest storage cleanup authority', () => {
  it('fails closed when malformed pending Guest storage cannot be removed before using an active Guest', () => {
    sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer, '   ');
    sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, 'guest-active-valid');
    session.failRemovals.add(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer);

    expect(() => readGuestBearer()).toThrowError(expect.objectContaining({
      code: 'WEB_AUTH_GUEST_CLEAR_FAILED',
    }));
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBe('   ');
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe('guest-active-valid');
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();

    session.failRemovals.clear();
    expect(readGuestBearer()).toBe('guest-active-valid');
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBeNull();
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe('guest-active-valid');
  });

  it('fails closed when malformed active Guest storage cannot be removed', () => {
    sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, '\t');
    session.failRemovals.add(PRODUCT_AUTH_STORAGE_V1.guestBearer);

    expect(() => readGuestBearer()).toThrowError(expect.objectContaining({
      code: 'WEB_AUTH_GUEST_CLEAR_FAILED',
    }));
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe('\t');
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();

    session.failRemovals.clear();
    expect(readGuestBearer()).toBeNull();
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBeNull();
  });

  it('does not start Guest bootstrap while malformed pending storage cannot be removed and recovers after cleanup succeeds', async () => {
    sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer, '   ');
    session.failRemovals.add(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer);
    const fetchMock = vi.fn(() => Promise.resolve(guestBootstrapResponse('guest-after-cleanup-retry')));
    vi.stubGlobal('fetch', fetchMock);

    await expect(ensureGuestBearer()).rejects.toMatchObject({
      code: 'WEB_AUTH_GUEST_CLEAR_FAILED',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBe('   ');
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBeNull();
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();

    session.failRemovals.clear();
    await expect(ensureGuestBearer()).resolves.toBe('guest-after-cleanup-retry');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBeNull();
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe('guest-after-cleanup-retry');
    expect(globalThis.dispatchEvent).toHaveBeenCalledTimes(1);
  });
});