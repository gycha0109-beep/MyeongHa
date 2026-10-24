import { describe, expect, it, vi } from 'vitest';
import {
  createProductionPortOneIdentityHttpRuntimeV1,
  PORTONE_V2_PRODUCTION_IDENTITY_HTTP_ACTIVATION_V1,
  resolveProductionPortOneIdentityHttpModeV1,
} from '../apps/api/src/portone-v2-production-identity-http-runtime-v1.js';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';

const setting = PORTONE_V2_PRODUCTION_IDENTITY_HTTP_ACTIVATION_V1;
const approved = {
  MYEONGHA_PORTONE_VERIFIED_AGE_ENFORCEMENT: 'ENFORCE',
  MYEONGHA_PORTONE_IDENTITY_MIGRATION_STATE: 'APPROVED_AND_APPLIED',
  MYEONGHA_PORTONE_IDENTITY_PRIVACY_DISPOSITION_STATE: 'APPROVED',
  [setting.mode]: 'ENFORCE',
  [setting.contract]: 'APPROVED',
  [setting.storeId]: 'store-0123456789',
  [setting.channelKey]: 'channel-key-0123456789',
  [setting.apiSecret]: 'test-only-portone-api-secret-material-not-real',
  MYEONGHA_DATABASE_URL:
    'postgresql://myeongha_runtime.cnsfpcdiyofqvhpcegfc:test-password@aws-0-test.pooler.supabase.com:5432/postgres?sslmode=require',
  MYEONGHA_DATABASE_PRINCIPAL: 'myeongha_runtime',
  MYEONGHA_DATABASE_TLS_PEER_MODE: 'verify-full',
  MYEONGHA_DATABASE_SSL_ROOT_CERT_PEM: '-----BEGIN CERTIFICATE-----\\ntest-only\\n-----END CERTIFICATE-----',
  MYEONGHA_SUPABASE_URL: 'https://cnsfpcdiyofqvhpcegfc.supabase.co',
  MYEONGHA_SUPABASE_API_KEY: 'sb_publishable_test_key_material_for_identity_runtime',
  MYEONGHA_GUEST_FINGERPRINT_SECRET: 'test-guest-fingerprint-secret-material-at-least-thirty-two-bytes',
};
const pool: PostgresSubjectPoolV1 = {
  connect: vi.fn(async () => { throw new Error('No DB connection should be opened'); }),
};

describe('PortOne approved production identity composition', () => {
  it('stays completely OFF by default and refuses to construct a runtime', () => {
    expect(resolveProductionPortOneIdentityHttpModeV1({})).toBe('off');
    expect(resolveProductionPortOneIdentityHttpModeV1({
      ...approved, [setting.mode]: 'OFF',
    })).toBe('off');
    expect(() => createProductionPortOneIdentityHttpRuntimeV1({
      env: { ...approved, [setting.mode]: 'OFF' }, pool,
    })).toThrow();
  });

  it('refuses partial approvals, absent channel and invalid server key', () => {
    const cases = [
      { ...approved, [setting.contract]: 'PENDING' },
      { ...approved, [setting.channelKey]: '' },
      { ...approved, [setting.channelKey]: 'not-channel' },
      { ...approved, [setting.storeId]: 'not-store' },
      { ...approved, [setting.storeId]: '' },
      { ...approved, [setting.apiSecret]: 'short' },
      { ...approved, MYEONGHA_PORTONE_IDENTITY_MIGRATION_STATE: 'PROPOSED' },
      { ...approved, MYEONGHA_PORTONE_VERIFIED_AGE_ENFORCEMENT: 'OFF' },
      { ...approved, MYEONGHA_PORTONE_IDENTITY_PRIVACY_DISPOSITION_STATE: 'PENDING' },
      { ...approved, [setting.mode]: 'INVALID' },
    ];
    for (const env of cases) {
      expect(() => resolveProductionPortOneIdentityHttpModeV1(env)).toThrow();
    }
  });

  it('supports only authorized request composition; method rejection makes no provider or DB call', async () => {
    expect(resolveProductionPortOneIdentityHttpModeV1(approved)).toBe('enforce');
    const runtime = createProductionPortOneIdentityHttpRuntimeV1({ env: approved, pool });
    const response = await runtime.handleRequest({
      request: new Request('https://myeongha.internal/api/identity-verifications/attempts'),
      requestId: 'test-identity-runtime',
      serverTime: '2026-10-24T00:00:00Z',
      action: 'issue',
    });
    expect(response.status).toBe(405);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(pool.connect).not.toHaveBeenCalled();
  });
});
