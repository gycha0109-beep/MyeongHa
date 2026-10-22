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
] = await Promise.all([
  import('../../dist/apps/api/src/production-account-deletion-worker-db-config.js'),
  import('../../dist/apps/api/src/node-postgres-account-deletion-worker-pool.js'),
  import('../../dist/apps/api/src/official-reader-offprimary-worker-config-v1.js'),
  import('../../dist/apps/api/src/official-reader-node-offprimary-privacy-store-v1.js'),
  import('../../dist/apps/api/src/official-reader-private-restore-reconciliation-v1.js'),
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
      || result.ordinaryDerivedRestoreQuarantineGuardInstalled !== true) blocked();
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
    publicReaderServiceEnabled: false,
    next: 'Keep ALL Reader paid-read and ordinary Memory/Search/Summary restore consumers OFF until the complete privacy reconciliation and restore owner acceptance.',
  }) + '\n');
} finally {
  await pool.close();
}
