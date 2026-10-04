import { describe, expect, it } from 'vitest';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';
import { createProductionDeviceInstallationRuntimeV1 } from '../apps/api/src/production-device-installation-runtime.js';

function productionLikeEnv(): Record<string, string> {
  return {
    MYEONGHA_DATABASE_URL:
      'postgresql://myeongha_runtime.cnsfpcdiyofqvhpcegfc:test-password@aws-0-test.pooler.supabase.com:5432/postgres?sslmode=require',
    MYEONGHA_DATABASE_PRINCIPAL: 'myeongha_runtime',
    MYEONGHA_DATABASE_TLS_PEER_MODE: 'verify-full',
    MYEONGHA_DATABASE_SSL_ROOT_CERT_PEM:
      '-----BEGIN CERTIFICATE-----\\ntest-only\\n-----END CERTIFICATE-----',
    MYEONGHA_SUPABASE_URL: 'https://cnsfpcdiyofqvhpcegfc.supabase.co',
    MYEONGHA_SUPABASE_API_KEY:
      'sb_publishable_test_key_material_for_device_runtime',
    MYEONGHA_GUEST_FINGERPRINT_SECRET:
      'test-guest-fingerprint-secret-material-at-least-thirty-two-bytes',
  };
}

describe('Production Device Installation runtime', () => {
  it('does not require Push token secrets before a request reaches token protection', async () => {
    const pool: PostgresSubjectPoolV1 = {
      connect() {
        throw new Error('method rejection must not open PostgreSQL');
      },
    };
    const runtime = createProductionDeviceInstallationRuntimeV1({
      env: productionLikeEnv(),
      pool,
    });

    const response = await runtime.handleRequest({
      request: new Request(
        'https://myeongha.internal/api/device-installations/register',
        { method: 'GET' },
      ),
      requestId: 'device-runtime-test',
      serverTime: '2026-10-02T06:00:00.000Z',
    });

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
    await runtime.close();
  });
});
