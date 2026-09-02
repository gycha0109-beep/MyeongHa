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
});
