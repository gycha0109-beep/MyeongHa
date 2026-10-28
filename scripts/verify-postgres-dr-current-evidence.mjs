import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { validateDrCurrentEvidence } from './validate-postgres-dr-current-evidence.mjs';

const status = await readFile('docs/operations/POSTGRES_DR_READINESS_STATUS_V1.md', 'utf8');
const frontier = 20261028110500;
const result = validateDrCurrentEvidence(status, frontier);
assert.equal(result.restoreRunId, 40655447574);
assert.equal(result.restoredBackupMigration, 20261027043527);
assert.equal(result.observedLiveMigrationAsOf20261028, 20261028011357);
assert.equal(result.documentedRepositoryMigrationAsOf20261028, frontier);
assert.equal(result.restoredBackupCoversObservedLive, false);
assert.equal(result.providerManagedDataFullRestore, false);
assert.equal(result.futureSafePrivacyReconciliation, false);
assert.equal(result.drReady, false);
assert.equal(result.admission, 'BLOCKED_STALE_SCHEMA_AND_HOSTED_PRIVACY_GAPS');

// The old "1310" field is historical, and modifying it must never change
// which Production observation defines the current bounded DR contract.
const historicalTrap = status.replace(
  'production_schema_latest_deployed_migration: 1310',
  'production_schema_latest_deployed_migration: 99999999999999',
);
assert.equal(
  validateDrCurrentEvidence(historicalTrap, frontier).observedLiveMigrationAsOf20261028,
  20261028011357,
);

function mutate(oldText, newText, error) {
  assert.ok(status.includes(oldText));
  assert.throws(
    () => validateDrCurrentEvidence(status.replace(oldText, newText), frontier),
    error,
  );
}
mutate(
  'verified_restore_covers_live_frontier: false',
  'verified_restore_covers_live_frontier: true',
  /latest evidence verified_restore_covers_live_frontier/u,
);
mutate('dr_ready: false', 'dr_ready: true', /latest evidence dr_ready/u);
mutate(
  'provider_managed_data_full_restore: false',
  'provider_managed_data_full_restore: true',
  /latest evidence provider_managed_data_full_restore/u,
);
mutate(
  'future_safe_privacy_reconciliation: false',
  'future_safe_privacy_reconciliation: true',
  /latest evidence future_safe_privacy_reconciliation/u,
);
mutate(
  'verified_bounded_privacy_replay: PASS',
  'verified_bounded_privacy_replay: FAIL',
  /latest evidence verified_bounded_privacy_replay/u,
);
mutate(
  'verified_bounded_privacy_replay_events: 1',
  'verified_bounded_privacy_replay_events: 0',
  /bounded replay must have independently recorded nonzero/u,
);
mutate(
  'verified_bounded_restore_backup_migration: 20261027043527',
  'verified_bounded_restore_backup_migration: 20261028011357',
  /no longer describes the older-than-observed backup/u,
);
mutate(
  'verified_bounded_restore_result: SUCCESS',
  'verified_bounded_restore_result: SUCCESS\nverified_bounded_restore_result: SUCCESS',
  /duplicate latest evidence key/u,
);
mutate(
  'verified_bounded_restore_artifact_sha256: 59ea25bf3d29b7a06e9f26bd1616c41c10f651ee11da56a0d7342717b6b5ab6d',
  'verified_bounded_restore_artifact_sha256: fake',
  /restore artifact SHA-256/u,
);
assert.throws(
  () => validateDrCurrentEvidence(status, frontier - 1),
  /repository is behind the recorded migration/u,
);
assert.throws(
  () => validateDrCurrentEvidence(status, frontier + 1, 'push'),
  /repository migrations advanced beyond the dated evidence/u,
);
const candidate = validateDrCurrentEvidence(status, frontier + 1, 'pull_request');
assert.equal(candidate.repositoryCandidateBeyondObservation, true);
assert.equal(candidate.restoredBackupCoversObservedLive, false);
assert.equal(candidate.drReady, false);
assert.throws(
  () => validateDrCurrentEvidence(status.replace(
    '## 2026-10-28 verified restore status (latest observation)',
    '## Old historical evidence',
  ), frontier),
  /exactly one latest dated verified restore/u,
);
// Exercise the complete legacy DR contract with the new latest-evidence
// validator as part of PR governance, not only its pure parsing unit tests.
execFileSync('node', ['scripts/verify-postgres-dr-readiness-authority.mjs'], {
  stdio: 'inherit',
  env: { ...process.env, GITHUB_EVENT_NAME: 'pull_request' },
});
console.log('PostgreSQL DR current evidence PASS: latest dated bounded proof is distinct from historical frontier 1310 and cannot authorize serving.');
