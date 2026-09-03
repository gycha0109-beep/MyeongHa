import { beforeAll, describe, expect, it } from 'vitest';
import sajuCalculationEndpoint from '../api/me/saju/calculation.js';

const SERVICE_BEARER = 'test-production-saju-service-bearer-secret';

beforeAll(() => {
  process.env.MYEONGHA_DATABASE_URL =
    'postgresql://myeongha_runtime.cnsfpcdiyofqvhpcegfc:test-password@aws-0-test.pooler.supabase.com:5432/postgres?sslmode=require';
  process.env.MYEONGHA_DATABASE_PRINCIPAL = 'myeongha_runtime';
  process.env.MYEONGHA_SUPABASE_URL = 'https://cnsfpcdiyofqvhpcegfc.supabase.co';
  process.env.MYEONGHA_SUPABASE_API_KEY =
    'sb_publishable_test_key_material_for_api_saju_calculation_runtime';
  process.env.MYEONGHA_GUEST_FINGERPRINT_SECRET =
    'test-guest-fingerprint-secret-material-at-least-thirty-two-bytes';
  process.env.MYEONGHA_SAJU_SERVICE_ORIGIN = 'https://saju.internal.example';
  process.env.MYEONGHA_SAJU_SERVICE_BEARER = SERVICE_BEARER;
});

describe('POST /api/me/saju/calculation production route adapter', () => {
  it('returns governed AUTH_REQUIRED without opening PostgreSQL or calling the Saju service when credentials are absent', async () => {
    const response = await sajuCalculationEndpoint.fetch(
      new Request('https://myeongha.example/api/me/saju/calculation', { method: 'POST' }),
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
    expect(JSON.stringify(body)).not.toContain(SERVICE_BEARER);
    expect(body.meta.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
  });

  it('preserves the source-safe POST-only method boundary at the executable route', async () => {
    const response = await sajuCalculationEndpoint.fetch(
      new Request('https://myeongha.example/api/me/saju/calculation', { method: 'GET' }),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
  });

  it('rejects client-supplied calculation authority before authentication and does not reflect the service credential', async () => {
    const response = await sajuCalculationEndpoint.fetch(
      new Request('https://myeongha.example/api/me/saju/calculation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          calculationPolicyId: 'attacker-policy',
          revisionId: 'attacker-revision',
          baseUrl: 'https://attacker.example',
          bearerToken: SERVICE_BEARER,
        }),
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: false,
      error: {
        code: 'INVALID_REQUEST',
        retryable: false,
      },
    });
    expect(JSON.stringify(body)).not.toContain(SERVICE_BEARER);
  });
});
