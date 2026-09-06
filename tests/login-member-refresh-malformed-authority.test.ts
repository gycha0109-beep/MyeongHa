import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PRODUCT_AUTH_STORAGE_V1,
  ensureActiveBearer,
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

const member = Object.freeze({
  id: '99999999-9999-4999-8999-999999999999',
  email: 'malformed-refresh-member@example.com',
});

function session(expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()) {
  return {
    accessToken: 'malformed.member.signature',
    refreshToken: 'malformed-refresh-token',
    expiresAt,
    tokenType: 'bearer',
    user: member,
  };
}

function seedMember(value = session()) {
  localStorage.setItem(PRODUCT_AUTH_STORAGE_V1.memberSession, JSON.stringify(value));
  sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, value.accessToken);
  sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer, 'staged-guest-before-malformed-refresh');
}

function malformedJsonResponse() {
  return new Response('{"ok":true,"data":', {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function malformedSessionResponse() {
  return Response.json({
    ok: true,
    data: {
      status: 'authenticated',
      session: {
        accessToken: '',
        refreshToken: 'invalid-refresh-token',
        expiresAt: 'not-a-date',
        tokenType: 'bearer',
        user: member,
      },
    },
  });
}

function expectMemberAuthorityPreserved(expectedAccessToken: string) {
  expect(readMemberSession()).toMatchObject({
    accessToken: expectedAccessToken,
    refreshToken: 'malformed-refresh-token',
    user: member,
  });
  expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(expectedAccessToken);
  expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBe('staged-guest-before-malformed-refresh');
  expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
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

describe('Malformed Member refresh authority', () => {
  it('preserves Member credentials when refresh returns malformed JSON', async () => {
    const current = session();
    seedMember(current);
    vi.stubGlobal('fetch', vi.fn(async () => malformedJsonResponse()));

    await expect(refreshMemberSession()).rejects.toMatchObject({ code: 'WEB_AUTH_MALFORMED_RESPONSE' });

    expectMemberAuthorityPreserved(current.accessToken);
  });

  it('preserves Member credentials when refresh returns an authenticated status with a malformed session', async () => {
    const current = session();
    seedMember(current);
    vi.stubGlobal('fetch', vi.fn(async () => malformedSessionResponse()));

    await expect(refreshMemberSession()).rejects.toMatchObject({ code: 'WEB_AUTH_MALFORMED_SESSION' });

    expectMemberAuthorityPreserved(current.accessToken);
  });

  it('does not downgrade an expired recoverable Member to Guest after malformed JSON', async () => {
    const current = session(new Date(Date.now() - 5_000).toISOString());
    seedMember(current);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/auth/refresh') return malformedJsonResponse();
      return Response.json({ ok: true, data: { kind: 'guest', guestSession: { bearerToken: 'unexpected-guest' } } });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(ensureActiveBearer()).rejects.toMatchObject({ code: 'WEB_AUTH_MALFORMED_RESPONSE' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expectMemberAuthorityPreserved(current.accessToken);
  });

  it('does not downgrade an expired recoverable Member to Guest after a malformed refreshed session', async () => {
    const current = session(new Date(Date.now() - 5_000).toISOString());
    seedMember(current);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/auth/refresh') return malformedSessionResponse();
      return Response.json({ ok: true, data: { kind: 'guest', guestSession: { bearerToken: 'unexpected-guest' } } });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(ensureActiveBearer()).rejects.toMatchObject({ code: 'WEB_AUTH_MALFORMED_SESSION' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expectMemberAuthorityPreserved(current.accessToken);
  });
});
