export class AdminAccessDeniedErrorV1 extends Error {
  constructor() {
    super('관리자 접근 권한이 거부되었습니다.');
    this.name = 'AdminAccessDeniedErrorV1';
  }
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
 * by the server-side Owner allowlist. The token remains in component memory;
 * no localStorage, sessionStorage or refresh-token custody is introduced.
 */
export async function signInForAdminSessionV1(
  email: string,
  password: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (email.length > 254 || password.length === 0 || password.length > 1024) {
    throw new Error('로그인 입력을 확인해 주세요.');
  }
  const response = await fetchImpl('/api/auth/sign-in', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-MyeongHa-Auth-Transport': 'web-cookie-v1',
    },
    credentials: 'same-origin',
    cache: 'no-store',
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error('인증 서버에서 로그인을 완료하지 못했습니다.');
  }
  const payload: unknown = await response.json();
  const data = isRecord(payload) && payload.ok === true ? payload.data : null;
  const session = isRecord(data) && data.status === 'authenticated' ? data.session : null;
  const accessToken = isRecord(session) ? session.accessToken : null;
  if (!jwtLike(accessToken)) {
    throw new Error('관리자 인증에 사용할 회원 세션을 확인하지 못했습니다.');
  }
  return accessToken;
}

export async function fetchAdminReadV1(
  path: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AdminReadResponse> {
  if (!jwtLike(token) || !/^\/api\/admin\/[a-z0-9\/-]+(?:\?[A-Za-z0-9_.:%=&-]+)?$/iu.test(path) || path.length > 1024) {
    throw new Error('관리자 조회 경로 또는 세션이 유효하지 않습니다.');
  }
  const response = await fetchImpl(path, {
    method: 'GET',
    headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (response.status === 403 || response.status === 401) {
    throw new AdminAccessDeniedErrorV1();
  }
  if (!response.ok) {
    throw new Error('관리자 읽기 서버를 이용할 수 없습니다.');
  }
  const payload: unknown = await response.json();
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
  if (!jwtLike(token)) throw new Error('관리자 세션 자격 증명이 유효하지 않습니다.');
  const response = await fetchImpl('/api/admin/session', {
    method: 'GET',
    headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (response.status === 401 || response.status === 403) throw new AdminAccessDeniedErrorV1();
  if (!response.ok) throw new Error('관리자 권한을 확인하지 못했습니다.');
  const payload: unknown = await response.json();
  if (!isRecord(payload) || payload.authorized !== true) {
    throw new Error('관리자 권한을 확인하지 못했습니다.');
  }
}

export async function fetchAdminIssuesCsvV1(
  token: string,
  query: URLSearchParams,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (!jwtLike(token)) throw new Error('관리자 세션이 유효하지 않습니다.');
  const allowed = new Set(['limit', 'cursor', 'from', 'to', 'status', 'category']);
  for (const key of query.keys()) if (!allowed.has(key)) throw new Error('허용되지 않은 내보내기 조건입니다.');
  const res = await fetchImpl('/api/admin/issues.csv?' + query.toString(), {
    method: 'GET',
    headers: { Accept: 'text/csv', Authorization: 'Bearer ' + token },
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (res.status === 401 || res.status === 403) throw new AdminAccessDeniedErrorV1();
  if (!res.ok || !res.headers.get('content-type')?.startsWith('text/csv')) {
    throw new Error('감사된 운영 이슈 내보내기를 완료하지 못했습니다.');
  }
  const content = await res.text();
  if (content.length > 64 * 1024) throw new Error('내보내기 결과가 최대 크기를 초과했습니다.');
  return content;
}
