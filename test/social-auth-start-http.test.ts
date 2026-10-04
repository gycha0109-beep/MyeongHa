import { describe, expect, it } from 'vitest';

import {
  handleSocialAuthStartRequestV1,
} from '../apps/api/src/social-auth-start-http.js';

function request(body: unknown) {
  return new Request('https://myeongha.vercel.app/api/auth/social/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('social auth start HTTP boundary', () => {
  it('fails closed when the provider activation flag is absent', async () => {
    const response = await handleSocialAuthStartRequestV1({
      request: request({
        provider: 'google',
        redirectUri: 'myeongha://auth/callback',
      }),
      env: {},
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: 'SOCIAL_AUTH_PROVIDER_DISABLED' },
    });
  });

  it('creates an exact mobile callback and provider authorization URL when enabled', async () => {
    const response = await handleSocialAuthStartRequestV1({
      request: request({
        provider: 'google',
        redirectUri: 'myeongha://auth/callback',
      }),
      env: { MYEONGHA_SOCIAL_AUTH_GOOGLE_ENABLED: 'true' },
      nowEpochMs: () => Date.parse('2026-10-04T00:00:00.000Z'),
    });

    expect(response.status).toBe(200);
    const payload = await response.json() as {
      data: {
        authorizationUrl: string;
        state: string;
        expiresAt: string;
      };
    };
    expect(payload.data.state).toMatch(/^[A-Za-z0-9_-]{16,128}$/u);
    expect(payload.data.expiresAt).toBe('2026-10-04T00:10:00.000Z');

    const authorize = new URL(payload.data.authorizationUrl);
    expect(authorize.origin).toBe('https://cnsfpcdiyofqvhpcegfc.supabase.co');
    expect(authorize.pathname).toBe('/auth/v1/authorize');
    expect(authorize.searchParams.get('provider')).toBe('google');

    const redirect = new URL(authorize.searchParams.get('redirect_to') ?? '');
    expect(redirect.protocol).toBe('myeongha:');
    expect(redirect.hostname).toBe('auth');
    expect(redirect.pathname).toBe('/callback');
    expect(redirect.searchParams.get('state')).toBe(payload.data.state);
  });

  it.each([
    ['kakao', 'MYEONGHA_SOCIAL_AUTH_KAKAO_ENABLED', 'kakao'],
    ['naver', 'MYEONGHA_SOCIAL_AUTH_NAVER_ENABLED', 'custom:naver'],
  ] as const)('maps %s to its governed Supabase provider identifier', async (
    provider,
    envName,
    expectedProvider,
  ) => {
    const response = await handleSocialAuthStartRequestV1({
      request: request({
        provider,
        redirectUri: 'myeongha://auth/callback',
      }),
      env: { [envName]: 'true' },
    });
    const payload = await response.json() as { data: { authorizationUrl: string } };
    expect(new URL(payload.data.authorizationUrl).searchParams.get('provider'))
      .toBe(expectedProvider);
  });

  it('rejects arbitrary redirect URIs', async () => {
    const response = await handleSocialAuthStartRequestV1({
      request: request({
        provider: 'google',
        redirectUri: 'https://evil.example/callback',
      }),
      env: { MYEONGHA_SOCIAL_AUTH_GOOGLE_ENABLED: 'true' },
    });
    expect(response.status).toBe(400);
  });
});
