import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PRODUCT_AUTH_STORAGE_V1,
  invalidateMemberSession,
  readMemberSession,
  refreshMemberSession,
  signInWithPassword,
  signOutMember,
  signUpWithPassword,
} from '../apps/web/product-auth.js';

class MemoryStorage {
  protected readonly values = new Map<string, string>();

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

class QueueLockManager {
  readonly requestedNames: string[] = [];
  private tail: Promise<void> = Promise.resolve();

  request<T>(name: string, _options: { mode: string }, callback: () => T | Promise<T>) {
    this.requestedNames.push(name);
    const run = this.tail.then(callback);
    this.tail = run.then(() => undefined, () => undefined);
    return run;
  }

  async hold(name: string) {
    let release!: () => void;
    let acquired!: () => void;
    const acquiredPromise = new Promise<void>((resolve) => { acquired = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const held = this.request(name, { mode: 'exclusive' }, async () => {
      acquired();
      await gate;
    });
    await acquiredPromise;
    return async () => {
      release();
      await held;
    };
  }
}

class ReplacingLocalStorage extends MemoryStorage {
  private replacementKey: string | null = null;
  private replacementValue: string | null = null;
  private armed = false;

  armReplacement(key: string, value: string) {
    this.replacementKey = key;
    this.replacementValue = value;
    this.armed = true;
  }

  override getItem(key: string) {
    const observed = super.getItem(key);
    if (this.armed && key === this.replacementKey && this.replacementValue !== null) {
      this.armed = false;
      super.setItem(key, this.replacementValue);
    }
    return observed;
  }
}

const lockName = 'myeongha.memberSession.v1.refresh.lock';
const member = Object.freeze({
  id: '11111111-1111-4111-8111-111111111111',
  email: 'member-mutation-race@example.com',
});

function memberSession(accessToken: string, refreshToken: string) {
  return Object.freeze({
    accessToken,
    refreshToken,
    expiresAt: '2099-01-01T00:00:00.000Z',
    tokenType: 'bearer',
    user: member,
  });
}

const original = memberSession('old.header.signature', 'refresh-old');
const staleRefresh = memberSession('stale.header.signature', 'refresh-stale');
const newerLogin = memberSession('newlogin.header.signature', 'refresh-new-login');
const signupSession = memberSession('signup.header.signature', 'refresh-signup');
const stagedGuest = 'guest-before-member';

function seed(session = original) {
  localStorage.setItem(PRODUCT_AUTH_STORAGE_V1.memberSession, JSON.stringify(session));
  sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, session.accessToken);
  sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer, stagedGuest);
}

function authenticated(session: ReturnType<typeof memberSession>) {
  return Response.json({
    ok: true,
    data: { status: 'authenticated', session },
  }, { status: 200 });
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
  vi.stubGlobal('sessionStorage', new MemoryStorage());
  vi.stubGlobal('CustomEvent', class {
    constructor(readonly type: string) {}
  });
  vi.stubGlobal('dispatchEvent', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Member mutation lock authority', () => {
  it('serializes a newer sign-in ahead of an older successful refresh commit', async () => {
    seed();
    const locks = new QueueLockManager();
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('navigator', { locks });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/auth/sign-in') return authenticated(newerLogin);
      if (String(input) === '/api/auth/refresh') return authenticated(staleRefresh);
      throw new Error(`unexpected request: ${String(input)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const release = await locks.hold(lockName);
    const signIn = signInWithPassword(member.email, 'password');
    await vi.waitFor(() => expect(locks.requestedNames).toHaveLength(2));
    expect(readMemberSession()).toMatchObject({ accessToken: original.accessToken });

    const refresh = refreshMemberSession();
    await vi.waitFor(() => expect(locks.requestedNames).toHaveLength(3));
    expect(locks.requestedNames).toEqual([lockName, lockName, lockName]);
    expect(readMemberSession()).toMatchObject({ accessToken: original.accessToken });

    await release();

    await expect(signIn).resolves.toMatchObject({ accessToken: newerLogin.accessToken });
    await expect(refresh).resolves.toMatchObject({ accessToken: newerLogin.accessToken });
    expect(readMemberSession()).toMatchObject({
      accessToken: newerLogin.accessToken,
      refreshToken: newerLogin.refreshToken,
    });
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(newerLogin.accessToken);
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBe(stagedGuest);
    expect(globalThis.dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it('serializes an authenticated sign-up commit through the same mixed-version lock namespace', async () => {
    seed();
    const locks = new QueueLockManager();
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('navigator', { locks });
    vi.stubGlobal('fetch', vi.fn(async () => authenticated(signupSession)));

    const release = await locks.hold(lockName);
    const signUp = signUpWithPassword(member.email, 'password');
    await vi.waitFor(() => expect(locks.requestedNames).toEqual([lockName, lockName]));
    expect(readMemberSession()).toMatchObject({ accessToken: original.accessToken });

    await release();

    await expect(signUp).resolves.toMatchObject({
      status: 'authenticated',
      session: { accessToken: signupSession.accessToken },
    });
    expect(readMemberSession()).toMatchObject({ accessToken: signupSession.accessToken });
  });

  it('makes local sign-out win ahead of an already-returned stale refresh response without resurrection', async () => {
    seed();
    const locks = new QueueLockManager();
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('navigator', { locks });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/auth/sign-out') {
        return Response.json({ ok: true, data: { status: 'signed_out' } }, { status: 200 });
      }
      if (String(input) === '/api/auth/refresh') return authenticated(staleRefresh);
      throw new Error(`unexpected request: ${String(input)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const release = await locks.hold(lockName);
    const signOut = signOutMember();
    await vi.waitFor(() => expect(locks.requestedNames).toEqual([lockName, lockName]));
    expect(fetchMock).not.toHaveBeenCalled();

    const refresh = refreshMemberSession();
    await vi.waitFor(() => expect(locks.requestedNames).toEqual([lockName, lockName, lockName]));
    expect(readMemberSession()).toMatchObject({ accessToken: original.accessToken });

    await release();

    await expect(signOut).resolves.toBeUndefined();
    await expect(refresh).resolves.toBeNull();
    expect(readMemberSession()).toBeNull();
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(stagedGuest);
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('binds exact rejected-bearer invalidation to the raw generation that was actually checked', () => {
    const storage = new ReplacingLocalStorage();
    vi.stubGlobal('localStorage', storage);
    seed();
    storage.armReplacement(PRODUCT_AUTH_STORAGE_V1.memberSession, JSON.stringify(newerLogin));

    expect(invalidateMemberSession(original.accessToken)).toBe(false);
    expect(readMemberSession()).toMatchObject({
      accessToken: newerLogin.accessToken,
      refreshToken: newerLogin.refreshToken,
    });
    expect(globalThis.dispatchEvent).not.toHaveBeenCalled();
  });
});
