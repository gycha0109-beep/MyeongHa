import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PRODUCT_AUTH_STORAGE_V1,
  ensureActiveBearer,
  ensureGuestBearer,
  readGuestBearer,
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

class FaultingGuestStorage extends MemoryStorage {
  failGuestWrites = false;
  replacementOnFailure: string | null = null;

  override setItem(key: string, value: string) {
    if (this.failGuestWrites && key === PRODUCT_AUTH_STORAGE_V1.guestBearer) {
      if (this.replacementOnFailure) {
        this.values.set(key, this.replacementOnFailure);
      }
      throw new Error('Guest sessionStorage write blocked');
    }
    super.setItem(key, value);
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

let session: FaultingGuestStorage;

beforeEach(() => {
  session = new FaultingGuestStorage();
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

describe('Guest bootstrap persistence authority', () => {
  it('rejects concurrent Guest callers when the bootstrap bearer cannot be persisted', async () => {
    session.failGuestWrites = true;
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }));
    vi.stubGlobal('fetch', fetchMock);

    const direct = ensureGuestBearer();
    const active = ensureActiveBearer();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch(guestBootstrapResponse('guest-unstored'));

    await expect(direct).rejects.toMatchObject({ code: 'WEB_AUTH_GUEST_PERSIST_FAILED' });
    await expect(active).rejects.toMatchObject({ code: 'WEB_AUTH_GUEST_PERSIST_FAILED' });
    expect(readGuestBearer()).toBeNull();
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBeNull();
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('clears the failed flight so a later retry can persist and reuse a stable Guest bearer', async () => {
    session.failGuestWrites = true;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(guestBootstrapResponse('guest-first-unstored'))
      .mockResolvedValueOnce(guestBootstrapResponse('guest-after-persist-retry'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(ensureActiveBearer()).rejects.toMatchObject({
      code: 'WEB_AUTH_GUEST_PERSIST_FAILED',
    });
    expect(readGuestBearer()).toBeNull();
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();

    session.failGuestWrites = false;
    await expect(ensureActiveBearer()).resolves.toEqual({
      kind: 'guest',
      token: 'guest-after-persist-retry',
    });
    await expect(ensureActiveBearer()).resolves.toEqual({
      kind: 'guest',
      token: 'guest-after-persist-retry',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(readGuestBearer()).toBe('guest-after-persist-retry');
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe('guest-after-persist-retry');
    expect(globalThis.dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it('prefers a newer Guest authority that becomes visible while the attempted bootstrap write fails', async () => {
    session.failGuestWrites = true;
    session.replacementOnFailure = 'guest-newer-authority';
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(guestBootstrapResponse('guest-stale-bootstrap'))));

    await expect(ensureGuestBearer()).resolves.toBe('guest-newer-authority');
    expect(readGuestBearer()).toBe('guest-newer-authority');
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe('guest-newer-authority');
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });
});
