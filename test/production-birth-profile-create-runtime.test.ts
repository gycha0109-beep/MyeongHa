import { describe, expect, it } from 'vitest';
import { createProductionBirthProfileCreateRuntimeV1 } from '../apps/api/src/production-birth-profile-create-runtime.js';

function productionLikeEnv(): Record<string, string> {
  return {
    MYEONGHA_DATABASE_URL:
      'postgresql://myeongha_runtime.cnsfpcdiyofqvhpcegfc:test-password@aws-0-test.pooler.supabase.com:5432/postgres?sslmode=require',
    MYEONGHA_DATABASE_PRINCIPAL: 'myeongha_runtime',
    MYEONGHA_SUPABASE_URL: 'https://cnsfpcdiyofqvhpcegfc.supabase.co',
    MYEONGHA_SUPABASE_API_KEY:
      'sb_publishable_test_key_material_for_birth_profile_create_runtime',
    MYEONGHA_GUEST_FINGERPRINT_SECRET:
      'test-guest-fingerprint-secret-material-at-least-thirty-two-bytes',
    MYEONGHA_BIRTH_INPUT_HMAC_K1_SECRET:
      'test-birth-input-hmac-k1-secret-material-at-least-thirty-two-bytes',
  };
}

describe('production Birth Profile create runtime composition', () => {
  it('fails closed when the dedicated Birth HMAC secret is absent', () => {
    const env = productionLikeEnv();
    delete env.MYEONGHA_BIRTH_INPUT_HMAC_K1_SECRET;

    expect(() =>
      createProductionBirthProfileCreateRuntimeV1({ env }),
    ).toThrow('Production Birth input HMAC k1 secret is missing or too short.');
  });

  it('composes without activating a route and preserves POST-only/no-store semantics', async () => {
    const runtime = createProductionBirthProfileCreateRuntimeV1({
      env: productionLikeEnv(),
    });

    try {
      const response = await runtime.handleRequest({
        request: new Request('https://myeongha.vercel.app/api/birth-profiles', {
          method: 'GET',
        }),
        requestId: 'request-birth-create-runtime-1',
        serverTime: '2026-09-03T08:00:00.000Z',
      });

      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('POST');
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.text()).toBe('');
    } finally {
      await runtime.close();
    }
  });
});
