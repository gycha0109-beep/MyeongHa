import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PRODUCT_AUTH_STORAGE_V1,
  invalidateMemberSession,
  readMemberSession,
  refreshMemberSession,
} from '../apps/web/product-auth.js';

type MemberFaultMode =
  | 'write-replacement'
  | 'write-read-error-replacement'
  | 'remove-throw-replacement'
  | 'remove-read-error-replacement'
  | 'compat-rollback-replacement'
  | null;

class MemberFaultStorage {
  private readonly values = new Map<string, string>();
  mode: MemberFaultMode = null;
  replacementRaw: string | null = null;
  private writeReadArmed = false;
  private removalReadArmed = false;
  private memberRemoved = false;
  private postRemovalReads = 0;

  getItem(key: string) {
    if (key === PRODUCT_AUTH_STORAGE_V1.memberSession) {
      if (this.writeReadArmed) {
        this.writeReadArmed = false;
        if (this.replacementRaw !== null) this.values.set(key, this.replacementRaw);
        if (this.mode === 'write-read-error-replacement') {
          this.mode = null;
          throw new Error('member write verification read blocked');
        }
        this.mode = null;
      }

      if (this.removalReadArmed) {
        this.removalReadArmed = false;
        if (this.replacementRaw !== null) this.values.set(key, this.replacementRaw);
        this.mode = null;
        throw new Error('member removal verification read blocked');
      }

      if (this.memberRemoved && this.mode === 'compat-rollback-replacement') {
        this.postRemovalReads += 1;
        if (this.postRemovalReads === 2 && this.replacementRaw !== null) {
          this.values.set(key, this.replacementRaw);
          this.mode = null;
        }
      }
    }
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
    if (
      key === PRODUCT_AUTH_STORAGE_V1.memberSession &&
      (this.mode === 'write-replacement' || this.mode === 'write-read-error-replacement')
    ) {
      this.writeReadArmed = true;
    }
  }

  removeItem(key: string) {
    if (key === PRODUCT_AUTH_STORAGE_V1.memberSession) {
      if (this.mode === 'remove-throw-replacement') {
        this.values.delete(key);
        if (this.replacementRaw !== null) this.values.set(key, this.replacementRaw);
        this.mode = null;
        throw new Error('member removal mutated then replacement won');
      }
      this.values.delete(key);
      this.memberRemoved = true;
      this.postRemovalReads = 0;
      if (this.mode === 'remove-read-error-replacement') this.removalReadArmed = true;
      return;
    }
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
    this.mode = null;
    this.replacementRaw = null;
    this.writeReadArmed = false;
    this.removalReadArmed = false;
    this.memberRemoved = false;
    this.postRemovalReads = 0;
  }

  peek(key: string) {
    return this.values.get(key) ?? null;
  }
}

class SessionFaultStorage {
  private readonly values = new Map<string, string>();
  noOpPendingRemoval = false;

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }

  removeItem(key: string) {
    if (this.noOpPendingRemoval && key === PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer) return;
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
    this.noOpPendingRemoval = false;
  }

  peek(key: string) {
    return this.values.get(key) ?? null;
  }
}

const OLD_ACCESS = 'old.member.payload';
const NEW_ACCESS = 'new.member.payload';
const REPLACEMENT_ACCESS = 'replacement.member.payload';
const PENDING_GUEST = 'guest-before-member';

const OLD_SESSION = Object.freeze({
  accessToken: OLD_ACCESS,
  refreshToken: 'old-member-refresh',
  expiresAt: '2099-01-01T00:00:00.000Z',
  tokenType: 'bearer',
  user: Object.freeze({ id: 'auth-user-member-race', email: 'member-race@example.com' }),
});
const NEW_SESSION = Object.freeze({
  ...OLD_SESSION,
  accessToken: NEW_ACCESS,
  refreshToken: 'new-member-refresh',
  expiresAt: '2099-01-02T00:00:00.000Z',
});
const REPLACEMENT_SESSION = Object.freeze({
  ...OLD_SESSION,
  accessToken: REPLACEMENT_ACCESS,
  refreshToken: 'replacement-member-refresh',
  expiresAt: '2099-01-03T00:00:00.000Z',
});
const OLD_RAW = JSON.stringify(OLD_SESSION);
const REPLACEMENT_RAW = JSON.stringify(REPLACEMENT_SESSION);

function refreshSuccessResponse() {
  return Response.json({
    ok: true,
    data: { status: 'authenticated', session: NEW_SESSION },
  });
}

let local: MemberFaultStorage;
let session: SessionFaultStorage;

function seedOldMember() {
  local.setItem(PRODUCT_AUTH_STORAGE_V1.memberSession, OLD_RAW);
  session.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, OLD_ACCESS);
  session.setItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer, PENDING_GUEST);
}

beforeEach(() => {
  local = new MemberFaultStorage();
  session = new SessionFaultStorage();
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

describe('Member localStorage rollback replacement preservation', () => {
  it('preserves a newer Member replacement observed during write verification', async () => {
    seedOldMember();
    local.replacementRaw = REPLACEMENT_RAW;
    local.mode = 'write-replacement';
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(refreshSuccessResponse())));

    await expect(refreshMemberSession()).rejects.toMatchObject({ code: 'WEB_AUTH_MEMBER_PERSIST_FAILED' });

    expect(readMemberSession()).toMatchObject({
      accessToken: REPLACEMENT_ACCESS,
      refreshToken: REPLACEMENT_SESSION.refreshToken,
    });
    expect(session.peek(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(OLD_ACCESS);
    expect(session.peek(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBe(PENDING_GUEST);
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });

  it('preserves a newer Member replacement that wins after a write verification read fault', async () => {
    seedOldMember();
    local.replacementRaw = REPLACEMENT_RAW;
    local.mode = 'write-read-error-replacement';
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(refreshSuccessResponse())));

    await expect(refreshMemberSession()).rejects.toMatchObject({ code: 'WEB_AUTH_MEMBER_READ_FAILED' });

    expect(readMemberSession()?.accessToken).toBe(REPLACEMENT_ACCESS);
    expect(session.peek(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(OLD_ACCESS);
    expect(session.peek(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBe(PENDING_GUEST);
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });

  it('preserves a newer Member replacement when removal mutates then throws', () => {
    seedOldMember();
    local.replacementRaw = REPLACEMENT_RAW;
    local.mode = 'remove-throw-replacement';

    expect(invalidateMemberSession(OLD_ACCESS)).toBe(false);

    expect(readMemberSession()?.accessToken).toBe(REPLACEMENT_ACCESS);
    expect(session.peek(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(OLD_ACCESS);
    expect(session.peek(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBe(PENDING_GUEST);
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });

  it('preserves a newer Member replacement that wins after a removal verification read fault', () => {
    seedOldMember();
    local.replacementRaw = REPLACEMENT_RAW;
    local.mode = 'remove-read-error-replacement';

    expect(() => invalidateMemberSession(OLD_ACCESS)).toThrowError(expect.objectContaining({
      code: 'WEB_AUTH_MEMBER_READ_FAILED',
    }));

    expect(readMemberSession()?.accessToken).toBe(REPLACEMENT_ACCESS);
    expect(session.peek(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(OLD_ACCESS);
    expect(session.peek(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBe(PENDING_GUEST);
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });

  it('does not resurrect the previous Member when compatibility rollback sees a newer replacement', () => {
    seedOldMember();
    local.replacementRaw = REPLACEMENT_RAW;
    local.mode = 'compat-rollback-replacement';
    session.noOpPendingRemoval = true;

    expect(invalidateMemberSession(OLD_ACCESS)).toBe(false);

    expect(readMemberSession()?.accessToken).toBe(REPLACEMENT_ACCESS);
    expect(session.peek(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(OLD_ACCESS);
    expect(session.peek(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBe(PENDING_GUEST);
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });
});
