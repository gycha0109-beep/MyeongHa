import { describe, expect, it } from 'vitest';

import {
  ProductionAccountDeletionWorkerTlsCanaryError,
  canonicalStrictWorkerDatabaseUrl,
  validateWorkerTlsCanaryEvidenceRow,
} from '../scripts/operations/run-production-account-deletion-worker-tls-canary.mjs';

function expectCode(action, code) {
  try {
    action();
    throw new Error('expected worker TLS canary rejection');
  } catch (error) {
    expect(error).toBeInstanceOf(
      ProductionAccountDeletionWorkerTlsCanaryError,
    );
    expect(error).toMatchObject({ code });
  }
}

describe('Production account-deletion worker TLS canary contract', () => {
  it('rebuilds the protected credential onto the governed pooler with verify-full', () => {
    const url = new URL(
      canonicalStrictWorkerDatabaseUrl({
        sourceDatabaseUrl:
          'postgresql://myeongha_worker_runtime:secret-value@old.example.test:9999/other?sslmode=require&application_name=legacy',
        sessionPoolerHost: 'aws-0-test.pooler.supabase.com',
      }),
    );

    expect(decodeURIComponent(url.username)).toBe(
      'myeongha_worker_runtime.cnsfpcdiyofqvhpcegfc',
    );
    expect(url.password).toBe('secret-value');
    expect(url.hostname).toBe('aws-0-test.pooler.supabase.com');
    expect(url.port).toBe('5432');
    expect(url.pathname).toBe('/postgres');
    expect(url.searchParams.get('sslmode')).toBe('verify-full');
    expect(url.searchParams.get('application_name')).toBeNull();
  });

  it('rejects an unrelated qualified project identity', () => {
    expectCode(
      () =>
        canonicalStrictWorkerDatabaseUrl({
          sourceDatabaseUrl:
            'postgresql://myeongha_worker_runtime.aaaaaaaaaaaaaaaaaaaa:secret-value@old.example.test/postgres?sslmode=require',
          sessionPoolerHost: 'aws-0-test.pooler.supabase.com',
        }),
      'WORKER_DATABASE_URL_SOURCE_PRINCIPAL_INVALID',
    );
  });

  it('rejects an ungoverned pooler hostname', () => {
    expectCode(
      () =>
        canonicalStrictWorkerDatabaseUrl({
          sourceDatabaseUrl:
            'postgresql://myeongha_worker_runtime:secret-value@old.example.test/postgres',
          sessionPoolerHost: 'evil.example.test',
        }),
      'SESSION_POOLER_HOST_INVALID',
    );
  });

  it('accepts only the fixed read-only worker principal and role evidence', () => {
    expect(() =>
      validateWorkerTlsCanaryEvidenceRow(
        {
          sessionUser: 'myeongha_worker_runtime',
          currentUser: 'myeongha_worker_runtime',
          transactionReadOnly: 'on',
          executionRoleMember: true,
        },
        1,
      ),
    ).not.toThrow();

    expectCode(
      () =>
        validateWorkerTlsCanaryEvidenceRow(
          {
            sessionUser: 'unexpected',
            currentUser: 'unexpected',
            transactionReadOnly: 'on',
            executionRoleMember: true,
          },
          1,
        ),
      'CANARY_EVIDENCE_PRINCIPAL_MISMATCH',
    );

    expectCode(
      () =>
        validateWorkerTlsCanaryEvidenceRow(
          {
            sessionUser: 'myeongha_worker_runtime',
            currentUser: 'myeongha_worker_runtime',
            transactionReadOnly: 'off',
            executionRoleMember: true,
          },
          1,
        ),
      'CANARY_EVIDENCE_TRANSACTION_READ_ONLY_INVALID',
    );

    expectCode(
      () =>
        validateWorkerTlsCanaryEvidenceRow(
          {
            sessionUser: 'myeongha_worker_runtime',
            currentUser: 'myeongha_worker_runtime',
            transactionReadOnly: 'on',
            executionRoleMember: false,
          },
          1,
        ),
      'CANARY_EVIDENCE_ROLE_MEMBERSHIP_INVALID',
    );
  });
});
