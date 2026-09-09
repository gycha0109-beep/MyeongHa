import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PRODUCT_AUTH_STORAGE_V1,
  ProductAuthError,
  readGuestBearer,
  readMemberSession,
  refreshMemberSession,
  signInWithPassword,
  signUpWithPassword,
} from '../apps/web/product-auth.js';

class FaultingStorage {
  private readonly values = new Map<string, string>();
  private armedVerificationReadFailureKey: string | null = null;
  failMemberWrites = false;
  verificationReadFailureAfterWriteKey: string | null = null;

  getItem(key: string) {
    if (this.armedVerificationReadFailureKey === key) {
      this.armedVerificationReadFailureKey = null;
      throw new Error(`verification read blocked: ${key}`);
    }
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    if (this.failMemberWrites && key === PRODUCT_AUTH_STORAGE_V1.memberSession) {
      throw new Error('member persistence blocked');
    }
    this.values.set(key, String(value));
    if (this.verificationReadFailureAfterWriteKey === key) {
      this.verificationReadFailureAfterWriteKey = null;
      this.armedVerificationReadFailureKey = key;
    }
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }
}

const OLD_ACCESS = 'old.member.payload';
const NEW_ACCESS = 'new.member.payload';
const MEMBER_SESSION = Object.freeze({
  accessToken: NEW_ACCESS,
  refreshToken: 'refresh-new-member',
  expiresAt: '2099-01-01T00:00:00.000Z',
  tokenType: 'bearer',
  user: Object.freeze({ id: 'auth-user-persist', email: 'member@example.com' }),
});
const OLD_SESSION = Object.freeze({
  accessToken: OLD_ACCESS,
  refreshToken: 'refresh-old-member',
  expiresAt: '2099-01-01T00:00:00.000Z',
  tokenType: 'bearer',
  user: Object.freeze({ id: 'auth-user-persist', email: 'member@example.com' }),
});

function authenticatedResponse(session = MEMBER_SESSION) {
  return Response.json({
    ok: true,
    data: {
      status: 'authenticated',
      session,
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

    constructor(type: string) {
      this.type = type;
    }
  });
  vi.stubGlobal('dispatchEvent', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Member session persistence authority', () => {
  it('rejects sign-in success when the returned Member session cannot be persisted and preserves the Guest lineage', async () => {
    session.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, 'guest-before-sign-in');
    local.failMemberWrites = true;
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(authenticatedResponse())));

    await expect(signInWithPassword('member@example.com', 'password')).rejects.toMatchObject({
      name: 'ProductAuthError',
      code: 'WEB_AUTH_MEMBER_PERSIST_FAILED',
    } satisfies Partial<ProductAuthError>);

    expect(readMemberSession()).toBeNull();
    expect(readGuestBearer()).toBe('guest-before-sign-in');
    expect(session.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe('guest-before-sign-in');
    expect(session.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBeNull();
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });

  it('rejects authenticated sign-up when Member persistence fails instead of returning a false authenticated state', async () => {
    local.failMemberWrites = true;
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(authenticatedResponse())));

    await expect(signUpWithPassword('member@example.com', 'password')).rejects.toMatchObject({
      name: 'ProductAuthError',
      code: 'WEB_AUTH_MEMBER_PERSIST_FAILED',
    } satisfies Partial<ProductAuthError>);

    expect(readMemberSession()).toBeNull();
    expect(session.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBeNull();
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });

  it('preserves the previous Member generation when a refresh response cannot be persisted', async () => {
    local.setItem(PRODUCT_AUTH_STORAGE_V1.memberSession, JSON.stringify(OLD_SESSION));
    session.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, OLD_ACCESS);
    local.failMemberWrites = true;
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(authenticatedResponse(MEMBER_SESSION))));

    await expect(refreshMemberSession()).rejects.toMatchObject({
      name: 'ProductAuthError',
      code: 'WEB_AUTH_MEMBER_PERSIST_FAILED',
    } satisfies Partial<ProductAuthError>);

    expect(readMemberSession()?.accessToken).toBe(OLD_ACCESS);
    expect(session.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(OLD_ACCESS);
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });

  it('rolls back a newly written Member and staged Guest lineage when Member verification read fails after the write', async () => {
    session.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, 'guest-before-read-fault');
    local.verificationReadFailureAfterWriteKey = PRODUCT_AUTH_STORAGE_V1.memberSession;
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(authenticatedResponse())));

    await expect(signInWithPassword('member@example.com', 'password')).rejects.toMatchObject({
      name: 'ProductAuthError',
      code: 'WEB_AUTH_MEMBER_READ_FAILED',
    } satisfies Partial<ProductAuthError>);

    expect(readMemberSession()).toBeNull();
    expect(readGuestBearer()).toBe('guest-before-read-fault');
    expect(session.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe('guest-before-read-fault');
    expect(session.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBeNull();
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });

  it('restores the previous Member generation when refresh write succeeds but its verification read fails', async () => {
    local.setItem(PRODUCT_AUTH_STORAGE_V1.memberSession, JSON.stringify(OLD_SESSION));
    session.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, OLD_ACCESS);
    local.verificationReadFailureAfterWriteKey = PRODUCT_AUTH_STORAGE_V1.memberSession;
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(authenticatedResponse(MEMBER_SESSION))));

    await expect(refreshMemberSession()).rejects.toMatchObject({
      name: 'ProductAuthError',
      code: 'WEB_AUTH_MEMBER_READ_FAILED',
    } satisfies Partial<ProductAuthError>);

    expect(readMemberSession()).toMatchObject({
      accessToken: OLD_ACCESS,
      refreshToken: OLD_SESSION.refreshToken,
    });
    expect(session.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(OLD_ACCESS);
    expect(session.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBeNull();
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });

  it('rolls back Member compatibility staging when a sessionStorage write succeeds but verification read fails', async () => {
    session.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, 'guest-before-compat-read-fault');
    session.verificationReadFailureAfterWriteKey = PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer;
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(authenticatedResponse())));

    await expect(signInWithPassword('member@example.com', 'password')).rejects.toMatchObject({
      name: 'ProductAuthError',
      code: 'WEB_AUTH_SESSION_READ_FAILED',
    } satisfies Partial<ProductAuthError>);

    expect(readMemberSession()).toBeNull();
    expect(readGuestBearer()).toBe('guest-before-compat-read-fault');
    expect(session.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe('guest-before-compat-read-fault');
    expect(session.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBeNull();
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });
});
