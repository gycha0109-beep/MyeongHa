import { beforeAll, describe, expect, it } from 'vitest';
import meEndpoint from '../api/me.js';

beforeAll(() => {
  process.env.MYEONGHA_DATABASE_URL =
    'postgresql://myeongha_runtime.cnsfpcdiyofqvhpcegfc:test-password@aws-0-test.pooler.supabase.com:5432/postgres?sslmode=require';
  process.env.MYEONGHA_DATABASE_PRINCIPAL = 'myeongha_runtime';
  process.env.MYEONGHA_SUPABASE_URL = 'https://cnsfpcdiyofqvhpcegfc.supabase.co';
  process.env.MYEONGHA_SUPABASE_API_KEY =
    'sb_publishable_test_key_material_for_api_me_records_public_source_runtime';
  process.env.MYEONGHA_GUEST_FINGERPRINT_SECRET =
    'test-guest-fingerprint-secret-material-at-least-thirty-two-bytes';
});

describe('GET Records public source path dispatch', () => {
  it.each([
    ['life-record', '/api/life-record'],
    ['readings', '/api/readings'],
    ['memories', '/api/memories'],
  ] as const)(
    'accepts the Vercel-preserved %s source pathname when the private rewrite marker matches',
    async (dispatchValue, publicRoute) => {
      const response = await meEndpoint.fetch(
        new Request(
          `https://myeongha.example${publicRoute}?__myeongha_records_read=${dispatchValue}`,
          { method: 'GET' },
        ),
      );

      expect(response.status).toBe(401);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toMatchObject({
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
    },
  );

  it.each([
    'https://myeongha.example/api/life-record',
    'https://myeongha.example/api/readings',
    'https://myeongha.example/api/memories',
    'https://myeongha.example/api/life-record?__myeongha_records_read=memories',
    'https://myeongha.example/api/readings?__myeongha_records_read=life-record',
    'https://myeongha.example/api/memories?__myeongha_records_read=readings',
    'https://myeongha.example/api/chat?__myeongha_records_read=life-record',
  ])('fails closed for missing, mismatched, or foreign Records source evidence: %s', async (url) => {
    const response = await meEndpoint.fetch(new Request(url, { method: 'GET' }));

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe('');
  });
});