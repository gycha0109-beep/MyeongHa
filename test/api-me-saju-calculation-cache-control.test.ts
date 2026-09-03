import { beforeAll, describe, expect, it } from 'vitest';
import sajuCalculationEndpoint from '../api/me/saju/calculation.js';

beforeAll(() => {
  process.env.MYEONGHA_DATABASE_URL =
    'postgresql://myeongha_runtime.cnsfpcdiyofqvhpcegfc:test-password@aws-0-test.pooler.supabase.com:5432/postgres?sslmode=require';
  process.env.MYEONGHA_DATABASE_PRINCIPAL = 'myeongha_runtime';
  process.env.MYEONGHA_SUPABASE_URL = 'https://cnsfpcdiyofqvhpcegfc.supabase.co';
  process.env.MYEONGHA_SUPABASE_API_KEY =
    'sb_publishable_test_key_material_for_api_saju_calculation_cache_control';
  process.env.MYEONGHA_GUEST_FINGERPRINT_SECRET =
    'test-guest-fingerprint-secret-material-at-least-thirty-two-bytes';
  process.env.MYEONGHA_SAJU_SERVICE_ORIGIN = 'https://saju.internal.example';
  process.env.MYEONGHA_SAJU_SERVICE_BEARER = 'test-cache-control-service-bearer';
});

describe('POST /api/me/saju/calculation production cache boundary', () => {
  it('forces no-store on unauthenticated calculation responses', async () => {
    const response = await sajuCalculationEndpoint.fetch(
      new Request('https://myeongha.example/api/me/saju/calculation', { method: 'POST' }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('forces no-store on method-boundary responses', async () => {
    const response = await sajuCalculationEndpoint.fetch(
      new Request('https://myeongha.example/api/me/saju/calculation', { method: 'GET' }),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('forces no-store when client-owned calculation input is rejected', async () => {
    const response = await sajuCalculationEndpoint.fetch(
      new Request('https://myeongha.example/api/me/saju/calculation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ calculationPolicyId: 'client-owned-policy' }),
      }),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
