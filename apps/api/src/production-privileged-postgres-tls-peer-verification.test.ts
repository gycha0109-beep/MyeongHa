import { describe, expect, it, vi } from 'vitest';
import {
  PRODUCTION_PRIVILEGED_POSTGRES_PRINCIPAL_V1,
  ProductionPrivilegedPostgresTlsAuthorityErrorV1,
  buildProductionPrivilegedPostgresStrictTlsTargetV1,
  inspectProductionPrivilegedPostgresAuthorityV1,
} from './production-privileged-postgres-tls-peer-verification.js';

type StrictTargetBuilder = NonNullable<
  NonNullable<
    Parameters<typeof buildProductionPrivilegedPostgresStrictTlsTargetV1>[1]
  >['buildStrictTarget']
>;

describe('Production privileged PostgreSQL TLS authority', () => {
  const governedUrl =
    'postgresql://postgres.cnsfpcdiyofqvhpcegfc:secret@aws-0-test.pooler.supabase.com:5432/postgres?sslmode=require';

  it('pins the project-qualified postgres principal and governed pooler authority', () => {
    expect(inspectProductionPrivilegedPostgresAuthorityV1(governedUrl)).toEqual({
      contractVersion:
        'myeongha-production-privileged-postgres-tls-peer-verification-v1',
      projectRef: 'cnsfpcdiyofqvhpcegfc',
      databasePrincipal: PRODUCTION_PRIVILEGED_POSTGRES_PRINCIPAL_V1,
      databaseName: 'postgres',
      databasePort: '5432',
      endpointKind: 'supavisor',
      endpointAuthorityPinned: true,
    });
  });

  it.each([
    [
      'postgresql://postgres:secret@aws-0-test.pooler.supabase.com:5432/postgres?sslmode=require',
      'ADMIN_PRINCIPAL_MISMATCH',
    ],
    [
      'postgresql://postgres.aaaaaaaaaaaaaaaaaaaa:secret@aws-0-test.pooler.supabase.com:5432/postgres?sslmode=require',
      'ADMIN_PROJECT_AUTHORITY_MISMATCH',
    ],
    [
      'postgresql://postgres.cnsfpcdiyofqvhpcegfc:secret@evil.example.test:5432/postgres?sslmode=require',
      'ADMIN_ENDPOINT_AUTHORITY_MISMATCH',
    ],
    [
      'postgresql://postgres.cnsfpcdiyofqvhpcegfc:secret@aws-0-test.pooler.supabase.com:6543/postgres?sslmode=require',
      'ADMIN_ENDPOINT_AUTHORITY_MISMATCH',
    ],
    [
      'postgresql://postgres.cnsfpcdiyofqvhpcegfc:secret@aws-0-test.pooler.supabase.com:5432/other?sslmode=require',
      'ADMIN_DATABASE_AUTHORITY_MISMATCH',
    ],
  ])('rejects non-governed privileged authority: %s', (url, code) => {
    try {
      inspectProductionPrivilegedPostgresAuthorityV1(url);
      throw new Error('expected privileged authority rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(
        ProductionPrivilegedPostgresTlsAuthorityErrorV1,
      );
      expect(error).toMatchObject({ code });
    }
  });

  it('transforms the governed require source into the generic verify-full target', () => {
    let captured: Parameters<StrictTargetBuilder>[0] | undefined;

    const buildStrictTarget: StrictTargetBuilder = vi.fn(
      (input: Parameters<StrictTargetBuilder>[0]) => {
        captured = input;
        return {
          connectionString:
            'postgresql://postgres.cnsfpcdiyofqvhpcegfc:secret@aws-0-test.pooler.supabase.com:5432/postgres',
          ssl: {
            ca: 'test-only-root',
            rejectUnauthorized: true as const,
          },
          evidence: {
            contractVersion:
              'myeongha-production-postgres-tls-peer-verification-v1' as const,
            projectRef: 'cnsfpcdiyofqvhpcegfc' as const,
            tlsMode: 'verify-full' as const,
            peerVerification: 'full' as const,
            rejectUnauthorized: true as const,
            defaultHostnameVerification: true as const,
            rootCertificateFingerprint256:
              '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA',
            rootCertificatePinned: true as const,
          },
        };
      },
    );

    const target = buildProductionPrivilegedPostgresStrictTlsTargetV1(
      {
        databaseUrl:
          governedUrl + '&application_name=privacy-canary&uselibpqcompat=true',
        rootCertificatePem: 'test-only-root',
      },
      { buildStrictTarget },
    );

    expect(buildStrictTarget).toHaveBeenCalledTimes(1);
    const strictUrl = new URL(String(captured?.databaseUrl));
    expect(strictUrl.searchParams.get('sslmode')).toBe('verify-full');
    expect(strictUrl.searchParams.get('uselibpqcompat')).toBeNull();
    expect(strictUrl.searchParams.get('application_name')).toBe(
      'privacy-canary',
    );
    expect(captured?.rootCertificatePem).toBe('test-only-root');
    expect(captured?.authority).toMatchObject({
      projectRef: 'cnsfpcdiyofqvhpcegfc',
      requiredTlsMode: 'verify-full',
    });

    expect(target.ssl).toEqual({
      ca: 'test-only-root',
      rejectUnauthorized: true,
    });
    expect(target.evidence).toMatchObject({
      databasePrincipal: 'postgres.cnsfpcdiyofqvhpcegfc',
      tlsMode: 'verify-full',
      peerVerification: 'full',
      rejectUnauthorized: true,
      defaultHostnameVerification: true,
      rootCertificatePinned: true,
    });
  });

  it.each([
    '',
    '?sslmode=disable',
    '?sslmode=allow',
    '?sslmode=prefer',
    '?sslmode=verify-ca',
  ])('fails closed for unsupported source TLS posture %s', (query) => {
    expect(() =>
      buildProductionPrivilegedPostgresStrictTlsTargetV1(
        {
          databaseUrl:
            `postgresql://postgres.cnsfpcdiyofqvhpcegfc:secret@aws-0-test.pooler.supabase.com:5432/postgres${query}`,
          rootCertificatePem: 'test-only-root',
        },
        {
          buildStrictTarget: vi.fn(() => {
            throw new Error('must not be reached for unsupported posture');
          }),
        },
      ),
    ).toThrowError(ProductionPrivilegedPostgresTlsAuthorityErrorV1);
  });
});
