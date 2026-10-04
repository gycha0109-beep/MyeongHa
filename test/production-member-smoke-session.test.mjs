import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  acquireProductionMemberSmokeSession,
} from '../scripts/production-member-smoke-session.mjs';

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_EMAIL = process.env.MYEONGHA_PRODUCTION_MEMBER_EMAIL;
const ORIGINAL_PASSWORD = process.env.MYEONGHA_PRODUCTION_MEMBER_PASSWORD;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_EMAIL === undefined) {
    delete process.env.MYEONGHA_PRODUCTION_MEMBER_EMAIL;
  } else {
    process.env.MYEONGHA_PRODUCTION_MEMBER_EMAIL = ORIGINAL_EMAIL;
  }
  if (ORIGINAL_PASSWORD === undefined) {
    delete process.env.MYEONGHA_PRODUCTION_MEMBER_PASSWORD;
  } else {
    process.env.MYEONGHA_PRODUCTION_MEMBER_PASSWORD = ORIGINAL_PASSWORD;
  }
});

describe('Production Member smoke session', () => {
  it('returns the authenticated Supabase user id together with the access token', async () => {
    process.env.MYEONGHA_PRODUCTION_MEMBER_EMAIL = 'dogfood@example.com';
    process.env.MYEONGHA_PRODUCTION_MEMBER_PASSWORD = 'secret-password';

    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({
        ok: true,
        data: {
          status: 'authenticated',
          session: {
            accessToken: 'header.payload.signature',
            user: {
              id: '11111111-1111-4111-8111-111111111111',
              email: 'dogfood@example.com',
            },
          },
        },
      }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'cache-control': 'no-store',
        },
      }),
    );

    await expect(
      acquireProductionMemberSmokeSession(),
    ).resolves.toEqual({
      accessToken: 'header.payload.signature',
      verifiedAuthUserId: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('fails closed when the authenticated user id is missing or malformed', async () => {
    process.env.MYEONGHA_PRODUCTION_MEMBER_EMAIL = 'dogfood@example.com';
    process.env.MYEONGHA_PRODUCTION_MEMBER_PASSWORD = 'secret-password';

    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({
        ok: true,
        data: {
          status: 'authenticated',
          session: {
            accessToken: 'header.payload.signature',
            user: {
              id: 'not-a-uuid',
            },
          },
        },
      }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'cache-control': 'no-store',
        },
      }),
    );

    await expect(
      acquireProductionMemberSmokeSession(),
    ).rejects.toThrow(/invalid authenticated user id/i);
  });
});
