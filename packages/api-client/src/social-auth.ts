import {
  MyeongHaApiClientErrorV1,
  type MyeongHaApiClientV1,
} from './http.js';
import type { MemberSessionV1 } from './member-auth.js';

export const SOCIAL_AUTH_PROVIDERS_V1 =
  Object.freeze(['google', 'kakao', 'naver'] as const);

export type SocialAuthProviderV1 =
  (typeof SOCIAL_AUTH_PROVIDERS_V1)[number];

export interface SocialAuthStartResultV1 {
  readonly provider: SocialAuthProviderV1;
  readonly authorizationUrl: string;
  readonly state: string;
  readonly expiresAt: string;
}

export type SocialAuthCallbackResultV1 =
  | Readonly<{
      kind: 'authenticated';
      session: MemberSessionV1;
    }>
  | Readonly<{
      kind: 'cancelled';
      code: string;
      description: string | null;
    }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseSocialAuthProviderV1(
  value: unknown,
): SocialAuthProviderV1 {
  if (
    typeof value === 'string' &&
    (SOCIAL_AUTH_PROVIDERS_V1 as readonly string[]).includes(value)
  ) {
    return value as SocialAuthProviderV1;
  }
  throw new MyeongHaApiClientErrorV1(
    'malformed_response',
    'CLIENT_SOCIAL_AUTH_PROVIDER_INVALID',
    'Social auth provider is invalid.',
  );
}

function requireState(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9_-]{16,128}$/u.test(value)
  ) {
    throw new MyeongHaApiClientErrorV1(
      'malformed_response',
      'API_SOCIAL_AUTH_STATE_INVALID',
      'Social auth state is invalid.',
    );
  }
  return value;
}

function requireTimestamp(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new MyeongHaApiClientErrorV1(
      'malformed_response',
      'API_SOCIAL_AUTH_EXPIRY_INVALID',
      'Social auth expiry is invalid.',
    );
  }
  return value;
}

function requireAuthorizationUrl(value: unknown): string {
  if (typeof value !== 'string') {
    throw new MyeongHaApiClientErrorV1(
      'malformed_response',
      'API_SOCIAL_AUTH_URL_INVALID',
      'Social auth authorization URL is invalid.',
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new MyeongHaApiClientErrorV1(
      'malformed_response',
      'API_SOCIAL_AUTH_URL_INVALID',
      'Social auth authorization URL is invalid.',
    );
  }

  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/auth/v1/authorize'
  ) {
    throw new MyeongHaApiClientErrorV1(
      'malformed_response',
      'API_SOCIAL_AUTH_URL_INVALID',
      'Social auth authorization URL is outside the approved boundary.',
    );
  }

  return url.toString();
}

function callbackParams(url: URL): URLSearchParams {
  const merged = new URLSearchParams(url.search);
  const fragment = new URLSearchParams(
    url.hash.startsWith('#') ? url.hash.slice(1) : url.hash,
  );
  for (const [key, value] of fragment) {
    if (!merged.has(key)) merged.set(key, value);
  }
  return merged;
}

function requireCallbackToken(
  name: 'access_token' | 'refresh_token',
  value: string | null,
): string {
  if (
    value === null ||
    value.length === 0 ||
    value.length > 4096 ||
    /\s/u.test(value)
  ) {
    throw new MyeongHaApiClientErrorV1(
      'malformed_response',
      'SOCIAL_AUTH_CALLBACK_SESSION_INVALID',
      `Social auth callback ${name} is invalid.`,
    );
  }
  return value;
}

function callbackExpiry(params: URLSearchParams, nowEpochMs: number): string {
  const expiresAtRaw = params.get('expires_at');
  if (expiresAtRaw !== null && /^\d{1,12}$/u.test(expiresAtRaw)) {
    const seconds = Number(expiresAtRaw);
    if (Number.isSafeInteger(seconds) && seconds > 0) {
      return new Date(seconds * 1000).toISOString();
    }
  }

  const expiresInRaw = params.get('expires_in');
  if (expiresInRaw === null || !/^\d{1,8}$/u.test(expiresInRaw)) {
    throw new MyeongHaApiClientErrorV1(
      'malformed_response',
      'SOCIAL_AUTH_CALLBACK_SESSION_INVALID',
      'Social auth callback expiry is missing.',
    );
  }
  const seconds = Number(expiresInRaw);
  if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > 2_592_000) {
    throw new MyeongHaApiClientErrorV1(
      'malformed_response',
      'SOCIAL_AUTH_CALLBACK_SESSION_INVALID',
      'Social auth callback expiry is outside the accepted range.',
    );
  }
  return new Date(nowEpochMs + seconds * 1000).toISOString();
}

export async function startSocialAuthV1(
  client: MyeongHaApiClientV1,
  providerInput: SocialAuthProviderV1,
  redirectUri: string,
): Promise<SocialAuthStartResultV1> {
  const provider = parseSocialAuthProviderV1(providerInput);
  const data = await client.requestData({
    method: 'POST',
    path: '/api/auth/social/start',
    body: Object.freeze({ provider, redirectUri }),
  });

  if (!isRecord(data)) {
    throw new MyeongHaApiClientErrorV1(
      'malformed_response',
      'API_SOCIAL_AUTH_RESPONSE_INVALID',
      'Social auth start response is invalid.',
    );
  }

  const observedProvider = parseSocialAuthProviderV1(data.provider);
  if (observedProvider !== provider) {
    throw new MyeongHaApiClientErrorV1(
      'malformed_response',
      'API_SOCIAL_AUTH_RESPONSE_INVALID',
      'Social auth provider changed unexpectedly.',
    );
  }

  return Object.freeze({
    provider,
    authorizationUrl: requireAuthorizationUrl(data.authorizationUrl),
    state: requireState(data.state),
    expiresAt: requireTimestamp(data.expiresAt),
  });
}

export function parseSocialAuthCallbackV1(
  callbackUrl: string,
  expectedState: string,
  nowEpochMs = Date.now(),
): SocialAuthCallbackResultV1 {
  requireState(expectedState);

  let url: URL;
  try {
    url = new URL(callbackUrl);
  } catch {
    throw new MyeongHaApiClientErrorV1(
      'malformed_response',
      'SOCIAL_AUTH_CALLBACK_URL_INVALID',
      'Social auth callback URL is invalid.',
    );
  }

  if (
    url.protocol !== 'myeongha:' ||
    url.hostname !== 'auth' ||
    url.pathname !== '/callback'
  ) {
    throw new MyeongHaApiClientErrorV1(
      'malformed_response',
      'SOCIAL_AUTH_CALLBACK_URL_INVALID',
      'Social auth callback URL is outside the approved app route.',
    );
  }

  const params = callbackParams(url);
  if (params.get('state') !== expectedState) {
    throw new MyeongHaApiClientErrorV1(
      'malformed_response',
      'SOCIAL_AUTH_CALLBACK_STATE_MISMATCH',
      'Social auth callback state did not match the pending request.',
    );
  }

  const errorCode = params.get('error') ?? params.get('error_code');
  if (errorCode !== null) {
    return Object.freeze({
      kind: 'cancelled' as const,
      code: errorCode,
      description: params.get('error_description'),
    });
  }

  const tokenType = params.get('token_type');
  if (tokenType !== null && tokenType.toLowerCase() !== 'bearer') {
    throw new MyeongHaApiClientErrorV1(
      'malformed_response',
      'SOCIAL_AUTH_CALLBACK_SESSION_INVALID',
      'Social auth callback token type is invalid.',
    );
  }

  return Object.freeze({
    kind: 'authenticated' as const,
    session: Object.freeze({
      accessToken: requireCallbackToken('access_token', params.get('access_token')),
      refreshToken: requireCallbackToken('refresh_token', params.get('refresh_token')),
      expiresAt: callbackExpiry(params, nowEpochMs),
      tokenType: 'bearer' as const,
      user: Object.freeze({
        id: null,
        email: null,
      }),
    }),
  });
}
