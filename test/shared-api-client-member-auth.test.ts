import { describe, expect, it } from 'vitest';

import {
  MyeongHaApiClientV1,
  isMemberSessionExpiredV1,
  parseStoredMemberSessionV1,
  refreshMemberSessionV1,
  serializeMemberSessionV1,
  signInMemberV1,
  signOutMemberV1,
} from '../packages/api-client/src/index.js';

const session = Object.freeze({
  accessToken: 'header.payload.signature',
  refreshToken: 'refresh-token',
  expiresAt: '2099-01-01T00:00:00.000Z',
  tokenType: 'bearer' as const,
  user: Object.freeze({
    id: '11111111-1111-4111-8111-111111111111',
    email: 'member@example.com',
  }),
});

function success(data: unknown): Response {
  return Response.json({ ok: true, data }, { status: 200 });
}

describe('shared Member auth client', () => {
  it('signs in through the server auth proxy without exposing Supabase credentials', async () => {
    let path = '';
    let body = '';
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async (input, init) => {
        path = new URL(String(input)).pathname;
        body = String(init?.body ?? '');
        return success({ status: 'authenticated', session });
      },
    });

    await expect(
      signInMemberV1(client, ' MEMBER@example.com ', 'secret-password'),
    ).resolves.toEqual(session);

    expect(path).toBe('/api/auth/sign-in');
    expect(JSON.parse(body)).toEqual({
      email: 'member@example.com',
      password: 'secret-password',
    });
  });

  it('refreshes rotated Member credentials through the server boundary', async () => {
    let path = '';
    let body = '';
    const replacement = Object.freeze({
      ...session,
      accessToken: 'new.header.signature',
      refreshToken: 'rotated-refresh-token',
    });
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async (input, init) => {
        path = new URL(String(input)).pathname;
        body = String(init?.body ?? '');
        return success({ status: 'authenticated', session: replacement });
      },
    });

    await expect(
      refreshMemberSessionV1(client, session.refreshToken),
    ).resolves.toEqual(replacement);
    expect(path).toBe('/api/auth/refresh');
    expect(JSON.parse(body)).toEqual({ refreshToken: session.refreshToken });
  });

  it('signs out with the Member bearer', async () => {
    let authorization: string | null = null;
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async (_input, init) => {
        authorization = new Headers(init?.headers).get('Authorization');
        return success({ signedOut: true });
      },
    });

    await expect(signOutMemberV1(client, session.accessToken)).resolves.toBeUndefined();
    expect(authorization).toBe(`Bearer ${session.accessToken}`);
  });

  it('round-trips persisted sessions and checks expiry without JWT decoding', () => {
    const serialized = serializeMemberSessionV1(session);
    expect(parseStoredMemberSessionV1(serialized)).toEqual(session);
    expect(
      isMemberSessionExpiredV1(session, Date.parse('2098-12-31T00:00:00.000Z')),
    ).toBe(false);
    expect(
      isMemberSessionExpiredV1(session, Date.parse('2099-01-01T00:00:00.000Z')),
    ).toBe(true);
  });
});
