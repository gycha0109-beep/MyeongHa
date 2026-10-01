import { describe, expect, it } from 'vitest';

import {
  MyeongHaApiClientV1,
  promoteGuestToNewMemberV1,
  type GuestCredentialV1,
} from '../packages/api-client/src/index.js';

const guest: GuestCredentialV1 = Object.freeze({
  kind: 'guest',
  subjectId: '11111111-1111-4111-8111-111111111111',
  guestSessionId: '22222222-2222-4222-8222-222222222222',
  bearerToken: 'opaque-guest-bearer-ABCDEFGHIJKLMNOPQRSTUVWXYZ-0123456789',
  expiresAt: '2099-01-01T00:00:00.000Z',
});

function success(data: unknown): Response {
  return Response.json({ ok: true, data }, { status: 200 });
}

describe('shared Guest promotion client', () => {
  it('sends Member and Guest evidence without client-controlled identity fields', async () => {
    let authorization: string | null = null;
    let guestBearer: string | null = null;
    let body: unknown = null;
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async (_input, init) => {
        const headers = new Headers(init?.headers);
        authorization = headers.get('Authorization');
        guestBearer = headers.get('x-myeongha-guest-bearer');
        body = JSON.parse(String(init?.body));
        return success({
          subjectId: guest.subjectId,
          kind: 'member',
          status: 'active',
          replayed: false,
        });
      },
    });

    await expect(
      promoteGuestToNewMemberV1(client, 'header.payload.signature', guest),
    ).resolves.toEqual({
      subjectId: guest.subjectId,
      kind: 'member',
      status: 'active',
      replayed: false,
    });

    expect(authorization).toBe('Bearer header.payload.signature');
    expect(guestBearer).toBe(guest.bearerToken);
    expect(body).toEqual({});
  });

  it('fails closed if promotion changes the canonical subject id', async () => {
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () => success({
        subjectId: '33333333-3333-4333-8333-333333333333',
        kind: 'member',
        status: 'active',
        replayed: false,
      }),
    });

    await expect(
      promoteGuestToNewMemberV1(client, 'header.payload.signature', guest),
    ).rejects.toMatchObject({
      code: 'API_GUEST_PROMOTION_RESPONSE_INVALID',
    });
  });
});
