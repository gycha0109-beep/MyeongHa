import { adminFetchWithDeadlineV1, adminReadResponseBodyV1, ADMIN_READ_DEADLINE_MS_V1, ADMIN_SESSION_DEADLINE_MS_V1 } from './admin-request-deadline-v1.js';

export const ADMIN_SESSION_MARKER_V1 = 'cookie-session' as const;

export type AdminSignInFailureReasonV1 = 'invalid-credentials' | 'rate-limited' | 'upstream-unavailable' | 'invalid-session';

export class AdminSignInFailureV1 extends Error {
  constructor(readonly reason: AdminSignInFailureReasonV1) {
    super('Admin Member sign-in failed: ' + reason);
    this.name = 'AdminSignInFailureV1';
  }
}

export class AdminAccessDeniedErrorV1 extends Error {
  constructor() {
    super('관리자 접근 권한이 거부되었습니다.');
    this.name = 'AdminAccessDeniedErrorV1';
  }
}

/** Display only a bounded HTTP status and an allowlisted server reason; no response body is trusted. */
export class AdminReadUnavailableErrorV1 extends Error {
  constructor(readonly status: number, readonly reason: string | null) {
    super(status === 429
      ? 'Read request rate limited (HTTP 429). Retry after a short interval.'
      : 'Admin read failed (HTTP ' + status + (reason ? ' / ' + reason : '') + ').');
    this.name = 'AdminReadUnavailableErrorV1';
  }
}

export function shouldClearAdminSessionAfterVerificationFailureV1(error: unknown): boolean {
  return error instanceof AdminAccessDeniedErrorV1;
}

export interface AdminReadResponse {
  readonly kind: string;
  readonly rows: readonly Readonly<Record<string, string | number | boolean | null>>[];
  readonly nextCursor: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function jwtLike(value: unknown): value is string {
  return typeof value === 'string' &&
    value.length < 8192 &&
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(value);
}

/** Used only to shorten UI access; a decoded claim never grants Owner authority. */
export function adminTokenExpiresAtV1(token: string): number | null {
  if (!jwtLike(token)) return null;
  try {
    const part = token.split('.')[1]!;
    const claims: unknown = JSON.parse(atob(part.replace(/-/gu, '+').replace(/_/gu, '/')));
    if (!isRecord(claims) || typeof claims.exp !== 'number' ||
        !Number.isSafeInteger(claims.exp) || claims.exp <= 0 ||
        !Number.isSafeInteger(claims.exp * 1000)) return null;
    return claims.exp * 1000;
  } catch { return null; }
}

/**
 * Uses the existing customer Member authentication transport, but never trusts
 * its claims for Admin authorization. Every admin read is independently checked
 * The token is stored only in a server-issued HttpOnly host-only cookie;
 * no JavaScript token, localStorage, sessionStorage or refresh-token custody exists.
 */
export async function signInForAdminSessionV1(
  email: string,
  password: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (email.length > 254 || password.length === 0 || password.length > 1024) {
    throw new Error('로그인 입력을 확인해 주세요.');
  }
  const response = await adminFetchWithDeadlineV1('/api/auth/sign-in', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-MyeongHa-Auth-Transport': 'web-cookie-v1',
    },
    credentials: 'same-origin',
    cache: 'no-store',
    body: JSON.stringify({ email, password }),
  }, fetchImpl, ADMIN_READ_DEADLINE_MS_V1);
  if (!response.ok) {
    throw new AdminSignInFailureV1(response.status === 401 ? 'invalid-credentials'
      : response.status === 429 ? 'rate-limited' : 'upstream-unavailable');
  }
  const payload: unknown = await adminReadResponseBodyV1(() => response.json());
  const data = isRecord(payload) && payload.ok === true ? payload.data : null;
  const session = isRecord(data) && data.status === 'authenticated' ? data.session : null;
  if (!isRecord(session) || session.mode !== 'cookie') {
    throw new AdminSignInFailureV1('invalid-session');
  }
  return ADMIN_SESSION_MARKER_V1;
}

export async function fetchAdminReadV1(
  path: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AdminReadResponse> {
  if (token !== ADMIN_SESSION_MARKER_V1 || !/^\/api\/admin\/[a-z0-9\/-]+(?:\?[A-Za-z0-9_.:%=&-]+)?$/iu.test(path) || path.length > 1024) {
    throw new Error('관리자 조회 경로 또는 세션이 유효하지 않습니다.');
  }
  const response = await adminFetchWithDeadlineV1(path, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    credentials: 'same-origin',
  }, fetchImpl, ADMIN_READ_DEADLINE_MS_V1);
  if (response.status === 403 || response.status === 401) {
    throw new AdminAccessDeniedErrorV1();
  }
  if (!response.ok) {
    let reason: string | null = null;
    if (response.headers.get('content-type')?.includes('application/json')) {
      try {
        const raw: unknown = await adminReadResponseBodyV1(() => response.json());
        if (isRecord(raw) && typeof raw.error === 'string' &&
            /^ADMIN_[A-Z_]{3,64}$/u.test(raw.error)) reason = raw.error;
      } catch {
        // Never relay arbitrary error bodies or authentication details.
      }
    }
    throw new AdminReadUnavailableErrorV1(response.status, reason);
  }
  const payload: unknown = await adminReadResponseBodyV1(() => response.json());
  if (!isRecord(payload) || !Array.isArray(payload.rows) ||
    payload.rows.length > 50 ||
    !(payload.nextCursor === null || typeof payload.nextCursor === 'string')) {
    throw new Error('운영 데이터 응답 형식이 유효하지 않습니다.');
  }
  const rows = payload.rows.map((row: unknown) => {
    if (!isRecord(row)) throw new Error('운영 데이터 응답 형식이 유효하지 않습니다.');
    for (const value of Object.values(row)) {
      if (!(value === null || typeof value === 'string' || typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value)))) {
        throw new Error('운영 데이터 응답 형식이 유효하지 않습니다.');
      }
    }
    return row as Record<string, string | number | boolean | null>;
  });
  return {
    kind: typeof payload.kind === 'string' ? payload.kind : '',
    rows,
    nextCursor: payload.nextCursor,
  };
}

/** Rejects every Member session until the independent Admin Owner gate passes. */
export async function verifyAdminOwnerSessionV1(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (token !== ADMIN_SESSION_MARKER_V1) throw new Error('관리자 세션이 유효하지 않습니다.');
  const requestSession = () => adminFetchWithDeadlineV1('/api/admin/session', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
    cache: 'no-store',
  }, fetchImpl, ADMIN_SESSION_DEADLINE_MS_V1);
  let response = await requestSession();
  // One bounded retry for transient upstream failure. Never retry explicit denial or throttling.
  if (response.status === 502 || response.status === 503) response = await requestSession();
  if (response.status === 401 || response.status === 403) throw new AdminAccessDeniedErrorV1();
  if (!response.ok) {
    let reason: string | null = null;
    if (response.headers.get('content-type')?.includes('application/json')) {
      try {
        const body: unknown = await adminReadResponseBodyV1(() => response.json());
        if (isRecord(body) && typeof body.error === 'string' &&
            /^ADMIN_[A-Z_]{3,64}$/u.test(body.error)) reason = body.error;
      } catch {
        // Never reflect arbitrary response bodies, tokens or credentials.
      }
    }
    throw new AdminReadUnavailableErrorV1(response.status, reason);
  }
  const payload: unknown = await adminReadResponseBodyV1(() => response.json());
  if (!isRecord(payload) || payload.authorized !== true) {
    throw new Error('관리자 권한을 확인하지 못했습니다.');
  }
}

export async function fetchAdminIssuesCsvV1(
  token: string,
  query: URLSearchParams,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (token !== ADMIN_SESSION_MARKER_V1) throw new Error('관리자 세션이 유효하지 않습니다.');
  const allowed = new Set(['limit', 'cursor', 'from', 'to', 'status', 'category']);
  for (const key of query.keys()) if (!allowed.has(key)) throw new Error('허용되지 않은 내보내기 조건입니다.');
  const res = await adminFetchWithDeadlineV1('/api/admin/issues.csv?' + query.toString(), {
    method: 'GET',
    headers: { Accept: 'text/csv' },
    credentials: 'same-origin',
    cache: 'no-store',
  }, fetchImpl, ADMIN_READ_DEADLINE_MS_V1);
  if (res.status === 401 || res.status === 403) throw new AdminAccessDeniedErrorV1();
  if (!res.ok || !res.headers.get('content-type')?.startsWith('text/csv')) {
    throw new Error('감사된 운영 이슈 내보내기를 완료하지 못했습니다.');
  }
  const content = await adminReadResponseBodyV1(() => res.text());
  if (content.length > 64 * 1024) throw new Error('내보내기 결과가 최대 크기를 초과했습니다.');
  return content;
}

/** Explicit logout expires the host-only session cookie. */
export async function signOutAdminSessionV1(fetchImpl: typeof fetch = fetch): Promise<void> {
  const response = await adminFetchWithDeadlineV1('/api/admin/logout', {
    method: 'POST',
    credentials: 'same-origin', cache: 'no-store',
  }, fetchImpl, ADMIN_READ_DEADLINE_MS_V1);
  if (response.status !== 204) throw new Error('관리자 로그아웃을 완료하지 못했습니다.');
}
