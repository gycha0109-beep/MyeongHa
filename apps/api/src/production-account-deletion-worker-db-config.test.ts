import { describe, expect, it } from 'vitest';
import {
  MYEONGHA_ACCOUNT_DELETION_SYSTEM_EXECUTION_ROLE,
  MYEONGHA_ACCOUNT_DELETION_WORKER_DATABASE_PRINCIPAL,
  parseProductionAccountDeletionWorkerDbConfigV1,
  summarizeProductionAccountDeletionWorkerDbConfigV1,
} from './production-account-deletion-worker-db-config.js';
import { ACCOUNT_DELETION_WORKER_RUNTIME_BINDINGS_V1 } from './production-account-deletion-worker-runtime.js';

describe('production account deletion worker DB config', () => {
  it('binds a dedicated worker login and system execution role without exposing the URL in summary', () => {
    const config = parseProductionAccountDeletionWorkerDbConfigV1({
      MYEONGHA_WORKER_DATABASE_URL:
        'postgresql://myeongha_worker_runtime:secret-value@db.example.test:5432/postgres?sslmode=require',
      MYEONGHA_WORKER_DATABASE_PRINCIPAL: 'myeongha_worker_runtime',
    });

    expect(config.databasePrincipal).toBe(
      MYEONGHA_ACCOUNT_DELETION_WORKER_DATABASE_PRINCIPAL,
    );
    expect(config.databaseExecutionRole).toBe(
      MYEONGHA_ACCOUNT_DELETION_SYSTEM_EXECUTION_ROLE,
    );
    expect(summarizeProductionAccountDeletionWorkerDbConfigV1(config)).toEqual({
      databaseConfigured: true,
      databasePrincipal: 'myeongha_worker_runtime',
      databaseExecutionRole: 'myeongha_system_executor',
    });
  });

  it('rejects ordinary or privileged database principals', () => {
    expect(() =>
      parseProductionAccountDeletionWorkerDbConfigV1({
        MYEONGHA_WORKER_DATABASE_URL:
          'postgresql://myeongha_runtime:secret-value@db.example.test/postgres',
        MYEONGHA_WORKER_DATABASE_PRINCIPAL: 'myeongha_runtime',
      }),
    ).toThrow(/must be myeongha_worker_runtime/u);

    expect(() =>
      parseProductionAccountDeletionWorkerDbConfigV1({
        MYEONGHA_WORKER_DATABASE_URL:
          'postgresql://postgres:secret-value@db.example.test/postgres',
        MYEONGHA_WORKER_DATABASE_PRINCIPAL: 'myeongha_worker_runtime',
      }),
    ).toThrow(/dedicated worker login principal/u);
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
