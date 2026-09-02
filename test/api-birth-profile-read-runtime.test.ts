import { beforeAll, describe, expect, it } from 'vitest';
import birthProfileEndpoint from '../api/birth-profiles/[id].js';

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

describe('GET /api/birth-profiles/:id production route adapter', () => {
  it('returns governed AUTH_REQUIRED without opening PostgreSQL when credentials are absent', async () => {
    const response = await birthProfileEndpoint.fetch(
      new Request(`https://myeongha.example/api/birth-profiles/${PROFILE_ID}`, {
        method: 'GET',
      }),
    );

    await expectAuthRequired(response);
  });

  it('normalizes the Vercel-injected dynamic id query when it matches the public path id', async () => {
    const response = await birthProfileEndpoint.fetch(
      new Request(
        `https://myeongha.example/api/birth-profiles/${PROFILE_ID}?id=${PROFILE_ID}`,
        { method: 'GET' },
      ),
    );

    await expectAuthRequired(response);
  });

  it('normalizes the internal square-bracket route shape when Vercel supplies the matching id', async () => {
    const response = await birthProfileEndpoint.fetch(
      new Request(
        `https://myeongha.example/api/birth-profiles/%5Bid%5D?id=${PROFILE_ID}`,
        { method: 'GET' },
      ),
    );

    await expectAuthRequired(response);
  });

  it('does not normalize a mismatched dynamic id query', async () => {
    const response = await birthProfileEndpoint.fetch(
      new Request(
        `https://myeongha.example/api/birth-profiles/${PROFILE_ID}?id=${OTHER_PROFILE_ID}`,
        { method: 'GET' },
      ),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('does not normalize additional client query parameters', async () => {
    const response = await birthProfileEndpoint.fetch(
      new Request(
        `https://myeongha.example/api/birth-profiles/${PROFILE_ID}?id=${PROFILE_ID}&debug=1`,
        { method: 'GET' },
      ),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('preserves the GET-only method boundary for the injected dynamic route shape', async () => {
    const response = await birthProfileEndpoint.fetch(
      new Request(
        `https://myeongha.example/api/birth-profiles/${PROFILE_ID}?id=${PROFILE_ID}`,
        { method: 'POST' },
      ),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
