import { describe, expect, it } from 'vitest';
import {
  ProductionAccountDeletionWorkerStrictRuntimeCanaryError,
  canonicalWorkerMigrationSourceUrl,
  requireStrictRuntimeCanaryAuthority,
  validateStrictRuntimeEvidenceRow,
} from '../scripts/operations/run-production-account-deletion-worker-strict-runtime-canary.mjs';

function expectCode(action, code) {
  try {
    action();
    throw new Error('expected strict-runtime canary rejection');
  } catch (error) {
    expect(error).toBeInstanceOf(
      ProductionAccountDeletionWorkerStrictRuntimeCanaryError,
    );
    expect(error).toMatchObject({ code });
  }
}

describe('Production account-deletion worker strict runtime canary', () => {
  it('canonicalizes the protected worker credential onto the governed require migration source', () => {
    const url = new URL(
      canonicalWorkerMigrationSourceUrl({
        sourceDatabaseUrl:
          'postgresql://myeongha_worker_runtime:secret@legacy.example.test:6543/other?sslmode=prefer&application_name=old',
        sessionPoolerHost: 'aws-0-test.pooler.supabase.com',
      }),
    );
    expect(decodeURIComponent(url.username)).toBe(
      'myeongha_worker_runtime.cnsfpcdiyofqvhpcegfc',
    );
    expect(url.hostname).toBe('aws-0-test.pooler.supabase.com');
    expect(url.port).toBe('5432');
    expect(url.pathname).toBe('/postgres');
    expect(url.searchParams.get('sslmode')).toBe('require');
    expect(url.searchParams.size).toBe(1);
  });

  it('rejects unrelated worker principals and non-Supabase pooler authority', () => {
    expectCode(
      () =>
        canonicalWorkerMigrationSourceUrl({
          sourceDatabaseUrl:
            'postgresql://postgres:secret@legacy.example.test/postgres',
          sessionPoolerHost: 'aws-0-test.pooler.supabase.com',
        }),
      'WORKER_DATABASE_URL_SOURCE_PRINCIPAL_INVALID',
    );
    expectCode(
      () =>
        canonicalWorkerMigrationSourceUrl({
          sourceDatabaseUrl:
            'postgresql://myeongha_worker_runtime:secret@legacy.example.test/postgres',
          sessionPoolerHost: 'evil.example.test',
        }),
      'SESSION_POOLER_HOST_INVALID',
    );
  });

  it('requires exact main/security dispatch authority', () => {
    expect(() =>
      requireStrictRuntimeCanaryAuthority({
        GITHUB_REF: 'refs/heads/main',
        GITHUB_EVENT_NAME: 'workflow_dispatch',
        MYEONGHA_WATCHTOWER_TRACK: 'security',
        MYEONGHA_WORKER_TLS_RUNTIME_CANARY_CONFIRM:
          'VERIFY_ACCOUNT_DELETION_WORKER_TLS_B3_RUNTIME',
      }),
    ).not.toThrow();

    expectCode(
      () =>
        requireStrictRuntimeCanaryAuthority({
          GITHUB_REF: 'refs/heads/main',
          GITHUB_EVENT_NAME: 'workflow_dispatch',
          MYEONGHA_WATCHTOWER_TRACK: 'ops',
          MYEONGHA_WORKER_TLS_RUNTIME_CANARY_CONFIRM:
            'VERIFY_ACCOUNT_DELETION_WORKER_TLS_B3_RUNTIME',
        }),
      'CANARY_AUTHORITY_INVALID',
    );
  });

  it('accepts only the fixed read-only worker evidence shape', () => {
    expect(() =>
      validateStrictRuntimeEvidenceRow(
        {
          currentUser: 'myeongha_worker_runtime',
          transactionReadOnly: 'on',
          executionRoleMember: true,
        },
        1,
      ),
    ).not.toThrow();

    expectCode(
      () =>
        validateStrictRuntimeEvidenceRow(
          {
            currentUser: 'myeongha_worker_runtime',
            transactionReadOnly: 'off',
            executionRoleMember: true,
          },
          1,
        ),
      'CANARY_EVIDENCE_TRANSACTION_READ_ONLY_INVALID',
    );
  });
});
