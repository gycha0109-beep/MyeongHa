import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PRODUCT_AUTH_STORAGE_V1,
  clearPromotedGuestBearer,
  ensureGuestBearer,
  invalidateGuestSession,
} from '../apps/web/product-auth.js';

class MemoryStorage {
  protected readonly values = new Map<string, string>();

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

class VerificationFaultStorage extends MemoryStorage {
  failReadAfterNextGuestWrite = false;
  failReadAfterNextRemovalKey: string | null = null;
  replacementAfterNextRemoval: { key: string; value: string } | null = null;
  private failNextReadKey: string | null = null;

  override getItem(key: string) {
    if (this.failNextReadKey === key) {
      this.failNextReadKey = null;
      throw new Error(`verification read blocked: ${key}`);
    }
    return super.getItem(key);
  }

  override setItem(key: string, value: string) {
    super.setItem(key, value);
    if (
      this.failReadAfterNextGuestWrite
      && key === PRODUCT_AUTH_STORAGE_V1.guestBearer
    ) {
      this.failReadAfterNextGuestWrite = false;
      this.failNextReadKey = key;
    }
  }

  override removeItem(key: string) {
    super.removeItem(key);
    if (this.replacementAfterNextRemoval?.key === key) {
      this.values.set(key, this.replacementAfterNextRemoval.value);
      this.replacementAfterNextRemoval = null;
    }
    if (this.failReadAfterNextRemovalKey === key) {
      this.failReadAfterNextRemovalKey = null;
      this.failNextReadKey = key;
    }
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

let session: VerificationFaultStorage;

beforeEach(() => {
  session = new VerificationFaultStorage();
  vi.stubGlobal('localStorage', new MemoryStorage());
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

describe('Guest session verification-read rollback authority', () => {
  it('rolls back a Guest bootstrap write when its verification read fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(guestBootstrapResponse('guest-write-read-failure'))
      .mockResolvedValueOnce(guestBootstrapResponse('guest-write-read-recovery'));
    vi.stubGlobal('fetch', fetchMock);
    session.failReadAfterNextGuestWrite = true;

    await expect(ensureGuestBearer()).rejects.toMatchObject({
      code: 'WEB_AUTH_SESSION_READ_FAILED',
    });
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBeNull();
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBeNull();
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();

    await expect(ensureGuestBearer()).resolves.toBe('guest-write-read-recovery');
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe('guest-write-read-recovery');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(globalThis.dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it('restores an exact Guest bearer when removal succeeds but verification read fails', () => {
    sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, 'guest-remove-read-failure');
    session.failReadAfterNextRemovalKey = PRODUCT_AUTH_STORAGE_V1.guestBearer;

    expect(() => invalidateGuestSession('guest-remove-read-failure')).toThrowError(expect.objectContaining({
      code: 'WEB_AUTH_SESSION_READ_FAILED',
    }));
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe('guest-remove-read-failure');
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();

    expect(invalidateGuestSession('guest-remove-read-failure')).toBe(true);
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBeNull();
    expect(globalThis.dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it('restores sibling Guest lineage when a later removal verification read fails', () => {
    const bearer = 'guest-multi-remove-read-failure';
    sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, bearer);
    sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer, bearer);
    session.failReadAfterNextRemovalKey = PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer;

    expect(() => invalidateGuestSession(bearer)).toThrowError(expect.objectContaining({
      code: 'WEB_AUTH_SESSION_READ_FAILED',
    }));
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(bearer);
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBe(bearer);
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();

    expect(clearPromotedGuestBearer()).toBe(true);
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBeNull();
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBeNull();
  });

  it('does not overwrite a newer Guest authority observed after a removal attempt', () => {
    sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, 'guest-removal-old-authority');
    session.replacementAfterNextRemoval = {
      key: PRODUCT_AUTH_STORAGE_V1.guestBearer,
      value: 'guest-removal-newer-authority',
    };

    expect(() => invalidateGuestSession('guest-removal-old-authority')).toThrowError(expect.objectContaining({
      code: 'WEB_AUTH_GUEST_CLEAR_FAILED',
    }));
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe('guest-removal-newer-authority');
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });
});
