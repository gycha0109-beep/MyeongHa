import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { validateDrCurrentEvidence } from './validate-postgres-dr-current-evidence.mjs';

const status = await readFile('docs/operations/POSTGRES_DR_READINESS_STATUS_V1.md', 'utf8');
const frontier = 20261028110500;
const result = validateDrCurrentEvidence(status, frontier);
assert.equal(result.latestEvidenceDate, '2026-10-29');
assert.equal(result.restoreRunId, 40799522511);
assert.equal(result.backupRunId, 40780751650);
assert.equal(result.restoreArtifactId, 12865611458);
assert.equal(result.restoredBackupMigration, 20261028011357);
assert.equal(result.observedLiveMigrationVersion, 20261028011357);
assert.equal(result.documentedRepositoryMigrationVersion, frontier);
assert.equal(result.restoredBackupMatchesObservedMigrationVersion, true);
assert.equal(result.fullSchemaCatalogEquivalenceProven, false);
assert.equal(result.authoritativePrivacyReplayForCurrentRestoreProven, false);
assert.equal(result.syntheticPrivacyReplayProven, true);
assert.equal(result.serviceResumptionAllowed, false);
assert.equal(result.servingGate, 'BLOCKED');
assert.equal(result.providerManagedDataFullRestore, false);
assert.equal(result.futureSafePrivacyReconciliation, false);
assert.equal(result.drReady, false);

// Prior real bounded privacy proof remains historical, and must not be used
// as if this later synthetic-only restore had replayed those Production events.
const oldProofTampered = status.replace(
  'verified_bounded_privacy_replay: PASS',
  'verified_bounded_privacy_replay: HISTORICAL_BUT_NOT_THIS_RUN',
);
assert.equal(
  validateDrCurrentEvidence(oldProofTampered, frontier)
    .authoritativePrivacyReplayForCurrentRestoreProven,
  false,
);
assert.equal(
  validateDrCurrentEvidence(status.replace(
    'production_schema_latest_deployed_migration: 1310',
    'production_schema_latest_deployed_migration: 99999999999999',
  ), frontier).observedLiveMigrationVersion,
  20261028011357,
);

function mutate(oldText, newText, error) {
  assert.ok(status.includes(oldText), 'test fixture missing: ' + oldText);
  assert.throws(
    () => validateDrCurrentEvidence(status.replace(oldText, newText), frontier),
    error,
  );
}
for (const field of [
  'dr_ready',
  'provider_managed_data_full_restore',
  'future_safe_privacy_reconciliation',
  'verified_full_schema_catalog_equivalence',
]) {
  mutate(field + ': false', field + ': true', new RegExp('latest evidence ' + field, 'u'));
}
mutate(
  'verified_isolated_restore_authoritative_privacy: not_exercised_without_production_ledger',
  'verified_isolated_restore_authoritative_privacy: production_nonzero_captured_window_replay_proven',
  /latest evidence verified_isolated_restore_authoritative_privacy/u,
);
mutate(
  'verified_isolated_restore_serving_gate: BLOCKED',
  'verified_isolated_restore_serving_gate: OPEN',
  /latest evidence verified_isolated_restore_serving_gate/u,
);
mutate(
  'verified_isolated_restore_backup_migration: 20261028011357',
  'verified_isolated_restore_backup_migration: 20261027043527',
  /restored backup migration does not match/u,
);
mutate(
  'verified_isolated_restore_result: SUCCESS',
  'verified_isolated_restore_result: SUCCESS\nverified_isolated_restore_result: SUCCESS',
  /duplicate latest evidence key/u,
);
mutate(
  'verified_isolated_restore_artifact_sha256: 74ad1108805187228f73f124a8ddee5868e248c0b7fe451d21b25c43a5fe950e',
  'verified_isolated_restore_artifact_sha256: fake',
  /verified_isolated_restore_artifact_sha256 has invalid fingerprint/u,
);
mutate(
  'verified_isolated_restore_artifact_expires_at: 2026-11-28T01:18:19Z',
  'verified_isolated_restore_artifact_expires_at: 2026-10-29T00:00:00Z',
  /restore artifact expiration must follow/u,
);
assert.throws(
  () => validateDrCurrentEvidence(status, frontier - 1),
  /repository is behind the recorded migration filename frontier/u,
);
assert.throws(
  () => validateDrCurrentEvidence(status, frontier + 1, 'push'),
  /repository migration advance is not covered/u,
);
const prCandidate = validateDrCurrentEvidence(status, frontier + 1, 'pull_request');
assert.equal(prCandidate.repositoryCandidateBeyondObservation, true);
assert.equal(prCandidate.drReady, false);
assert.throws(
  () => validateDrCurrentEvidence(status.replace(
    '## 2026-10-29 verified restore status (latest observation)',
    '## 2026-10-29 old snapshot',
  ), frontier),
  /exactly one latest dated verified restore/u,
);
execFileSync('node', ['scripts/verify-postgres-dr-readiness-authority.mjs'], {
  stdio: 'inherit',
  env: { ...process.env, GITHUB_EVENT_NAME: 'pull_request' },
});
console.log('PostgreSQL DR current evidence PASS: migration-matched isolated restore is real, privacy replay is synthetic-only, Hosted/DR serving remains BLOCKED.');
