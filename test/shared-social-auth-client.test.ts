import { describe, expect, it } from 'vitest';

import {
  MyeongHaApiClientV1,
  parseSocialAuthCallbackV1,
  startSocialAuthV1,
} from '../packages/api-client/src/index.js';

describe('shared social auth API client', () => {
  it('parses a governed social auth start response', async () => {
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.vercel.app',
      fetchImpl: async () => Response.json({
        ok: true,
        data: {
          provider: 'google',
          authorizationUrl:
            'https://cnsfpcdiyofqvhpcegfc.supabase.co/auth/v1/authorize?provider=google',
          state: '1234567890abcdef1234567890abcdef',
          expiresAt: '2026-10-04T00:10:00.000Z',
        },
      }),
    });

    await expect(startSocialAuthV1(
      client,
      'google',
      'myeongha://auth/callback',
    )).resolves.toMatchObject({
      provider: 'google',
      state: '1234567890abcdef1234567890abcdef',
    });
  });

  it('parses the Supabase mobile callback into the existing MemberSession contract', () => {
    const state = '1234567890abcdef1234567890abcdef';
    const result = parseSocialAuthCallbackV1(
      `myeongha://auth/callback?state=${state}#access_token=access123&refresh_token=refresh123&expires_in=3600&token_type=bearer`,
      state,
      Date.parse('2026-10-04T00:00:00.000Z'),
    );

    expect(result).toEqual({
      kind: 'authenticated',
      session: {
        accessToken: 'access123',
        refreshToken: 'refresh123',
        expiresAt: '2026-10-04T01:00:00.000Z',
        tokenType: 'bearer',
        user: { id: null, email: null },
      },
    });
  });

  it('rejects callback state mismatch before accepting tokens', () => {
    expect(() => parseSocialAuthCallbackV1(
      'myeongha://auth/callback?state=aaaaaaaaaaaaaaaa#access_token=a&refresh_token=b&expires_in=3600',
      'bbbbbbbbbbbbbbbb',
    )).toThrow(/state/u);
  });

  it('returns a bounded cancelled result for provider errors', () => {
    const state = '1234567890abcdef1234567890abcdef';
    expect(parseSocialAuthCallbackV1(
      `myeongha://auth/callback?state=${state}#error=access_denied&error_description=cancelled`,
      state,
    )).toEqual({
      kind: 'cancelled',
      code: 'access_denied',
      description: 'cancelled',
    });
  });
});
