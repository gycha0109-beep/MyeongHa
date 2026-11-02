/**
 * INTERNAL OPERATIONS ONLY. One repeatable-read/read-only snapshot across
 * production Receipt, immutable Reader selection, checkout notice and delivery.
 *
 * The pool must use the existing trusted RLS-complete operations identity;
 * ordinary API executor has no rights on checkout notice evidence tables.
 * Nothing in this module enables or installs a public purchase/refund endpoint.
 */
import type {
  PostgresSubjectConnectionV1,
  PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import { prepareDigitalReadingWithdrawalReviewV1,
  type DigitalReadingWithdrawalPreflightV1,
} from './commerce-digital-reading-withdrawal-review-preflight-v1.js';
import {
  createPostgresDigitalReadingWithdrawalEvidencePrivateV1,
} from './postgres-digital-reading-withdrawal-evidence-private-v1.js';

export const DIGITAL_READING_WITHDRAWAL_PRIVATE_TRANSACTION_V1 = Object.freeze({
  isolation: 'repeatable_read',
  readonly: true,
  rollbackOnly: true,
  publicRouteMounted: false,
  requestPersistenceEnabled: false,
} as const);

const DENIED: DigitalReadingWithdrawalPreflightV1 = Object.freeze({
  kind: 'not_admitted',
  requestRecorded: false,
  providerRefundAuthorized: false,
  entitlementMutationAuthorized: false,
});

/**
 * Does not acknowledge a consumer claim or make a refund decision.
 * SQL privileges and RLS completeness are supplied by the dedicated operations
 * connection; a missing/under-privileged source is fail-closed, not bypassed.
 */
export async function inspectDigitalReadingWithdrawalPrivateV1(input: Readonly<{
  pool: PostgresSubjectPoolV1;
  resolvedSubjectId: string | undefined;
  request: unknown;
}>): Promise<DigitalReadingWithdrawalPreflightV1> {
  let connection: PostgresSubjectConnectionV1 | undefined;
  let transactionStarted = false;
  let poisonConnection: unknown;
  let result: DigitalReadingWithdrawalPreflightV1 = DENIED;

  try {
    connection = await input.pool.connect();
    await connection.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    transactionStarted = true;
    result = await prepareDigitalReadingWithdrawalReviewV1({
      resolvedSubjectId: input.resolvedSubjectId,
      request: input.request,
      evidencePort: createPostgresDigitalReadingWithdrawalEvidencePrivateV1(connection),
    });
  } catch {
    // An exception while BEGIN is in flight may still leave a transaction
    // open server-side. Discard rather than returning that connection to pool.
    if (connection !== undefined && !transactionStarted) {
      poisonConnection = new Error('Private read-only transaction initialization failed.');
    }
    result = DENIED;
  } finally {
    if (connection !== undefined) {
      if (transactionStarted) {
        try {
          await connection.query('ROLLBACK');
        } catch {
          poisonConnection = new Error('Private read-only transaction rollback failed.');
          result = DENIED;
        }
      }
      try {
        connection.release(poisonConnection);
      } catch {
        result = DENIED;
      }
    }
  }
  return result;
}
