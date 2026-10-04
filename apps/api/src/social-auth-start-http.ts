import {
  AuthenticatedJsonRequestBodyTooLargeV1,
  readAuthenticatedJsonRequestBodyV1,
} from './authenticated-json-request-resource.js';
import {
  MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
  type ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';

const NO_STORE = 'no-store' as const;
const MOBILE_SOCIAL_REDIRECT_SCHEME = 'myeongha:' as const;
const MOBILE_SOCIAL_REDIRECT_HOST = 'auth' as const;
const MOBILE_SOCIAL_REDIRECT_PATH = '/callback' as const;
const SOCIAL_AUTH_STATE_TTL_MS = 10 * 60 * 1000;

export const SOCIAL_AUTH_PROVIDER_ENV_V1 = Object.freeze({
  google: 'MYEONGHA_SOCIAL_AUTH_GOOGLE_ENABLED',
  kakao: 'MYEONGHA_SOCIAL_AUTH_KAKAO_ENABLED',
  naver: 'MYEONGHA_SOCIAL_AUTH_NAVER_ENABLED',
} as const);

export type SocialAuthProviderServerV1 = keyof typeof SOCIAL_AUTH_PROVIDER_ENV_V1;

const SUPABASE_PROVIDER_V1 = Object.freeze({
  google: 'google',
  kakao: 'kakao',
  naver: 'custom:naver',
} as const satisfies Record<SocialAuthProviderServerV1, string>);

function response(data: unknown, status = 200): Response {
  return Response.json(
    { ok: true, data },
    { status, headers: { 'Cache-Control': NO_STORE } },
  );
}

function failure(code: string, status: number): Response {
  return Response.json(
    {
      ok: false,
      error: {
        code,
        messageKey: `auth.${code.toLowerCase()}`,
        retryable: status >= 500 && code !== 'SOCIAL_AUTH_PROVIDER_DISABLED',
      },
    },
    { status, headers: { 'Cache-Control': NO_STORE } },
  );
}

function cancelUnusedRequestBody(request: Request): void {
  if (request.body === null || request.bodyUsed) return;
  try {
    void request.body.cancel().catch(() => undefined);
  } catch {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseProvider(value: unknown): SocialAuthProviderServerV1 | null {
  return value === 'google' || value === 'kakao' || value === 'naver'
    ? value
    : null;
}

function parseRedirectUri(value: unknown): URL | null {
  if (typeof value !== 'string' || value.length > 512) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (
    url.protocol !== MOBILE_SOCIAL_REDIRECT_SCHEME ||
    url.hostname !== MOBILE_SOCIAL_REDIRECT_HOST ||
    url.pathname !== MOBILE_SOCIAL_REDIRECT_PATH ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    return null;
  }
  return url;
}

function providerEnabled(
  env: ProductionUserDataRuntimeEnvV1,
  provider: SocialAuthProviderServerV1,
): boolean {
  return env[SOCIAL_AUTH_PROVIDER_ENV_V1[provider]]?.trim().toLowerCase() === 'true';
}

function randomState(): string {
  return crypto.randomUUID().replaceAll('-', '');
}

export async function handleSocialAuthStartRequestV1(input: {
  readonly request: Request;
  readonly env: ProductionUserDataRuntimeEnvV1;
  readonly nowEpochMs?: () => number;
}): Promise<Response> {
  if (input.request.method !== 'POST') {
    cancelUnusedRequestBody(input.request);
    return new Response(null, {
      status: 405,
      headers: { Allow: 'POST', 'Cache-Control': NO_STORE },
    });
  }

  let body: unknown;
  try {
    body = await readAuthenticatedJsonRequestBodyV1(input.request);
  } catch (error) {
    if (error instanceof AuthenticatedJsonRequestBodyTooLargeV1) {
      return failure('INVALID_REQUEST', 400);
    }
    return failure('INVALID_REQUEST', 400);
  }

  if (!isRecord(body)) return failure('INVALID_REQUEST', 400);
  const provider = parseProvider(body.provider);
  const redirectUri = parseRedirectUri(body.redirectUri);
  if (provider === null || redirectUri === null) {
    return failure('INVALID_REQUEST', 400);
  }

  if (!providerEnabled(input.env, provider)) {
    return failure('SOCIAL_AUTH_PROVIDER_DISABLED', 503);
  }

  const state = randomState();
  redirectUri.searchParams.set('state', state);

  const authorizationUrl = new URL(
    '/auth/v1/authorize',
    MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
  );
  authorizationUrl.searchParams.set('provider', SUPABASE_PROVIDER_V1[provider]);
  authorizationUrl.searchParams.set('redirect_to', redirectUri.toString());

  const now = input.nowEpochMs?.() ?? Date.now();
  return response(Object.freeze({
    provider,
    authorizationUrl: authorizationUrl.toString(),
    state,
    expiresAt: new Date(now + SOCIAL_AUTH_STATE_TTL_MS).toISOString(),
  }));
}
