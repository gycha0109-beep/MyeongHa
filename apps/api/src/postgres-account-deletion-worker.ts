import type {
  AccountDeletionWorkerCompletionPortV1,
  AccountDeletionWorkerDbFinalizerPortV1,
  AccountDeletionWorkerResumeStatePortV1,
  AccountDeletionWorkerResumeStateV1,
  AccountDeletionReaderPrivacyStatePortV1,
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
  readonly readerPrivacyStatePort: AccountDeletionReaderPrivacyStatePortV1;
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

const READER_PRIVACY_SCHEMA_SQL = `
select
  pg_catalog.to_regclass('public.official_reader_paid_answer_bodies')::text as "bodyTable",
  pg_catalog.to_regprocedure(
    'public.internal_qry_official_reader_account_deletion_manifest_v1(uuid,uuid,text)'
  )::text as "manifestFunction",
  pg_catalog.to_regclass('public.official_reader_account_deletion_privacy_status_v1')::text as "statusTable",
  pg_catalog.to_regprocedure(
    'public.internal_qry_official_reader_account_privacy_pending_v1(uuid,uuid,text)'
  )::text as "pendingFunction"
`.trim();

type ReaderPrivacySchemaV1 = Readonly<{
  bodyTable: string | null;
  manifestFunction: string | null;
  statusTable: string | null;
  pendingFunction: string | null;
}>;

async function readerPrivacySchemaV1(client: PostgresTransactionQueryV1): Promise<ReaderPrivacySchemaV1> {
  const result = await client.query<ReaderPrivacySchemaV1>(READER_PRIVACY_SCHEMA_SQL);
  return oneRow(result.rows, 'Reader Privacy schema');
}

const READER_PRIVACY_MANIFEST_SQL = `
select body_id::text as "bodyId",
       encryption_key_ref as "encryptionKeyRef"
from public.internal_qry_official_reader_account_deletion_manifest_v1(
  $1::uuid,$2::uuid,$3::text
)
`.trim();

const READER_PRIVACY_PENDING_SQL = `
select public.internal_qry_official_reader_account_privacy_pending_v1(
  $1::uuid,$2::uuid,$3::text
) as "pending"
`.trim();

const READER_PRIVACY_ACK_SQL = `
select public.internal_ack_official_reader_account_key_erasure_v1(
  $1::uuid,$2::uuid,$3::text,$4::text
) as "acknowledged"
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
      readonly privacyFenceId?: string;
    }) {
      return executePostgresAccountDeletionWorkerTransactionV1({
        pool: input.pool,
        execute: async (client) => {
          // Transaction-local authority originates from a durable external
          // ledger receipt, never from a browser or provider payload.
          if (finalizeInput.privacyFenceId !== undefined) {
            const receipt = finalizeInput.privacyFenceId;
            if (typeof receipt !== 'string' || receipt.trim() !== receipt
                || receipt.length === 0 || receipt.length > 256) {
              throw new Error('Protected Reader external privacy fence is invalid.');
            }
            await client.query(
              "select pg_catalog.set_config('myeongha.reader_privacy_fence_subject_id',$1::text,true)",
              [finalizeInput.subjectId],
            );
            await client.query(
              "select pg_catalog.set_config('myeongha.reader_privacy_fence_deletion_job_id',$1::text,true)",
              [finalizeInput.deletionJobId],
            );
            await client.query(
              "select pg_catalog.set_config('myeongha.reader_privacy_fence_receipt_id',$1::text,true)",
              [receipt],
            );
          }
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

  const readerPrivacyStatePort: AccountDeletionReaderPrivacyStatePortV1 = Object.freeze({
    async readProtectedManifest(identity) {
      return executePostgresAccountDeletionWorkerTransactionV1({
        pool: input.pool,
        execute: async (client) => {
          const schema = await readerPrivacySchemaV1(client);
          if (schema.bodyTable === null && schema.manifestFunction === null) {
            return Object.freeze({ entries: Object.freeze([]) });
          }
          if (schema.bodyTable === null || schema.manifestFunction === null) {
            throw new Error('Protected Reader deletion needs the complete manifest migration.');
          }
          const result = await client.query<{
            bodyId: unknown;
            encryptionKeyRef: unknown;
          }>(READER_PRIVACY_MANIFEST_SQL, [
            identity.subjectId, identity.deletionJobId, identity.lockOwner,
          ]);
          const rows = result.rows.map((row) => Object.freeze({
            bodyId: requireString(row.bodyId, 'protected Reader body identity'),
            encryptionKeyRef: requireString(row.encryptionKeyRef, 'protected Reader key identity'),
          }));
          return Object.freeze({ entries: Object.freeze(rows) });
        },
      });
    },
    async hasPendingKeyErasure(identity) {
      return executePostgresAccountDeletionWorkerTransactionV1({
        pool: input.pool,
        execute: async (client) => {
          const schema = await readerPrivacySchemaV1(client);
          if (schema.bodyTable === null && schema.statusTable === null
              && schema.pendingFunction === null) return false;
          if (schema.statusTable === null || schema.pendingFunction === null) {
            throw new Error('Protected Reader deletion status authority is unavailable.');
          }
          const result = await client.query<{ pending: unknown }>(
            READER_PRIVACY_PENDING_SQL,
            [identity.subjectId, identity.deletionJobId, identity.lockOwner],
          );
          return requireBoolean(oneRow(result.rows, 'protected key erasure pending').pending, 'key erasure pending');
        },
      });
    },
    async markKeysErased(identity) {
      return executePostgresAccountDeletionWorkerTransactionV1({
        pool: input.pool,
        execute: async (client) => {
          const result = await client.query<{ acknowledged: unknown }>(
            READER_PRIVACY_ACK_SQL,
            [
              identity.subjectId, identity.deletionJobId, identity.lockOwner,
              identity.privacyFenceId,
            ],
          );
          return requireBoolean(oneRow(result.rows, 'protected key erasure acknowledgment').acknowledged, 'key erasure acknowledgment');
        },
      });
    },
  });

  return Object.freeze({
    claimPort,
    resumeStatePort,
    dbFinalizerPort,
    completionPort,
    readerPrivacyStatePort,
  });
}
