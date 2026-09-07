import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBirthRuntimeClient } from '../apps/web/birth-runtime-client.js';
import { createMyRuntimeClient } from '../apps/web/my-runtime-client.js';
import {
  PRODUCT_AUTH_STORAGE_V1,
  getMemberAccessToken,
  invalidateMemberSession,
  readGuestBearer,
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

  clear() {
    this.values.clear();
  }
}

const oldMember = Object.freeze({
  accessToken: 'old.header.signature',
  refreshToken: 'old-refresh-token',
  expiresAt: new Date(Date.now() + 30_000).toISOString(),
  tokenType: 'bearer',
  user: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'member@example.com',
  },
});

const rotatedMember = Object.freeze({
  ...oldMember,
  accessToken: 'new.header.signature',
  refreshToken: 'new-refresh-token',
  expiresAt: '2099-01-02T00:00:00.000Z',
});

const staleRefreshResult = Object.freeze({
  ...oldMember,
  accessToken: 'stale.header.signature',
  refreshToken: 'stale-refresh-token',
  expiresAt: '2099-01-03T00:00:00.000Z',
});

function seedMember(session = oldMember, pendingGuest: string | null = null) {
  localStorage.setItem(PRODUCT_AUTH_STORAGE_V1.memberSession, JSON.stringify(session));
  sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, session.accessToken);
  if (pendingGuest === null) {
    sessionStorage.removeItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer);
  } else {
    sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer, pendingGuest);
  }
}

function authErrorResponse(code: string, status: number) {
  return Response.json({
    ok: false,
    error: {
      code,
      messageKey: `auth.${code.toLowerCase()}`,
      retryable: status >= 500,
    },
  }, { status });
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

describe('exact rejected bearer invalidation', () => {
  it('preserves a rotated Member when an older My request returns 401', async () => {
    seedMember(oldMember);
    const client = createMyRuntimeClient({
      resolveBearer: async () => ({ kind: 'member' as const, token: oldMember.accessToken }),
      fetchImpl: vi.fn(async () => {
        seedMember(rotatedMember);
        return authErrorResponse('AUTH_REQUIRED', 401);
      }),
    });

    await expect(client.readProfile()).rejects.toMatchObject({ code: 'WEB_MY_SESSION_REQUIRED' });

    expect(readMemberSession()).toMatchObject({
      accessToken: rotatedMember.accessToken,
      refreshToken: rotatedMember.refreshToken,
    });
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(rotatedMember.accessToken);
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });

  it('preserves a replacement Guest when an older Birth request returns 401', async () => {
    const oldGuest = 'old-opaque-guest';
    const replacementGuest = 'replacement-opaque-guest';
    sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, oldGuest);

    const client = createBirthRuntimeClient({
      resolveBearer: async () => ({ kind: 'guest' as const, token: oldGuest }),
      fetchImpl: vi.fn(async () => {
        sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, replacementGuest);
        return authErrorResponse('AUTH_REQUIRED', 401);
      }),
    });

    await expect(client.readCurrentBirthProfile()).rejects.toMatchObject({ code: 'WEB_BIRTH_SESSION_REQUIRED' });

    expect(readGuestBearer()).toBe(replacementGuest);
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(replacementGuest);
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });

  it('passes the captured request token into every production 401 invalidation call site', () => {
    const root = join(process.cwd(), 'apps', 'web');
    const expectations = [
      ['birth-runtime-client.js', 'invalidateMemberSession(activeBearer.token)', 'invalidateGuestSession(activeBearer.token)'],
      ['records-runtime-client.js', 'invalidateMemberSession(bearer.token)', 'invalidateGuestSession(bearer.token)'],
      ['my-runtime-client.js', 'invalidateMemberSession(activeBearer.token)', 'invalidateGuestSession(activeBearer.token)'],
      ['chat-runtime-client.js', 'invalidateMemberSession(activeBearer.token)', 'invalidateGuestSession(activeBearer.token)'],
      ['saju-hub.js', 'invalidateMemberSession(activeBearer.token)', 'invalidateGuestSession(activeBearer.token)'],
    ] as const;

    for (const [file, memberCall, guestCall] of expectations) {
      const source = readFileSync(join(root, file), 'utf8');
      expect(source, file).toContain(memberCall);
      expect(source, file).toContain(guestCall);
    }
  });
});

describe('refresh generation authority', () => {
  it('does not delete a rotated Member when an older refresh returns SESSION_EXPIRED', async () => {
    seedMember(oldMember, 'guest-before-member');
    let release: ((response: Response) => void) | null = null;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { release = resolve; }));
    vi.stubGlobal('fetch', fetchMock);

    const pending = refreshMemberSession();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    seedMember(rotatedMember, 'guest-before-member');
    release?.(authErrorResponse('SESSION_EXPIRED', 401));

    await expect(pending).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(readMemberSession()).toMatchObject({
      accessToken: rotatedMember.accessToken,
      refreshToken: rotatedMember.refreshToken,
    });
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(rotatedMember.accessToken);
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBe('guest-before-member');
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });

  it('does not overwrite a rotated Member with an older successful refresh response', async () => {
    seedMember(oldMember, 'guest-before-member');
    let release: ((response: Response) => void) | null = null;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { release = resolve; }));
    vi.stubGlobal('fetch', fetchMock);

    const pending = refreshMemberSession();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    seedMember(rotatedMember, 'guest-before-member');
    release?.(Response.json({
      ok: true,
      data: { status: 'authenticated', session: staleRefreshResult },
    }));

    await expect(pending).resolves.toMatchObject({
      accessToken: rotatedMember.accessToken,
      refreshToken: rotatedMember.refreshToken,
    });
    expect(readMemberSession()).toMatchObject({
      accessToken: rotatedMember.accessToken,
      refreshToken: rotatedMember.refreshToken,
    });
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(rotatedMember.accessToken);
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });

  it('does not restage an old access token after sign-out wins over a transient refresh failure', async () => {
    seedMember(oldMember, 'guest-before-member');
    let rejectRefresh: ((error: Error) => void) | null = null;
    const fetchMock = vi.fn(() => new Promise<Response>((_resolve, reject) => { rejectRefresh = reject; }));
    vi.stubGlobal('fetch', fetchMock);

    const pending = getMemberAccessToken();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    invalidateMemberSession(oldMember.accessToken);
    rejectRefresh?.(new Error('offline'));

    await expect(pending).rejects.toMatchObject({ code: 'WEB_AUTH_NETWORK_FAILED' });
    expect(readMemberSession()).toBeNull();
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe('guest-before-member');
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBeNull();
  });
});