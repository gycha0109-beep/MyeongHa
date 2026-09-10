import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PRODUCT_AUTH_STORAGE_V1,
  readMemberSession,
  refreshMemberSession,
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

class GatedLockManager {
  requestedName: string | null = null;
  private requestedResolve!: () => void;
  readonly requested = new Promise<void>((resolve) => {
    this.requestedResolve = resolve;
  });
  private releaseResolve!: () => void;
  private readonly gate = new Promise<void>((resolve) => {
    this.releaseResolve = resolve;
  });

  request<T>(name: string, _options: { mode: string }, callback: () => T | Promise<T>) {
    this.requestedName = name;
    this.requestedResolve();
    return this.gate.then(callback);
  }

  release() {
    this.releaseResolve();
  }
}

const member = Object.freeze({
  id: '11111111-1111-4111-8111-111111111111',
  email: 'refresh-race@example.com',
});

function memberSession(accessToken: string, refreshToken: string) {
  return Object.freeze({
    accessToken,
    refreshToken,
    expiresAt: '2099-01-01T00:00:00.000Z',
    tokenType: 'bearer',
    user: member,
  });
}

function seed(session: ReturnType<typeof memberSession>) {
  localStorage.setItem(PRODUCT_AUTH_STORAGE_V1.memberSession, JSON.stringify(session));
  sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, session.accessToken);
  sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer, 'guest-before-member');
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
  vi.stubGlobal('sessionStorage', new MemoryStorage());
  vi.stubGlobal('CustomEvent', class {
    constructor(readonly type: string) {}
  });
  vi.stubGlobal('dispatchEvent', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Member successful refresh commit authority', () => {
  it('preserves a newer Member generation that appears while the stale refresh commit is waiting for the lock', async () => {
    const original = memberSession('old.header.signature', 'refresh-old');
    const staleRefresh = memberSession('stale.header.signature', 'refresh-stale');
    const newer = memberSession('newer.header.signature', 'refresh-newer');
    seed(original);

    const locks = new GatedLockManager();
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('navigator', { locks });
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      ok: true,
      data: { status: 'authenticated', session: staleRefresh },
    }, { status: 200 })));

    const refresh = refreshMemberSession();
    await locks.requested;

    expect(locks.requestedName).toBe('myeongha.memberSession.v1.refresh.lock');
    expect(readMemberSession()).toMatchObject({ accessToken: original.accessToken });

    seed(newer);
    locks.release();

    await expect(refresh).resolves.toMatchObject({
      accessToken: newer.accessToken,
      refreshToken: newer.refreshToken,
    });
    expect(readMemberSession()).toMatchObject({
      accessToken: newer.accessToken,
      refreshToken: newer.refreshToken,
    });
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(newer.accessToken);
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBe('guest-before-member');
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });
});
