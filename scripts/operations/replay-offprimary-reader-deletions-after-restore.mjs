#!/usr/bin/env node
// S4 isolated restore tool. NEVER a startup hook and NEVER a public route.
// Invocation requires a dedicated Worker database principal, independently
// mounted sealed Privacy Ledger/DEK vault, and an explicit quarantine action.
// This only replays protected Reader deletion; it does not authorize S8,
// complete account/Commerce restore, or make production paid reading available.

const EXACT_CONFIRMATION = 'REPLAY_READER_DELETION_TOMBSTONES_IN_ISOLATED_RESTORE';

function blocked() {
  throw new Error('Protected Reader off-primary restore cannot proceed.');
}

if (process.argv.length !== 4
    || process.argv[2] !== '--confirmation'
    || process.argv[3] !== EXACT_CONFIRMATION) blocked();

const [
  workerDbConfig,
  workerPool,
  offPrimaryConfig,
  offPrimaryStore,
  reconciliation,
  quarantineState,
] = await Promise.all([
  import('../../dist/apps/api/src/production-account-deletion-worker-db-config.js'),
  import('../../dist/apps/api/src/node-postgres-account-deletion-worker-pool.js'),
  import('../../dist/apps/api/src/official-reader-offprimary-worker-config-v1.js'),
  import('../../dist/apps/api/src/official-reader-node-offprimary-privacy-store-v1.js'),
  import('../../dist/apps/api/src/official-reader-private-restore-reconciliation-v1.js'),
  import('../../dist/apps/api/src/official-reader-private-restore-quarantine-state-v1.js'),
]);

const databaseConfig = workerDbConfig.parseProductionAccountDeletionWorkerDbConfigV1(
  process.env,
);
const offPrimary = offPrimaryConfig.parseOfficialReaderOffPrimaryWorkerConfigV1(
  process.env,
);
if (offPrimary === null) blocked();

const store = offPrimaryStore.createOfficialReaderNodeOffPrimaryStoreV1(offPrimary);
const pool = workerPool.createNodePostgresAccountDeletionWorkerPoolV1(databaseConfig);
try {
  const result = await reconciliation.reconcileOfficialReaderProtectedBodiesAfterRestoreV1({
    pool,
    offPrimary: store,
    executionBoundary: 'isolated-restoration-only',
  });
  if (result.publicReaderServiceEnabled !== false
      || result.ordinaryDerivedRestoreQuarantineGuardInstalled !== true
      || result.ordinaryDerivedRecordsReadFenceInstalled !== true
      || result.ordinaryDerivedOutboxReadFenceInstalled !== true
      || ![
        'protected_body_tombstone_replay_only',
        'no_protected_body_tombstones',
      ].includes(result.restoreState)
      || result.restoreCompletionApproved !== false
      || result.ordinaryRestoreConsumersEnabled !== false) blocked();
  // No Subject IDs, DEK references, ciphertext or raw tombstones in logs.
  process.stdout.write(JSON.stringify({
    schemaVersion: result.schemaVersion,
    tombstonesReplayed: result.tombstonesReplayed,
    protectedRowsPhysicallyDeleted: result.protectedRowsPhysicallyDeleted,
    keysConfirmedDestroyed: result.keysConfirmedDestroyed,
    refundScopeTombstonesReplayed: result.refundScopeTombstonesReplayed,
    refundScopeRowsDeleted: result.refundScopeRowsDeleted,
    refundScopeKeysConfirmedDestroyed: result.refundScopeKeysConfirmedDestroyed,
    ordinaryDerivedRestoreQuarantineGuardInstalled: true,
    ordinaryDerivedRecordsReadFenceInstalled: true,
    ordinaryDerivedOutboxReadFenceInstalled: true,
    restoreState: result.restoreState,
    restoreCompletionApproved: false,
    ordinaryRestoreConsumersEnabled: false,
    publicReaderServiceEnabled: false,
    next: 'Only the exact off-primary protected-body tombstones were replayed. Complete the existing Privacy/DB Owner remediation and broader disaster-recovery acceptance before releasing any service.',
  }) + '\n');
} catch (error) {
  // Never display source/Subject/receipt/DEK IDs, a raw SQL error message,
  // stack trace, private ledger or restored Memory text in operator logs.
  // A known S4 marker-derived SQL constraint becomes only a category.
  // Unknown failures remain blocked_unclassified, not an invented cleanup.
  process.stdout.write(JSON.stringify(
    quarantineState.officialReaderRestoreFailureReportV1(error),
  ) + '\n');
  process.exitCode = 1;
} finally {
  await pool.close();
}
