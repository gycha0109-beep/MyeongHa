import { beforeAll, describe, expect, it } from 'vitest';
import birthProfileEndpoint from '../api/birth-profiles.js';

const PROFILE_ID = 'b6300000-0000-0000-0000-000000000001';
const OTHER_PROFILE_ID = 'b6300000-0000-0000-0000-000000000002';

beforeAll(() => {
  process.env.MYEONGHA_DATABASE_URL =
    'postgresql://myeongha_runtime.cnsfpcdiyofqvhpcegfc:test-password@aws-0-test.pooler.supabase.com:5432/postgres?sslmode=require';
  process.env.MYEONGHA_DATABASE_PRINCIPAL = 'myeongha_runtime';
  process.env.MYEONGHA_SUPABASE_URL = 'https://cnsfpcdiyofqvhpcegfc.supabase.co';
  process.env.MYEONGHA_SUPABASE_API_KEY =
    'sb_publishable_test_key_material_for_birth_profile_runtime';
  process.env.MYEONGHA_GUEST_FINGERPRINT_SECRET =
    'test-guest-fingerprint-secret-material-at-least-thirty-two-bytes';
});

async function expectAuthRequired(response: Response): Promise<void> {
  expect(response.status).toBe(401);
  expect(response.headers.get('cache-control')).toBe('no-store');
  const body = await response.json();
  expect(body).toMatchObject({
    ok: false,
    error: {
      code: 'AUTH_REQUIRED',
      messageKey: 'auth.required',
      retryable: false,
    },
    meta: {
      apiContractVersion: 'v0.9',
    },
  });
  expect(body.meta.requestId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
  );
}

describe('GET /api/birth-profiles/:id production static dispatcher', () => {
  it('normalizes the Vercel rewrite destination shape and returns governed AUTH_REQUIRED', async () => {
    const response = await birthProfileEndpoint.fetch(
      new Request(`https://myeongha.example/api/birth-profiles?id=${PROFILE_ID}`, {
        method: 'GET',
      }),
    );

    await expectAuthRequired(response);
  });

  it('also accepts the preserved public pathname when the injected id matches', async () => {
    const response = await birthProfileEndpoint.fetch(
      new Request(
        `https://myeongha.example/api/birth-profiles/${PROFILE_ID}?id=${PROFILE_ID}`,
        { method: 'GET' },
      ),
    );

    await expectAuthRequired(response);
  });

  it('does not normalize a mismatched public path id', async () => {
    const response = await birthProfileEndpoint.fetch(
      new Request(
        `https://myeongha.example/api/birth-profiles/${PROFILE_ID}?id=${OTHER_PROFILE_ID}`,
        { method: 'GET' },
      ),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('fails closed when the injected id is absent, duplicated, or polluted', async () => {
    const missing = await birthProfileEndpoint.fetch(
      new Request('https://myeongha.example/api/birth-profiles', { method: 'GET' }),
    );
    expect(missing.status).toBe(404);
    expect(missing.headers.get('cache-control')).toBe('no-store');

    const duplicated = await birthProfileEndpoint.fetch(
      new Request(
        `https://myeongha.example/api/birth-profiles?id=${PROFILE_ID}&id=${PROFILE_ID}`,
        { method: 'GET' },
      ),
    );
    expect(duplicated.status).toBe(404);
    expect(duplicated.headers.get('cache-control')).toBe('no-store');

    const polluted = await birthProfileEndpoint.fetch(
      new Request(
        `https://myeongha.example/api/birth-profiles?id=${PROFILE_ID}&debug=1`,
        { method: 'GET' },
      ),
    );
    expect(polluted.status).toBe(404);
    expect(polluted.headers.get('cache-control')).toBe('no-store');
  });

  it('preserves the GET-only method boundary after static dispatch', async () => {
    const response = await birthProfileEndpoint.fetch(
      new Request(`https://myeongha.example/api/birth-profiles?id=${PROFILE_ID}`, {
        method: 'POST',
      }),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
