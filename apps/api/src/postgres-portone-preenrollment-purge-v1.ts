import {
  executePostgresAccountDeletionWorkerTransactionV1,
} from './postgres-account-deletion-worker.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';

/**
 * Pre-account ID/HMAC footprint has a hard ten-minute DB clock expiry.
 * The worker port is deliberately inert until an approved system maintenance
 * caller explicitly invokes it. No scheduler or route is registered here.
 */
export const PORTONE_PREENROLLMENT_PURGE_HOLD_V1 = Object.freeze({
  authority: 'public.internal_purge_legal_portone_preenrollment_v1',
  executionRole: 'myeongha_system_executor',
  maxBatch: 250,
  scheduled: false,
  migrationApplied: false,
  scope: 'subjectless-expired-pending-verified-consumed-identity-attempts',
} as const);

const SQL =
  'select public.internal_purge_legal_portone_preenrollment_v1($1::integer) as "removed"';

export interface PortOnePreenrollmentPurgePortV1 {
  purgeExpiredPreenrollmentProofs(limit: number): Promise<number>;
}

export function createPostgresPortOnePreenrollmentPurgePortV1(
  pool: PostgresSubjectPoolV1,
): PortOnePreenrollmentPurgePortV1 {
  return Object.freeze({
    async purgeExpiredPreenrollmentProofs(limit: number): Promise<number> {
      if (!Number.isInteger(limit) || limit < 1 || limit > 250) {
        throw new Error('Preenrollment cleanup batch must be an integer from 1 to 250.');
      }
      return executePostgresAccountDeletionWorkerTransactionV1({
        pool,
        execute: async db => {
          const { rows } = await db.query<Readonly<{ removed: unknown }>>(SQL, [limit]);
          const count = rows[0]?.removed;
          if (rows.length !== 1 || typeof count !== 'number' ||
              !Number.isInteger(count) || count < 0 || count > limit) {
            throw new Error('Preenrollment cleanup returned an invalid affected-row count.');
          }
          return count;
        },
      });
    },
  });
}
