import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PRODUCT_AUTH_STORAGE_V1,
  getMemberAccessToken,
  readMemberSession,
  refreshMemberSession,
  signInWithPassword,
} from '../apps/web/product-auth.js';

class FailingStorage {
  private readonly values = new Map<string, string>();
  readonly failSet = new Set<string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    if (this.failSet.has(key)) throw new Error(`set blocked: ${key}`);
    this.values.set(key, String(value));
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }
}

const currentSession = Object.freeze({
  accessToken: 'current.member.signature',
  refreshToken: 'refresh-current',
  expiresAt: '2099-01-01T00:00:00.000Z',
  tokenType: 'bearer',
  user: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'member@example.com',
  },
});

const rotatedSession = Object.freeze({
  ...currentSession,
  accessToken: 'rotated.member.signature',
  refreshToken: 'refresh-rotated',
  expiresAt: '2099-01-02T00:00:00.000Z',
});

let local: FailingStorage;
let session: FailingStorage;

function success(data: unknown) {
  return Response.json({ ok: true, data });
}

function seedMember() {
  local.setItem(PRODUCT_AUTH_STORAGE_V1.memberSession, JSON.stringify(currentSession));
  session.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, currentSession.accessToken);
  session.setItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer, 'guest-before-member');
}

beforeEach(() => {
  local = new FailingStorage();
  session = new FailingStorage();
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

describe('Member compatibility sessionStorage staging persistence', () => {
  it('does not establish Member authority when the pre-login Guest cannot be preserved as pending', async () => {
    session.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, 'guest-before-member');
    session.failSet.add(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer);
    vi.stubGlobal('fetch', vi.fn(async () => success({
      status: 'authenticated',
      session: currentSession,
    })));

    await expect(signInWithPassword('member@example.com', 'password')).rejects.toMatchObject({
      code: 'WEB_AUTH_MEMBER_COMPAT_PERSIST_FAILED',
    });

    expect(readMemberSession()).toBeNull();
    expect(session.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe('guest-before-member');
    expect(session.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBeNull();
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });

  it('fails closed when an existing Member cannot reconcile a stale compatibility bearer', async () => {
    seedMember();
    session.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, 'stale.member.signature');
    session.failSet.add(PRODUCT_AUTH_STORAGE_V1.guestBearer);

    await expect(getMemberAccessToken()).rejects.toMatchObject({
      code: 'WEB_AUTH_MEMBER_COMPAT_PERSIST_FAILED',
    });

    expect(readMemberSession()).toMatchObject({
      accessToken: currentSession.accessToken,
      refreshToken: currentSession.refreshToken,
    });
    expect(session.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe('stale.member.signature');
    expect(session.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBe('guest-before-member');
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });

  it('keeps the previous Member generation when refresh compatibility staging cannot rotate', async () => {
    seedMember();
    session.failSet.add(PRODUCT_AUTH_STORAGE_V1.guestBearer);
    vi.stubGlobal('fetch', vi.fn(async () => success({
      status: 'authenticated',
      session: rotatedSession,
    })));

    await expect(refreshMemberSession()).rejects.toMatchObject({
      code: 'WEB_AUTH_MEMBER_COMPAT_PERSIST_FAILED',
    });

    expect(readMemberSession()).toMatchObject({
      accessToken: currentSession.accessToken,
      refreshToken: currentSession.refreshToken,
    });
    expect(session.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(currentSession.accessToken);
    expect(session.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBe('guest-before-member');
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });
});