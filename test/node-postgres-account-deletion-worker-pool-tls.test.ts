import { describe, expect, it, vi } from 'vitest';
import {
  NodePostgresAccountDeletionWorkerPoolErrorV1,
  buildNodePostgresAccountDeletionWorkerPoolConfigV1,
} from '../apps/api/src/node-postgres-account-deletion-worker-pool.js';
import type { ProductionAccountDeletionWorkerDbConfigV1 } from '../apps/api/src/production-account-deletion-worker-db-config.js';

describe('account-deletion worker node-postgres TLS selection', () => {
  it('preserves the legacy path while B3 activation authority is absent', () => {
    const config = buildNodePostgresAccountDeletionWorkerPoolConfigV1({
      databaseUrl:
        'postgresql://myeongha_worker_runtime:secret@db.example.test/postgres?sslmode=require',
      databasePrincipal: 'myeongha_worker_runtime',
      databaseExecutionRole: 'myeongha_system_executor',
    });

    const url = new URL(String(config.connectionString));
    expect(url.searchParams.get('sslmode')).toBe('require');
    expect(url.searchParams.get('uselibpqcompat')).toBe('true');
  });

  it('transforms the governed require migration source before the strict target', () => {
    let captured:
      | Readonly<{ databaseUrl: string; rootCertificatePem: string }>
      | undefined;

    const buildStrictTarget = vi.fn(
      (input: Readonly<{ databaseUrl: string; rootCertificatePem: string }>) => {
        captured = input;
        return {
          connectionString:
            'postgresql://myeongha_worker_runtime.cnsfpcdiyofqvhpcegfc:secret@aws-0-test.pooler.supabase.com:5432/postgres',
          ssl: {
            ca: 'test-only-root',
            rejectUnauthorized: true as const,
          },
          evidence: {
            contractVersion:
              'myeongha-production-account-deletion-worker-postgres-tls-peer-verification-v1' as const,
            projectRef: 'cnsfpcdiyofqvhpcegfc' as const,
            databasePrincipal: 'myeongha_worker_runtime' as const,
            endpointKind: 'supavisor' as const,
            endpointAuthorityPinned: true as const,
            tlsMode: 'verify-full' as const,
            peerVerification: 'full' as const,
            rejectUnauthorized: true as const,
            defaultHostnameVerification: true as const,
            rootCertificateFingerprint256:
              '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA' as const,
            rootCertificatePinned: true as const,
          },
        };
      },
    );

    const input: ProductionAccountDeletionWorkerDbConfigV1 = {
      databaseUrl:
        'postgresql://myeongha_worker_runtime.cnsfpcdiyofqvhpcegfc:secret@aws-0-test.pooler.supabase.com:5432/postgres?application_name=worker&sslmode=require&uselibpqcompat=true',
      databasePrincipal: 'myeongha_worker_runtime',
      databaseExecutionRole: 'myeongha_system_executor',
      databaseTlsPeerMode: 'verify-full',
      databaseSslRootCertificatePem: 'test-only-root',
    };

    const poolConfig = buildNodePostgresAccountDeletionWorkerPoolConfigV1(
      input,
      { buildStrictTarget },
    );

    expect(buildStrictTarget).toHaveBeenCalledTimes(1);
    expect(captured).toBeDefined();

    const strictUrl = new URL(String(captured?.databaseUrl));
    expect(strictUrl.searchParams.get('sslmode')).toBe('verify-full');
    expect(strictUrl.searchParams.get('uselibpqcompat')).toBeNull();
    expect(strictUrl.searchParams.get('application_name')).toBe('worker');
    expect(captured?.rootCertificatePem).toBe('test-only-root');

    expect(poolConfig.ssl).toEqual({
      ca: 'test-only-root',
      rejectUnauthorized: true,
    });
    expect(poolConfig.ssl).not.toHaveProperty('checkServerIdentity');
    expect(
      new URL(String(poolConfig.connectionString)).searchParams.get('sslmode'),
    ).toBeNull();
    expect(JSON.stringify(poolConfig.ssl)).not.toContain('secret@');
  });

  it.each([
    '',
    '?sslmode=disable',
    '?sslmode=allow',
    '?sslmode=prefer',
    '?sslmode=verify-ca',
    '?sslmode=unknown',
  ])('rejects non-migration strict source mode %s', (query) => {
    expect(() =>
      buildNodePostgresAccountDeletionWorkerPoolConfigV1({
        databaseUrl:
          `postgresql://myeongha_worker_runtime.cnsfpcdiyofqvhpcegfc:secret@aws-0-test.pooler.supabase.com/postgres${query}`,
        databasePrincipal: 'myeongha_worker_runtime',
        databaseExecutionRole: 'myeongha_system_executor',
        databaseTlsPeerMode: 'verify-full',
        databaseSslRootCertificatePem: 'test-only-root',
      }),
    ).toThrowError(NodePostgresAccountDeletionWorkerPoolErrorV1);
  });

  it('fails closed if strict activation lacks root material or target validation fails', () => {
    const missingRoot: ProductionAccountDeletionWorkerDbConfigV1 = {
      databaseUrl:
        'postgresql://myeongha_worker_runtime.cnsfpcdiyofqvhpcegfc:secret@aws-0-test.pooler.supabase.com/postgres?sslmode=verify-full',
      databasePrincipal: 'myeongha_worker_runtime',
      databaseExecutionRole: 'myeongha_system_executor',
      databaseTlsPeerMode: 'verify-full',
    };

    expect(() =>
      buildNodePostgresAccountDeletionWorkerPoolConfigV1(missingRoot),
    ).toThrowError(NodePostgresAccountDeletionWorkerPoolErrorV1);

    expect(() =>
      buildNodePostgresAccountDeletionWorkerPoolConfigV1(
        {
          ...missingRoot,
          databaseSslRootCertificatePem: 'test-only-root',
        },
        {
          buildStrictTarget: vi.fn(() => {
            throw new Error('rejected');
          }),
        },
      ),
    ).toThrowError(NodePostgresAccountDeletionWorkerPoolErrorV1);
  });
});
