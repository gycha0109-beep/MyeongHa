export const MEMBER_REFRESH_COOKIE_BINDING_V1 = Object.freeze({
  name: 'myeongha_member_refresh_v1',
  path: '/api/auth',
  httpOnly: true,
  secure: true,
  sameSite: 'Strict',
  domain: null,
} as const);

const MAXIMUM_REFRESH_TOKEN_LENGTH_V1 = 4_096;

function normalizeRefreshToken(value: string): string | null {
  if (
    value.length === 0 ||
    value.length > MAXIMUM_REFRESH_TOKEN_LENGTH_V1 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    return null;
  }
  return value;
}

export function readMemberRefreshCookieV1(request: Request): string | null {
  const raw = request.headers.get('cookie');
  if (raw === null) return null;

  for (const segment of raw.split(';')) {
    const trimmed = segment.trim();
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    if (trimmed.slice(0, separator) !== MEMBER_REFRESH_COOKIE_BINDING_V1.name) continue;

    const encoded = trimmed.slice(separator + 1);
    let decoded: string;
    try {
      decoded = decodeURIComponent(encoded);
    } catch {
      return null;
    }
    return normalizeRefreshToken(decoded);
  }

  return null;
}

function cookieAttributes(): string {
  const binding = MEMBER_REFRESH_COOKIE_BINDING_V1;
  return `Path=${binding.path}; HttpOnly; Secure; SameSite=${binding.sameSite}`;
}

export function setMemberRefreshCookieV1(response: Response, refreshToken: string): Response {
  const normalized = normalizeRefreshToken(refreshToken);
  if (normalized === null) {
    throw new Error('Member refresh credential is invalid.');
  }
  response.headers.set(
    'Set-Cookie',
    `${MEMBER_REFRESH_COOKIE_BINDING_V1.name}=${encodeURIComponent(normalized)}; ${cookieAttributes()}`,
  );
  return response;
}

export function clearMemberRefreshCookieV1(response: Response): Response {
  response.headers.set(
    'Set-Cookie',
    `${MEMBER_REFRESH_COOKIE_BINDING_V1.name}=; ${cookieAttributes()}; Max-Age=0`,
  );
  return response;
}
