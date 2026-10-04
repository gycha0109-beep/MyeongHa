import { describe, expect, it } from 'vitest';
import {
  MYEONGHA_ACCOUNT_DELETION_SYSTEM_EXECUTION_ROLE,
  MYEONGHA_ACCOUNT_DELETION_WORKER_DATABASE_PRINCIPAL,
  parseProductionAccountDeletionWorkerDbConfigV1,
  summarizeProductionAccountDeletionWorkerDbConfigV1,
} from './production-account-deletion-worker-db-config.js';
import { ACCOUNT_DELETION_WORKER_RUNTIME_BINDINGS_V1 } from './production-account-deletion-worker-runtime.js';

const ROOT_PEM =
  '-----BEGIN CERTIFICATE-----\ntest-only-root\n-----END CERTIFICATE-----';

describe('production account deletion worker DB config', () => {
  it('fails closed when strict TLS authority is absent', () => {
    expect(() =>
      parseProductionAccountDeletionWorkerDbConfigV1({
        MYEONGHA_WORKER_DATABASE_URL:
          'postgresql://myeongha_worker_runtime:secret-value@db.example.test:5432/postgres?sslmode=require',
        MYEONGHA_WORKER_DATABASE_PRINCIPAL: 'myeongha_worker_runtime',
      }),
    ).toThrow(/MYEONGHA_WORKER_DATABASE_TLS_PEER_MODE/u);
  });

  it('admits verify-full only with protected root material', () => {
    const config = parseProductionAccountDeletionWorkerDbConfigV1({
      MYEONGHA_WORKER_DATABASE_URL:
        'postgresql://myeongha_worker_runtime.cnsfpcdiyofqvhpcegfc:fixture-password@aws-0-test.pooler.supabase.com:5432/postgres?sslmode=verify-full',
      MYEONGHA_WORKER_DATABASE_PRINCIPAL: 'myeongha_worker_runtime',
      MYEONGHA_WORKER_DATABASE_TLS_PEER_MODE: 'verify-full',
      MYEONGHA_WORKER_DATABASE_SSL_ROOT_CERT_PEM: ROOT_PEM,
    });

    expect(config).toMatchObject({
      databasePrincipal: 'myeongha_worker_runtime',
      databaseExecutionRole: 'myeongha_system_executor',
      databaseTlsPeerMode: 'verify-full',
      databaseSslRootCertificatePem: ROOT_PEM,
    });
    expect(summarizeProductionAccountDeletionWorkerDbConfigV1(config)).toEqual({
      databaseConfigured: true,
      databasePrincipal: 'myeongha_worker_runtime',
      databaseExecutionRole: 'myeongha_system_executor',
      databaseTlsPeerMode: 'verify-full',
      databaseTlsRootCertificateConfigured: true,
    });
    expect(
      JSON.stringify(summarizeProductionAccountDeletionWorkerDbConfigV1(config)),
    ).not.toContain(ROOT_PEM);
  });

  it('fails closed for unknown strict mode, missing root material, or weak source posture', () => {
    const base = {
      MYEONGHA_WORKER_DATABASE_URL:
        'postgresql://myeongha_worker_runtime.cnsfpcdiyofqvhpcegfc:fixture-password@aws-0-test.pooler.supabase.com:5432/postgres?sslmode=require',
      MYEONGHA_WORKER_DATABASE_PRINCIPAL: 'myeongha_worker_runtime',
    };

    expect(() =>
      parseProductionAccountDeletionWorkerDbConfigV1({
        ...base,
        MYEONGHA_WORKER_DATABASE_TLS_PEER_MODE: 'legacy',
      }),
    ).toThrow(/must be verify-full/u);

    expect(() =>
      parseProductionAccountDeletionWorkerDbConfigV1({
        ...base,
        MYEONGHA_WORKER_DATABASE_TLS_PEER_MODE: 'verify-full',
      }),
    ).toThrow(/MYEONGHA_WORKER_DATABASE_SSL_ROOT_CERT_PEM/u);

    expect(() =>
      parseProductionAccountDeletionWorkerDbConfigV1({
        ...base,
        MYEONGHA_WORKER_DATABASE_URL:
          'postgresql://myeongha_worker_runtime.cnsfpcdiyofqvhpcegfc:fixture-password@aws-0-test.pooler.supabase.com:5432/postgres?sslmode=prefer',
        MYEONGHA_WORKER_DATABASE_TLS_PEER_MODE: 'verify-full',
        MYEONGHA_WORKER_DATABASE_SSL_ROOT_CERT_PEM: ROOT_PEM,
      }),
    ).toThrow(/require migration source or verify-full source/u);
  });

  it('accepts a Supavisor-qualified worker username while retaining strict database role authority', () => {
    const config = parseProductionAccountDeletionWorkerDbConfigV1({
      MYEONGHA_WORKER_DATABASE_URL:
        'postgresql://myeongha_worker_runtime.cnsfpcdiyofqvhpcegfc:fixture-password@pooler.example.test:5432/postgres?sslmode=require',
      MYEONGHA_WORKER_DATABASE_PRINCIPAL: 'myeongha_worker_runtime',
      MYEONGHA_WORKER_DATABASE_TLS_PEER_MODE: 'verify-full',
      MYEONGHA_WORKER_DATABASE_SSL_ROOT_CERT_PEM: ROOT_PEM,
    });

    expect(config.databasePrincipal).toBe(
      MYEONGHA_ACCOUNT_DELETION_WORKER_DATABASE_PRINCIPAL,
    );
    expect(config.databaseExecutionRole).toBe(
      MYEONGHA_ACCOUNT_DELETION_SYSTEM_EXECUTION_ROLE,
    );
    expect(config.databaseTlsPeerMode).toBe('verify-full');
  });

  it('rejects malformed or unrelated Supavisor-qualified principals', () => {
    for (const username of [
      'myeongha_worker_runtime.short',
      'myeongha_runtime.cnsfpcdiyofqvhpcegfc',
      'postgres.cnsfpcdiyofqvhpcegfc',
    ]) {
      expect(() =>
        parseProductionAccountDeletionWorkerDbConfigV1({
          MYEONGHA_WORKER_DATABASE_URL:
            `postgresql://${username}:fixture-password@pooler.example.test:5432/postgres?sslmode=require`,
          MYEONGHA_WORKER_DATABASE_PRINCIPAL: 'myeongha_worker_runtime',
          MYEONGHA_WORKER_DATABASE_TLS_PEER_MODE: 'verify-full',
          MYEONGHA_WORKER_DATABASE_SSL_ROOT_CERT_PEM: ROOT_PEM,
        }),
      ).toThrow(/dedicated worker login principal/u);
    }
  });

  it('rejects ordinary or privileged database principals', () => {
    expect(() =>
      parseProductionAccountDeletionWorkerDbConfigV1({
        MYEONGHA_WORKER_DATABASE_URL:
          'postgresql://myeongha_runtime:secret-value@db.example.test/postgres?sslmode=require',
        MYEONGHA_WORKER_DATABASE_PRINCIPAL: 'myeongha_runtime',
        MYEONGHA_WORKER_DATABASE_TLS_PEER_MODE: 'verify-full',
        MYEONGHA_WORKER_DATABASE_SSL_ROOT_CERT_PEM: ROOT_PEM,
      }),
    ).toThrow(/must be myeongha_worker_runtime/u);

    expect(() =>
      parseProductionAccountDeletionWorkerDbConfigV1({
        MYEONGHA_WORKER_DATABASE_URL:
          'postgresql://postgres:secret-value@db.example.test/postgres?sslmode=require',
        MYEONGHA_WORKER_DATABASE_PRINCIPAL: 'myeongha_worker_runtime',
        MYEONGHA_WORKER_DATABASE_TLS_PEER_MODE: 'verify-full',
        MYEONGHA_WORKER_DATABASE_SSL_ROOT_CERT_PEM: ROOT_PEM,
      }),
    ).toThrow(/dedicated worker login principal/u);
  });

  it('rejects malformed config summaries that do not carry strict TLS authority', () => {
    expect(() =>
      summarizeProductionAccountDeletionWorkerDbConfigV1({
        databaseUrl:
          'postgresql://myeongha_worker_runtime:secret@db.example.test/postgres?sslmode=require',
        databasePrincipal: 'myeongha_worker_runtime',
        databaseExecutionRole: 'myeongha_system_executor',
        databaseTlsPeerMode: undefined,
        databaseSslRootCertificatePem: undefined,
      } as unknown as Parameters<
        typeof summarizeProductionAccountDeletionWorkerDbConfigV1
      >[0]),
    ).toThrow(/requires strict verify-full TLS authority/u);
  });

  it('keeps the worker internal and owns no discovery or retry policy', () => {
    expect(ACCOUNT_DELETION_WORKER_RUNTIME_BINDINGS_V1).toEqual({
      publicRoute: null,
      routeMounted: false,
      browserAuthority: false,
      ownsBatchDiscovery: false,
      ownsRetryPolicy: false,
      claimCommitsBeforeProviderIo: true,
    });
  });
});
