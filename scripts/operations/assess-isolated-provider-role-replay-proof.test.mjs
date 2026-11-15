import { test } from 'vitest';
import assert from 'node:assert/strict';
import { assessIsolatedRoleReplayProof } from './assess-isolated-provider-role-replay-proof.mjs';

const scope = 'myeongha_to_non_myeongha_direct_membership_only_v1';
function fixture() {
  return {
    pairedSource: {
      schemaVersion: 'ops-paired-provider-ledger-source-recovery-v1',
      backupRunId: 43174606843, backupSourceSha: 'a'.repeat(40),
      migrationCount: 242, migrationFrontier: 20261109071019,
      encryptedSourceDecryptionVerified: true,
      originalHistoryPayloadIntegrityVerified: true,
      providerMigrationLedgerRestored: false,
      hostedProviderRecoveryProven: false,
      drReady: false, serviceResumptionAllowed: false,
    },
    replay: {
      schemaVersion: 'ops-isolated-source-external-role-replay-v1',
      scope, target: 'disposable-postgres17-only',
      sourceCatalogBracketStable: true, sameMvccSnapshotProven: false,
      originalFilteredDumpStillMissingEdges: true,
      actualTargetReplayExecuted: true,
      targetRoleCreationAllowed: false, providerRoleFabricationAllowed: false,
      targetOptionAndGrantorParityProven: false,
      providerFullRestoreProven: false,
      sourceDirectMembershipCount: 48,
      drReady: false, serviceResumptionAllowed: false,
    },
    filteredDump: {
      schemaVersion: 'ops-filtered-role-dump-cross-boundary-coverage-v1',
      scope, sourceWitnessAvailable: true, filteredRolesSqlOnly: true,
      sameMvccSnapshotProven: false,
      perGrantorAndOptionsRestoreParityProven: false,
      providerOwnershipProven: false,
      fullProviderCompatibleRestoreProven: false,
      sourceDirectMembershipCount: 48,
      sourceRowsWithPairInFilteredSqlCount: 0,
      sourceRowsWithoutPairInFilteredSqlCount: 48,
      missingPairReservedRecipientCandidateCount: 48,
      missingPairOtherRecipientCount: 0,
      filteredRolesSqlUnparsedGrantStatementCount: 0,
      verdict: 'HOLD_SOURCE_EXTERNAL_ROLE_GRANT_PAIRS_MISSING_FROM_FILTERED_DUMP',
      drReady: false, serviceResumptionAllowed: false,
    },
    catalogComparison: {
      schemaVersion: 'ops-postgres-restored-app-catalog-comparison-v1',
      sourceCatalogBoundToBackupSnapshot: false,
      sourceMigrationCatalogVersionCount: 242,
      isolatedBackupMigrationFrontier: '20261109071019',
      verifiedApplicationScopeEquivalence: false,
      verifiedFullSchemaCatalogEquivalence: false,
      fullSupabaseMigrationLedgerRestored: false,
      providerManagedDataFullRestore: false,
      hostedAuthStorageEquivalent: false,
      observedApplicationDirectRoleGraph: {
        sourceWitnessAvailable: true, observedMembershipOptionsParity: true,
        providerBoundaryMembershipsIncluded: false,
      },
      observedApplicationExternalRoleBoundary: {
        scope, sourceWitnessAvailable: true, providerOwnedOnlyProven: false,
        inheritedEffectiveAccessIncluded: false,
        observedDirectMembershipOptionParity: true,
        observedGrantorAttributionParity: true,
        details: {
          sourceDirectMembershipCount: 48,
          restoredDirectMembershipCount: 48,
          missingMembershipOptionEntryCount: 0,
          addedMembershipOptionEntryCount: 0,
          grantorAttributionDifferenceGroupCount: 0,
          missingReservedRecipientPolicyCandidateCount: 0,
          missingOtherRecipientCount: 0,
        },
      },
      drReady: false, serviceResumptionAllowed: false,
    },
  };
}
test('attributes source-to-disposable replay but never promotes Hosted recovery', () => {
  const out = assessIsolatedRoleReplayProof(fixture());
  assert.equal(out.replayedCrossBoundaryMembershipCount, 48);
  assert.equal(out.replayExecutedInDisposableTarget, true);
  assert.equal(out.directRoleMembershipTargetRehearsalProven, true);
  assert.equal(out.sourcePairsExcludedFromPortableRolesDump, 48);
  assert.equal(out.fullProviderCompatibleRestoreProven, false);
  assert.equal(out.drReady, false);
  assert.equal(out.serviceResumptionAllowed, false);
  assert.equal(JSON.stringify(out).includes('secret'), false);
});
test('rejects false replay, missing edges or changed grantor option parity', () => {
  const missingReplay = fixture();
  missingReplay.replay.actualTargetReplayExecuted = false;
  assert.throws(() => assessIsolatedRoleReplayProof(missingReplay));
  const drift = fixture();
  drift.catalogComparison.observedApplicationExternalRoleBoundary.details
    .restoredDirectMembershipCount = 47;
  assert.throws(() => assessIsolatedRoleReplayProof(drift));
  const options = fixture();
  options.catalogComparison.observedApplicationExternalRoleBoundary
    .observedDirectMembershipOptionParity = false;
  assert.throws(() => assessIsolatedRoleReplayProof(options));
  const grantor = fixture();
  grantor.catalogComparison.observedApplicationExternalRoleBoundary
    .observedGrantorAttributionParity = false;
  assert.throws(() => assessIsolatedRoleReplayProof(grantor));
});
test('rejects a different source, an unfiltered portable roles dump or DR promotion', () => {
  const count = fixture();
  count.filteredDump.sourceRowsWithoutPairInFilteredSqlCount = 47;
  assert.throws(() => assessIsolatedRoleReplayProof(count));
  const source = fixture();
  source.catalogComparison.sourceMigrationCatalogVersionCount = 241;
  assert.throws(() => assessIsolatedRoleReplayProof(source));
  const restore = fixture();
  restore.pairedSource.providerMigrationLedgerRestored = true;
  assert.throws(() => assessIsolatedRoleReplayProof(restore));
  const hosted = fixture();
  hosted.catalogComparison.hostedAuthStorageEquivalent = true;
  assert.throws(() => assessIsolatedRoleReplayProof(hosted));
});
