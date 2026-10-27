import { describe, expect, it, vi } from 'vitest';
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


  it('uses the supplied Cloudflare subject pool without opening an independent direct connection or closing borrowed pool', async () => {
    const connect = vi.fn(async () => { throw new Error('INJECTED_GUEST_POOL_SENTINEL'); });
    const close = vi.fn(async () => undefined);
    const runtime = createProductionGuestBootstrapHttpRuntimeV1({
      env: { ...BASE_PRODUCTION_ENV, MYEONGHA_GUEST_SESSION_TTL_SECONDS: '604800' },
      pool: { connect, close },
    });
    try {
      await expect(runtime.handleRequest({
        request: new Request('https://myeongha.example/api/session/bootstrap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        }),
        requestId: 'req-cloudflare-guest-pool-injection',
        serverTime: '2026-10-27T05:40:00.000Z',
      })).rejects.toThrow('INJECTED_GUEST_POOL_SENTINEL');
      expect(connect).toHaveBeenCalledTimes(1);
    } finally {
      await runtime.close();
    }
    expect(close).not.toHaveBeenCalled();
  });

  it('fails closed when Guest TTL activation is missing before any runtime pool is created', () => {
    expect(() =>
      createProductionGuestBootstrapHttpRuntimeV1({
        env: BASE_PRODUCTION_ENV,
      }),
    ).toThrowError(ProductionGuestBootstrapActivationConfigErrorV1);
  });
});
