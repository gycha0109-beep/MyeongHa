import type {
  AccountDeletionWorkerCompletionPortV1,
  AccountDeletionWorkerDbFinalizerPortV1,
  AccountDeletionWorkerResumeStatePortV1,
  AccountDeletionWorkerResumeStateV1,
} from './account-deletion-worker-orchestration.js';
import type {
  PostgresSubjectPoolV1,
  PostgresTransactionQueryV1,
} from './postgres-subject-execution.js';
import { MYEONGHA_ACCOUNT_DELETION_SYSTEM_EXECUTION_ROLE } from './production-account-deletion-worker-db-config.js';

export const POSTGRES_ACCOUNT_DELETION_WORKER_BINDINGS_V1 = Object.freeze({
  executionRole: MYEONGHA_ACCOUNT_DELETION_SYSTEM_EXECUTION_ROLE,
  claim: 'public.internal_claim_account_deletion_outbox_v1',
  resume: 'public.internal_account_deletion_resume_state_v1',
  finalize: 'public.internal_finalize_account_deletion_db_v1',
  complete: 'public.internal_complete_account_deletion_v1',
} as const);

type Awaitable<T> = T | Promise<T>;

export interface AccountDeletionWorkerClaimResultV1 {
  readonly outboxEventId: string;
  readonly subjectId: string;
  readonly deletionJobId: string;
  readonly reclaimed: boolean;
}

export interface AccountDeletionWorkerClaimPortV1 {
  claimEvent(input: {
    readonly outboxEventId: string;
    readonly lockOwner: string;
    readonly leaseExpiresAt: string;
  }): Awaitable<AccountDeletionWorkerClaimResultV1>;
}

export interface PostgresAccountDeletionWorkerPortsV1 {
  readonly claimPort: AccountDeletionWorkerClaimPortV1;
  readonly resumeStatePort: AccountDeletionWorkerResumeStatePortV1;
  readonly dbFinalizerPort: AccountDeletionWorkerDbFinalizerPortV1;
  readonly completionPort: AccountDeletionWorkerCompletionPortV1;
}

const BEGIN_SQL = 'BEGIN';
const ENTER_SYSTEM_ROLE_SQL = `SET LOCAL ROLE ${MYEONGHA_ACCOUNT_DELETION_SYSTEM_EXECUTION_ROLE}`;
const COMMIT_SQL = 'COMMIT';
const ROLLBACK_SQL = 'ROLLBACK';

const CLAIM_SQL = `
select
  outbox_event_id::text as "outboxEventId",
  subject_id::text as "subjectId",
  deletion_job_id::text as "deletionJobId",
  reclaimed
from public.internal_claim_account_deletion_outbox_v1($1::uuid, $2::text, $3::timestamptz)
`.trim();

const RESUME_SQL = `
select
  deletion_job_id::text as "deletionJobId",
  subject_id::text as "subjectId",
  phase,
  auth_user_id::text as "authUserId",
  outbox_event_id::text as "outboxEventId",
  outbox_status as "outboxStatus"
from public.internal_account_deletion_resume_state_v1($1::uuid, $2::uuid, $3::text)
`.trim();

const FINALIZE_SQL = `
select
  finalized,
  replayed,
  auth_mapping_present as "authMappingPresent"
from public.internal_finalize_account_deletion_db_v1($1::uuid, $2::uuid, $3::text)
`.trim();

const COMPLETE_SQL = `
select
  completed,
  replayed,
  completed_at::text as "completedAt"
from public.internal_complete_account_deletion_v1($1::uuid, $2::uuid, $3::text)
`.trim();

function oneRow<Row>(
  rows: readonly Row[],
  operation: string,
): Row {
  const row = rows[0];
  if (rows.length !== 1 || row === undefined) {
    throw new Error(`Account-deletion worker ${operation} must return exactly one row.`);
  }
  return row;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Account-deletion worker returned invalid ${label}.`);
  }
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Account-deletion worker returned invalid ${label}.`);
  }
  return value;
}

export async function executePostgresAccountDeletionWorkerTransactionV1<T>(input: {
  readonly pool: PostgresSubjectPoolV1;
  readonly execute: (client: PostgresTransactionQueryV1) => Awaitable<T>;
}): Promise<T> {
  const connection = await input.pool.connect();
  let transactionStarted = false;
  let discardConnectionError: unknown;

  try {
    await connection.query(BEGIN_SQL);
    transactionStarted = true;
    await connection.query(ENTER_SYSTEM_ROLE_SQL);
    const result = await input.execute(connection);
    await connection.query(COMMIT_SQL);
    transactionStarted = false;
    return result;
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.query(ROLLBACK_SQL);
      } catch (rollbackError) {
        discardConnectionError = rollbackError;
        throw new AggregateError(
          [error, rollbackError],
          'Account-deletion worker transaction failed and rollback also failed.',
        );
      }
    }
    throw error;
  } finally {
    connection.release(discardConnectionError);
  }
}

export function createPostgresAccountDeletionWorkerPortsV1(input: {
  readonly pool: PostgresSubjectPoolV1;
}): PostgresAccountDeletionWorkerPortsV1 {
  const claimPort: AccountDeletionWorkerClaimPortV1 = Object.freeze({
    async claimEvent(claimInput: {
      readonly outboxEventId: string;
      readonly lockOwner: string;
      readonly leaseExpiresAt: string;
    }) {
      return executePostgresAccountDeletionWorkerTransactionV1({
        pool: input.pool,
        execute: async (client) => {
          const result = await client.query<{
            outboxEventId: unknown;
            subjectId: unknown;
            deletionJobId: unknown;
            reclaimed: unknown;
          }>(CLAIM_SQL, [
            claimInput.outboxEventId,
            claimInput.lockOwner,
            claimInput.leaseExpiresAt,
          ]);
          const row = oneRow(result.rows, 'claim');
          return Object.freeze({
            outboxEventId: requireString(row.outboxEventId, 'outbox event id'),
            subjectId: requireString(row.subjectId, 'subject id'),
            deletionJobId: requireString(row.deletionJobId, 'deletion job id'),
            reclaimed: requireBoolean(row.reclaimed, 'reclaimed flag'),
          });
        },
      });
    },
  });

  const resumeStatePort: AccountDeletionWorkerResumeStatePortV1 = Object.freeze({
    async readResumeState(resumeInput: {
      readonly subjectId: string;
      readonly deletionJobId: string;
      readonly lockOwner: string;
    }): Promise<AccountDeletionWorkerResumeStateV1> {
      return executePostgresAccountDeletionWorkerTransactionV1({
        pool: input.pool,
        execute: async (client) => {
          const result = await client.query<{
            deletionJobId: unknown;
            subjectId: unknown;
            phase: unknown;
            authUserId: unknown;
            outboxEventId: unknown;
            outboxStatus: unknown;
          }>(RESUME_SQL, [
            resumeInput.subjectId,
            resumeInput.deletionJobId,
            resumeInput.lockOwner,
          ]);
          const row = oneRow(result.rows, 'resume');
          const authUserId =
            row.authUserId === null
              ? null
              : requireString(row.authUserId, 'Auth user id');
          const phase = requireString(row.phase, 'resume phase');
          const outboxStatus = requireString(row.outboxStatus, 'outbox status');
          return Object.freeze({
            deletionJobId: requireString(row.deletionJobId, 'deletion job id'),
            subjectId: requireString(row.subjectId, 'subject id'),
            phase: phase as AccountDeletionWorkerResumeStateV1['phase'],
            authUserId,
            outboxEventId: requireString(row.outboxEventId, 'outbox event id'),
            outboxStatus: outboxStatus as AccountDeletionWorkerResumeStateV1['outboxStatus'],
          });
        },
      });
    },
  });

  const dbFinalizerPort: AccountDeletionWorkerDbFinalizerPortV1 = Object.freeze({
    async finalizeDatabase(finalizeInput: {
      readonly subjectId: string;
      readonly deletionJobId: string;
      readonly lockOwner: string;
    }) {
      return executePostgresAccountDeletionWorkerTransactionV1({
        pool: input.pool,
        execute: async (client) => {
          const result = await client.query<{
            finalized: unknown;
            replayed: unknown;
            authMappingPresent: unknown;
          }>(FINALIZE_SQL, [
            finalizeInput.subjectId,
            finalizeInput.deletionJobId,
            finalizeInput.lockOwner,
          ]);
          const row = oneRow(result.rows, 'DB finalizer');
          return Object.freeze({
            finalized: requireBoolean(row.finalized, 'finalized flag'),
            replayed: requireBoolean(row.replayed, 'finalizer replay flag'),
            authMappingPresent: requireBoolean(
              row.authMappingPresent,
              'Auth mapping flag',
            ),
          });
        },
      });
    },
  });

  const completionPort: AccountDeletionWorkerCompletionPortV1 = Object.freeze({
    async completeDeletion(completeInput: {
      readonly subjectId: string;
      readonly deletionJobId: string;
      readonly lockOwner: string;
    }) {
      return executePostgresAccountDeletionWorkerTransactionV1({
        pool: input.pool,
        execute: async (client) => {
          const result = await client.query<{
            completed: unknown;
            replayed: unknown;
            completedAt: unknown;
          }>(COMPLETE_SQL, [
            completeInput.subjectId,
            completeInput.deletionJobId,
            completeInput.lockOwner,
          ]);
          const row = oneRow(result.rows, 'completion ACK');
          return Object.freeze({
            completed: requireBoolean(row.completed, 'completed flag'),
            replayed: requireBoolean(row.replayed, 'completion replay flag'),
            completedAt: requireString(row.completedAt, 'completion timestamp'),
          });
        },
      });
    },
  });

  return Object.freeze({
    claimPort,
    resumeStatePort,
    dbFinalizerPort,
    completionPort,
  });
}
