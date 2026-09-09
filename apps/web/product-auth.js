const MEMBER_SESSION_KEY = 'myeongha.memberSession.v1';
const GUEST_TOKEN_KEY = 'myeongha.guestBearer.v1';
const PENDING_GUEST_TOKEN_KEY = 'myeongha.pendingGuestBearer.v1';
const AUTH_CHANGED_EVENT = 'myeongha:auth-changed';
const REFRESH_SKEW_MS = 60_000;
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
    if (!restoreLocalSnapshot(key, previous)) throw memberWriteRollbackFailure(error);
    throw error;
  }

  if (observed === value) return true;
  if (observed === previous) return false;
  if (!restoreLocalSnapshot(key, previous)) throw memberWriteRollbackFailure();
  return false;
}

function restoreLocalSnapshot(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeLocal(key) {
  const previous = readLocal(key);
  try {
    localStorage.removeItem(key);
  } catch {
    restoreLocalSnapshot(key, previous);
    return false;
  }

  let removed;
  try {
    removed = readLocal(key) === null;
  } catch (error) {
    if (!restoreLocalSnapshot(key, previous)) {
      throw new ProductAuthError(
        'WEB_AUTH_MEMBER_CLEAR_ROLLBACK_FAILED',
        '로그인 세션 제거 확인 실패 후 브라우저 상태를 안전하게 복원하지 못했습니다.',
        error,
      );
    }
    throw error;
  }

  if (removed) return true;
  if (!restoreLocalSnapshot(key, previous)) {
    throw new ProductAuthError(
      'WEB_AUTH_MEMBER_CLEAR_ROLLBACK_FAILED',
      '로그인 세션 제거 실패 후 브라우저 상태를 안전하게 복원하지 못했습니다.',
    );
  }
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

function writeSession(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    return readSession(key) === value;
  }
  return readSession(key) === value;
}

function removeSession(key) {
  try {
    sessionStorage.removeItem(key);
    return sessionStorage.getItem(key) === null;
  } catch {
    return false;
  }
}

function removeSessionEntries(entries) {
  if (entries.length === 0) return true;

  let removedAll = true;
  for (const [key] of entries) {
    if (!removeSession(key)) removedAll = false;
  }
  if (removedAll) return true;

  for (const [key, value] of entries) {
    if (readSession(key) === null) writeSession(key, value);
  }
  return false;
}

function restoreSessionSnapshot(entries) {
  let restoredAll = true;
  for (const [key, value] of entries) {
    try {
      const restored = value === null ? removeSession(key) : writeSession(key, value);
      if (!restored) restoredAll = false;
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
  const current = normalizeGuestBearer(snapshot[0][1]);
  const pendingRaw = snapshot[1][1];
  const pending = normalizeGuestBearer(pendingRaw);

  try {
    if (pendingRaw !== null && !pending && !removeSession(PENDING_GUEST_TOKEN_KEY)) {
      throw memberCompatibilityFailure();
    }
    if (current && !pending && !writeSession(PENDING_GUEST_TOKEN_KEY, current)) {
      throw memberCompatibilityFailure();
    }
    if (!writeSession(GUEST_TOKEN_KEY, accessToken)) {
      throw memberCompatibilityFailure();
    }
  } catch (error) {
    if (!restoreSessionSnapshot(snapshot)) throw memberCompatibilityRollbackFailure(error);
    throw error;
  }

  return () => restoreSessionSnapshot(snapshot);
}

function sameMemberSessionGeneration(left, right) {
  return Boolean(
    left &&
    right &&
    left.accessToken === right.accessToken &&
    left.refreshToken === right.refreshToken
  );
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
  const fail = () => Object.freeze({ ok: false, rolledBack: restoreSessionSnapshot(snapshot) });
  const active = snapshot[0][1];
  if (
    (isJwtLike(active) || (active !== null && !normalizeGuestBearer(active))) &&
    !removeSession(GUEST_TOKEN_KEY)
  ) {
    return fail();
  }

  const pendingRaw = snapshot[1][1];
  const pending = normalizeGuestBearer(pendingRaw);
  if (pending) {
    if (!writeSession(GUEST_TOKEN_KEY, pending)) return fail();
    if (!removeSession(PENDING_GUEST_TOKEN_KEY)) return fail();
  } else if (pendingRaw !== null && !removeSession(PENDING_GUEST_TOKEN_KEY)) {
    return fail();
  }

  return Object.freeze({ ok: true, rolledBack: true });
}

function discardMemberSession(expectedAccessToken = null, expectedRefreshToken = null) {
  if (expectedAccessToken !== null) {
    const current = readMemberSession();
    if (
      !current ||
      current.accessToken !== expectedAccessToken ||
      (expectedRefreshToken !== null && current.refreshToken !== expectedRefreshToken)
    ) {
      return false;
    }
  }

  const memberRaw = readLocal(MEMBER_SESSION_KEY);
  const restorableMemberRaw = normalizedStoredMemberSession(memberRaw) ? memberRaw : null;
  if (!removeLocal(MEMBER_SESSION_KEY)) return false;

  const compatibility = discardMemberCompatibilityState();
  if (!compatibility.ok) {
    if (restorableMemberRaw !== null) {
      const memberRolledBack = writeLocal(MEMBER_SESSION_KEY, restorableMemberRaw);
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

export function readMemberSession() {
  const raw = readLocal(MEMBER_SESSION_KEY);
  if (!raw) return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    discardMemberSession();
    return null;
  }

  const normalized = normalizeSession(parsed);
  if (!normalized) {
    discardMemberSession();
    return null;
  }
  return normalized;
}

export function readGuestBearer() {
  const pendingRaw = readSession(PENDING_GUEST_TOKEN_KEY);
  const pending = normalizeGuestBearer(pendingRaw);
  if (pending) return pending;
  if (pendingRaw !== null && !removeSession(PENDING_GUEST_TOKEN_KEY)) throw guestClearFailure();

  const tokenRaw = readSession(GUEST_TOKEN_KEY);
  const token = normalizeGuestBearer(tokenRaw);
  if (token) return token;
  if (tokenRaw !== null && !isJwtLike(tokenRaw) && !removeSession(GUEST_TOKEN_KEY)) throw guestClearFailure();
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

    const latest = readMemberSession();
    if (!sameMemberSessionGeneration(latest, current)) {
      return latest;
    }
    return saveSession(data.session);
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
  return saveSession(data.session);
}

export async function signUpWithPassword(email, password, next = 'hall.html') {
  const data = await postJson('/api/auth/sign-up', { email, password, next });
  if (!isRecord(data)) {
    throw new ProductAuthError('WEB_AUTH_MALFORMED_RESPONSE', '회원가입 응답이 올바르지 않습니다.');
  }
  if (data.status === 'authenticated') {
    return Object.freeze({ status: 'authenticated', session: saveSession(data.session) });
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
