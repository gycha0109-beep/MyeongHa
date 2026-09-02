import { beforeAll, describe, expect, it } from 'vitest';
import bootstrapEndpoint from '../api/session/bootstrap.js';

beforeAll(() => {
  process.env.MYEONGHA_DATABASE_URL =
    'postgresql://myeongha_runtime.cnsfpcdiyofqvhpcegfc:test-password@aws-0-test.pooler.supabase.com:5432/postgres?sslmode=require';
  process.env.MYEONGHA_DATABASE_PRINCIPAL = 'myeongha_runtime';
  process.env.MYEONGHA_SUPABASE_URL = 'https://cnsfpcdiyofqvhpcegfc.supabase.co';
  process.env.MYEONGHA_SUPABASE_API_KEY =
    'sb_publishable_test_key_material_for_guest_bootstrap_runtime';
  process.env.MYEONGHA_GUEST_FINGERPRINT_SECRET =
    'test-guest-fingerprint-secret-material-at-least-thirty-two-bytes';
  process.env.MYEONGHA_GUEST_SESSION_TTL_SECONDS = '604800';
});

describe('POST /api/session/bootstrap production route adapter', () => {
  it('preserves the source-safe POST-only method boundary without opening PostgreSQL', async () => {
    const response = await bootstrapEndpoint.fetch(
      new Request('https://myeongha.example/api/session/bootstrap', { method: 'GET' }),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe('');
  });
});
