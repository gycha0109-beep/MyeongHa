import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PRODUCT_AUTH_STORAGE_V1,
  ensureActiveBearer,
  ensureGuestBearer,
  readGuestBearer,
} from '../apps/web/product-auth.js';

class FaultingStorage {
  protected readonly values = new Map<string, string>();
  readonly failReads = new Set<string>();

  getItem(key: string) {
    if (this.failReads.has(key)) throw new Error(`read blocked: ${key}`);
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

const memberAccessToken = 'member.read.token';
const memberSession = JSON.stringify({
  accessToken: memberAccessToken,
  refreshToken: 'refresh-read-authority',
  expiresAt: '2099-01-01T00:00:00.000Z',
  tokenType: 'bearer',
  user: { id: 'auth-user-read', email: 'read@example.com' },
});

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

describe('Browser auth storage read authority', () => {
  it('does not downgrade an unreadable stored Member to Guest authority', async () => {
    localStorage.setItem(PRODUCT_AUTH_STORAGE_V1.memberSession, memberSession);
    local.failReads.add(PRODUCT_AUTH_STORAGE_V1.memberSession);
    const fetchMock = vi.fn(() => Promise.resolve(guestBootstrapResponse('guest-must-not-bootstrap')));
    vi.stubGlobal('fetch', fetchMock);

    await expect(ensureActiveBearer()).rejects.toMatchObject({
      code: 'WEB_AUTH_MEMBER_READ_FAILED',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();

    local.failReads.clear();
    await expect(ensureActiveBearer()).resolves.toEqual({
      kind: 'member',
      token: memberAccessToken,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(PRODUCT_AUTH_STORAGE_V1.memberSession)).toBe(memberSession);
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(memberAccessToken);
  });

  it('fails closed when Guest session storage is unreadable instead of falling through to another credential', () => {
    sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, 'guest-read-existing');
    session.failReads.add(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer);

    expect(() => readGuestBearer()).toThrowError(expect.objectContaining({
      code: 'WEB_AUTH_SESSION_READ_FAILED',
    }));
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();

    session.failReads.clear();
    expect(readGuestBearer()).toBe('guest-read-existing');
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe('guest-read-existing');
  });

  it('does not start Guest bootstrap while session authority is unreadable and recovers with one transport', async () => {
    session.failReads.add(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer);
    const fetchMock = vi.fn(() => Promise.resolve(guestBootstrapResponse('guest-after-read-recovery')));
    vi.stubGlobal('fetch', fetchMock);

    await expect(ensureGuestBearer()).rejects.toMatchObject({
      code: 'WEB_AUTH_SESSION_READ_FAILED',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();

    session.failReads.clear();
    await expect(ensureGuestBearer()).resolves.toBe('guest-after-read-recovery');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe('guest-after-read-recovery');
    expect(globalThis.dispatchEvent).toHaveBeenCalledTimes(1);
  });
});