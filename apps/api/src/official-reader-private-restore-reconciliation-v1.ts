import type {
  OfficialReaderOffPrimaryStoreV1,
} from './official-reader-node-offprimary-privacy-store-v1.js';
import {
  executePostgresAccountDeletionWorkerTransactionV1,
} from './postgres-account-deletion-worker.js';
import type {
  PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import {
  OfficialReaderRestoreQuarantinedV1,
  safeOfficialReaderRestoreQuarantineCategoryV1,
} from './official-reader-private-restore-quarantine-state-v1.js';

export const OFFICIAL_READER_RESTORE_RECONCILIATION_VERSION_V1 =
  'official-reader-offprimary-restore-reconciliation-v1' as const;

const ORDINARY_DERIVED_QUARANTINE_GUARD_INSTALLED_SQL = `
select
  pg_catalog.to_regprocedure(
    'public.internal_assert_official_reader_restored_ordinary_derivations_absent_v1(uuid)'
  ) is not null as "installed",
  pg_catalog.to_regprocedure(
    'public.internal_is_official_reader_s4_protected_derivation_v1(uuid,uuid,uuid)'
  ) is not null
  and exists (
    select 1 from pg_catalog.pg_policies p
    where p.schemaname='public'
      and p.tablename='memory_items'
      and p.policyname='memory_items_api_current_select_v1'
      and p.cmd='SELECT'
      and p.qual like '%internal_is_official_reader_s4_protected_derivation_v1%'
  )
  and exists (
    select 1 from pg_catalog.pg_policies p
    where p.schemaname='public'
      and p.tablename='life_facts'
      and p.policyname='life_facts_api_current_select_v1'
      and p.cmd='SELECT'
      and p.qual like '%internal_is_official_reader_s4_protected_derivation_v1%'
  ) as "readFenceInstalled",
  exists (
    select 1 from pg_catalog.pg_policies p
    where p.schemaname='public'
      and p.tablename='outbox_events'
      and p.policyname='outbox_events_seyeon_s4_paid_marker_read_fence_v1'
      and p.cmd='SELECT'
      and p.permissive='RESTRICTIVE'
      and p.qual like '%c04638eb883ebf25b14a9f8ce0c5bb0ae0e0bae7aaa69ea91f33f22172abbf63%'
  )
  and exists (
    select 1 from pg_catalog.pg_policies p
    where p.schemaname='public'
      and p.tablename='outbox_events'
      and p.policyname='outbox_events_seyeon_s4_paid_marker_update_fence_v1'
      and p.cmd='UPDATE'
      and p.permissive='RESTRICTIVE'
      and p.qual like '%c04638eb883ebf25b14a9f8ce0c5bb0ae0e0bae7aaa69ea91f33f22172abbf63%'
      and p.with_check like '%c04638eb883ebf25b14a9f8ce0c5bb0ae0e0bae7aaa69ea91f33f22172abbf63%'
  ) as "outboxFenceInstalled"
`;

const REFUND_RESTORE_SQL = `
select
  erased_row_count::text as "erasedRowCount",
  remaining_tombstoned_row_count::text as "remainingTombstonedRowCount"
from public.internal_replay_offprimary_reader_refund_purge_v1(
  $1::uuid,$2::uuid,$3::uuid,$4::text,$5::uuid,$6::uuid[]
)
`;

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
  readonly refundScopeTombstonesReplayed: number;
  readonly refundScopeRowsDeleted: number;
  readonly refundScopeKeysConfirmedDestroyed: number;
  readonly protectedRowsPhysicallyDeleted: number;
  readonly keysConfirmedDestroyed: number;
  /** Refuse even to start tombstone replay on old DB migrations that lack
   * the S4 ordinary Memory/Outbox restore quarantine fence. */
  readonly ordinaryDerivedRestoreQuarantineGuardInstalled: true;
  /** API owner-scoped Memory, Life Fact, Reader, Se-yeon and Search/Summary
   * reads must already filter resurrected S5-derived provenance. */
  readonly ordinaryDerivedRecordsReadFenceInstalled: true;
  /** Se-yeon's existing analytics Outbox consumer must also exclude S5
   * protected turns on both claim/read and update/complete. */
  readonly ordinaryDerivedOutboxReadFenceInstalled: true;
  /** Only the protected-body tombstone replay for listed, exact S4 fences
   * completed. It is NEVER an owner-approved full restore or service release. */
  readonly restoreState:
    | 'protected_body_tombstone_replay_only'
    | 'no_protected_body_tombstones';
  readonly restoreCompletionApproved: false;
  readonly ordinaryRestoreConsumersEnabled: false;
  /** A SECOND complete S4 rollback-only inspection after protected-body
   * replays and key erasure. Its scope is only the exact external manifests. */
  readonly postReplayQuarantineRecheck:
    | 'passed_for_replay_manifests'
    | 'not_applicable_no_manifests';
  /** Existing policy owner/DB restore acceptance is NOT inferred from
   * successful technical S4 tombstone replay. */
  readonly existingPrivacyOwnerAcceptancePending: true;
  /** This operation does NOT release broader P30D/S8 read serviceability. */
  readonly publicReaderServiceEnabled: false;
}

function fail(): never {
  throw new Error('Official Reader restored privacy state is unavailable.');
}

function rethrowQuarantineOrFailure(error: unknown): never {
  const category = safeOfficialReaderRestoreQuarantineCategoryV1(error);
  if (category) throw new OfficialReaderRestoreQuarantinedV1(category);
  throw error;
}

function integer(value: unknown): number {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(value)) return fail();
  const result = Number(value);
  if (!Number.isSafeInteger(result)) return fail();
  return result;
}

/**
 * Preflight by invoking ONLY the already authorized S4 account/refund replay
 * SQL inside the existing Worker transaction, then deliberately ROLLBACK.
 * Unlike checking separate SQL snippets, this exercises the exact
 * tombstone/Subject/sibling-body/derived-data contract that will govern
 * execution. Nothing reaches a database COMMIT or an off-primary key store.
 *
 * The source transaction wrapper MUST propagate this sentinel after
 * rollback; if it ever begins committing instead, deny by default.
 */
type ReaderRollbackPreflightStageV1 = Readonly<{
  query: string;
  args: readonly unknown[];
  remainingColumn: 'remainingSubjectRowCount' | 'remainingTombstonedRowCount';
}>;

async function assertRollbackOnlyReaderRestorePreflightV1(input: {
  readonly pool: PostgresSubjectPoolV1;
  readonly stages: readonly ReaderRollbackPreflightStageV1[];
}): Promise<void> {
  const rollbackSentinel = Object.freeze({
    contract: 'official-reader-s4-rollback-only-preflight-v1',
  });
  try {
    await executePostgresAccountDeletionWorkerTransactionV1({
      pool: input.pool,
      execute: async (client) => {
        await client.query(
          "select pg_catalog.set_config('myeongha.reader_restore_quarantine','on',true)",
        );

        // Simulate the same order as the real replay, including its writes:
        // refund tombstones FIRST, full account tombstones LAST. A later
        // account manifest may legitimately omit a body erased earlier by
        // a refunded fence. An isolated per-fence preflight would falsely
        // reject that scenario, so the entire ordered simulation must share
        // one rolled-back transaction.
        for (const stage of input.stages) {
          const result = await client.query<Record<string, unknown>>(
            stage.query, stage.args,
          );
          if (result.rows.length !== 1 || !result.rows[0]
              || integer(result.rows[0][stage.remainingColumn]) !== 0) {
            return fail();
          }
        }

        // No simulated deletes or DB changes may commit. The Worker
        // transaction wrapper rolls back, then propagates this sentinel.
        throw rollbackSentinel;
      },
    });
    return fail();
  } catch (error) {
    if (error === rollbackSentinel) return;
    rethrowQuarantineOrFailure(error);
  }
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
      || !input.offPrimary.scopeLedger || !input.offPrimary.keys) return fail();

  // Abort BEFORE any DB erasure or off-primary DEK destruction when restored
  // PostgreSQL lacks the forward-only S4 ordinary-derived quarantine guard.
  // The 2200 migration atomically replaces both existing restore functions
  // to invoke this same check within each exact Subject deletion transaction.
  const guardInstalled=await executePostgresAccountDeletionWorkerTransactionV1({
    pool:input.pool,
    execute:async(client)=>{
      const result=await client.query<{
        installed:unknown;
        readFenceInstalled:unknown;
        outboxFenceInstalled:unknown;
      }>(ORDINARY_DERIVED_QUARANTINE_GUARD_INSTALLED_SQL);
      if(result.rows.length!==1 || result.rows[0]?.installed!==true
          || result.rows[0]?.readFenceInstalled!==true
          || result.rows[0]?.outboxFenceInstalled!==true) return fail();
      return true as const;
    },
  });
  if(guardInstalled!==true) return fail();

  // Replay refund-scope historical deletions FIRST. A later account delete
  // may cover OTHER paid rows; account tombstone physical erasure is the
  // final all-subject operation. Each refund uses the exact pre-erased IDs,
  // retaining any later independent paid Reader answer in that same scope.
  const refundFences =
    await input.offPrimary.restoreCatalog.listConfirmedScopeDeletionFences();
  const fences = await input.offPrimary.restoreCatalog.listAccountDeletionFences();

  // Inspect ALL backup-independent durable manifests before touching any
  // database body or off-primary key. Otherwise a corrupt later manifest
  // could be found after irreversible erasure of an earlier fence.
  for (const fence of refundFences) {
    const exact=await input.offPrimary.scopeLedger.readScopeDeletionFence(fence.jobId);
    if (!exact || exact.jobId!==fence.jobId
        || exact.fenceId!==fence.fenceId
        || exact.subjectId!==fence.subjectId
        || exact.officialReadingId!==fence.officialReadingId
        || exact.readerCharacterId!==fence.readerCharacterId
        || exact.bodyIds.length!==fence.bodyIds.length
        || exact.keyRefs.length!==fence.keyRefs.length
        || exact.bodyIds.some((id,index)=>id!==fence.bodyIds[index])
        || exact.keyRefs.some((ref,index)=>ref!==fence.keyRefs[index])) return fail();
  }

  for (const fence of fences) {
    const exact = await input.offPrimary.ledger.readAccountDeletionFence({
      subjectId: fence.subjectId,
      deletionJobId: fence.deletionJobId,
    });
    if (!exact || exact.subjectId !== fence.subjectId
        || exact.deletionJobId !== fence.deletionJobId
        || exact.fenceId !== fence.fenceId
        || exact.bodyIds.length !== fence.bodyIds.length
        || exact.bodyIds.some((id, index) => id !== fence.bodyIds[index])
        || exact.keyRefs.length !== fence.keyRefs.length
        || exact.keyRefs.some((key, index) => key !== fence.keyRefs[index])
        || !(await input.offPrimary.restoreCatalog.isSubjectTombstoned(fence.subjectId))) {
      return fail();
    }
  }

  // All backup-independent manifests are authenticated. Before any
  // irreversible DEK destruction, establish that EVERY exact replay would
  // succeed under the actual private SQL + categorical S4 quarantine gate.
  // This preserves previously erased keys and their external tombstones,
  // while preventing a late dirty Subject from becoming a partial new replay.
  const preflightStages: ReaderRollbackPreflightStageV1[] = [];
  for (const fence of refundFences) {
    preflightStages.push({
      query: REFUND_RESTORE_SQL,
      args: [
        fence.jobId, fence.subjectId, fence.officialReadingId,
        fence.readerCharacterId, fence.fenceId, [...fence.bodyIds],
      ],
      remainingColumn: 'remainingTombstonedRowCount',
    });
  }
  for (const fence of fences) {
    preflightStages.push({
      query: RESTORE_SQL,
      args: [
        fence.subjectId, fence.deletionJobId, fence.fenceId,
        [...fence.bodyIds],
      ],
      remainingColumn: 'remainingSubjectRowCount',
    });
  }
  await assertRollbackOnlyReaderRestorePreflightV1({
    pool: input.pool,
    stages: preflightStages,
  });

  let refundDeleted = 0;
  let refundKeysDestroyed = 0;
  for (const fence of refundFences) {
    let removed: number;
    try {
      removed=await executePostgresAccountDeletionWorkerTransactionV1({
      pool:input.pool,
      execute:async(client)=>{
        await client.query(
          "select pg_catalog.set_config('myeongha.reader_restore_quarantine','on',true)",
        );
        const result=await client.query<{
          erasedRowCount:unknown;
          remainingTombstonedRowCount:unknown;
        }>(REFUND_RESTORE_SQL,[
          fence.jobId,fence.subjectId,fence.officialReadingId,
          fence.readerCharacterId,fence.fenceId,[...fence.bodyIds],
        ]);
        const row=result.rows[0];
        if(result.rows.length!==1 || !row
            || integer(row.remainingTombstonedRowCount)!==0) return fail();
        return integer(row.erasedRowCount);
      },
      });
    } catch (error) {
      rethrowQuarantineOrFailure(error);
    }
    refundDeleted+=removed;
    for(const keyRef of fence.keyRefs) {
      if(!(await input.offPrimary.keys.isKeyDestroyed(keyRef))) {
        await input.offPrimary.keys.destroyKey(keyRef);
      }
      if(!(await input.offPrimary.keys.isKeyDestroyed(keyRef))) return fail();
      refundKeysDestroyed++;
    }
    await input.offPrimary.scopeLedger.acknowledgeScopeKeyErasure(
      fence.jobId,fence.fenceId,
    );
  }

  let deleted = 0;
  let destroyedKeys = 0;

  for (const fence of fences) {
    // No key operations or off-primary network I/O inside this transaction.
    let rows: number;
    try {
      rows = await executePostgresAccountDeletionWorkerTransactionV1({
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
    } catch (error) {
      rethrowQuarantineOrFailure(error);
    }
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

  // Owner remediation may have completed since an earlier failed attempt,
  // but its absence is never inferred from a previous in-memory 'green'.
  // Rerun ALL authoritative exact-scope S4 predicates against restored
  // PostgreSQL after tombstone/DEK work before emitting even a bounded
  // technical replay result. The simulation is rolled back in full.
  // This is not full P30D Privacy ledger replay or a service release gate.
  if (preflightStages.length > 0) {
    await assertRollbackOnlyReaderRestorePreflightV1({
      pool: input.pool,
      stages: preflightStages,
    });
  }

  return Object.freeze({
    schemaVersion: OFFICIAL_READER_RESTORE_RECONCILIATION_VERSION_V1,
    tombstonesReplayed: fences.length,
    protectedRowsPhysicallyDeleted: deleted,
    keysConfirmedDestroyed: destroyedKeys,
    refundScopeTombstonesReplayed: refundFences.length,
    refundScopeRowsDeleted: refundDeleted,
    refundScopeKeysConfirmedDestroyed: refundKeysDestroyed,
    ordinaryDerivedRestoreQuarantineGuardInstalled: true as const,
    ordinaryDerivedRecordsReadFenceInstalled: true as const,
    ordinaryDerivedOutboxReadFenceInstalled: true as const,
    restoreState: refundFences.length + fences.length > 0
      ? 'protected_body_tombstone_replay_only' as const
      : 'no_protected_body_tombstones' as const,
    restoreCompletionApproved: false as const,
    ordinaryRestoreConsumersEnabled: false as const,
    postReplayQuarantineRecheck: preflightStages.length > 0
      ? 'passed_for_replay_manifests' as const
      : 'not_applicable_no_manifests' as const,
    existingPrivacyOwnerAcceptancePending: true as const,
    publicReaderServiceEnabled: false as const,
  });
}
