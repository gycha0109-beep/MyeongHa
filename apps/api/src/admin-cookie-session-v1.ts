/** Host-only, JavaScript-inaccessible Admin session, restricted to the Access-gated Worker.
 * The existing Supabase Member JWT is reverified against the server-only Owner allowlist on
 * every read; this cookie does not independently grant Owner access.
 */
export const ADMIN_SESSION_COOKIE_NAME_V1 = '__Host-MyeongHaAdminSession';
const TOKEN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u;
const MAX_AGE_SECONDS = 60 * 60;
const BASE = 'Path=/; Secure; HttpOnly; SameSite=Strict';

export function createAdminSessionCookieV1(token: string, nowMs = Date.now()): string {
  if (typeof token !== 'string' || token.length > 8192 || !TOKEN.test(token)) {
    throw new Error('Invalid Member session token');
  }
  let exp: unknown;
  try {
    const claims: unknown = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8'));
    exp = claims !== null && typeof claims === 'object' && !Array.isArray(claims)
      ? (claims as Record<string, unknown>).exp : undefined;
  } catch {
    throw new Error('Member expiry not available');
  }
  if (typeof exp !== 'number' || !Number.isSafeInteger(exp) || exp <= 0) {
    throw new Error('Invalid Member expiry');
  }
  const seconds = Math.min(MAX_AGE_SECONDS, Math.floor((exp * 1000 - nowMs) / 1000));
  if (seconds <= 0) throw new Error('Member session already expired');
  return ADMIN_SESSION_COOKIE_NAME_V1 + '=' + token + '; Max-Age=' + seconds + '; ' + BASE;
}

export function clearAdminSessionCookieV1(): string {
  return ADMIN_SESSION_COOKIE_NAME_V1 + '=; Max-Age=0; ' + BASE;
}

export function readAdminSessionCookieV1(header: string | null): string | null {
  if (typeof header !== 'string' || header.length > 16_384) return null;
  const matches = header.split(';').map(item => item.trim())
    .filter(item => item.startsWith(ADMIN_SESSION_COOKIE_NAME_V1 + '='));
  if (matches.length !== 1) return null;
  const token = matches[0]!.slice(ADMIN_SESSION_COOKIE_NAME_V1.length + 1);
  return token.length <= 8192 && TOKEN.test(token) ? token : null;
}

/** Only explicitly read-only GET APIs receive cookie-derived authorization.
 * Admin command mutations must never acquire cookie authorization automatically.
 */
export function withAdminSessionCookieV1(request: Request): Request {
  if (request.method !== 'GET' || !new URL(request.url).pathname.startsWith('/api/admin/')) {
    return request;
  }
  // Preserve explicit authenticated tooling while not allowing cookies to override it.
  if (request.headers.has('Authorization')) return request;
  const token = readAdminSessionCookieV1(request.headers.get('Cookie'));
  if (token === null) return request;
  const headers = new Headers(request.headers);
  headers.set('Authorization', 'Bearer ' + token);
  return new Request(request, { headers });
}
