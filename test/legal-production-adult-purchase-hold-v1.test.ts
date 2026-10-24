import { describe, expect, it, vi } from 'vitest';
import { createProductionPurchaseIntentCreateRuntimeV3 } from '../apps/api/src/production-purchase-intent-create-runtime-v3.js';

function env() {
  return {
    MYEONGHA_DATABASE_URL:
      'postgresql://myeongha_runtime.cnsfpcdiyofqvhpcegfc:test-password@aws-0-test.pooler.supabase.com:5432/postgres?sslmode=require',
    MYEONGHA_DATABASE_PRINCIPAL: 'myeongha_runtime',
    MYEONGHA_DATABASE_TLS_PEER_MODE: 'verify-full',
    MYEONGHA_DATABASE_SSL_ROOT_CERT_PEM: '-----BEGIN CERTIFICATE-----\\ntest-only\\n-----END CERTIFICATE-----',
    MYEONGHA_SUPABASE_URL: 'https://cnsfpcdiyofqvhpcegfc.supabase.co',
    MYEONGHA_SUPABASE_API_KEY: 'sb_publishable_test_key_material_for_commerce_runtime',
    MYEONGHA_GUEST_FINGERPRINT_SECRET: 'test-guest-fingerprint-secret-material-at-least-thirty-two-bytes',
  };
}

describe('Legal A4 production purchase intent adult-only binding', () => {
  it('does not issue a purchase intent while the verified-age authority is OFF', async () => {
    const connect = vi.fn();
    const runtime = createProductionPurchaseIntentCreateRuntimeV3({
      env: env(),
      pool: { connect },
    });
    try {
      const response = await runtime.handleRequest({
        request: new Request('https://myeongha.vercel.app/internal/purchase-intent', {
          method: 'POST',
          body: JSON.stringify({ productOfferId: 'unverified', idempotencyKey: 'test' }),
        }),
        requestId: 'legal-adult-hold',
        serverTime: '2026-10-24T00:00:00Z',
      });
      expect(response.status).toBe(503);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect((await response.json()).error.code).toBe('PURCHASE_UNAVAILABLE');
      expect(connect).not.toHaveBeenCalled();
    } finally {
      await runtime.close();
    }
  });
});
