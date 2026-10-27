import { describe, expect, it } from 'vitest';
import {
  createProductionGuestBootstrapHttpRuntimeV1,
} from '../apps/api/src/production-guest-bootstrap-http-runtime.js';
import { ProductionGuestBootstrapActivationConfigErrorV1 } from '../apps/api/src/production-guest-bootstrap-credential-issuer.js';
import { parseProductionUserDataRuntimeConfigV1 } from '../apps/api/src/production-user-data-runtime-config.js';

const BASE_PRODUCTION_ENV = Object.freeze({
  MYEONGHA_DATABASE_URL:
    'postgresql://myeongha_runtime.cnsfpcdiyofqvhpcegfc:runtime-password@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require',
  MYEONGHA_DATABASE_PRINCIPAL: 'myeongha_runtime',
  MYEONGHA_DATABASE_TLS_PEER_MODE: 'verify-full',
  MYEONGHA_DATABASE_SSL_ROOT_CERT_PEM:
    '-----BEGIN CERTIFICATE-----\\ntest-only\\n-----END CERTIFICATE-----',
  MYEONGHA_SUPABASE_URL: 'https://cnsfpcdiyofqvhpcegfc.supabase.co',
  MYEONGHA_SUPABASE_API_KEY: 'test-publishable-key-value',
  MYEONGHA_GUEST_FINGERPRINT_SECRET:
    'test-guest-fingerprint-secret-value-0000000000000000',
} as const);

describe('Production Guest bootstrap HTTP runtime composition', () => {
  it('keeps the existing production user-data config independent of Guest TTL activation', () => {
    expect(() => parseProductionUserDataRuntimeConfigV1(BASE_PRODUCTION_ENV)).not.toThrow();
  });

  it('fails closed when Guest TTL activation is missing before any runtime pool is created', () => {
    expect(() =>
      createProductionGuestBootstrapHttpRuntimeV1({
        env: BASE_PRODUCTION_ENV,
      }),
    ).toThrowError(ProductionGuestBootstrapActivationConfigErrorV1);
  });
  it('uses a supplied request-owned Hyperdrive pool and leaves its ownership to the caller', async () => {
    const commands: string[] = [];
    let connections = 0;
    let releases = 0;
    let injectedCloses = 0;
    const injectedPool = {
      async connect() {
        connections++;
        return {
          async query(sql: string, values?: readonly unknown[]) {
            commands.push(sql.trim().split('\\n')[0] ?? '');
            if (sql.includes('cmd_create_guest_session_runtime_v1')) {
              return { rows: [{
                subjectId: values?.[0], guestSessionId: values?.[1],
                expiresAt: values?.[3], replayed: false,
              }] };
            }
            return { rows: [] };
          },
          release() { releases++; },
        };
      },
      async close() { injectedCloses++; },
    };
    const runtime = createProductionGuestBootstrapHttpRuntimeV1({
      env: { ...BASE_PRODUCTION_ENV, MYEONGHA_GUEST_SESSION_TTL_SECONDS: '604800' },
      pool: injectedPool as unknown as Parameters<typeof createProductionGuestBootstrapHttpRuntimeV1>[0]['pool'],
    });
    try {
      const response = await runtime.handleRequest({
        request: new Request('https://myeongha.gycha0109.workers.dev/api/session/bootstrap', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
        }),
        requestId: 'e6b01f3d-1424-4cc8-89a6-7a7e0e644985',
        serverTime: new Date().toISOString(),
      });
      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload.ok).toBe(true);
      expect(connections).toBe(1);
      expect(releases).toBe(1);
      expect(commands).toContain('BEGIN');
      expect(commands).toContain('SET LOCAL ROLE myeongha_api_executor');
      expect(commands).toContain('COMMIT');
      expect(commands.some(sql => sql.includes('select'))).toBe(true);
    } finally {
      await runtime.close();
    }
    // Injected pool remains owned by the Cloudflare adapter and is closed exactly once there.
    expect(injectedCloses).toBe(0);
    // Cloudflare adapter, not the shared HTTP runtime, retains close ownership.
    await injectedPool.close();
    expect(injectedCloses).toBe(1);
  });

});
