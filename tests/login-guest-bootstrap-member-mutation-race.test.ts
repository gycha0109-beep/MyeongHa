import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PRODUCT_AUTH_STORAGE_V1,
  ensureActiveBearer,
  readGuestBearer,
  readMemberSession,
  signInWithPassword,
  signUpWithPassword,
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

class QueueLockManager {
  readonly requestedNames: string[] = [];
  private tail: Promise<void> = Promise.resolve();

  request<T>(name: string, _options: { mode: string }, callback: () => T | Promise<T>) {
    this.requestedNames.push(name);
    const run = this.tail.then(callback);
    this.tail = run.then(() => undefined, () => undefined);
    return run;
  }
}

const lockName = 'myeongha.memberSession.v1.refresh.lock';
const memberSession = Object.freeze({
  accessToken: 'member.bootstrap.race',
  refreshToken: 'refresh-bootstrap-race',
  expiresAt: '2099-01-01T00:00:00.000Z',
  tokenType: 'bearer',
  user: Object.freeze({
    id: '22222222-2222-4222-8222-222222222222',
    email: 'member@example.com',
  }),
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function guestResponse(token: string) {
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

function authenticatedResponse() {
  return Response.json({
    ok: true,
    data: { status: 'authenticated', session: memberSession },
  });
}

function verificationRequiredResponse(email: string) {
  return Response.json({
    ok: true,
    data: { status: 'verification_required', email },
  });
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

describe('Guest bootstrap and explicit Member mutation authority', () => {
  it('makes a sign-in started during Guest bootstrap win even when the Guest response arrives first', async () => {
    const locks = new QueueLockManager();
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('navigator', { locks });
    const bootstrap = deferred<Response>();
    const signIn = deferred<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input) === '/api/session/bootstrap') return bootstrap.promise;
      if (String(input) === '/api/auth/sign-in') return signIn.promise;
      throw new Error(`unexpected request: ${String(input)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const pendingActive = ensureActiveBearer();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/session/bootstrap', expect.any(Object)));

    const pendingSignIn = signInWithPassword('member@example.com', 'password');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/auth/sign-in', expect.any(Object)));
    expect(locks.requestedNames).toEqual([lockName]);

    bootstrap.resolve(guestResponse('guest-must-wait-for-member'));
    await vi.waitFor(() => expect(locks.requestedNames).toEqual([lockName, lockName]));
    expect(readMemberSession()).toBeNull();
    expect(readGuestBearer()).toBeNull();

    signIn.resolve(authenticatedResponse());

    await expect(pendingSignIn).resolves.toMatchObject({ accessToken: memberSession.accessToken });
    await expect(pendingActive).resolves.toEqual({ kind: 'member', token: memberSession.accessToken });
    expect(readMemberSession()).toMatchObject({ accessToken: memberSession.accessToken });
    expect(readGuestBearer()).toBeNull();
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe(memberSession.accessToken);
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.pendingGuestBearer)).toBeNull();
    expect(globalThis.dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it('gives authenticated sign-up the same precedence over an earlier Guest bootstrap when no Guest lineage exists yet', async () => {
    const locks = new QueueLockManager();
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('navigator', { locks });
    const bootstrap = deferred<Response>();
    const signUp = deferred<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input) === '/api/session/bootstrap') return bootstrap.promise;
      if (String(input) === '/api/auth/sign-up') return signUp.promise;
      throw new Error(`unexpected request: ${String(input)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const pendingActive = ensureActiveBearer();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/session/bootstrap', expect.any(Object)));

    const pendingSignUp = signUpWithPassword('member@example.com', 'password');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/auth/sign-up', expect.any(Object)));
    expect(locks.requestedNames).toEqual([lockName]);

    bootstrap.resolve(guestResponse('guest-must-wait-for-signup'));
    await vi.waitFor(() => expect(locks.requestedNames).toEqual([lockName, lockName]));
    expect(readGuestBearer()).toBeNull();

    signUp.resolve(authenticatedResponse());

    await expect(pendingSignUp).resolves.toMatchObject({
      status: 'authenticated',
      session: { accessToken: memberSession.accessToken },
    });
    await expect(pendingActive).resolves.toEqual({ kind: 'member', token: memberSession.accessToken });
    expect(readMemberSession()).toMatchObject({ accessToken: memberSession.accessToken });
    expect(readGuestBearer()).toBeNull();
    expect(globalThis.dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it('keeps verification-required sign-up requests concurrent when each tab already has Guest lineage', async () => {
    const locks = new QueueLockManager();
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('navigator', { locks });
    sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, 'guest-existing-lineage');
    const first = deferred<Response>();
    const second = deferred<Response>();
    let signUpRequests = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input) !== '/api/auth/sign-up') throw new Error(`unexpected request: ${String(input)}`);
      signUpRequests += 1;
      return signUpRequests === 1 ? first.promise : second.promise;
    });
    vi.stubGlobal('fetch', fetchMock);

    const firstSignup = signUpWithPassword('first@example.com', 'password');
    const secondSignup = signUpWithPassword('second@example.com', 'password');

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(locks.requestedNames).toEqual([]);

    first.resolve(verificationRequiredResponse('first@example.com'));
    second.resolve(verificationRequiredResponse('second@example.com'));

    await expect(Promise.all([firstSignup, secondSignup])).resolves.toEqual([
      { status: 'verification_required', email: 'first@example.com' },
      { status: 'verification_required', email: 'second@example.com' },
    ]);
    expect(readGuestBearer()).toBe('guest-existing-lineage');
    expect(readMemberSession()).toBeNull();
    expect(locks.requestedNames).toEqual([]);
  });

  it('releases the Member mutation lock after failed sign-in so the queued Guest bootstrap can become authoritative', async () => {
    const locks = new QueueLockManager();
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('navigator', { locks });
    const bootstrap = deferred<Response>();
    const signIn = deferred<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input) === '/api/session/bootstrap') return bootstrap.promise;
      if (String(input) === '/api/auth/sign-in') return signIn.promise;
      throw new Error(`unexpected request: ${String(input)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const pendingActive = ensureActiveBearer();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/session/bootstrap', expect.any(Object)));

    const pendingSignIn = signInWithPassword('member@example.com', 'wrong-password');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/auth/sign-in', expect.any(Object)));

    bootstrap.resolve(guestResponse('guest-after-failed-member-intent'));
    await vi.waitFor(() => expect(locks.requestedNames).toEqual([lockName, lockName]));
    expect(readGuestBearer()).toBeNull();

    signIn.resolve(Response.json({
      ok: false,
      error: { code: 'INVALID_CREDENTIALS' },
    }, { status: 401 }));

    await expect(pendingSignIn).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await expect(pendingActive).resolves.toEqual({
      kind: 'guest',
      token: 'guest-after-failed-member-intent',
    });
    expect(readMemberSession()).toBeNull();
    expect(readGuestBearer()).toBe('guest-after-failed-member-intent');
    expect(sessionStorage.getItem(PRODUCT_AUTH_STORAGE_V1.guestBearer)).toBe('guest-after-failed-member-intent');
    expect(globalThis.dispatchEvent).toHaveBeenCalledTimes(1);
  });
});