import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PRODUCT_AUTH_STORAGE_V1,
  clearPromotedGuestBearer,
  ensureGuestBearer,
  invalidateGuestSession,
  invalidateMemberSession,
  signInWithPassword,
} from '../apps/web/product-auth.js';

class CoordinatedStorage {
  private readonly values = new Map<string, string>();
  failNextReadKey: string | null = null;
  onSet: ((key: string, value: string) => void) | null = null;
  onRemove: ((key: string) => void) | null = null;

  getItem(key: string) {
    if (this.failNextReadKey === key) {
      this.failNextReadKey = null;
      throw new Error(`verification read blocked: ${key}`);
    }
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    const normalized = String(value);
    this.values.set(key, normalized);
    this.onSet?.(key, normalized);
  }

  removeItem(key: string) {
    this.values.delete(key);
    this.onRemove?.(key);
  }

  clear() {
    this.values.clear();
    this.failNextReadKey = null;
    this.onSet = null;
    this.onRemove = null;
  }

  setRaw(key: string, value: string) {
    this.values.set(key, value);
  }

  removeRaw(key: string) {
    this.values.delete(key);
  }

  peek(key: string) {
    return this.values.get(key) ?? null;
  }
}

const MEMBER_ACCESS = 'member.rollback.token';
const MEMBER_SESSION = Object.freeze({
  accessToken: MEMBER_ACCESS,
  refreshToken: 'member-refresh-token',
  expiresAt: '2099-01-01T00:00:00.000Z',
  tokenType: 'bearer',
  user: Object.freeze({ id: 'auth-user-guest-rollback', email: 'guest-rollback@example.com' }),
});
const MEMBER_RAW = JSON.stringify(MEMBER_SESSION);
const BOOTSTRAP_GUEST = 'guest-bootstrap-token';
const OLD_GUEST = 'guest-before-member';
const PENDING_GUEST = 'guest-pending-lineage';
const REPLACEMENT_GUEST = 'guest-newer-replacement';

function authenticatedResponse() {
  return Response.json({
    ok: true,
    data: { status: 'authenticated', session: MEMBER_SESSION },
  });
}

function guestBootstrapResponse() {
  return Response.json({
    ok: true,
    data: {
      kind: 'guest',
      guestSession: {
        bearerToken: BOOTSTRAP_GUEST,
        expiresAt: '2099-01-01T00:00:00.000Z',
      },
    },
  });
}

let local: CoordinatedStorage;
let session: CoordinatedStorage;

beforeEach(() => {
  local = new CoordinatedStorage();
  session = new CoordinatedStorage();
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

describe('Guest session rollback replacement preservation', () => {
  it('preserves a newer Guest replacement after a write verification read fault', async () => {
    session.onSet = (key, value) => {
      if (key !== PRODUCT_AUTH_STORAGE_V1.guestBearer || value !== BOOTSTRAP_GUEST) return;
      session.onSet = null;
      session.setRaw(key, REPLACEMENT_GUEST);
      session.failNextReadKey = key;
    };
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(guestBootstrapResponse())));

    await expect(ensureGuestBearer()).rejects.toMatchObject({ code: 'WEB_AUTH_SESSION_READ_FAILED' });
    expect(session.peek(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(REPLACEMENT_GUEST);
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });

  it('preserves a newer Guest replacement after a removal verification read fault', () => {
    session.setRaw(PRODUCT_AUTH_STORAGE_V1.guestBearer, OLD_GUEST);
    session.onRemove = (key) => {
      if (key !== PRODUCT_AUTH_STORAGE_V1.guestBearer) return;
      session.onRemove = null;
      session.setRaw(key, REPLACEMENT_GUEST);
      session.failNextReadKey = key;
    };

    expect(() => invalidateGuestSession(OLD_GUEST)).toThrowError(expect.objectContaining({
      code: 'WEB_AUTH_SESSION_READ_FAILED',
    }));
    expect(session.peek(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(REPLACEMENT_GUEST);
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });

  it('restores earlier removed Guest lineage while preserving a replacement on a later multi-key clear', () => {
    session.setRaw(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer, PENDING_GUEST);
    session.setRaw(PRODUCT_AUTH_STORAGE_V1.guestBearer, OLD_GUEST);
    session.onRemove = (key) => {
      if (key !== PRODUCT_AUTH_STORAGE_V1.guestBearer) return;
      session.onRemove = null;
      session.setRaw(key, REPLACEMENT_GUEST);
    };

    expect(() => clearPromotedGuestBearer()).toThrowError(expect.objectContaining({
      code: 'WEB_AUTH_GUEST_CLEAR_FAILED',
    }));
    expect(session.peek(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBe(PENDING_GUEST);
    expect(session.peek(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(REPLACEMENT_GUEST);
  });

  it('does not overwrite a newer Guest replacement when Member persistence rolls back compatibility staging', async () => {
    session.setRaw(PRODUCT_AUTH_STORAGE_V1.guestBearer, OLD_GUEST);
    local.onSet = (key) => {
      if (key !== PRODUCT_AUTH_STORAGE_V1.memberSession) return;
      local.onSet = null;
      local.removeRaw(key);
      session.setRaw(PRODUCT_AUTH_STORAGE_V1.guestBearer, REPLACEMENT_GUEST);
    };
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(authenticatedResponse())));

    await expect(signInWithPassword('guest-rollback@example.com', 'password')).rejects.toMatchObject({
      code: 'WEB_AUTH_MEMBER_PERSIST_FAILED',
    });
    expect(local.peek(PRODUCT_AUTH_STORAGE_V1.memberSession)).toBeNull();
    expect(session.peek(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(REPLACEMENT_GUEST);
    expect(session.peek(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBeNull();
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });

  it('preserves a newer Guest replacement during Member discard compatibility rollback', () => {
    local.setRaw(PRODUCT_AUTH_STORAGE_V1.memberSession, MEMBER_RAW);
    session.setRaw(PRODUCT_AUTH_STORAGE_V1.guestBearer, MEMBER_ACCESS);
    session.setRaw(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer, PENDING_GUEST);
    session.onRemove = (key) => {
      if (key !== PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer) return;
      session.onRemove = null;
      session.setRaw(key, PENDING_GUEST);
      session.setRaw(PRODUCT_AUTH_STORAGE_V1.guestBearer, REPLACEMENT_GUEST);
    };

    expect(invalidateMemberSession(MEMBER_ACCESS)).toBe(false);
    expect(local.peek(PRODUCT_AUTH_STORAGE_V1.memberSession)).toBe(MEMBER_RAW);
    expect(session.peek(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(REPLACEMENT_GUEST);
    expect(session.peek(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBe(PENDING_GUEST);
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });
});
