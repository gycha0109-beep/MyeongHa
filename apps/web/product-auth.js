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
  } catch {
    return null;
  }
}

function writeLocal(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    return;
  }
}

function removeLocal(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    return;
  }
}

function readSession(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    return;
  }
}

function removeSession(key) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    return;
  }
}

function emitAuthChanged() {
  globalThis.dispatchEvent?.(new CustomEvent(AUTH_CHANGED_EVENT));
}

function stageMemberBearerForLegacyProductClients(accessToken) {
  const current = normalizeGuestBearer(readSession(GUEST_TOKEN_KEY));
  const pendingRaw = readSession(PENDING_GUEST_TOKEN_KEY);
  const pending = normalizeGuestBearer(pendingRaw);
  if (pendingRaw !== null && !pending) removeSession(PENDING_GUEST_TOKEN_KEY);
  if (current && !pending) {
    writeSession(PENDING_GUEST_TOKEN_KEY, current);
  }
  writeSession(GUEST_TOKEN_KEY, accessToken);
}

function sameMemberSessionGeneration(left, right) {
  return Boolean(
    left &&
    right &&
    left.accessToken === right.accessToken &&
    left.refreshToken === right.refreshToken
  );
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

  removeLocal(MEMBER_SESSION_KEY);
  const active = readSession(GUEST_TOKEN_KEY);
  if (isJwtLike(active) || (active !== null && !normalizeGuestBearer(active))) {
    removeSession(GUEST_TOKEN_KEY);
  }
  const pendingRaw = readSession(PENDING_GUEST_TOKEN_KEY);
  const pending = normalizeGuestBearer(pendingRaw);
  if (pending) {
    writeSession(GUEST_TOKEN_KEY, pending);
    removeSession(PENDING_GUEST_TOKEN_KEY);
  } else if (pendingRaw !== null) {
    removeSession(PENDING_GUEST_TOKEN_KEY);
  }
  emitAuthChanged();
  return true;
}

function discardGuestSession(expectedBearer = null) {
  if (expectedBearer !== null) {
    const normalized = normalizeGuestBearer(expectedBearer);
    if (!normalized) return false;

    let changed = false;
    if (readSession(GUEST_TOKEN_KEY) === normalized) {
      removeSession(GUEST_TOKEN_KEY);
      changed = true;
    }
    if (readSession(PENDING_GUEST_TOKEN_KEY) === normalized) {
      removeSession(PENDING_GUEST_TOKEN_KEY);
      changed = true;
    }
    if (changed) emitAuthChanged();
    return changed;
  }

  const active = readSession(GUEST_TOKEN_KEY);
  if (active && !isJwtLike(active)) removeSession(GUEST_TOKEN_KEY);
  const pending = readSession(PENDING_GUEST_TOKEN_KEY);
  if (pending && !isJwtLike(pending)) removeSession(PENDING_GUEST_TOKEN_KEY);
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
  writeLocal(MEMBER_SESSION_KEY, JSON.stringify(normalized));
  stageMemberBearerForLegacyProductClients(normalized.accessToken);
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
  try {
    const normalized = normalizeSession(JSON.parse(raw));
    if (!normalized) {
      discardMemberSession();
      return null;
    }
    return normalized;
  } catch {
    discardMemberSession();
    return null;
  }
}

export function readGuestBearer() {
  const pendingRaw = readSession(PENDING_GUEST_TOKEN_KEY);
  const pending = normalizeGuestBearer(pendingRaw);
  if (pending) return pending;
  if (pendingRaw !== null) removeSession(PENDING_GUEST_TOKEN_KEY);

  const tokenRaw = readSession(GUEST_TOKEN_KEY);
  const token = normalizeGuestBearer(tokenRaw);
  if (token) return token;
  if (tokenRaw !== null && !isJwtLike(tokenRaw)) removeSession(GUEST_TOKEN_KEY);
  return null;
}

export async function ensureGuestBearer() {
  const existing = readGuestBearer();
  if (existing) return existing;

  const request = guestBootstrapInFlight ??= (async () => {
    const data = await postJson('/api/session/bootstrap', {});
    const guestSession = isRecord(data) && isRecord(data.guestSession) ? data.guestSession : null;
    const token = normalizeGuestBearer(guestSession?.bearerToken);
    if (!isRecord(data) || data.kind !== 'guest' || !token) {
      throw new ProductAuthError('WEB_AUTH_GUEST_PREPARE_FAILED', '게스트 세션을 준비하지 못했습니다.');
    }

    const racedExisting = readGuestBearer();
    if (racedExisting) return racedExisting;

    writeSession(GUEST_TOKEN_KEY, token);
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
  return Object.freeze({ kind: 'guest', token });
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
      // Local sign-out is still authoritative for this browser session.
    }
  }
  discardMemberSession();
}

export function clearPromotedGuestBearer() {
  removeSession(PENDING_GUEST_TOKEN_KEY);
  const active = readSession(GUEST_TOKEN_KEY);
  if (active && !isJwtLike(active)) removeSession(GUEST_TOKEN_KEY);
}

export const PRODUCT_AUTH_STORAGE_V1 = Object.freeze({
  memberSession: MEMBER_SESSION_KEY,
  guestBearer: GUEST_TOKEN_KEY,
  pendingGuestBearer: PENDING_GUEST_TOKEN_KEY,
  changedEvent: AUTH_CHANGED_EVENT,
});