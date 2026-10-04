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

const user = Object.freeze({
  id: '11111111-1111-4111-8111-111111111111',
  email: 'member@example.com',
});

function legacySession() {
  return {
    accessToken: 'legacy.header.signature',
    refreshToken: 'legacy-long-lived-refresh-token',
    expiresAt: new Date(Date.now() + 30_000).toISOString(),
    tokenType: 'bearer',
    user,
  };
}

function currentSession() {
  return {
    accessToken: 'current.header.signature',
    expiresAt: new Date(Date.now() + 30_000).toISOString(),
    tokenType: 'bearer',
    user,
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
  vi.stubGlobal('sessionStorage', new MemoryStorage());
  vi.stubGlobal('CustomEvent', class {
    readonly type: string;
    constructor(type: string) { this.type = type; }
  });
  vi.stubGlobal('dispatchEvent', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Web Member refresh credential boundary', () => {
  it('removes a legacy refresh credential from localStorage on first member-session read', () => {
    localStorage.setItem(
      PRODUCT_AUTH_STORAGE_V1.memberSession,
      JSON.stringify(legacySession()),
    );

    const observed = readMemberSession();
    const persisted = JSON.parse(
      localStorage.getItem(PRODUCT_AUTH_STORAGE_V1.memberSession) ?? 'null',
    );

    expect(observed).toMatchObject({
      accessToken: 'legacy.header.signature',
      user,
    });
    expect(observed).not.toHaveProperty('refreshToken');
    expect(persisted).toMatchObject({
      accessToken: 'legacy.header.signature',
      user,
    });
    expect(persisted).not.toHaveProperty('refreshToken');
    expect(
      localStorage.getItem(PRODUCT_AUTH_STORAGE_V1.memberSession),
    ).not.toContain('legacy-long-lived-refresh-token');
  });

  it('refreshes through the web cookie transport without a JavaScript refresh credential', async () => {
    localStorage.setItem(
      PRODUCT_AUTH_STORAGE_V1.memberSession,
      JSON.stringify(currentSession()),
    );

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('x-myeongha-auth-transport')).toBe('web-cookie-v1');
      expect(init?.credentials).toBe('same-origin');
      expect(init?.body).toBe('{}');

      return Response.json({
        ok: true,
        data: {
          status: 'authenticated',
          session: {
            accessToken: 'rotated.header.signature',
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            tokenType: 'bearer',
            user,
          },
        },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const refreshed = await refreshMemberSession();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refreshed).toMatchObject({
      accessToken: 'rotated.header.signature',
      user,
    });
    expect(refreshed).not.toHaveProperty('refreshToken');
    expect(
      localStorage.getItem(PRODUCT_AUTH_STORAGE_V1.memberSession),
    ).not.toContain('refreshToken');
  });
});
