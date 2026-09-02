import { beforeAll, describe, expect, it } from 'vitest';
import birthProfileEndpoint from '../api/birth-profiles.js';

const PROFILE_ID = 'b6300000-0000-0000-0000-000000000001';
const INTERNAL_ID_PARAM = '__myeongha_birth_profile_id';

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

function rewrittenRequest(method: string): Request {
  return new Request(
    `https://myeongha.example/api/birth-profiles?${INTERNAL_ID_PARAM}=${PROFILE_ID}`,
    { method },
  );
}

describe('GET /api/birth-profiles/:id production route adapter', () => {
  it('returns governed AUTH_REQUIRED without opening PostgreSQL when credentials are absent', async () => {
    const response = await birthProfileEndpoint.fetch(rewrittenRequest('GET'));

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
  });

  it('preserves the GET-only method boundary after static dispatch', async () => {
    const response = await birthProfileEndpoint.fetch(rewrittenRequest('POST'));

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('fails closed when the internal rewrite locator is absent or polluted', async () => {
    const missing = await birthProfileEndpoint.fetch(
      new Request('https://myeongha.example/api/birth-profiles', { method: 'GET' }),
    );
    expect(missing.status).toBe(404);
    expect(missing.headers.get('cache-control')).toBe('no-store');

    const polluted = await birthProfileEndpoint.fetch(
      new Request(
        `https://myeongha.example/api/birth-profiles?${INTERNAL_ID_PARAM}=${PROFILE_ID}&extra=1`,
        { method: 'GET' },
      ),
    );
    expect(polluted.status).toBe(404);
    expect(polluted.headers.get('cache-control')).toBe('no-store');
  });
});
