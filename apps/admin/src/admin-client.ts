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
  if (!jwtLike(token) || !/^\/api\/admin\/[a-z0-9/?=&-]+$/u.test(path)) {
    throw new Error('관리자 조회 경로 또는 세션이 유효하지 않습니다.');
  }
  const response = await fetchImpl(path, {
    method: 'GET',
    headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
    cache: 'no-store',
    credentials: 'omit',
  });
  if (response.status === 403 || response.status === 401) {
    throw new Error('관리자 접근 권한이 거부되었습니다.');
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
