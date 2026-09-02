import { beforeAll, describe, expect, it } from 'vitest';
import meEndpoint from '../api/me.js';

beforeAll(() => {
  process.env.MYEONGHA_DATABASE_URL =
    'postgresql://myeongha_runtime.cnsfpcdiyofqvhpcegfc:test-password@aws-0-test.pooler.supabase.com:5432/postgres?sslmode=require';
  process.env.MYEONGHA_DATABASE_PRINCIPAL = 'myeongha_runtime';
  process.env.MYEONGHA_SUPABASE_URL = 'https://cnsfpcdiyofqvhpcegfc.supabase.co';
  process.env.MYEONGHA_SUPABASE_API_KEY =
    'sb_publishable_test_key_material_for_api_me_runtime';
  process.env.MYEONGHA_GUEST_FINGERPRINT_SECRET =
    'test-guest-fingerprint-secret-material-at-least-thirty-two-bytes';
});

describe('GET /api/me production route adapter', () => {
  it('returns the governed AUTH_REQUIRED response without opening PostgreSQL when credentials are absent', async () => {
    const response = await meEndpoint.fetch(
      new Request('https://myeongha.example/api/me', { method: 'GET' }),
    );

    expect(response.status).toBe(401);
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

  it('preserves the source-safe GET-only method boundary at the executable route', async () => {
    const response = await meEndpoint.fetch(
      new Request('https://myeongha.example/api/me', { method: 'POST' }),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
  });
});
