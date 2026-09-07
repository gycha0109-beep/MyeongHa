import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PRODUCT_AUTH_STORAGE_V1,
  ensureActiveBearer,
  ensureGuestBearer,
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

describe('same-tab Guest bootstrap single-flight authority', () => {
  it('converges concurrent Guest callers onto one bootstrap request and one bearer', async () => {
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }));
    vi.stubGlobal('fetch', fetchMock);

    const direct = ensureGuestBearer();
    const active = ensureActiveBearer();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/session/bootstrap', expect.objectContaining({
      method: 'POST',
    }));

    resolveFetch(guestBootstrapResponse('guest-single-flight'));

    await expect(direct).resolves.toBe('guest-single-flight');
    await expect(active).resolves.toEqual({ kind: 'guest', token: 'guest-single-flight' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe('guest-single-flight');
    expect(globalThis.dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it('clears a failed bootstrap flight so the next caller can retry', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(guestBootstrapResponse('guest-after-retry'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(ensureGuestBearer()).rejects.toMatchObject({
      code: 'WEB_AUTH_NETWORK_FAILED',
    });
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBeNull();

    await expect(ensureGuestBearer()).resolves.toBe('guest-after-retry');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe('guest-after-retry');
    expect(globalThis.dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it('preserves a newer Guest bearer that appears before the bootstrap response settles', async () => {
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }));
    vi.stubGlobal('fetch', fetchMock);

    const pending = ensureGuestBearer();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, 'guest-newer-authority');
    resolveFetch(guestBootstrapResponse('guest-stale-response'));

    await expect(pending).resolves.toBe('guest-newer-authority');
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe('guest-newer-authority');
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });
});
