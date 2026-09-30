import { describe, expect, it } from 'vitest';

import {
  MyeongHaApiClientV1,
  refreshMemberSessionV1,
  signInMemberV1,
  signOutMemberV1,
} from '../packages/api-client/src/index.js';

function success(data: unknown): Response {
  return Response.json(
    { ok: true, data },
    { status: 200 },
  );
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    accessToken: 'member-access-token',
    refreshToken: 'member-refresh-token',
    expiresAt: '2026-10-01T00:00:00.000Z',
    tokenType: 'bearer',
    user: { id: 'member-user-1', email: 'member@example.com' },
    ...overrides,
  };
}

describe('shared existing-Member auth API client', () => {
  it('signs in through the governed Member auth route and parses the session', async () => {
    let requestedUrl = '';
    let requestedBody = '';
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async (input, init) => {
        requestedUrl = String(input);
        requestedBody = String(init?.body ?? '');
        return success({
          status: 'authenticated',
          session: session(),
          passwordCompromiseCheck: 'safe',
        });
      },
    });

    const result = await signInMemberV1(client, {
      email: 'member@example.com',
      password: 'secret',
    });

    expect(new URL(requestedUrl).pathname).toBe('/api/auth/sign-in');
    expect(JSON.parse(requestedBody)).toEqual({
      email: 'member@example.com',
      password: 'secret',
    });
    expect(result.session.accessToken).toBe('member-access-token');
    expect(result.passwordCompromiseCheck).toBe('safe');
  });

  it('refreshes with only the refresh token and accepts credential rotation', async () => {
    let requestedBody = '';
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async (_input, init) => {
        requestedBody = String(init?.body ?? '');
        return success({
          status: 'authenticated',
          session: session({
            accessToken: 'member-access-token-2',
            refreshToken: 'member-refresh-token-2',
          }),
        });
      },
    });

    const result = await refreshMemberSessionV1(client, 'member-refresh-token');

    expect(JSON.parse(requestedBody)).toEqual({
      refreshToken: 'member-refresh-token',
    });
    expect(result.accessToken).toBe('member-access-token-2');
    expect(result.refreshToken).toBe('member-refresh-token-2');
  });

  it('signs out with the Member access bearer and an empty JSON body', async () => {
    let authorization: string | null = null;
    let requestedBody = '';
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async (_input, init) => {
        authorization = new Headers(init?.headers).get('Authorization');
        requestedBody = String(init?.body ?? '');
        return success({ signedOut: true });
      },
    });

    await expect(signOutMemberV1(client, 'member-access-token')).resolves.toBeUndefined();
    expect(authorization).toBe('Bearer member-access-token');
    expect(JSON.parse(requestedBody)).toEqual({});
  });

  it('fails closed on a malformed successful auth payload', async () => {
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () => success({
        status: 'authenticated',
        session: { ...session(), refreshToken: '' },
      }),
    });

    await expect(
      signInMemberV1(client, { email: 'member@example.com', password: 'secret' }),
    ).rejects.toMatchObject({
      code: 'API_MEMBER_AUTH_RESPONSE_INVALID',
    });
  });
});
