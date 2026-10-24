import {
  executePostgresAccountDeletionWorkerTransactionV1,
} from './postgres-account-deletion-worker.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';

/**
 * Manually invoked maintenance port only. Uses the pre-existing isolated
 * myeongha_system_executor role, never a caller-supplied Subject or API role.
 * No scheduler, API route, DB migration or live provider activation here.
 */
export const POSTGRES_PORTONE_ATTEMPT_PURGE_BINDINGS_V1 = Object.freeze({
  function: 'public.internal_purge_expired_legal_portone_attempts_v1',
  executionRole: 'myeongha_system_executor',
  minimumBatch: 1,
  maximumBatch: 250,
  scheduled: false,
  migrationApplied: false,
} as const);

const PURGE_SQL =
  'select public.internal_purge_expired_legal_portone_attempts_v1($1::integer) as "removed"';

export interface PortOneIdentityAttemptPurgePortV1 {
  purgeExpiredAttempts(limit: number): Promise<number>;
}

export function createPostgresPortOneIdentityAttemptPurgePortV1(
  pool: PostgresSubjectPoolV1,
): PortOneIdentityAttemptPurgePortV1 {
  return Object.freeze({
    async purgeExpiredAttempts(limit: number): Promise<number> {
      if (!Number.isInteger(limit) || limit < 1 || limit > 250) {
        throw new Error('PortOne cleanup batch size must be between 1 and 250.');
      }
      return executePostgresAccountDeletionWorkerTransactionV1({
        pool,
        execute: async client => {
          const result = await client.query<{ removed?: unknown }>(PURGE_SQL, [limit]);
          const removed = result.rows[0]?.removed;
          if (
            result.rows.length !== 1 ||
            typeof removed !== 'number' ||
            !Number.isInteger(removed) ||
            removed < 0 ||
            removed > limit
          ) {
            throw new Error('PortOne cleanup authority returned invalid affected-row count.');
          }
          return removed;
        },
      });
    },
  });
}
