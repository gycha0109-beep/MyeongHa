import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProductionAccountDeletionWorkerRuntimeV1 } from
  '../apps/api/src/production-account-deletion-worker-runtime.js';

/**
 * S4 account deletion and refund purge must not silently use different
 * independent Privacy authorities in the same worker process. These are
 * configuration-only checks; no DB, filesystem, or live key is created.
 */
afterEach(() => vi.unstubAllEnvs());

describe('Official Reader S4 single off-primary authority for deletion and purge', () => {
  it('rejects an injected account deletion provider when environment configures a second refund-purge ledger', () => {
    vi.stubEnv('MYEONGHA_READER_PRIVACY_LEDGER_ROOT', 'C:\\reader-privacy-ledger');
    vi.stubEnv('MYEONGHA_READER_PRIVACY_KEY_ROOT', 'C:\\reader-privacy-keys');
    vi.stubEnv('MYEONGHA_READER_PRIVACY_LEDGER_SEAL_KEY_B64',
      Buffer.alloc(32, 1).toString('base64url'));
    vi.stubEnv('MYEONGHA_READER_PRIVACY_KEY_SEAL_KEY_B64',
      Buffer.alloc(32, 2).toString('base64url'));

    expect(() => createProductionAccountDeletionWorkerRuntimeV1({
      databaseConfig: {} as never,
      authAdminConfig: {} as never,
      readerPrivacyDeletionPort: {
        fenceBeforeDatabaseDeletion: vi.fn(),
        finishAfterDatabaseDeletion: vi.fn(),
      } as never,
    })).toThrow('Protected Reader deletion can use only one Privacy provider.');
  });

  it('rejects partially configured environment even with an injected deletion provider', () => {
    vi.stubEnv('MYEONGHA_READER_PRIVACY_LEDGER_ROOT', 'C:\\reader-privacy-ledger');
    vi.stubEnv('MYEONGHA_READER_PRIVACY_KEY_ROOT', undefined);
    vi.stubEnv('MYEONGHA_READER_PRIVACY_LEDGER_SEAL_KEY_B64', undefined);
    vi.stubEnv('MYEONGHA_READER_PRIVACY_KEY_SEAL_KEY_B64', undefined);
    expect(() => createProductionAccountDeletionWorkerRuntimeV1({
      databaseConfig: {} as never,
      authAdminConfig: {} as never,
      readerPrivacyDeletionPort: {
        fenceBeforeDatabaseDeletion: vi.fn(),
        finishAfterDatabaseDeletion: vi.fn(),
      } as never,
    })).toThrow('Protected Reader off-primary Worker configuration is unavailable.');
  });
});
