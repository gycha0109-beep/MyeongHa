import { describe, expect, it } from 'vitest';
import {
  MYEONGHA_API_EXECUTION_ROLE,
  MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
  MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_USER_DATA_RUNTIME_ENV_V1,
  ProductionUserDataRuntimeConfigErrorV1,
  parseProductionUserDataRuntimeConfigV1,
  summarizeProductionUserDataRuntimeConfigV1,
} from '../apps/api/src/production-user-data-runtime-config.js';

const DATABASE_URL =
  'postgresql://myeongha_runtime:runtime-password@db.example.internal:5432/postgres?sslmode=require';
const DATABASE_PRINCIPAL = 'myeongha_runtime';
const SUPABASE_API_KEY = 'sb_publishable_example_key_for_runtime_contract';
const GUEST_FINGERPRINT_SECRET =
  'guest-fingerprint-secret-material-at-least-thirty-two-bytes';

function validEnv(): Record<string, string> {
  return {
    [PRODUCTION_USER_DATA_RUNTIME_ENV_V1.databaseUrl]: DATABASE_URL,
    [PRODUCTION_USER_DATA_RUNTIME_ENV_V1.databasePrincipal]: DATABASE_PRINCIPAL,
    [PRODUCTION_USER_DATA_RUNTIME_ENV_V1.supabaseUrl]:
      MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
    [PRODUCTION_USER_DATA_RUNTIME_ENV_V1.supabaseApiKey]: SUPABASE_API_KEY,
    [PRODUCTION_USER_DATA_RUNTIME_ENV_V1.guestFingerprintSecret]:
      GUEST_FINGERPRINT_SECRET,
  };
}

describe('production user-data runtime configuration', () => {
  it('pins the governed production project and ordinary execution role', () => {
    expect(MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF).toBe(
      'cnsfpcdiyofqvhpcegfc',
    );
    expect(MYEONGHA_PRODUCTION_SUPABASE_ORIGIN).toBe(
      'https://cnsfpcdiyofqvhpcegfc.supabase.co',
    );
    expect(MYEONGHA_API_EXECUTION_ROLE).toBe('myeongha_api_executor');
    expect(PRODUCTION_USER_DATA_RUNTIME_ENV_V1).toEqual({
      databaseUrl: 'MYEONGHA_DATABASE_URL',
      databasePrincipal: 'MYEONGHA_DATABASE_PRINCIPAL',
      supabaseUrl: 'MYEONGHA_SUPABASE_URL',
      supabaseApiKey: 'MYEONGHA_SUPABASE_API_KEY',
      guestFingerprintSecret: 'MYEONGHA_GUEST_FINGERPRINT_SECRET',
    });
  });

  it('parses only a complete production user-data runtime binding', () => {
    expect(parseProductionUserDataRuntimeConfigV1(validEnv())).toEqual({
      databaseUrl: DATABASE_URL,
      databasePrincipal: DATABASE_PRINCIPAL,
      databaseExecutionRole: 'myeongha_api_executor',
      supabaseOrigin: MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
      supabaseApiKey: SUPABASE_API_KEY,
      guestFingerprintSecret: GUEST_FINGERPRINT_SECRET,
    });
  });

  it('fails closed when any required runtime binding is absent', () => {
    for (const envName of Object.values(PRODUCTION_USER_DATA_RUNTIME_ENV_V1)) {
      const env = validEnv();
      delete env[envName];
      expect(() => parseProductionUserDataRuntimeConfigV1(env)).toThrow(
        ProductionUserDataRuntimeConfigErrorV1,
      );
    }
  });

  it('rejects a Supabase project other than the governed production project', () => {
    const env = validEnv();
    env[PRODUCTION_USER_DATA_RUNTIME_ENV_V1.supabaseUrl] =
      'https://aaaaaaaaaaaaaaaaaaaa.supabase.co';

    expect(() => parseProductionUserDataRuntimeConfigV1(env)).toThrow(
      `governed production project ${MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF}`,
    );
  });

  it('requires a modern publishable Supabase API key and rejects privileged or legacy key classes', () => {
    for (const apiKey of [
      'too-short',
      'sb_secret_example_secret_key_that_must_not_be_used_here',
      'eyJhbGciOiJIUzI1NiJ9.legacy-anon-key.signature',
    ]) {
      const env = validEnv();
      env[PRODUCTION_USER_DATA_RUNTIME_ENV_V1.supabaseApiKey] = apiKey;
      expect(() => parseProductionUserDataRuntimeConfigV1(env)).toThrow(
        'must be a modern Supabase publishable key',
      );
    }
  });

  it('rejects privileged/default PostgreSQL principals', () => {
    const principalNames = ['postgres', 'supabase_admin', 'service_role'];

    for (const principal of principalNames) {
      const env = validEnv();
      env[PRODUCTION_USER_DATA_RUNTIME_ENV_V1.databasePrincipal] = principal;
      env[PRODUCTION_USER_DATA_RUNTIME_ENV_V1.databaseUrl] =
        `postgresql://${principal}:password@db.example.internal/postgres?sslmode=require`;

      expect(() => parseProductionUserDataRuntimeConfigV1(env)).toThrow(
        ProductionUserDataRuntimeConfigErrorV1,
      );
    }
  });

  it('requires the network login principal to remain distinct from the NOLOGIN execution role', () => {
    const env = validEnv();
    env[PRODUCTION_USER_DATA_RUNTIME_ENV_V1.databasePrincipal] =
      MYEONGHA_API_EXECUTION_ROLE;

    expect(() => parseProductionUserDataRuntimeConfigV1(env)).toThrow(
      'distinct from the NOLOGIN execution role',
    );
  });

  it('rejects a database URL that disables TLS', () => {
    const env = validEnv();
    env[PRODUCTION_USER_DATA_RUNTIME_ENV_V1.databaseUrl] =
      'postgresql://myeongha_runtime:password@db.example.internal/postgres?sslmode=disable';

    expect(() => parseProductionUserDataRuntimeConfigV1(env)).toThrow(
      'must not disable TLS',
    );
  });

  it('rejects weak Guest fingerprint secret material', () => {
    const weakGuestSecret = validEnv();
    weakGuestSecret[PRODUCTION_USER_DATA_RUNTIME_ENV_V1.guestFingerprintSecret] =
      'too-short';
    expect(() => parseProductionUserDataRuntimeConfigV1(weakGuestSecret)).toThrow(
      'MYEONGHA_GUEST_FINGERPRINT_SECRET is shorter than the production minimum',
    );
  });

  it('produces a diagnostic summary without exposing credential values or the database URL', () => {
    const config = parseProductionUserDataRuntimeConfigV1(validEnv());
    const summary = summarizeProductionUserDataRuntimeConfigV1(config);
    const serialized = JSON.stringify(summary);

    expect(summary).toEqual({
      databaseConfigured: true,
      databasePrincipal: DATABASE_PRINCIPAL,
      databaseExecutionRole: 'myeongha_api_executor',
      supabaseOrigin: MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
      supabaseApiKeyConfigured: true,
      guestFingerprintSecretConfigured: true,
    });
    expect(serialized).not.toContain(DATABASE_URL);
    expect(serialized).not.toContain('runtime-password');
    expect(serialized).not.toContain(SUPABASE_API_KEY);
    expect(serialized).not.toContain(GUEST_FINGERPRINT_SECRET);
  });
});
