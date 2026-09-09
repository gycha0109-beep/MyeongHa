import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PRODUCT_AUTH_STORAGE_V1,
  ensureGuestBearer,
  invalidateGuestSession,
  invalidateMemberSession,
  signInWithPassword,
} from '../apps/web/product-auth.js';

type RollbackMode = 'silent-noop' | 'mutate-then-throw' | null;

class FaultingStorage {
  private readonly values = new Map<string, string>();
  failReadAfterNextWriteKey: string | null = null;
  failReadAfterNextRemovalKey: string | null = null;
  throwAfterNextRemovalKey: string | null = null;
  rollbackMode: RollbackMode = null;
  private failNextReadKey: string | null = null;
  private rollbackArmedKey: string | null = null;

  getItem(key: string) {
    if (this.failNextReadKey === key) {
      this.failNextReadKey = null;
      this.rollbackArmedKey = key;
      throw new Error(`verification read blocked: ${key}`);
    }
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    const normalized = String(value);
    if (this.rollbackArmedKey === key && this.rollbackMode) {
      const mode = this.rollbackMode;
      this.rollbackArmedKey = null;
      this.rollbackMode = null;
      if (mode === 'silent-noop') return;
      this.values.set(key, normalized);
      throw new Error(`rollback set mutated then threw: ${key}`);
    }

    this.values.set(key, normalized);
    if (this.failReadAfterNextWriteKey === key) {
      this.failReadAfterNextWriteKey = null;
      this.failNextReadKey = key;
    }
  }

  removeItem(key: string) {
    if (this.rollbackArmedKey === key && this.rollbackMode) {
      const mode = this.rollbackMode;
      this.rollbackArmedKey = null;
      this.rollbackMode = null;
      if (mode === 'silent-noop') return;
      this.values.delete(key);
      throw new Error(`rollback remove mutated then threw: ${key}`);
    }

    this.values.delete(key);
    if (this.throwAfterNextRemovalKey === key) {
      this.throwAfterNextRemovalKey = null;
      this.rollbackArmedKey = key;
      throw new Error(`removal mutated then threw: ${key}`);
    }
    if (this.failReadAfterNextRemovalKey === key) {
      this.failReadAfterNextRemovalKey = null;
      this.failNextReadKey = key;
    }
  }

  clear() {
    this.values.clear();
    this.failNextReadKey = null;
    this.rollbackArmedKey = null;
  }

  peek(key: string) {
    return this.values.get(key) ?? null;
  }
}

const MEMBER_ACCESS = 'rollback.member.payload';
const MEMBER_SESSION = Object.freeze({
  accessToken: MEMBER_ACCESS,
  refreshToken: 'rollback-member-refresh',
  expiresAt: '2099-01-01T00:00:00.000Z',
  tokenType: 'bearer',
  user: Object.freeze({ id: 'auth-user-rollback', email: 'rollback@example.com' }),
});
const MEMBER_RAW = JSON.stringify(MEMBER_SESSION);
const GUEST_TOKEN = 'guest-rollback-readback';

function authenticatedResponse() {
  return Response.json({
    ok: true,
    data: {
      status: 'authenticated',
      session: MEMBER_SESSION,
    },
  });
}

function guestBootstrapResponse() {
  return Response.json({
    ok: true,
    data: {
      kind: 'guest',
      guestSession: {
        bearerToken: GUEST_TOKEN,
        expiresAt: '2099-01-01T00:00:00.000Z',
      },
    },
  });
}

let local: FaultingStorage;
let session: FaultingStorage;

beforeEach(() => {
  local = new FaultingStorage();
  session = new FaultingStorage();
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

describe('storage rollback read-back authority', () => {
  it('surfaces Member write rollback failure when rollback removal silently no-ops', async () => {
    local.failReadAfterNextWriteKey = PRODUCT_AUTH_STORAGE_V1.memberSession;
    local.rollbackMode = 'silent-noop';
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(authenticatedResponse())));

    await expect(signInWithPassword('rollback@example.com', 'password')).rejects.toMatchObject({
      code: 'WEB_AUTH_MEMBER_WRITE_ROLLBACK_FAILED',
    });
    expect(local.peek(PRODUCT_AUTH_STORAGE_V1.memberSession)).toBe(MEMBER_RAW);
    expect(session.peek(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBeNull();
    expect(session.peek(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBeNull();
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });

  it('accepts Member rollback mutation-then-throw only after exact read-back and preserves original read error', async () => {
    local.failReadAfterNextWriteKey = PRODUCT_AUTH_STORAGE_V1.memberSession;
    local.rollbackMode = 'mutate-then-throw';
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(authenticatedResponse())));

    await expect(signInWithPassword('rollback@example.com', 'password')).rejects.toMatchObject({
      code: 'WEB_AUTH_MEMBER_READ_FAILED',
    });
    expect(local.peek(PRODUCT_AUTH_STORAGE_V1.memberSession)).toBeNull();
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });

  it('surfaces Member clear rollback failure when removal mutates then throws and rollback silently no-ops', () => {
    local.setItem(PRODUCT_AUTH_STORAGE_V1.memberSession, MEMBER_RAW);
    session.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, MEMBER_ACCESS);
    local.throwAfterNextRemovalKey = PRODUCT_AUTH_STORAGE_V1.memberSession;
    local.rollbackMode = 'silent-noop';

    expect(() => invalidateMemberSession(MEMBER_ACCESS)).toThrowError(expect.objectContaining({
      code: 'WEB_AUTH_MEMBER_CLEAR_ROLLBACK_FAILED',
    }));
    expect(local.peek(PRODUCT_AUTH_STORAGE_V1.memberSession)).toBeNull();
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });

  it('treats Member clear rollback mutation-then-throw as restored only after exact read-back', () => {
    local.setItem(PRODUCT_AUTH_STORAGE_V1.memberSession, MEMBER_RAW);
    session.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, MEMBER_ACCESS);
    local.throwAfterNextRemovalKey = PRODUCT_AUTH_STORAGE_V1.memberSession;
    local.rollbackMode = 'mutate-then-throw';

    expect(invalidateMemberSession(MEMBER_ACCESS)).toBe(false);
    expect(local.peek(PRODUCT_AUTH_STORAGE_V1.memberSession)).toBe(MEMBER_RAW);
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });

  it('surfaces Guest write rollback failure when rollback removal silently no-ops', async () => {
    session.failReadAfterNextWriteKey = PRODUCT_AUTH_STORAGE_V1.guestBearer;
    session.rollbackMode = 'silent-noop';
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(guestBootstrapResponse())));

    await expect(ensureGuestBearer()).rejects.toMatchObject({
      code: 'WEB_AUTH_SESSION_WRITE_ROLLBACK_FAILED',
    });
    expect(session.peek(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(GUEST_TOKEN);
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });

  it('accepts Guest write rollback mutation-then-throw only after exact read-back and preserves original read error', async () => {
    session.failReadAfterNextWriteKey = PRODUCT_AUTH_STORAGE_V1.guestBearer;
    session.rollbackMode = 'mutate-then-throw';
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(guestBootstrapResponse())));

    await expect(ensureGuestBearer()).rejects.toMatchObject({
      code: 'WEB_AUTH_SESSION_READ_FAILED',
    });
    expect(session.peek(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBeNull();
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });

  it('surfaces Guest clear rollback failure while the outer snapshot restores the exact Guest lineage', () => {
    session.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, GUEST_TOKEN);
    session.failReadAfterNextRemovalKey = PRODUCT_AUTH_STORAGE_V1.guestBearer;
    session.rollbackMode = 'silent-noop';

    expect(() => invalidateGuestSession(GUEST_TOKEN)).toThrowError(expect.objectContaining({
      code: 'WEB_AUTH_SESSION_CLEAR_ROLLBACK_FAILED',
    }));
    expect(session.peek(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(GUEST_TOKEN);
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });

  it('accepts Guest clear rollback mutation-then-throw only after exact read-back and preserves original read error', () => {
    session.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, GUEST_TOKEN);
    session.failReadAfterNextRemovalKey = PRODUCT_AUTH_STORAGE_V1.guestBearer;
    session.rollbackMode = 'mutate-then-throw';

    expect(() => invalidateGuestSession(GUEST_TOKEN)).toThrowError(expect.objectContaining({
      code: 'WEB_AUTH_SESSION_READ_FAILED',
    }));
    expect(session.peek(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(GUEST_TOKEN);
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });
});
