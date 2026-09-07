import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PRODUCT_AUTH_STORAGE_V1,
  ensureActiveBearer,
  ensureGuestBearer,
  readGuestBearer,
  readMemberSession,
  signInWithPassword,
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

const MEMBER_ACCESS = 'member.header.payload';
const MEMBER_SESSION = Object.freeze({
  accessToken: MEMBER_ACCESS,
  refreshToken: 'refresh-member-wins',
  expiresAt: '2099-01-01T00:00:00.000Z',
  tokenType: 'bearer',
  user: Object.freeze({ id: 'auth-user-member-wins', email: 'member@example.com' }),
});

function guestBootstrapResponse(token = 'guest-stale-after-member') {
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

function signInResponse() {
  return Response.json({
    ok: true,
    data: {
      status: 'authenticated',
      session: MEMBER_SESSION,
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

describe('Member authority wins an in-flight Guest bootstrap', () => {
  it('converges an active-bearer caller to a Member session that appears before Guest bootstrap settles', async () => {
    let resolveBootstrap!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
      resolveBootstrap = resolve;
    }));
    vi.stubGlobal('fetch', fetchMock);

    const pendingActive = ensureActiveBearer();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    localStorage.setItem(PRODUCT_AUTH_STORAGE_V1.memberSession, JSON.stringify(MEMBER_SESSION));
    resolveBootstrap(guestBootstrapResponse());

    await expect(pendingActive).resolves.toEqual({ kind: 'member', token: MEMBER_ACCESS });
    expect(readMemberSession()?.accessToken).toBe(MEMBER_ACCESS);
    expect(readGuestBearer()).toBeNull();
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(MEMBER_ACCESS);
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBeNull();
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });

  it('does not let a late Guest bootstrap overwrite a Member session saved by production sign-in', async () => {
    let resolveBootstrap!: (response: Response) => void;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const endpoint = String(input);
      if (endpoint === '/api/session/bootstrap') {
        return new Promise<Response>((resolve) => {
          resolveBootstrap = resolve;
        });
      }
      if (endpoint === '/api/auth/sign-in') return Promise.resolve(signInResponse());
      throw new Error(`Unexpected endpoint: ${endpoint}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const pendingActive = ensureActiveBearer();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/session/bootstrap', expect.any(Object)));

    await expect(signInWithPassword('member@example.com', 'password')).resolves.toMatchObject({
      accessToken: MEMBER_ACCESS,
    });
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(MEMBER_ACCESS);

    resolveBootstrap(guestBootstrapResponse('guest-must-not-overwrite-member'));

    await expect(pendingActive).resolves.toEqual({ kind: 'member', token: MEMBER_ACCESS });
    expect(readGuestBearer()).toBeNull();
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(MEMBER_ACCESS);
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBeNull();
    expect(globalThis.dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it('does not start a direct Guest bootstrap when a Member session is already authoritative', async () => {
    localStorage.setItem(PRODUCT_AUTH_STORAGE_V1.memberSession, JSON.stringify(MEMBER_SESSION));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(ensureGuestBearer()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(readGuestBearer()).toBeNull();
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBeNull();
  });
});
