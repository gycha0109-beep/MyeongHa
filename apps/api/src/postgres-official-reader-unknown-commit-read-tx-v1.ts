import {
  MINIMAL_UNKNOWN_COMMIT_READ_SQL,
  observeOfficialReaderUnknownCommitMinimalV1,
  type MinimalOfficialReaderObservationV1,
} from './official-reader-unknown-commit-minimal-v1.js';
import type {
  PostgresSubjectPoolV1,
  PostgresTransactionQueryV1,
} from './postgres-subject-execution.js';
import type {
  PrivateOfficialReaderRecoveryTransactionPortV1,
} from './official-reader-private-replay-recovery-v1.js';
import {
  isOfficialReaderUnknownCommitReadSqlV1,
  reconcileOfficialReaderUnknownCommitV1,
  type UnknownCommitReconciliationOutcomeV1,
} from './official-reader-unknown-commit-reconciliation-v1.js';

const RESET_SQL = 'ROLLBACK';
const BEGIN_SQL = 'BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED READ ONLY';
const ROLE_SQL = 'SET LOCAL ROLE myeongha_api_executor';
const COMMIT_SQL = 'COMMIT';
const BIND_SUBJECT_SQL = "select pg_catalog.set_config('myeongha.subject_id',$1,true)";
const UUID_V1 = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu;

/**
 * This is a read-only observation adapter, NOT an issuer or an authorization.
 * Every call acquires an exclusive pool connection, resets inherited state,
 * creates an explicit READ COMMITTED/READ ONLY transaction, and closes it.
 * No private D2 Writer SQL can pass its exact-query allowlist.
 *
 * A pool supplied here is an already-authorized narrow read connection.
 * This function creates no credentials and does NOT grant any reader ACL.
 */
export function createOfficialReaderUnknownCommitReadTransactionV1(
  pool: PostgresSubjectPoolV1,
  verifiedSubjectId?: string,
): PrivateOfficialReaderRecoveryTransactionPortV1 {
  return Object.freeze({
    async execute<T>(callback: (client: PostgresTransactionQueryV1) => Promise<T>): Promise<T> {
      const connection = await pool.connect();
      let transactionStarted = false;
      let queryCount = 0;
      let releaseError: unknown;

      try {
        // A pooled connection may have been returned with transaction state.
        // RESET must succeed; never run inside an inherited MVCC snapshot.
        try {
          await connection.query(RESET_SQL);
        } catch (error) {
          releaseError = error;
          throw error;
        }

        try {
          await connection.query(BEGIN_SQL);
          transactionStarted = true;
        } catch (error) {
          releaseError = error;
          throw error;
        }
        await connection.query(ROLE_SQL);
        if (verifiedSubjectId !== undefined) {
          if (!UUID_V1.test(verifiedSubjectId)) {
            throw new Error('Verified canonical subject ID is required for minimal Receipt read.');
          }
          await connection.query(BIND_SUBJECT_SQL, [verifiedSubjectId]);
        }

        const readClient: PostgresTransactionQueryV1 = Object.freeze({
          async query<Row = Record<string, unknown>>(
            sql: string,
            values?: readonly unknown[],
          ) {
            const legacyRead = verifiedSubjectId === undefined &&
              isOfficialReaderUnknownCommitReadSqlV1(sql) &&
              values?.length === 1 && typeof values[0] === 'string';
            const minimalRead = verifiedSubjectId !== undefined &&
              sql === MINIMAL_UNKNOWN_COMMIT_READ_SQL &&
              values?.length === 2 && values[0] === verifiedSubjectId &&
              typeof values[1] === 'string' && UUID_V1.test(values[1]);
            if (queryCount !== 0 || (!legacyRead && !minimalRead)) {
              throw new Error('Official Reader recovery permits only one canonical read-only Receipt query.');
            }
            queryCount += 1;
            return connection.query<Row>(sql, values);
          },
        });

        const result = await callback(readClient);
        if (queryCount !== 1) {
          throw new Error('Official Reader recovery requires exactly one canonical Receipt query.');
        }

        // A lost COMMIT acknowledgement discards this connection, even
        // though this particular transaction cannot write anything.
        try {
          await connection.query(COMMIT_SQL);
          transactionStarted = false;
        } catch (error) {
          releaseError = error;
          throw error;
        }

        return result;
      } catch (error) {
        if (transactionStarted) {
          try {
            await connection.query(RESET_SQL);
            transactionStarted = false;
          } catch (rollbackError) {
            releaseError = rollbackError;
            throw new AggregateError(
              [error, rollbackError],
              'Official Reader read-only recovery and its rollback both failed.',
            );
          }
        }
        throw error;
      } finally {
        connection.release(releaseError);
      }
    },
  });
}

/**
 * Narrow optional caller convenience: always HOLD. It never creates a
 * production pool or routes user traffic, nor permits automatic new grants.
 */
export async function reconcileOfficialReaderUnknownCommitWithFreshReadV1(input: Readonly<{
  readonly pool: PostgresSubjectPoolV1;
  readonly receiptId: unknown;
}>): Promise<UnknownCommitReconciliationOutcomeV1> {
  return reconcileOfficialReaderUnknownCommitV1({
    receiptId: input.receiptId,
    transaction: createOfficialReaderUnknownCommitReadTransactionV1(input.pool),
  });
}

/**
 * Approved narrow read surface. Authentication MUST be completed in the API
 * before passing verifiedSubjectId; no public route or issuer is created.
 */
export async function observeOfficialReaderUnknownCommitWithMinimalReadV1(input: Readonly<{
  readonly pool: PostgresSubjectPoolV1;
  readonly verifiedSubjectId: string;
  readonly receiptId: unknown;
}>): Promise<MinimalOfficialReaderObservationV1> {
  return observeOfficialReaderUnknownCommitMinimalV1({
    verifiedSubjectId: input.verifiedSubjectId,
    receiptId: input.receiptId,
    transaction: createOfficialReaderUnknownCommitReadTransactionV1(
      input.pool, input.verifiedSubjectId,
    ),
  });
}
