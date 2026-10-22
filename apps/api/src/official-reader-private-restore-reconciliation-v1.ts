import type {
  OfficialReaderOffPrimaryStoreV1,
} from './official-reader-node-offprimary-privacy-store-v1.js';
import {
  executePostgresAccountDeletionWorkerTransactionV1,
} from './postgres-account-deletion-worker.js';
import type {
  PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';

export const OFFICIAL_READER_RESTORE_RECONCILIATION_VERSION_V1 =
  'official-reader-offprimary-restore-reconciliation-v1' as const;

const RESTORE_SQL = `
select
  erased_row_count::text as "erasedRowCount",
  remaining_subject_row_count::text as "remainingSubjectRowCount"
from public.internal_replay_offprimary_reader_account_deletion_v1(
  $1::uuid,$2::uuid,$3::text,$4::uuid[]
)
`;

export interface OfficialReaderOffPrimaryRestoreReconciliationResultV1 {
  readonly schemaVersion: typeof OFFICIAL_READER_RESTORE_RECONCILIATION_VERSION_V1;
  readonly tombstonesReplayed: number;
  readonly protectedRowsPhysicallyDeleted: number;
  readonly keysConfirmedDestroyed: number;
  /** This operation does NOT release broader P30D/S8 read serviceability. */
  readonly publicReaderServiceEnabled: false;
}

function fail(): never {
  throw new Error('Official Reader restored privacy state is unavailable.');
}

function integer(value: unknown): number {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(value)) return fail();
  const result = Number(value);
  if (!Number.isSafeInteger(result)) return fail();
  return result;
}

/**
 * OFFLINE ONLY. Run with ALL public paid-read routes and all protected-key
 * serving disabled after a physical PostgreSQL restore.
 *
 * Every off-primary encrypted account tombstone is replayed against the
 * restored DB under the dedicated account-deletion system execution role.
 * Physical protected-body erasure is a single DB transaction per Subject.
 * The key store then replays its independent revocation tombstones, and the
 * outside-backup ledger acknowledges key destruction again if necessary.
 *
 * A failure leaves the service quarantined; this function intentionally
 * cannot set an "approved for public use" bit. Existing authoritative
 * account/Commerce/privacy recovery reconciliation must ALSO complete.
 */
export async function reconcileOfficialReaderProtectedBodiesAfterRestoreV1(input: {
  readonly pool: PostgresSubjectPoolV1;
  readonly offPrimary: OfficialReaderOffPrimaryStoreV1;
  /** Explicit offline restore invocation, NOT inferred from DB status. */
  readonly executionBoundary: 'isolated-restoration-only';
}): Promise<OfficialReaderOffPrimaryRestoreReconciliationResultV1> {
  if (input.executionBoundary !== 'isolated-restoration-only'
      || !input.pool || !input.offPrimary
      || !input.offPrimary.restoreCatalog || !input.offPrimary.ledger
      || !input.offPrimary.keys) return fail();

  const fences = await input.offPrimary.restoreCatalog.listAccountDeletionFences();
  let deleted = 0;
  let destroyedKeys = 0;

  for (const fence of fences) {
    const exact = await input.offPrimary.ledger.readAccountDeletionFence({
      subjectId: fence.subjectId,
      deletionJobId: fence.deletionJobId,
    });
    if (!exact || exact.fenceId !== fence.fenceId
        || exact.bodyIds.length !== fence.bodyIds.length
        || exact.bodyIds.some((id, index) => id !== fence.bodyIds[index])
        || exact.keyRefs.length !== fence.keyRefs.length
        || exact.keyRefs.some((key, index) => key !== fence.keyRefs[index])
        || !(await input.offPrimary.restoreCatalog.isSubjectTombstoned(fence.subjectId))) {
      return fail();
    }

    // No key operations or off-primary network I/O inside this transaction.
    const rows = await executePostgresAccountDeletionWorkerTransactionV1({
      pool: input.pool,
      execute: async (client) => {
        await client.query(
          "select pg_catalog.set_config('myeongha.reader_restore_quarantine','on',true)",
        );
        const answer = await client.query<{
          erasedRowCount: unknown;
          remainingSubjectRowCount: unknown;
        }>(RESTORE_SQL, [
          fence.subjectId, fence.deletionJobId, fence.fenceId, [...fence.bodyIds],
        ]);
        const row = answer.rows[0];
        if (answer.rows.length !== 1 || row === undefined
            || integer(row.remainingSubjectRowCount) !== 0) {
          return fail();
        }
        return integer(row.erasedRowCount);
      },
    });
    deleted += rows;

    for (const keyRef of fence.keyRefs) {
      if (!(await input.offPrimary.keys.isKeyDestroyed(keyRef))) {
        await input.offPrimary.keys.destroyKey(keyRef);
      }
      if (!(await input.offPrimary.keys.isKeyDestroyed(keyRef))) return fail();
      destroyedKeys += 1;
    }
    if (await input.offPrimary.ledger.acknowledgeAccountKeyErasure({
      subjectId: fence.subjectId,
      deletionJobId: fence.deletionJobId,
      fenceId: fence.fenceId,
    }) !== true) return fail();
  }

  return Object.freeze({
    schemaVersion: OFFICIAL_READER_RESTORE_RECONCILIATION_VERSION_V1,
    tombstonesReplayed: fences.length,
    protectedRowsPhysicallyDeleted: deleted,
    keysConfirmedDestroyed: destroyedKeys,
    publicReaderServiceEnabled: false as const,
  });
}
