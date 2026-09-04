import {
  MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
  PRODUCTION_USER_DATA_RUNTIME_ENV_V1,
  type ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';

const NO_STORE = 'no-store' as const;
const JSON_HEADERS = Object.freeze({
  Accept: 'application/json',
  'Content-Type': 'application/json',
} as const);

export type SupabaseAuthActionV1 = 'sign-in' | 'sign-up' | 'refresh' | 'sign-out';

interface AuthProxyConfigV1 {
  readonly supabaseOrigin: typeof MYEONGHA_PRODUCTION_SUPABASE_ORIGIN;
  readonly supabaseApiKey: string;
}

interface AuthSessionV1 {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: string;
  readonly tokenType: 'bearer';
  readonly user: Readonly<{
    id: string | null;
    email: string | null;
  }>;
}

function response(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': NO_STORE },
  });
}

function errorResponse(code: string, status: number): Response {
  return response(
    {
      ok: false,
      error: {
        code,
        messageKey: `auth.${code.toLowerCase()}`,
        retryable: status >= 500,
      },
    },
    status,
  );
}

function parseConfig(env: ProductionUserDataRuntimeEnvV1): AuthProxyConfigV1 {
  const rawUrl = env[PRODUCTION_USER_DATA_RUNTIME_ENV_V1.supabaseUrl];
  const rawKey = env[PRODUCTION_USER_DATA_RUNTIME_ENV_V1.supabaseApiKey];
  if (typeof rawUrl !== 'string' || rawUrl.trim() !== MYEONGHA_PRODUCTION_SUPABASE_ORIGIN) {
    throw new Error('Auth proxy Supabase origin is not the governed production project.');
  }
  if (typeof rawKey !== 'string' || rawKey.trim().length < 20) {
    throw new Error('Auth proxy Supabase API key is unavailable.');
  }
  return Object.freeze({
    supabaseOrigin: MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
    supabaseApiKey: rawKey.trim(),
  });
}

async function readObjectBody(request: Request): Promise<Record<string, unknown> | null> {
  const length = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(length) && length > 16_384) return null;
  try {
    const value: unknown = await request.json();
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function readRequiredString(
  body: Record<string, unknown>,
  field: string,
  maximum: number,
): string | null {
  const value = body[field];
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum) return null;
  return value;
}

function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 320 || !email.includes('@')) return null;
  return email;
}

function readUser(value: unknown): { id: string | null; email: string | null } {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { id: null, email: null };
  }
  const record = value as Record<string, unknown>;
  return {
    id: typeof record.id === 'string' && record.id.length > 0 ? record.id : null,
    email: typeof record.email === 'string' && record.email.length > 0 ? record.email : null,
  };
}

function normalizeSession(payload: unknown): AuthSessionV1 | null {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const root = payload as Record<string, unknown>;
  const nested = root.session;
  const session = nested !== null && typeof nested === 'object' && !Array.isArray(nested)
    ? (nested as Record<string, unknown>)
    : root;
  const accessToken = session.access_token;
  const refreshToken = session.refresh_token;
  if (
    typeof accessToken !== 'string' || accessToken.length === 0 ||
    typeof refreshToken !== 'string' || refreshToken.length === 0
  ) {
    return null;
  }

  const expiresAtRaw = session.expires_at;
  const expiresInRaw = session.expires_in;
  let expiresAtMs: number;
  if (typeof expiresAtRaw === 'number' && Number.isFinite(expiresAtRaw)) {
    expiresAtMs = expiresAtRaw * 1000;
  } else if (typeof expiresInRaw === 'number' && Number.isFinite(expiresInRaw)) {
    expiresAtMs = Date.now() + Math.max(1, expiresInRaw) * 1000;
  } else {
    expiresAtMs = Date.now() + 3600_000;
  }

  return Object.freeze({
    accessToken,
    refreshToken,
    expiresAt: new Date(expiresAtMs).toISOString(),
    tokenType: 'bearer' as const,
    user: Object.freeze(readUser(session.user ?? root.user ?? root)),
  });
}

async function callSupabase(
  config: AuthProxyConfigV1,
  path: string,
  init: RequestInit,
): Promise<{ response: Response; payload: unknown }> {
  const upstream = await fetch(`${config.supabaseOrigin}${path}`, {
    ...init,
    headers: {
      ...JSON_HEADERS,
      apikey: config.supabaseApiKey,
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });
  let payload: unknown = null;
  try {
    payload = await upstream.json();
  } catch {
    payload = null;
  }
  return { response: upstream, payload };
}

function upstreamError(action: SupabaseAuthActionV1, status: number): Response {
  if (status === 429) return errorResponse('RATE_LIMITED', 429);
  if (action === 'sign-in' && (status === 400 || status === 401 || status === 422)) {
    return errorResponse('INVALID_CREDENTIALS', 401);
  }
  if (action === 'sign-up' && (status === 400 || status === 409 || status === 422)) {
    return errorResponse('SIGN_UP_REJECTED', 422);
  }
  if (action === 'refresh' && (status === 400 || status === 401 || status === 422)) {
    return errorResponse('SESSION_EXPIRED', 401);
  }
  if (action === 'sign-out' && (status === 401 || status === 403)) {
    return errorResponse('SESSION_EXPIRED', 401);
  }
  return errorResponse('AUTH_UPSTREAM_UNAVAILABLE', status >= 500 ? 503 : 502);
}

export async function handleSupabaseAuthRequestV1(input: {
  readonly request: Request;
  readonly env: ProductionUserDataRuntimeEnvV1;
  readonly action: SupabaseAuthActionV1;
}): Promise<Response> {
  if (input.request.method !== 'POST') {
    return new Response(null, {
      status: 405,
      headers: { Allow: 'POST', 'Cache-Control': NO_STORE },
    });
  }

  const config = parseConfig(input.env);

  try {
    if (input.action === 'sign-out') {
      const authorization = input.request.headers.get('authorization');
      if (!authorization || !/^Bearer [^\s,]+$/u.test(authorization)) {
        return errorResponse('AUTH_REQUIRED', 401);
      }
      const upstream = await callSupabase(config, '/auth/v1/logout', {
        method: 'POST',
        headers: { Authorization: authorization },
        body: '{}',
      });
      if (!upstream.response.ok) return upstreamError(input.action, upstream.response.status);
      return response({ ok: true, data: { signedOut: true } });
    }

    const body = await readObjectBody(input.request);
    if (body === null) return errorResponse('INVALID_REQUEST', 400);

    if (input.action === 'refresh') {
      const refreshToken = readRequiredString(body, 'refreshToken', 4096);
      if (refreshToken === null) return errorResponse('INVALID_REQUEST', 400);
      const upstream = await callSupabase(config, '/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!upstream.response.ok) return upstreamError(input.action, upstream.response.status);
      const session = normalizeSession(upstream.payload);
      if (session === null) return errorResponse('AUTH_UPSTREAM_MALFORMED', 502);
      return response({ ok: true, data: { status: 'authenticated', session } });
    }

    const rawEmail = readRequiredString(body, 'email', 320);
    const password = readRequiredString(body, 'password', 1024);
    const email = rawEmail === null ? null : normalizeEmail(rawEmail);
    if (email === null || password === null) return errorResponse('INVALID_REQUEST', 400);

    const path = input.action === 'sign-in'
      ? '/auth/v1/token?grant_type=password'
      : '/auth/v1/signup';
    const upstream = await callSupabase(config, path, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (!upstream.response.ok) return upstreamError(input.action, upstream.response.status);

    const session = normalizeSession(upstream.payload);
    if (session !== null) {
      return response({ ok: true, data: { status: 'authenticated', session } });
    }

    if (input.action === 'sign-up') {
      const payload = upstream.payload;
      const root = payload !== null && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
      const user = readUser(root.user ?? root);
      return response({
        ok: true,
        data: {
          status: 'verification_required',
          email: user.email ?? email,
        },
      });
    }

    return errorResponse('AUTH_UPSTREAM_MALFORMED', 502);
  } catch {
    return errorResponse('AUTH_UPSTREAM_UNAVAILABLE', 503);
  }
}
