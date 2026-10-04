import { describe, expect, it, vi } from 'vitest';

import {
  PRODUCTION_ACCOUNT_DELETION_WORKER_DIRECT_HOST_V1,
  PRODUCTION_ACCOUNT_DELETION_WORKER_SUPAVISOR_USERNAME_V1,
  ProductionAccountDeletionWorkerTlsAuthorityErrorV1,
  buildProductionAccountDeletionWorkerStrictTlsTargetV1,
  inspectProductionAccountDeletionWorkerDatabaseAuthorityV1,
} from '../apps/api/src/production-account-deletion-worker-tls-peer-verification.js';
import {
  PRODUCTION_POSTGRES_TLS_PEER_VERIFICATION_CONTRACT_VERSION_V1,
  PRODUCTION_POSTGRES_TLS_REQUIRED_MODE_V1,
  PRODUCTION_POSTGRES_TLS_ROOT_FINGERPRINT256_V1,
} from '../apps/api/src/production-postgres-tls-peer-verification.js';
import { MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF } from '../apps/api/src/production-user-data-runtime-config.js';

const ROOT_PEM =
  '-----BEGIN CERTIFICATE-----\\ntest-only-root\\n-----END CERTIFICATE-----';

function expectCode(
  action: () => unknown,
  code: ProductionAccountDeletionWorkerTlsAuthorityErrorV1['code'],
): void {
  try {
    action();
    throw new Error('expected worker TLS authority rejection');
  } catch (error) {
    expect(error).toBeInstanceOf(
      ProductionAccountDeletionWorkerTlsAuthorityErrorV1,
    );
    expect(error).toMatchObject({ code });
  }
}

describe('Production account-deletion worker PostgreSQL TLS authority', () => {
  it('pins the direct worker login to the governed Production project host', () => {
    expect(
      inspectProductionAccountDeletionWorkerDatabaseAuthorityV1(
        `postgresql://myeongha_worker_runtime:password@${PRODUCTION_ACCOUNT_DELETION_WORKER_DIRECT_HOST_V1}:5432/postgres?sslmode=verify-full`,
      ),
    ).toEqual({
      contractVersion:
        'myeongha-production-account-deletion-worker-postgres-tls-peer-verification-v1',
      projectRef: MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF,
      databasePrincipal: 'myeongha_worker_runtime',
      endpointKind: 'direct',
      endpointAuthorityPinned: true,
    });
  });

  it('pins the Supavisor-qualified worker login to the exact governed project ref', () => {
    expect(
      inspectProductionAccountDeletionWorkerDatabaseAuthorityV1(
        `postgresql://${PRODUCTION_ACCOUNT_DELETION_WORKER_SUPAVISOR_USERNAME_V1}:password@aws-0-test.pooler.supabase.com:6543/postgres?sslmode=verify-full`,
      ),
    ).toMatchObject({
      projectRef: MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF,
      databasePrincipal: 'myeongha_worker_runtime',
      endpointKind: 'supavisor',
      endpointAuthorityPinned: true,
    });
  });

  it('rejects an unrelated Supavisor project ref', () => {
    expectCode(
      () =>
        inspectProductionAccountDeletionWorkerDatabaseAuthorityV1(
          'postgresql://myeongha_worker_runtime.aaaaaaaaaaaaaaaaaaaa:password@aws-0-test.pooler.supabase.com:6543/postgres?sslmode=verify-full',
        ),
      'WORKER_PROJECT_AUTHORITY_MISMATCH',
    );
  });

  it.each([
    'postgresql://postgres:password@db.cnsfpcdiyofqvhpcegfc.supabase.co/postgres?sslmode=verify-full',
    'postgresql://myeongha_runtime.cnsfpcdiyofqvhpcegfc:password@aws-0-test.pooler.supabase.com/postgres?sslmode=verify-full',
  ])('rejects unrelated worker principal %s', (databaseUrl) => {
    expectCode(
      () =>
        inspectProductionAccountDeletionWorkerDatabaseAuthorityV1(databaseUrl),
      'WORKER_PRINCIPAL_MISMATCH',
    );
  });

  it.each([
    'postgresql://myeongha_worker_runtime:password@evil.example.test/postgres?sslmode=verify-full',
    `postgresql://${PRODUCTION_ACCOUNT_DELETION_WORKER_SUPAVISOR_USERNAME_V1}:password@evil.example.test/postgres?sslmode=verify-full`,
  ])('rejects ungoverned endpoint authority %s', (databaseUrl) => {
    expectCode(
      () =>
        inspectProductionAccountDeletionWorkerDatabaseAuthorityV1(databaseUrl),
      'WORKER_ENDPOINT_AUTHORITY_MISMATCH',
    );
  });

  it('delegates exact CA and verify-full enforcement to the governed SEC-01 strict target', () => {
    const buildStrictTarget = vi.fn((input) => ({
      connectionString:
        'postgresql://redacted@aws-0-test.pooler.supabase.com/postgres',
      ssl: {
        ca: input.rootCertificatePem,
        rejectUnauthorized: true as const,
      },
      evidence: {
        contractVersion:
          PRODUCTION_POSTGRES_TLS_PEER_VERIFICATION_CONTRACT_VERSION_V1,
        projectRef: MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF,
        tlsMode: PRODUCTION_POSTGRES_TLS_REQUIRED_MODE_V1,
        peerVerification: 'full' as const,
        rejectUnauthorized: true as const,
        defaultHostnameVerification: true as const,
        rootCertificateFingerprint256:
          PRODUCTION_POSTGRES_TLS_ROOT_FINGERPRINT256_V1,
        rootCertificatePinned: true as const,
      },
    }));

    const databaseUrl =
      `postgresql://${PRODUCTION_ACCOUNT_DELETION_WORKER_SUPAVISOR_USERNAME_V1}:password@aws-0-test.pooler.supabase.com:6543/postgres?sslmode=verify-full`;

    const target =
      buildProductionAccountDeletionWorkerStrictTlsTargetV1(
        {
          databaseUrl,
          rootCertificatePem: ROOT_PEM,
        },
        { buildStrictTarget },
      );

    expect(buildStrictTarget).toHaveBeenCalledWith({
      databaseUrl,
      rootCertificatePem: ROOT_PEM,
      authority: {
        contractVersion:
          PRODUCTION_POSTGRES_TLS_PEER_VERIFICATION_CONTRACT_VERSION_V1,
        projectRef: MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF,
        requiredTlsMode: PRODUCTION_POSTGRES_TLS_REQUIRED_MODE_V1,
        rootCertificateFingerprint256:
          PRODUCTION_POSTGRES_TLS_ROOT_FINGERPRINT256_V1,
      },
    });
    expect(target.ssl).toEqual({
      ca: ROOT_PEM,
      rejectUnauthorized: true,
    });
    expect(target.ssl).not.toHaveProperty('checkServerIdentity');
    expect(target.evidence).toEqual({
      contractVersion:
        'myeongha-production-account-deletion-worker-postgres-tls-peer-verification-v1',
      projectRef: MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF,
      databasePrincipal: 'myeongha_worker_runtime',
      endpointKind: 'supavisor',
      endpointAuthorityPinned: true,
      tlsMode: 'verify-full',
      peerVerification: 'full',
      rejectUnauthorized: true,
      defaultHostnameVerification: true,
      rootCertificateFingerprint256:
        PRODUCTION_POSTGRES_TLS_ROOT_FINGERPRINT256_V1,
      rootCertificatePinned: true,
    });
    expect(JSON.stringify(target.evidence)).not.toContain('password');
    expect(JSON.stringify(target.evidence)).not.toContain(ROOT_PEM);
  });

  it.each([
    '',
    '?sslmode=disable',
    '?sslmode=allow',
    '?sslmode=prefer',
    '?sslmode=require',
    '?sslmode=verify-ca',
    '?sslmode=unknown',
  ])('fails closed when the shared strict target rejects TLS mode %s', (query) => {
    const buildStrictTarget = vi.fn(() => {
      throw new Error('strict target rejected');
    });

    expectCode(
      () =>
        buildProductionAccountDeletionWorkerStrictTlsTargetV1(
          {
            databaseUrl:
              `postgresql://${PRODUCTION_ACCOUNT_DELETION_WORKER_SUPAVISOR_USERNAME_V1}:password@aws-0-test.pooler.supabase.com:6543/postgres${query}`,
            rootCertificatePem: ROOT_PEM,
          },
          { buildStrictTarget },
        ),
      'STRICT_TLS_TARGET_REJECTED',
    );
  });
});
