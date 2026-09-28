import { describe, expect, it } from 'vitest';
import {
  MYEONGHA_API_EXECUTION_ROLE,
  MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
  MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_POSTGRES_TLS_ACTIVATION_ENV_V1,
  PRODUCTION_USER_DATA_RUNTIME_ENV_V1,
  ProductionUserDataRuntimeConfigErrorV1,
  inspectProductionDatabaseTlsPostureV1,
  parseProductionUserDataRuntimeConfigV1,
  summarizeProductionUserDataRuntimeConfigV1,
} from '../apps/api/src/production-user-data-runtime-config.js';

const DATABASE_URL =
  'postgresql://myeongha_runtime:runtime-password@db.example.internal:5432/postgres?sslmode=require';
const DATABASE_PRINCIPAL = 'myeongha_runtime';
const SUPABASE_API_KEY = 'sb_publishable_example_key_for_runtime_contract';
const GUEST_FINGERPRINT_SECRET =
  'guest-fingerprint-secret-material-at-least-thirty-two-bytes';

const TEST_ROOT_PEM =
  '-----BEGIN CERTIFICATE-----\\ntest-only-sensitive-material\\n-----END CERTIFICATE-----';

function validEnv(): Record<string, string> {
  return {
    [PRODUCTION_USER_DATA_RUNTIME_ENV_V1.databaseUrl]: DATABASE_URL,
    [PRODUCTION_USER_DATA_RUNTIME_ENV_V1.databasePrincipal]: DATABASE_PRINCIPAL,
    [PRODUCTION_USER_DATA_RUNTIME_ENV_V1.supabaseUrl]:
      MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
    [PRODUCTION_USER_DATA_RUNTIME_ENV_V1.supabaseApiKey]: SUPABASE_API_KEY,
    [PRODUCTION_USER_DATA_RUNTIME_ENV_V1.guestFingerprintSecret]:
      GUEST_FINGERPRINT_SECRET,
    [PRODUCTION_POSTGRES_TLS_ACTIVATION_ENV_V1.peerMode]: 'verify-full',
    [PRODUCTION_POSTGRES_TLS_ACTIVATION_ENV_V1.rootCertificatePem]:
      TEST_ROOT_PEM,
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

  it('parses only a complete strict production user-data runtime binding', () => {
    expect(parseProductionUserDataRuntimeConfigV1(validEnv())).toEqual({
      databaseUrl: DATABASE_URL,
      databasePrincipal: DATABASE_PRINCIPAL,
      databaseExecutionRole: 'myeongha_api_executor',
      databaseTlsPeerMode: 'verify-full',
      databaseSslRootCertificatePem: TEST_ROOT_PEM,
      supabaseOrigin: MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
      supabaseApiKey: SUPABASE_API_KEY,
      guestFingerprintSecret: GUEST_FINGERPRINT_SECRET,
    });
  });

  it('fails closed when the TLS peer-verification mode is absent', () => {
    const env = validEnv();
    delete env[PRODUCTION_POSTGRES_TLS_ACTIVATION_ENV_V1.peerMode];

    expect(() => parseProductionUserDataRuntimeConfigV1(env)).toThrow(
      'MYEONGHA_DATABASE_TLS_PEER_MODE',
    );
  });

  it('rejects the retired legacy mode after B3 activation', () => {
    const env = validEnv();
    env[PRODUCTION_POSTGRES_TLS_ACTIVATION_ENV_V1.peerMode] = 'legacy';

    expect(() => parseProductionUserDataRuntimeConfigV1(env)).toThrow(
      'must be verify-full after SEC-01 Production activation',
    );
  });

  it('fails closed when verify-full activation has no root certificate binding', () => {
    const env = validEnv();
    env[PRODUCTION_POSTGRES_TLS_ACTIVATION_ENV_V1.peerMode] = 'verify-full';

    expect(() => parseProductionUserDataRuntimeConfigV1(env)).toThrow(
      'MYEONGHA_DATABASE_SSL_ROOT_CERT_PEM',
    );
  });

  it('fails closed when verify-full activation is applied to an ungoverned source TLS mode', () => {
    const env = validEnv();
    env[PRODUCTION_USER_DATA_RUNTIME_ENV_V1.databaseUrl] =
      'postgresql://myeongha_runtime:password@db.example.internal/postgres?sslmode=prefer';
    env[PRODUCTION_POSTGRES_TLS_ACTIVATION_ENV_V1.peerMode] = 'verify-full';
    env[PRODUCTION_POSTGRES_TLS_ACTIVATION_ENV_V1.rootCertificatePem] =
      '-----BEGIN CERTIFICATE-----\\ntest-only\\n-----END CERTIFICATE-----';

    expect(() => parseProductionUserDataRuntimeConfigV1(env)).toThrow(
      'governed require migration source or verify-full source',
    );
  });

  it('fails closed on an unknown PostgreSQL TLS activation mode', () => {
    const env = validEnv();
    env[PRODUCTION_POSTGRES_TLS_ACTIVATION_ENV_V1.peerMode] = 'prefer';

    expect(() => parseProductionUserDataRuntimeConfigV1(env)).toThrow(
      'must be verify-full after SEC-01 Production activation',
    );
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

  it('rejects weak or empty credential material', () => {
    const weakApiKey = validEnv();
    weakApiKey[PRODUCTION_USER_DATA_RUNTIME_ENV_V1.supabaseApiKey] = 'too-short';
    expect(() => parseProductionUserDataRuntimeConfigV1(weakApiKey)).toThrow(
      'MYEONGHA_SUPABASE_API_KEY is shorter than the production minimum',
    );

    const weakGuestSecret = validEnv();
    weakGuestSecret[PRODUCTION_USER_DATA_RUNTIME_ENV_V1.guestFingerprintSecret] =
      'too-short';
    expect(() => parseProductionUserDataRuntimeConfigV1(weakGuestSecret)).toThrow(
      'MYEONGHA_GUEST_FINGERPRINT_SECRET is shorter than the production minimum',
    );
  });

  it('classifies PostgreSQL TLS modes without returning connection authority material', () => {
    expect(inspectProductionDatabaseTlsPostureV1(DATABASE_URL)).toEqual({
      mode: 'require',
      peerVerification: 'none',
      explicitRootCertificateConfigured: false,
    });

    expect(
      inspectProductionDatabaseTlsPostureV1(
        'postgresql://user:secret@pooler.example/postgres?sslmode=verify-ca&sslrootcert=%2Fvar%2Frun%2Fproject-ca.crt',
      ),
    ).toEqual({
      mode: 'verify-ca',
      peerVerification: 'ca_only',
      explicitRootCertificateConfigured: true,
    });

    expect(
      inspectProductionDatabaseTlsPostureV1(
        'postgresql://user:secret@pooler.example/postgres?sslmode=verify-full&sslrootcert=%2Fvar%2Frun%2Fproject-ca.crt',
      ),
    ).toEqual({
      mode: 'verify-full',
      peerVerification: 'full',
      explicitRootCertificateConfigured: true,
    });

    expect(
      inspectProductionDatabaseTlsPostureV1(
        'postgresql://user:secret@pooler.example/postgres',
      ),
    ).toEqual({
      mode: 'absent',
      peerVerification: 'none',
      explicitRootCertificateConfigured: false,
    });

    expect(
      inspectProductionDatabaseTlsPostureV1(
        'postgresql://user:secret@pooler.example/postgres?sslmode=no-verify',
      ),
    ).toEqual({
      mode: 'no-verify',
      peerVerification: 'none',
      explicitRootCertificateConfigured: false,
    });
  });

  it('keeps unknown or malformed TLS authority fail-observable without reflecting input', () => {
    expect(
      inspectProductionDatabaseTlsPostureV1(
        'postgresql://user:secret@pooler.example/postgres?sslmode=future-mode',
      ),
    ).toEqual({
      mode: 'unknown',
      peerVerification: 'unknown',
      explicitRootCertificateConfigured: false,
    });

    expect(inspectProductionDatabaseTlsPostureV1('not a database url')).toEqual({
      mode: 'unknown',
      peerVerification: 'unknown',
      explicitRootCertificateConfigured: false,
    });
  });

  it('produces a diagnostic summary without exposing secret values or the database URL', () => {
    const config = parseProductionUserDataRuntimeConfigV1(validEnv());
    const summary = summarizeProductionUserDataRuntimeConfigV1(config);
    const serialized = JSON.stringify(summary);

    expect(summary).toEqual({
      databaseConfigured: true,
      databasePrincipal: DATABASE_PRINCIPAL,
      databaseExecutionRole: 'myeongha_api_executor',
      databaseTlsMode: 'verify-full',
      databaseTlsPeerVerification: 'full',
      databaseTlsRootCertificateConfigured: true,
      supabaseOrigin: MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
      supabaseApiKeyConfigured: true,
      guestFingerprintSecretConfigured: true,
    });
    expect(serialized).not.toContain(DATABASE_URL);
    expect(serialized).not.toContain('runtime-password');
    expect(serialized).not.toContain('db.example.internal');
    expect(serialized).not.toContain('sslrootcert');
    expect(serialized).not.toContain(SUPABASE_API_KEY);
    expect(serialized).not.toContain(GUEST_FINGERPRINT_SECRET);
  });

  it('summarizes activated verify-full posture without emitting root certificate material', () => {
    const env = validEnv();
    const rootCertificatePem = TEST_ROOT_PEM;
    env[PRODUCTION_POSTGRES_TLS_ACTIVATION_ENV_V1.rootCertificatePem] =
      rootCertificatePem;

    const summary = summarizeProductionUserDataRuntimeConfigV1(
      parseProductionUserDataRuntimeConfigV1(env),
    );
    const serialized = JSON.stringify(summary);

    expect(summary.databaseTlsMode).toBe('verify-full');
    expect(summary.databaseTlsPeerVerification).toBe('full');
    expect(summary.databaseTlsRootCertificateConfigured).toBe(true);
    expect(serialized).not.toContain(rootCertificatePem);
    expect(serialized).not.toContain('test-only-sensitive-material');
  });
});
