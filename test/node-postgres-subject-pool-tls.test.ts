import { describe, expect, it } from 'vitest';
import {
  NodePostgresSubjectPoolErrorV1,
  buildProductionNodePostgresPoolConfigV1,
  normalizeNodePostgresConnectionStringV1,
} from '../apps/api/src/node-postgres-subject-pool.js';
import {
  buildProductionPostgresStrictTlsTargetV1,
  PRODUCTION_POSTGRES_TLS_ROOT_FINGERPRINT256_V1,
} from '../apps/api/src/production-postgres-tls-peer-verification.js';
import {
  MYEONGHA_API_EXECUTION_ROLE,
  MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF,
} from '../apps/api/src/production-user-data-runtime-config.js';

const BASE_URL =
  'postgresql://myeongha_runtime.example:encoded%3Fpassword@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';

describe('node-postgres production pooler TLS semantics', () => {
  it('pins sslmode=require to explicit libpq-compatible encrypted transport semantics', () => {
    const normalized = normalizeNodePostgresConnectionStringV1(
      `${BASE_URL}?sslmode=require`,
    );
    const url = new URL(normalized);

    expect(url.protocol).toBe('postgresql:');
    expect(url.hostname).toBe('aws-0-ap-southeast-1.pooler.supabase.com');
    expect(url.port).toBe('6543');
    expect(decodeURIComponent(url.username)).toBe('myeongha_runtime.example');
    expect(decodeURIComponent(url.password)).toBe('encoded?password');
    expect(url.searchParams.get('sslmode')).toBe('require');
    expect(url.searchParams.get('uselibpqcompat')).toBe('true');
  });

  it('keeps an already explicit compatible sslmode=require stable', () => {
    const normalized = normalizeNodePostgresConnectionStringV1(
      `${BASE_URL}?sslmode=require&uselibpqcompat=true`,
    );
    const url = new URL(normalized);

    expect(url.searchParams.getAll('uselibpqcompat')).toEqual(['true']);
    expect(url.searchParams.get('sslmode')).toBe('require');
  });

  it('never downgrades verify-full to require compatibility semantics', () => {
    const source = `${BASE_URL}?sslmode=verify-full&sslrootcert=%2Ftmp%2Fsupabase-ca.crt`;

    expect(normalizeNodePostgresConnectionStringV1(source)).toBe(source);
  });

  it('never rewrites verify-ca to require compatibility semantics', () => {
    const source = `${BASE_URL}?sslmode=verify-ca&sslrootcert=%2Ftmp%2Fsupabase-ca.crt`;

    expect(normalizeNodePostgresConnectionStringV1(source)).toBe(source);
  });

  it('builds the activated ordinary runtime with explicit verify-full TLS authority', () => {
    let capturedInput:
      | Parameters<typeof buildProductionPostgresStrictTlsTargetV1>[0]
      | undefined;

    const config = buildProductionNodePostgresPoolConfigV1(
      {
        databaseUrl: `${BASE_URL}?sslmode=require&uselibpqcompat=true`,
        databasePrincipal: 'myeongha_runtime',
        databaseExecutionRole: MYEONGHA_API_EXECUTION_ROLE,
        databaseTlsPeerMode: 'verify-full',
        databaseSslRootCertificatePem: 'test-only-root-pem',
      },
      {},
      {
        buildStrictTarget(input) {
          capturedInput = input;
          return {
            connectionString: BASE_URL,
            ssl: {
              ca: 'test-only-root-pem',
              rejectUnauthorized: true,
            },
          };
        },
      },
    );

    expect(capturedInput).toBeDefined();
    const candidate = new URL(capturedInput?.databaseUrl ?? '');
    expect(candidate.searchParams.get('sslmode')).toBe('verify-full');
    expect(candidate.searchParams.has('uselibpqcompat')).toBe(false);
    expect(capturedInput?.rootCertificatePem).toBe('test-only-root-pem');
    expect(capturedInput?.authority).toEqual({
      contractVersion: 'myeongha-production-postgres-tls-peer-verification-v1',
      projectRef: MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF,
      requiredTlsMode: 'verify-full',
      rootCertificateFingerprint256:
        PRODUCTION_POSTGRES_TLS_ROOT_FINGERPRINT256_V1,
    });
    expect(config.connectionString).toBe(BASE_URL);
    expect(config.ssl).toEqual({
      ca: 'test-only-root-pem',
      rejectUnauthorized: true,
    });
    expect(config.ssl).not.toHaveProperty('checkServerIdentity');
  });

  it.each(['absent', 'prefer', 'verify-ca'])('fails closed when B3 strict activation starts from %s TLS source semantics', (mode) => {
    const suffix = mode === 'absent' ? '' : `?sslmode=${mode}`;
    expect(() =>
      buildProductionNodePostgresPoolConfigV1({
        databaseUrl: `${BASE_URL}${suffix}`,
        databasePrincipal: 'myeongha_runtime',
        databaseExecutionRole: MYEONGHA_API_EXECUTION_ROLE,
        databaseTlsPeerMode: 'verify-full',
        databaseSslRootCertificatePem: 'test-only-root-pem',
      }),
    ).toThrowError(NodePostgresSubjectPoolErrorV1);
  });

  it('fails closed when the ordinary Production pool lacks verify-full activation mode', () => {
    expect(() =>
      buildProductionNodePostgresPoolConfigV1({
        databaseUrl: `${BASE_URL}?sslmode=require`,
        databasePrincipal: 'myeongha_runtime',
        databaseExecutionRole: MYEONGHA_API_EXECUTION_ROLE,
        databaseSslRootCertificatePem: 'test-only-root-pem',
      }),
    ).toThrowError(NodePostgresSubjectPoolErrorV1);
  });

  it('fails closed when verify-full activation is missing root certificate material', () => {
    expect(() =>
      buildProductionNodePostgresPoolConfigV1({
        databaseUrl: `${BASE_URL}?sslmode=require`,
        databasePrincipal: 'myeongha_runtime',
        databaseExecutionRole: MYEONGHA_API_EXECUTION_ROLE,
        databaseTlsPeerMode: 'verify-full',
      }),
    ).toThrowError(NodePostgresSubjectPoolErrorV1);
  });

  it('fails closed when sslmode=require explicitly disables libpq compatibility', () => {
    expect(() =>
      normalizeNodePostgresConnectionStringV1(
        `${BASE_URL}?sslmode=require&uselibpqcompat=false`,
      ),
    ).toThrowError(NodePostgresSubjectPoolErrorV1);

    try {
      normalizeNodePostgresConnectionStringV1(
        `${BASE_URL}?sslmode=require&uselibpqcompat=false`,
      );
      throw new Error('expected TLS compatibility rejection');
    } catch (error) {
      expect(error).toMatchObject({ code: 'TLS_MODE_UNSUPPORTED' });
    }
  });
});
