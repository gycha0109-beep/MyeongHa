const MEMBER_SESSION_KEY = 'myeongha.memberSession.v1';
const GUEST_TOKEN_KEY = 'myeongha.guestBearer.v1';
const PENDING_GUEST_TOKEN_KEY = 'myeongha.pendingGuestBearer.v1';
const AUTH_CHANGED_EVENT = 'myeongha:auth-changed';
const REFRESH_SKEW_MS = 60_000;

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
  const current = readSession(GUEST_TOKEN_KEY);
  if (current && !isJwtLike(current) && !readSession(PENDING_GUEST_TOKEN_KEY)) {
    writeSession(PENDING_GUEST_TOKEN_KEY, current);
  }
  writeSession(GUEST_TOKEN_KEY, accessToken);
}

function normalizeSession(value) {
  if (!isRecord(value)) return null;
  if (
    typeof value.accessToken !== 'string' || value.accessToken.length === 0 ||
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
    if (!normalized) removeLocal(MEMBER_SESSION_KEY);
    return normalized;
  } catch {
    removeLocal(MEMBER_SESSION_KEY);
    return null;
  }
}

export function readGuestBearer() {
  const pending = readSession(PENDING_GUEST_TOKEN_KEY);
  if (typeof pending === 'string' && pending.length > 0 && !isJwtLike(pending)) return pending;
  const token = readSession(GUEST_TOKEN_KEY);
  return typeof token === 'string' && token.length > 0 && !isJwtLike(token) ? token : null;
}

export async function refreshMemberSession() {
  const current = readMemberSession();
  if (!current) return null;
  try {
    const data = await postJson('/api/auth/refresh', { refreshToken: current.refreshToken });
    if (!isRecord(data) || data.status !== 'authenticated') {
      throw new ProductAuthError('WEB_AUTH_MALFORMED_SESSION', '갱신된 세션 응답이 올바르지 않습니다.');
    }
    return saveSession(data.session);
  } catch (error) {
    removeLocal(MEMBER_SESSION_KEY);
    const active = readSession(GUEST_TOKEN_KEY);
    if (isJwtLike(active)) removeSession(GUEST_TOKEN_KEY);
    const pending = readSession(PENDING_GUEST_TOKEN_KEY);
    if (pending) {
      writeSession(GUEST_TOKEN_KEY, pending);
      removeSession(PENDING_GUEST_TOKEN_KEY);
    }
    emitAuthChanged();
    throw error;
  }
}

export async function getMemberAccessToken() {
  const current = readMemberSession();
  if (!current) return null;
  if (Date.parse(current.expiresAt) - Date.now() > REFRESH_SKEW_MS) {
    stageMemberBearerForLegacyProductClients(current.accessToken);
    return current.accessToken;
  }
  const refreshed = await refreshMemberSession();
  return refreshed?.accessToken ?? null;
}

export async function getActiveBearer() {
  try {
    const member = await getMemberAccessToken();
    if (member) return Object.freeze({ kind: 'member', token: member });
  } catch {
    const guestAfterFailure = readGuestBearer();
    return guestAfterFailure ? Object.freeze({ kind: 'guest', token: guestAfterFailure }) : null;
  }
  const guest = readGuestBearer();
  return guest ? Object.freeze({ kind: 'guest', token: guest }) : null;
}

export async function signInWithPassword(email, password) {
  const data = await postJson('/api/auth/sign-in', { email, password });
  if (!isRecord(data) || data.status !== 'authenticated') {
    throw new ProductAuthError('WEB_AUTH_MALFORMED_SESSION', '로그인 응답이 올바르지 않습니다.');
  }
  return saveSession(data.session);
}

export async function signUpWithPassword(email, password) {
  const data = await postJson('/api/auth/sign-up', { email, password });
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
  removeLocal(MEMBER_SESSION_KEY);
  const active = readSession(GUEST_TOKEN_KEY);
  if (isJwtLike(active)) removeSession(GUEST_TOKEN_KEY);
  const pending = readSession(PENDING_GUEST_TOKEN_KEY);
  if (pending) {
    writeSession(GUEST_TOKEN_KEY, pending);
    removeSession(PENDING_GUEST_TOKEN_KEY);
  }
  emitAuthChanged();
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
