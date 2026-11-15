// Attribute a disposable Provider-boundary role rehearsal to its sealed
// source and observed target, never to a Hosted/Production recovery claim.
// Watchtower-Track: ops
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const sourceScope = 'myeongha_to_non_myeongha_direct_membership_only_v1';

export function assessIsolatedRoleReplayProof({
  replay, catalogComparison, filteredDump, pairedSource,
}) {
  assert.equal(pairedSource?.schemaVersion,
    'ops-paired-provider-ledger-source-recovery-v1');
  assert.equal(pairedSource.encryptedSourceDecryptionVerified, true);
  assert.equal(pairedSource.originalHistoryPayloadIntegrityVerified, true);
  assert.equal(pairedSource.providerMigrationLedgerRestored, false);
  assert.equal(pairedSource.hostedProviderRecoveryProven, false);
  assert.equal(pairedSource.drReady, false);
  assert.equal(pairedSource.serviceResumptionAllowed, false);

  assert.equal(replay?.schemaVersion,
    'ops-isolated-source-external-role-replay-v1');
  assert.equal(replay.scope, sourceScope);
  assert.equal(replay.target, 'disposable-postgres17-only');
  assert.equal(replay.sourceCatalogBracketStable, true);
  assert.equal(replay.sameMvccSnapshotProven, false);
  assert.equal(replay.originalFilteredDumpStillMissingEdges, true);
  assert.equal(replay.actualTargetReplayExecuted, true);
  assert.equal(replay.targetRoleCreationAllowed, false);
  assert.equal(replay.providerRoleFabricationAllowed, false);
  assert.equal(replay.targetOptionAndGrantorParityProven, false);
  assert.equal(replay.providerFullRestoreProven, false);
  assert.equal(replay.drReady, false);
  assert.equal(replay.serviceResumptionAllowed, false);

  assert.equal(filteredDump?.schemaVersion,
    'ops-filtered-role-dump-cross-boundary-coverage-v1');
  assert.equal(filteredDump.scope, sourceScope);
  assert.equal(filteredDump.sourceWitnessAvailable, true);
  assert.equal(filteredDump.filteredRolesSqlOnly, true);
  assert.equal(filteredDump.sameMvccSnapshotProven, false);
  assert.equal(filteredDump.perGrantorAndOptionsRestoreParityProven, false);
  assert.equal(filteredDump.providerOwnershipProven, false);
  assert.equal(filteredDump.fullProviderCompatibleRestoreProven, false);
  assert.equal(filteredDump.drReady, false);
  assert.equal(filteredDump.serviceResumptionAllowed, false);
  assert.equal(filteredDump.filteredRolesSqlUnparsedGrantStatementCount, 0);
  assert.equal(filteredDump.verdict,
    'HOLD_SOURCE_EXTERNAL_ROLE_GRANT_PAIRS_MISSING_FROM_FILTERED_DUMP');

  assert.equal(catalogComparison?.schemaVersion,
    'ops-postgres-restored-app-catalog-comparison-v1');
  assert.equal(catalogComparison.sourceCatalogBoundToBackupSnapshot, false);
  assert.equal(catalogComparison.verifiedApplicationScopeEquivalence, false);
  assert.equal(catalogComparison.verifiedFullSchemaCatalogEquivalence, false);
  assert.equal(catalogComparison.fullSupabaseMigrationLedgerRestored, false);
  assert.equal(catalogComparison.providerManagedDataFullRestore, false);
  assert.equal(catalogComparison.hostedAuthStorageEquivalent, false);
  assert.equal(catalogComparison.drReady, false);
  assert.equal(catalogComparison.serviceResumptionAllowed, false);
  assert.equal(catalogComparison.sourceMigrationCatalogVersionCount,
    pairedSource.migrationCount);
  assert.equal(Number(catalogComparison.isolatedBackupMigrationFrontier),
    pairedSource.migrationFrontier);

  const boundary = catalogComparison.observedApplicationExternalRoleBoundary;
  assert.equal(boundary?.scope, sourceScope);
  assert.equal(boundary.sourceWitnessAvailable, true);
  assert.equal(boundary.providerOwnedOnlyProven, false);
  assert.equal(boundary.inheritedEffectiveAccessIncluded, false);
  assert.equal(boundary.observedDirectMembershipOptionParity, true);
  assert.equal(boundary.observedGrantorAttributionParity, true);
  const details = boundary.details;
  assert.ok(details && typeof details === 'object');
  const count = replay.sourceDirectMembershipCount;
  assert.ok(Number.isSafeInteger(count) && count > 0);
  assert.equal(filteredDump.sourceDirectMembershipCount, count);
  assert.equal(filteredDump.sourceRowsWithPairInFilteredSqlCount, 0);
  assert.equal(filteredDump.sourceRowsWithoutPairInFilteredSqlCount, count);
  assert.equal(filteredDump.missingPairReservedRecipientCandidateCount, count);
  assert.equal(filteredDump.missingPairOtherRecipientCount, 0);
  assert.equal(details.sourceDirectMembershipCount, count);
  assert.equal(details.restoredDirectMembershipCount, count);
  for (const field of [
    'missingMembershipOptionEntryCount', 'addedMembershipOptionEntryCount',
    'grantorAttributionDifferenceGroupCount',
    'missingReservedRecipientPolicyCandidateCount', 'missingOtherRecipientCount',
  ]) assert.equal(details[field], 0);

  const internal = catalogComparison.observedApplicationDirectRoleGraph;
  assert.equal(internal.sourceWitnessAvailable, true);
  assert.equal(internal.observedMembershipOptionsParity, true);
  assert.equal(internal.providerBoundaryMembershipsIncluded, false);

  return {
    schemaVersion: 'ops-disposable-provider-role-replay-provenance-v1',
    sourceBackupRunId: pairedSource.backupRunId,
    sourceBackupCommitSha: pairedSource.backupSourceSha,
    migrationCount: pairedSource.migrationCount,
    migrationFrontier: pairedSource.migrationFrontier,
    sourceLedgerDecryptionPreviouslyVerified: true,
    isolatedTarget: 'disposable-postgres17-only',
    sourceCrossBoundaryMembershipCount: count,
    replayedCrossBoundaryMembershipCount: count,
    observedRestoredCrossBoundaryMembershipCount:
      details.restoredDirectMembershipCount,
    observedMembershipOptionsMatch: true,
    observedGrantorAttributionMatch: true,
    replayExecutedInDisposableTarget: true,
    sourcePairsExcludedFromPortableRolesDump: count,
    recipientBoundaryProviderOwnedOnlyProven: false,
    inheritedEffectiveAccessProven: false,
    sourceWitnessSameMvccSnapshotProven: false,
    directRoleMembershipTargetRehearsalProven: true,
    providerMigrationLedgerRestored: false,
    providerManagedDataFullRestoreProven: false,
    hostedAuthStorageEquivalent: false,
    fullProviderCompatibleRestoreProven: false,
    fullServiceRecoveryProven: false,
    drReady: false,
    serviceResumptionAllowed: false,
    verdict: 'DISPOSABLE_ROLE_REPLAY_OBSERVED__HOSTED_PROVIDER_PARITY_HOLD',
  };
}

async function main() {
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.equal(process.env.GITHUB_EVENT_NAME, 'workflow_dispatch');
  assert.equal(process.env.GITHUB_REF, 'refs/heads/main');
  const root = resolve(process.env.RUNNER_TEMP ?? '.');
  assert.notEqual(root, resolve('.'));
  const args = process.argv.slice(2);
  function arg(name) {
    const index = args.indexOf(name);
    assert.ok(index >= 0 && args[index + 1] &&
      !args[index + 1].startsWith('--'));
    const path = resolve(args[index + 1]);
    assert.ok(path.startsWith(root + sep));
    return path;
  }
  const [replay, catalogComparison, filteredDump, pairedSource] =
    await Promise.all([
      readFile(arg('--replay'), 'utf8').then(JSON.parse),
      readFile(arg('--catalog'), 'utf8').then(JSON.parse),
      readFile(arg('--filtered'), 'utf8').then(JSON.parse),
      readFile(arg('--paired-source'), 'utf8').then(JSON.parse),
    ]);
  const output = assessIsolatedRoleReplayProof({
    replay, catalogComparison, filteredDump, pairedSource,
  });
  await writeFile(arg('--output'), JSON.stringify(output, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 });
  process.stdout.write('DISPOSABLE_ROLE_REPLAY_PROVENANCE_PASS HOSTED_DR_HOLD\n');
}

if (process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    // Never print raw role/source object data or private SQL on failure.
    process.stderr.write('HOLD_DISPOSABLE_ROLE_REPLAY_PROVENANCE\n');
    process.exitCode = 1;
  });
}
