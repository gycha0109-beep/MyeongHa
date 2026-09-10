const MEMBER_SESSION_KEY = 'myeongha.memberSession.v1';
const GUEST_TOKEN_KEY = 'myeongha.guestBearer.v1';
const PENDING_GUEST_TOKEN_KEY = 'myeongha.pendingGuestBearer.v1';
const AUTH_CHANGED_EVENT = 'myeongha:auth-changed';
const REFRESH_SKEW_MS = 60_000;
// Keep the existing lock namespace so already-open older tabs still serialize with the expanded authority.
const MEMBER_MUTATION_LOCK_NAME = 'myeongha.memberSession.v1.refresh.lock';
let guestBootstrapInFlight = null;

export class ProductAuthError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'ProductAuthError';
    this.code = code;
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isJwtLike(value) {
  return typeof value === 'string' && /^[^.\s]+\.[^.\s]+\.[^.\s]+$/u.test(value);
}

export function normalizeGuestBearer(value) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 4096 ||
    /\s/u.test(value) ||
    isJwtLike(value)
  ) {
    return null;
  }
  return value;
}

function readLocal(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    throw new ProductAuthError(
      'WEB_AUTH_MEMBER_READ_FAILED',
      '로그인 세션을 브라우저에서 안전하게 읽지 못했습니다.',
      error,
    );
  }
}

function reconcileLocalRollback(key, previous, expectedCurrent) {
  let observed;
  try {
    observed = readLocal(key);
  } catch {
    return false;
  }

  if (observed === previous) return true;
  if (observed !== expectedCurrent) {
    // Another tab replaced this operation's value. Preserve the newer shared authority.
    return true;
  }

  try {
    if (previous === null) localStorage.removeItem(key);
    else localStorage.setItem(key, previous);
  } catch {
    // A rollback mutation may throw after restoring. Exact read-back remains authoritative.
  }

  try {
    observed = readLocal(key);
    return observed === previous || observed !== expectedCurrent;
  } catch {
    return false;
  }
}

function writeLocal(key, value) {
  const previous = readLocal(key);
  try {
    localStorage.setItem(key, value);
  } catch {
    // A browser storage write may throw after mutating. Verification below remains authoritative.
  }

  let observed;
  try {
    observed = readLocal(key);
  } catch (error) {
    if (!reconcileLocalRollback(key, previous, value)) throw memberWriteRollbackFailure(error);
    throw error;
  }

  if (observed === value) return true;
  if (observed === previous) return false;
  // A different observed value may be a newer cross-tab Member authority. Preserve it.
  return false;
}

function removeLocal(key, previousOverride = undefined) {
  const observedBefore = readLocal(key);
  if (previousOverride !== undefined && observedBefore !== previousOverride) return false;
  const previous = observedBefore;
  try {
    localStorage.removeItem(key);
  } catch (error) {
    if (!reconcileLocalRollback(key, previous, null)) {
      throw new ProductAuthError(
        'WEB_AUTH_MEMBER_CLEAR_ROLLBACK_FAILED',
        '로그인 세션 제거 실패 후 브라우저 상태를 안전하게 복원하지 못했습니다.',
        error,
      );
    }
    return false;
  }

  let observed;
  try {
    observed = readLocal(key);
  } catch (error) {
    if (!reconcileLocalRollback(key, previous, null)) {
      throw new ProductAuthError(
        'WEB_AUTH_MEMBER_CLEAR_ROLLBACK_FAILED',
        '로그인 세션 제거 확인 실패 후 브라우저 상태를 안전하게 복원하지 못했습니다.',
        error,
      );
    }
    throw error;
  }

  if (observed === null) return true;
  // Preserve either the unchanged previous value or a newer cross-tab replacement.
  return false;
}

function readSession(key) {
  try {
    return sessionStorage.getItem(key);
  } catch (error) {
    throw new ProductAuthError(
      'WEB_AUTH_SESSION_READ_FAILED',
      '브라우저 세션 상태를 안전하게 읽지 못했습니다.',
      error,
    );
  }
}

function reconcileSessionRollback(key, previous, expectedCurrent) {
  let observed;
  try {
    observed = readSession(key);
  } catch {
    return false;
  }

  if (observed === previous) return true;
  if (observed !== expectedCurrent) {
    // Same-tab work replaced this operation's value. Preserve the newer Guest authority.
    return true;
  }

  try {
    if (previous === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, previous);
  } catch {
    // A rollback mutation may throw after restoring. Exact read-back remains authoritative.
  }

  try {
    observed = readSession(key);
    return observed === previous || observed !== expectedCurrent;
  } catch {
    return false;
  }
}

function writeSession(key, value) {
  const previous = readSession(key);
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // A browser storage write may throw after mutating. Verification below remains authoritative.
  }

  let observed;
  try {
    observed = readSession(key);
  } catch (error) {
    if (!reconcileSessionRollback(key, previous, value)) throw sessionWriteRollbackFailure(error);
    throw error;
  }

  if (observed === value) return true;
  // A different observed value may be a newer same-tab Guest authority. Preserve it.
  return false;
}

function removeSession(key, previousOverride = undefined) {
  const observedBefore = readSession(key);
  if (previousOverride !== undefined && observedBefore !== previousOverride) return false;
  const previous = observedBefore;
  try {
    sessionStorage.removeItem(key);
  } catch {
    // A browser storage removal may throw after mutating. Verification below remains authoritative.
  }

  let observed;
  try {
    observed = readSession(key);
  } catch (error) {
    if (!reconcileSessionRollback(key, previous, null)) throw sessionClearRollbackFailure(error);
    throw error;
  }

  if (observed === null) return true;
  // Preserve an observed replacement instead of clobbering a newer same-tab authority.
  return false;
}

function removeSessionEntries(entries) {
  if (entries.length === 0) return true;

  const rollbackExpected = new Map();
  for (const [key, value] of entries) {
    rollbackExpected.set(key, null);
    try {
      if (removeSession(key, value)) continue;
      rollbackExpected.delete(key);
      return restoreSessionSnapshot(entries, rollbackExpected) && false;
    } catch (error) {
      if (!restoreSessionSnapshot(entries, rollbackExpected)) throw sessionClearRollbackFailure(error);
      throw error;
    }
  }
  return true;
}

function restoreSessionSnapshot(entries, expectedByKey) {
  if (!(expectedByKey instanceof Map)) return false;

  let restoredAll = true;
  for (const [key, value] of entries) {
    if (!expectedByKey.has(key)) continue;
    try {
      if (!reconcileSessionRollback(key, value, expectedByKey.get(key))) restoredAll = false;
    } catch {
      restoredAll = false;
    }
  }
  return restoredAll;
}

function guestClearFailure() {
  return new ProductAuthError(
    'WEB_AUTH_GUEST_CLEAR_FAILED',
    '게스트 세션을 브라우저에서 안전하게 제거하지 못했습니다.',
  );
}

function sessionWriteRollbackFailure(cause) {
  return new ProductAuthError(
    'WEB_AUTH_SESSION_WRITE_ROLLBACK_FAILED',
    '게스트 세션 저장 확인 실패 후 브라우저 상태를 안전하게 복원하지 못했습니다.',
    cause,
  );
}

function sessionClearRollbackFailure(cause) {
  return new ProductAuthError(
    'WEB_AUTH_SESSION_CLEAR_ROLLBACK_FAILED',
    '게스트 세션 제거 확인 실패 후 브라우저 상태를 안전하게 복원하지 못했습니다.',
    cause,
  );
}

function memberWriteRollbackFailure(cause) {
  return new ProductAuthError(
    'WEB_AUTH_MEMBER_WRITE_ROLLBACK_FAILED',
    '로그인 세션 저장 확인 실패 후 브라우저 상태를 안전하게 복원하지 못했습니다.',
    cause,
  );
}

function memberCompatibilityFailure() {
  return new ProductAuthError(
    'WEB_AUTH_MEMBER_COMPAT_PERSIST_FAILED',
    '로그인 세션의 브라우저 호환 상태를 안전하게 저장하지 못했습니다.',
  );
}

function memberCompatibilityRollbackFailure(cause) {
  return new ProductAuthError(
    'WEB_AUTH_MEMBER_COMPAT_ROLLBACK_FAILED',
    '로그인 세션 저장 실패 후 브라우저 호환 상태를 안전하게 복원하지 못했습니다.',
    cause,
  );
}

function memberCompatibilityDiscardRollbackFailure() {
  return new ProductAuthError(
    'WEB_AUTH_MEMBER_COMPAT_DISCARD_ROLLBACK_FAILED',
    '로그인 세션 제거 실패 후 브라우저 호환 상태를 안전하게 복원하지 못했습니다.',
  );
}

function emitAuthChanged() {
  globalThis.dispatchEvent?.(new CustomEvent(AUTH_CHANGED_EVENT));
}

function stageMemberBearerForLegacyProductClients(accessToken) {
  const snapshot = [
    [GUEST_TOKEN_KEY, readSession(GUEST_TOKEN_KEY)],
    [PENDING_GUEST_TOKEN_KEY, readSession(PENDING_GUEST_TOKEN_KEY)],
  ];
  const rollbackExpected = new Map();
  const current = normalizeGuestBearer(snapshot[0][1]);
  const pendingRaw = snapshot[1][1];
  const pending = normalizeGuestBearer(pendingRaw);
  const writeOwned = (key, value) => {
    const written = writeSession(key, value);
    if (written) rollbackExpected.set(key, value);
    return written;
  };
  const removeOwned = (key) => {
    const removed = removeSession(key);
    if (removed) rollbackExpected.set(key, null);
    return removed;
  };

  try {
    if (pendingRaw !== null && !pending && !removeOwned(PENDING_GUEST_TOKEN_KEY)) {
      throw memberCompatibilityFailure();
    }
    if (current && !pending && !writeOwned(PENDING_GUEST_TOKEN_KEY, current)) {
      throw memberCompatibilityFailure();
    }
    if (!writeOwned(GUEST_TOKEN_KEY, accessToken)) {
      throw memberCompatibilityFailure();
    }
  } catch (error) {
    if (!restoreSessionSnapshot(snapshot, rollbackExpected)) throw memberCompatibilityRollbackFailure(error);
    throw error;
  }

  return () => restoreSessionSnapshot(snapshot, rollbackExpected);
}

function sameMemberSessionGeneration(left, right) {
  return Boolean(
    left &&
    right &&
    left.accessToken === right.accessToken &&
    left.refreshToken === right.refreshToken
  );
}

function memberMutationLocks() {
  const browserWindow = globalThis.window;
  if (!browserWindow || browserWindow !== globalThis) return null;
  const locks = browserWindow.navigator?.locks;
  return locks && typeof locks.request === 'function' ? locks : null;
}

async function withMemberMutationLock(commit) {
  const locks = memberMutationLocks();
  if (!locks) return commit();
  return locks.request(MEMBER_MUTATION_LOCK_NAME, { mode: 'exclusive' }, commit);
}

async function commitRefreshedMemberSession(current, session) {
  return withMemberMutationLock(() => {
    const latest = readMemberSession();
    if (!sameMemberSessionGeneration(latest, current)) return latest;
    return saveSession(session);
  });
}

function normalizedStoredMemberSession(raw) {
  if (!raw) return null;
  try {
    return normalizeSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

function discardMemberCompatibilityState() {
  const snapshot = [
    [GUEST_TOKEN_KEY, readSession(GUEST_TOKEN_KEY)],
    [PENDING_GUEST_TOKEN_KEY, readSession(PENDING_GUEST_TOKEN_KEY)],
  ];
  const rollbackExpected = new Map();
  const writeOwned = (key, value) => {
    const written = writeSession(key, value);
    if (written) rollbackExpected.set(key, value);
    return written;
  };
  const removeOwned = (key) => {
    const removed = removeSession(key);
    if (removed) rollbackExpected.set(key, null);
    return removed;
  };
  const fail = () => Object.freeze({
    ok: false,
    rolledBack: restoreSessionSnapshot(snapshot, rollbackExpected),
  });
  const active = snapshot[0][1];
  if (
    (isJwtLike(active) || (active !== null && !normalizeGuestBearer(active))) &&
    !removeOwned(GUEST_TOKEN_KEY)
  ) {
    return fail();
  }

  const pendingRaw = snapshot[1][1];
  const pending = normalizeGuestBearer(pendingRaw);
  if (pending) {
    if (!writeOwned(GUEST_TOKEN_KEY, pending)) return fail();
    if (!removeOwned(PENDING_GUEST_TOKEN_KEY)) return fail();
  } else if (pendingRaw !== null && !removeOwned(PENDING_GUEST_TOKEN_KEY)) {
    return fail();
  }

  return Object.freeze({ ok: true, rolledBack: true });
}

function discardMemberSession(expectedAccessToken = null, expectedRefreshToken = null, expectedMemberRaw = undefined) {
  const memberRaw = expectedMemberRaw === undefined ? readLocal(MEMBER_SESSION_KEY) : expectedMemberRaw;
  const storedMember = normalizedStoredMemberSession(memberRaw);
  if (
    expectedAccessToken !== null &&
    (
      !storedMember ||
      storedMember.accessToken !== expectedAccessToken ||
      (expectedRefreshToken !== null && storedMember.refreshToken !== expectedRefreshToken)
    )
  ) {
    return false;
  }

  const restorableMemberRaw = storedMember ? memberRaw : null;
  if (!removeLocal(MEMBER_SESSION_KEY, memberRaw)) return false;

  const compatibility = discardMemberCompatibilityState();
  if (!compatibility.ok) {
    if (restorableMemberRaw !== null) {
      const memberRolledBack = reconcileLocalRollback(MEMBER_SESSION_KEY, restorableMemberRaw, null);
      if (!memberRolledBack || !compatibility.rolledBack) {
        throw memberCompatibilityDiscardRollbackFailure();
      }
      return false;
    }

    if (!compatibility.rolledBack) throw memberCompatibilityDiscardRollbackFailure();
    emitAuthChanged();
    return false;
  }

  emitAuthChanged();
  return true;
}

function discardGuestSession(expectedBearer = null) {
  const targets = [];

  if (expectedBearer !== null) {
    const normalized = normalizeGuestBearer(expectedBearer);
    if (!normalized) return false;

    if (readSession(GUEST_TOKEN_KEY) === normalized) {
      targets.push([GUEST_TOKEN_KEY, normalized]);
    }
    if (readSession(PENDING_GUEST_TOKEN_KEY) === normalized) {
      targets.push([PENDING_GUEST_TOKEN_KEY, normalized]);
    }
    if (targets.length === 0) return false;
    if (!removeSessionEntries(targets)) throw guestClearFailure();
    emitAuthChanged();
    return true;
  }

  const active = readSession(GUEST_TOKEN_KEY);
  if (active && !isJwtLike(active)) targets.push([GUEST_TOKEN_KEY, active]);
  const pending = readSession(PENDING_GUEST_TOKEN_KEY);
  if (pending && !isJwtLike(pending)) targets.push([PENDING_GUEST_TOKEN_KEY, pending]);
  if (!removeSessionEntries(targets)) throw guestClearFailure();
  emitAuthChanged();
  return true;
}

function isAuthoritativeRefreshRejection(error) {
  return error instanceof ProductAuthError && error.code === 'SESSION_EXPIRED';
}

function normalizeSession(value) {
  if (!isRecord(value)) return null;
  if (
    !isJwtLike(value.accessToken) ||
    typeof value.refreshToken !== 'string' || value.refreshToken.length === 0 ||
    typeof value.expiresAt !== 'string' || Number.isNaN(Date.parse(value.expiresAt))
  ) {
    return null;
  }
  const user = isRecord(value.user) ? value.user : {};
  return Object.freeze({
    accessToken: value.accessToken,
    refreshToken: value.refreshToken,
    expiresAt: value.expiresAt,
    tokenType: 'bearer',
    user: Object.freeze({
      id: typeof user.id === 'string' ? user.id : null,
      email: typeof user.email === 'string' ? user.email : null,
    }),
  });
}

function saveSession(session) {
  const normalized = normalizeSession(session);
  if (!normalized) throw new ProductAuthError('WEB_AUTH_MALFORMED_SESSION', '로그인 세션 응답이 올바르지 않습니다.');
  const serialized = JSON.stringify(normalized);
  const rollbackCompatibility = stageMemberBearerForLegacyProductClients(normalized.accessToken);

  let persisted;
  try {
    persisted = writeLocal(MEMBER_SESSION_KEY, serialized);
  } catch (error) {
    if (!rollbackCompatibility()) throw memberCompatibilityRollbackFailure(error);
    throw error;
  }

  if (!persisted) {
    if (!rollbackCompatibility()) throw memberCompatibilityRollbackFailure();
    throw new ProductAuthError('WEB_AUTH_MEMBER_PERSIST_FAILED', '로그인 세션을 브라우저에 안전하게 저장하지 못했습니다.');
  }
  emitAuthChanged();
  return normalized;
}

async function readEnvelope(response) {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    throw new ProductAuthError('WEB_AUTH_MALFORMED_RESPONSE', '인증 서버 응답을 확인할 수 없습니다.');
  }
  if (!isRecord(payload)) {
    throw new ProductAuthError('WEB_AUTH_MALFORMED_RESPONSE', '인증 서버 응답이 올바르지 않습니다.');
  }
  if (!response.ok || payload.ok !== true) {
    const code = isRecord(payload.error) && typeof payload.error.code === 'string'
      ? payload.error.code
      : 'AUTH_REQUEST_FAILED';
    throw new ProductAuthError(code, `인증 요청이 실패했습니다. (${response.status})`);
  }
  return payload.data;
}

async function postJson(endpoint, body, authorization = null) {
  const headers = new Headers({
    Accept: 'application/json',
    'Content-Type': 'application/json',
  });
  if (authorization) headers.set('Authorization', `Bearer ${authorization}`);
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch (error) {
    throw new ProductAuthError('WEB_AUTH_NETWORK_FAILED', '인증 서버에 연결할 수 없습니다.', error);
  }
  return readEnvelope(response);
}

function reconcileMalformedStoredMember(raw) {
  if (discardMemberSession(null, null, raw)) return null;

  const latestRaw = readLocal(MEMBER_SESSION_KEY);
  if (latestRaw === null || latestRaw === raw) return null;
  return readMemberSession();
}

export function readMemberSession() {
  const raw = readLocal(MEMBER_SESSION_KEY);
  if (!raw) return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return reconcileMalformedStoredMember(raw);
  }

  const normalized = normalizeSession(parsed);
  if (!normalized) {
    return reconcileMalformedStoredMember(raw);
  }
  return normalized;
}

export function readGuestBearer() {
  const pendingRaw = readSession(PENDING_GUEST_TOKEN_KEY);
  const pending = normalizeGuestBearer(pendingRaw);
  if (pending) return pending;
  if (pendingRaw !== null && !removeSession(PENDING_GUEST_TOKEN_KEY, pendingRaw)) {
    const replacement = normalizeGuestBearer(readSession(PENDING_GUEST_TOKEN_KEY));
    if (replacement) return replacement;
    throw guestClearFailure();
  }

  const tokenRaw = readSession(GUEST_TOKEN_KEY);
  const token = normalizeGuestBearer(tokenRaw);
  if (token) return token;
  if (tokenRaw !== null && !isJwtLike(tokenRaw) && !removeSession(GUEST_TOKEN_KEY, tokenRaw)) {
    const replacement = normalizeGuestBearer(readSession(GUEST_TOKEN_KEY));
    if (replacement) return replacement;
    throw guestClearFailure();
  }
  return null;
}

export async function ensureGuestBearer() {
  const existing = readGuestBearer();
  if (existing) return existing;
  if (readMemberSession()) return null;

  const request = guestBootstrapInFlight ??= (async () => {
    const data = await postJson('/api/session/bootstrap', {});
    const guestSession = isRecord(data) && isRecord(data.guestSession) ? data.guestSession : null;
    const token = normalizeGuestBearer(guestSession?.bearerToken);
    if (!isRecord(data) || data.kind !== 'guest' || !token) {
      throw new ProductAuthError('WEB_AUTH_GUEST_PREPARE_FAILED', '게스트 세션을 준비하지 못했습니다.');
    }

    const racedExisting = readGuestBearer();
    if (racedExisting) return racedExisting;
    if (readMemberSession()) return null;

    if (!writeSession(GUEST_TOKEN_KEY, token)) {
      const convergedGuest = readGuestBearer();
      if (convergedGuest) return convergedGuest;
      if (readMemberSession()) return null;
      throw new ProductAuthError('WEB_AUTH_GUEST_PERSIST_FAILED', '게스트 세션을 브라우저에 안전하게 저장하지 못했습니다.');
    }
    emitAuthChanged();
    return token;
  })();

  try {
    return await request;
  } finally {
    if (guestBootstrapInFlight === request) guestBootstrapInFlight = null;
  }
}

export function invalidateMemberSession(expectedAccessToken = null) {
  return discardMemberSession(expectedAccessToken);
}

export function invalidateGuestSession(expectedBearer = null) {
  return discardGuestSession(expectedBearer);
}

export async function refreshMemberSession() {
  const current = readMemberSession();
  if (!current) return null;
  try {
    const data = await postJson('/api/auth/refresh', { refreshToken: current.refreshToken });
    if (!isRecord(data) || data.status !== 'authenticated') {
      throw new ProductAuthError('WEB_AUTH_MALFORMED_SESSION', '갱신된 세션 응답이 올바르지 않습니다.');
    }

    return await commitRefreshedMemberSession(current, data.session);
  } catch (error) {
    if (isAuthoritativeRefreshRejection(error)) {
      discardMemberSession(current.accessToken, current.refreshToken);
    }
    throw error;
  }
}

export async function getMemberAccessToken() {
  const current = readMemberSession();
  if (!current) return null;
  const expiresAt = Date.parse(current.expiresAt);
  if (expiresAt - Date.now() > REFRESH_SKEW_MS) {
    stageMemberBearerForLegacyProductClients(current.accessToken);
    return current.accessToken;
  }
  try {
    const refreshed = await refreshMemberSession();
    return refreshed?.accessToken ?? null;
  } catch (error) {
    const latest = readMemberSession();
    if (latest && !sameMemberSessionGeneration(latest, current)) {
      return getMemberAccessToken();
    }
    if (!isAuthoritativeRefreshRejection(error) && latest && expiresAt > Date.now()) {
      stageMemberBearerForLegacyProductClients(current.accessToken);
      return current.accessToken;
    }
    throw error;
  }
}

export async function getActiveBearer() {
  try {
    const member = await getMemberAccessToken();
    if (member) return Object.freeze({ kind: 'member', token: member });
  } catch (error) {
    if (readMemberSession()) throw error;
    const guestAfterFailure = readGuestBearer();
    return guestAfterFailure ? Object.freeze({ kind: 'guest', token: guestAfterFailure }) : null;
  }
  const guest = readGuestBearer();
  return guest ? Object.freeze({ kind: 'guest', token: guest }) : null;
}

export async function ensureActiveBearer() {
  const active = await getActiveBearer();
  if (active) return active;

  const token = await ensureGuestBearer();
  const converged = await getActiveBearer();
  if (converged) return converged;
  if (token) return Object.freeze({ kind: 'guest', token });

  return ensureActiveBearer();
}

export async function signInWithPassword(email, password) {
  const data = await postJson('/api/auth/sign-in', { email, password });
  if (!isRecord(data) || data.status !== 'authenticated') {
    throw new ProductAuthError('WEB_AUTH_MALFORMED_SESSION', '로그인 응답이 올바르지 않습니다.');
  }
  return withMemberMutationLock(() => saveSession(data.session));
}

export async function signUpWithPassword(email, password, next = 'hall.html') {
  const data = await postJson('/api/auth/sign-up', { email, password, next });
  if (!isRecord(data)) {
    throw new ProductAuthError('WEB_AUTH_MALFORMED_RESPONSE', '회원가입 응답이 올바르지 않습니다.');
  }
  if (data.status === 'authenticated') {
    const session = await withMemberMutationLock(() => saveSession(data.session));
    return Object.freeze({ status: 'authenticated', session });
  }
  if (data.status === 'verification_required') {
    return Object.freeze({
      status: 'verification_required',
      email: typeof data.email === 'string' ? data.email : email,
    });
  }
  throw new ProductAuthError('WEB_AUTH_MALFORMED_RESPONSE', '회원가입 상태를 확인할 수 없습니다.');
}

export async function signOutMember() {
  return withMemberMutationLock(async () => {
    const current = readMemberSession();
    if (current) {
      try {
        await postJson('/api/auth/sign-out', {}, current.accessToken);
      } catch {
        // Local sign-out is still authoritative for this browser session when local authority can be cleared.
      }
    }
    if (!discardMemberSession(current?.accessToken ?? null, current?.refreshToken ?? null)) {
      throw new ProductAuthError('WEB_AUTH_MEMBER_CLEAR_FAILED', '로그인 세션을 브라우저에서 안전하게 제거하지 못했습니다.');
    }
  });
}

export function clearPromotedGuestBearer() {
  const targets = [];
  const pending = readSession(PENDING_GUEST_TOKEN_KEY);
  if (pending !== null) targets.push([PENDING_GUEST_TOKEN_KEY, pending]);
  const active = readSession(GUEST_TOKEN_KEY);
  if (active && !isJwtLike(active)) targets.push([GUEST_TOKEN_KEY, active]);
  if (!removeSessionEntries(targets)) throw guestClearFailure();
  return true;
}

export const PRODUCT_AUTH_STORAGE_V1 = Object.freeze({
  memberSession: MEMBER_SESSION_KEY,
  guestBearer: GUEST_TOKEN_KEY,
  pendingGuestBearer: PENDING_GUEST_TOKEN_KEY,
  changedEvent: AUTH_CHANGED_EVENT,
});