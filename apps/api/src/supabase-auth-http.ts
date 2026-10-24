import { denyUnverifiedInitialIdentityAdmissionV1 } from './portone-v2-preidentity-admission-v1.js';
import { expirePortOnePreenrollmentCookieV1 } from './portone-v2-preenrollment-age-authority-v1.js';
import {
  MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
  PRODUCTION_USER_DATA_RUNTIME_ENV_V1,
  type ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';
import {
  createIngressRequestBodyCompletionDeadlineLeaseV1,
  IngressRequestBodyCompletionDeadlineExceededV1,
} from './ingress-request-body-deadline.js';
import { fetchSupabaseAuthWithDeadlineV1 } from './supabase-auth-upstream-deadline.js';
import {
  clearMemberRefreshCookieV1,
  readMemberRefreshCookieV1,
  setMemberRefreshCookieV1,
} from './member-refresh-cookie.js';
import {
  SUPABASE_AUTH_JSON_RESPONSE_MAXIMUM_BYTES_V1,
  UpstreamJsonResponseTooLargeV1,
  readBoundedUpstreamJsonTextV1,
} from './upstream-json-response-resource.js';
import {
  createPwnedPasswordCompromiseGuardV1,
  type PasswordCompromiseGuardPortV1,
} from './breached-password-guard.js';

const NO_STORE = 'no-store' as const;
const MAX_AUTH_BODY_BYTES = 16_384;

/** Cookie clearing never replaces server-side one-shot consumption. */
function eraseUsedPreenrollmentCookieV1(response: Response): Response {
  response.headers.append('Set-Cookie', expirePortOnePreenrollmentCookieV1());
  return response;
}
const JSON_HEADERS = Object.freeze({
  Accept: 'application/json',
  'Content-Type': 'application/json',
} as const);
const MYEONGHA_PRODUCTION_WEB_ORIGIN = 'https://myeongha.vercel.app' as const;
const WEB_AUTH_TRANSPORT_HEADER_V1 = 'x-myeongha-auth-transport' as const;
const WEB_AUTH_TRANSPORT_VALUE_V1 = 'web-cookie-v1' as const;
const ALLOWED_AUTH_NEXT_PAGES = new Set([
  'hall.html',
  'reading.html',
  'reading-detail.html',
  'chat-hub.html',
  'chat.html',
  'records.html',
  'my.html',
]);

export type SupabaseAuthActionV1 =
  | 'sign-in'
  | 'sign-up'
  | 'refresh'
  | 'social-complete'
  | 'sign-out';

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

function clientSession(session: AuthSessionV1) {
  return Object.freeze({
    accessToken: session.accessToken,
    expiresAt: session.expiresAt,
    tokenType: session.tokenType,
    user: session.user,
  });
}

function usesWebCookieTransport(request: Request): boolean {
  return request.headers.get(WEB_AUTH_TRANSPORT_HEADER_V1) === WEB_AUTH_TRANSPORT_VALUE_V1;
}

function authenticatedResponse(
  session: AuthSessionV1,
  extraData: Readonly<Record<string, unknown>> = {},
  webCookieTransport = false,
): Response {
  const result = response({
    ok: true,
    data: {
      status: 'authenticated',
      session: webCookieTransport ? clientSession(session) : session,
      ...extraData,
    },
  });
  return webCookieTransport
    ? setMemberRefreshCookieV1(result, session.refreshToken)
    : result;
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
  const stream = request.body;
  const length = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(length) && length > MAX_AUTH_BODY_BYTES) {
    if (stream !== null) void stream.cancel().catch(() => undefined);
    return null;
  }

  if (stream === null) return null;

  const reader = stream.getReader();
  const deadline = createIngressRequestBodyCompletionDeadlineLeaseV1();
  const buffer = new Uint8Array(MAX_AUTH_BODY_BYTES);
  let totalBytes = 0;

  try {
    for (;;) {
      const { done, value } = await deadline.waitFor(reader.read());
      if (done) break;
      if (value === undefined || value.byteLength === 0) continue;
      if (value.byteLength > MAX_AUTH_BODY_BYTES - totalBytes) {
        return null;
      }
      buffer.set(value, totalBytes);
      totalBytes += value.byteLength;
    }
  } catch (error) {
    if (error instanceof IngressRequestBodyCompletionDeadlineExceededV1) throw error;
    return null;
  } finally {
    deadline.release();
    try {
      void reader.cancel().catch(() => undefined);
    } catch {
    } finally {
      try {
        reader.releaseLock();
      } catch {
      }
    }
  }

  try {
    const value: unknown = JSON.parse(
      new TextDecoder().decode(buffer.subarray(0, totalBytes)),
    );
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

function normalizeAuthNext(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return 'hall.html';
  try {
    const resolved = new URL(value, `${MYEONGHA_PRODUCTION_WEB_ORIGIN}/auth.html`);
    if (resolved.origin !== MYEONGHA_PRODUCTION_WEB_ORIGIN) return 'hall.html';
    const page = resolved.pathname.split('/').pop() ?? '';
    if (!ALLOWED_AUTH_NEXT_PAGES.has(page)) return 'hall.html';
    return `${page}${resolved.search}${resolved.hash}`;
  } catch {
    return 'hall.html';
  }
}

function signupRedirectPath(body: Record<string, unknown>): string {
  const redirect = new URL('/auth.html', MYEONGHA_PRODUCTION_WEB_ORIGIN);
  redirect.searchParams.set('confirmed', '1');
  redirect.searchParams.set('next', normalizeAuthNext(body.next));
  return `/auth/v1/signup?redirect_to=${encodeURIComponent(redirect.toString())}`;
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

function cancelUnusedResponseBody(response: Response): void {
  if (response.body === null) return;
  void response.body.cancel().catch(() => undefined);
}

async function callSupabase(
  config: AuthProxyConfigV1,
  path: string,
  init: Omit<RequestInit, 'signal'>,
  responseMode: 'json' | 'status-only' = 'json',
): Promise<{ response: Response; payload: unknown }> {
  const deadline = await fetchSupabaseAuthWithDeadlineV1(
    globalThis.fetch,
    `${config.supabaseOrigin}${path}`,
    {
      ...init,
      headers: {
        ...JSON_HEADERS,
        apikey: config.supabaseApiKey,
        ...(init.headers ?? {}),
      },
      cache: 'no-store',
    },
  );

  try {
    if (!deadline.response.ok) {
      cancelUnusedResponseBody(deadline.response);
      return { response: deadline.response, payload: null };
    }

    if (responseMode === 'status-only') {
      cancelUnusedResponseBody(deadline.response);
      return { response: deadline.response, payload: null };
    }

    let payload: unknown = null;
    try {
      const text = await readBoundedUpstreamJsonTextV1(deadline.response, {
        maximumBodyBytes: SUPABASE_AUTH_JSON_RESPONSE_MAXIMUM_BYTES_V1,
        signal: deadline.signal,
      });
      payload = JSON.parse(text) as unknown;
    } catch (error) {
      if (error instanceof UpstreamJsonResponseTooLargeV1) throw error;
      if (deadline.signal.aborted) throw error;
      payload = null;
    }
    return { response: deadline.response, payload };
  } finally {
    deadline.release();
  }
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

export interface SupabasePreenrollmentMemberBindingPortV1 {
  /** Server-validated HttpOnly actor proof, before sending Signup upstream. */
  readVerified(): Promise<boolean>;
  /** Trusted Supabase response UUID only; consumes proof & creates Member+age atomically. */
  bindMember(verifiedAuthUserId: string): Promise<void>;
  /** Existing verified Social Members must never be rewritten or re-issued. */
  admitExistingMember?(verifiedAuthUserId: string): Promise<boolean>;
  /** HMAC-signed OAuth state bound to same HttpOnly actor as provider proof. */
  issueSocialState?(nowEpochMs: number): string;
  verifySocialState?(state: string): boolean;
}

export async function handleSupabaseAuthRequestV1(input: {
  readonly request: Request;
  readonly env: ProductionUserDataRuntimeEnvV1;
  readonly action: SupabaseAuthActionV1;
  readonly passwordCompromiseGuard?: PasswordCompromiseGuardPortV1;
  readonly preenrollmentMemberPort?: SupabasePreenrollmentMemberBindingPortV1;
}): Promise<Response> {
  if (input.request.method !== 'POST') {
    return new Response(null, {
      status: 405,
      headers: { Allow: 'POST', 'Cache-Control': NO_STORE },
    });
  }

  const config = parseConfig(input.env);
  const webCookieTransport = usesWebCookieTransport(input.request);

  try {
    if (input.action === 'sign-up' || input.action === 'social-complete') {
      const denied = denyUnverifiedInitialIdentityAdmissionV1({
        env: input.env,
        surface: input.action === 'sign-up' ? 'member-sign-up' : 'social-complete',
      });
      if (denied !== null) {
        if (input.preenrollmentMemberPort === undefined) {
          return denied;
        }
        if (input.action === 'sign-up') {
          try {
            if (!await input.preenrollmentMemberPort.readVerified()) {
              return errorResponse('AGE_VERIFICATION_REQUIRED', 403);
            }
          } catch {
            return errorResponse('AGE_VERIFICATION_UNAVAILABLE', 503);
          }
        }
      }
    }
    if (input.action === 'sign-out') {
      const authorization = input.request.headers.get('authorization');
      if (!authorization || !/^Bearer [^\s,]+$/u.test(authorization)) {
        const denied = errorResponse('AUTH_REQUIRED', 401);
        return webCookieTransport ? clearMemberRefreshCookieV1(denied) : denied;
      }
      const upstream = await callSupabase(config, '/auth/v1/logout', {
        method: 'POST',
        headers: { Authorization: authorization },
        body: '{}',
      }, 'status-only');
      if (!upstream.response.ok) {
        const mapped = upstreamError(input.action, upstream.response.status);
        return webCookieTransport ? clearMemberRefreshCookieV1(mapped) : mapped;
      }
      const signedOut = response({ ok: true, data: { signedOut: true } });
      return webCookieTransport ? clearMemberRefreshCookieV1(signedOut) : signedOut;
    }

    if (input.action === 'social-complete') {
      if (!webCookieTransport) return errorResponse('INVALID_REQUEST', 400);

      const completeBody = await readObjectBody(input.request);
      const refreshToken = completeBody === null
        ? null
        : readRequiredString(completeBody, 'refreshToken', 4096);
      const providedState = completeBody === null
        ? null
        : readRequiredString(completeBody, 'state', 128);
      if (refreshToken === null || /\s/u.test(refreshToken) ||
          providedState === null || !/^[A-Za-z0-9_-]{16,128}$/u.test(providedState)) {
        // Existing verified Social Members also need a well-formed OAuth
        // correlation value. Never exchange an uncorrelated refresh token.
        return errorResponse('INVALID_REQUEST', 400);
      }

      const upstream = await callSupabase(config, '/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!upstream.response.ok) {
        return upstreamError('refresh', upstream.response.status);
      }
      const session = normalizeSession(upstream.payload);
      if (session === null) return errorResponse('AUTH_UPSTREAM_MALFORMED', 502);
      let newlyBoundSocialMember = false;
      if (input.preenrollmentMemberPort !== undefined) {
        // OFF/legacy social sign-in keeps its original transport contract.
        // Once A1 is enabled, binding always requires a trusted upstream UUID.
        if (session.user.id === null) return errorResponse('AUTH_UPSTREAM_MALFORMED', 502);
        try {
          const existing = await input.preenrollmentMemberPort.admitExistingMember?.(session.user.id) ?? false;
          if (!existing) {
            // OAuth may create a fresh Supabase user before the callback.
            // Such a user never receives MyeongHa tokens without a still-live,
            // independently verified browser-bound age proof.
            if (!await input.preenrollmentMemberPort.readVerified()) {
              return errorResponse('AGE_VERIFICATION_REQUIRED', 403);
            }
            // A different fresh age cookie cannot complete an OAuth attempt
            // initiated by somebody else's verified pre-account actor.
            if (providedState === null ||
                input.preenrollmentMemberPort.verifySocialState?.(providedState) !== true) {
              return errorResponse('SOCIAL_AUTH_CALLBACK_STATE_MISMATCH', 403);
            }
            try {
              await input.preenrollmentMemberPort.bindMember(session.user.id);
            } catch {
              // Social login may have minted an upstream Auth user, but it
              // has no verified-age Subject. No tokens/cookies are released.
              return errorResponse('AGE_BINDING_RECOVERY_REQUIRED', 503);
            }
            newlyBoundSocialMember = true;
          }
        } catch {
          return errorResponse('AGE_VERIFICATION_UNAVAILABLE', 503);
        }
      }
      const socialResponse = authenticatedResponse(session, {}, true);
      return newlyBoundSocialMember
        ? eraseUsedPreenrollmentCookieV1(socialResponse) : socialResponse;
    }

    if (input.action === 'refresh') {
      let refreshToken: string | null;
      if (webCookieTransport) {
        refreshToken = readMemberRefreshCookieV1(input.request);
      } else {
        const refreshBody = await readObjectBody(input.request);
        refreshToken = refreshBody === null
          ? null
          : readRequiredString(refreshBody, 'refreshToken', 4096);
      }

      if (refreshToken === null) {
        const expired = errorResponse('SESSION_EXPIRED', 401);
        return webCookieTransport ? clearMemberRefreshCookieV1(expired) : expired;
      }

      const upstream = await callSupabase(config, '/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!upstream.response.ok) {
        const mapped = upstreamError(input.action, upstream.response.status);
        if (
          webCookieTransport &&
          (
            upstream.response.status === 400 ||
            upstream.response.status === 401 ||
            upstream.response.status === 422
          )
        ) {
          return clearMemberRefreshCookieV1(mapped);
        }
        return mapped;
      }
      const session = normalizeSession(upstream.payload);
      if (session === null) return errorResponse('AUTH_UPSTREAM_MALFORMED', 502);
      return authenticatedResponse(session, {}, webCookieTransport);
    }

    const body = await readObjectBody(input.request);
    if (body === null) return errorResponse('INVALID_REQUEST', 400);

    const rawEmail = readRequiredString(body, 'email', 320);
    const password = readRequiredString(body, 'password', 1024);
    const email = rawEmail === null ? null : normalizeEmail(rawEmail);
    if (email === null || password === null) return errorResponse('INVALID_REQUEST', 400);

    const passwordCompromiseGuard = input.passwordCompromiseGuard
      ?? createPwnedPasswordCompromiseGuardV1();

    if (input.action === 'sign-up') {
      const compromiseCheck = await passwordCompromiseGuard.check(password);
      if (compromiseCheck.status === 'compromised') {
        return errorResponse('COMPROMISED_PASSWORD', 422);
      }
      if (compromiseCheck.status === 'unavailable') {
        return errorResponse('PASSWORD_SECURITY_UNAVAILABLE', 503);
      }
    }

    const path = input.action === 'sign-in'
      ? '/auth/v1/token?grant_type=password'
      : signupRedirectPath(body);
    const upstream = await callSupabase(config, path, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (!upstream.response.ok) return upstreamError(input.action, upstream.response.status);

    const session = normalizeSession(upstream.payload);
    if (session !== null) {
      if (input.action === 'sign-in') {
        const compromiseCheck = await passwordCompromiseGuard.check(password);
        if (compromiseCheck.status === 'compromised') {
          try {
            await callSupabase(config, '/auth/v1/logout', {
              method: 'POST',
              headers: { Authorization: `Bearer ${session.accessToken}` },
              body: '{}',
            }, 'status-only');
          } catch {
            // The compromised credential never receives the newly-created session tokens.
          }
          return errorResponse('COMPROMISED_PASSWORD', 403);
        }
        // Recovery after Supabase accepted a Signup but binding failed:
        // the Auth user can later sign in with password AND a fresh verified
        // pre-enrollment cookie. Never mint a new Subject for existing Members.
        // A missing/expired proof does not block login needed for privacy
        // rights; downstream personalization still requires verified age.
        let recoveredMember = false;
        if (input.preenrollmentMemberPort !== undefined) {
          if (session.user.id === null) return errorResponse('AUTH_UPSTREAM_MALFORMED', 502);
          try {
            const existing = await input.preenrollmentMemberPort.admitExistingMember?.(
              session.user.id,
            ) ?? false;
            if (!existing && await input.preenrollmentMemberPort.readVerified()) {
              await input.preenrollmentMemberPort.bindMember(session.user.id);
              recoveredMember = true;
            }
          } catch {
            // A failed attempted recovery must not claim successful age binding
            // or return a newly issued session as evidence of that binding.
            return errorResponse('AGE_VERIFICATION_UNAVAILABLE', 503);
          }
        }
        const signInResponse = authenticatedResponse(
          session,
          { passwordCompromiseCheck: compromiseCheck.status },
          webCookieTransport,
        );
        return recoveredMember
          ? eraseUsedPreenrollmentCookieV1(signInResponse) : signInResponse;
      }
      if (input.action === 'sign-up' && input.preenrollmentMemberPort !== undefined) {
        if (session.user.id === null) return errorResponse('AUTH_UPSTREAM_MALFORMED', 502);
        try {
          await input.preenrollmentMemberPort.bindMember(session.user.id);
        } catch {
          // Supabase may already have created the Auth account. Distinguish
          // this state from a failed upstream signup without exposing UUID,
          // credentials or a session. A verified password sign-in can later
          // recover the missing canonical Member binding.
          return errorResponse('AGE_BINDING_RECOVERY_REQUIRED', 503);
        }
      }
      const signupResponse = authenticatedResponse(session, {}, webCookieTransport);
      return input.action === 'sign-up' && input.preenrollmentMemberPort !== undefined
        ? eraseUsedPreenrollmentCookieV1(signupResponse) : signupResponse;
    }

    if (input.action === 'sign-up') {
      const payload = upstream.payload;
      const root = payload !== null && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
      const user = readUser(root.user ?? root);
      if (input.preenrollmentMemberPort !== undefined) {
        if (user.id === null) return errorResponse('AUTH_UPSTREAM_MALFORMED', 502);
        try {
          await input.preenrollmentMemberPort.bindMember(user.id);
        } catch {
          // An email-confirmation account may now exist upstream even though
          // canonical Subject binding failed. Never issue a success response.
          return errorResponse('AGE_BINDING_RECOVERY_REQUIRED', 503);
        }
      }
      const verificationResponse = response({
        ok: true,
        data: {
          status: 'verification_required',
          email: user.email ?? email,
        },
      });
      return input.preenrollmentMemberPort === undefined
        ? verificationResponse : eraseUsedPreenrollmentCookieV1(verificationResponse);
    }

    return errorResponse('AUTH_UPSTREAM_MALFORMED', 502);
  } catch (error) {
    if (error instanceof IngressRequestBodyCompletionDeadlineExceededV1) {
      return errorResponse('REQUEST_BODY_TIMEOUT', 408);
    }
    if (error instanceof UpstreamJsonResponseTooLargeV1) {
      return errorResponse('AUTH_UPSTREAM_MALFORMED', 502);
    }
    return errorResponse('AUTH_UPSTREAM_UNAVAILABLE', 503);
  }
}
