// PostgreSQL DR authority: parse the latest dated evidence block, never the
// first historical "production_schema_latest_deployed_migration" occurrence.
export const DR_CURRENT_EVIDENCE_GUARD_SCHEMA_V1 =
  'myeongha-postgres-dr-current-evidence-guard-v1';

function fail(reason) {
  throw new Error('PostgreSQL DR current evidence rejected: ' + reason);
}
function required(source, field) {
  if (!Object.hasOwn(source, field)) fail('missing latest evidence field: ' + field);
  return source[field];
}
function positiveVersion(text, field) {
  if (typeof text !== 'string' || !/^[1-9][0-9]*$/u.test(text)) {
    fail(field + ' must be an exact positive numeric migration version');
  }
  const value = Number(text);
  if (!Number.isSafeInteger(value)) fail(field + ' is not a safe integer');
  return value;
}
function positiveId(text, field) {
  return positiveVersion(text, field);
}
function pinned(source, key, value) {
  if (required(source, key) !== value) {
    fail('latest evidence ' + key + ' must equal ' + value);
  }
}
export function validateDrCurrentEvidence(statusText, repositoryMigrationFrontier, eventName = 'local') {
  if (typeof statusText !== 'string') fail('readiness status source must be text');
  if (!Number.isSafeInteger(repositoryMigrationFrontier) || repositoryMigrationFrontier <= 0) {
    fail('repository migration frontier must be a safe positive integer');
  }
  const blocks = [...statusText.matchAll(
    /^## \d{4}-\d{2}-\d{2} verified restore status \(latest observation\)[^\n]*\n\s*```yaml\n([\s\S]*?)\n```/gmu,
  )];
  if (blocks.length !== 1) {
    fail('exactly one latest dated verified restore YAML block is required');
  }
  const latest = Object.create(null);
  for (const line of blocks[0][1].split('\n')) {
    if (line.trim() === '') continue;
    const match = line.match(/^([a-z][a-z0-9_]*):\s*([^\s#]+)\s*$/u);
    if (!match) fail('invalid latest evidence key/value syntax');
    const [, key, value] = match;
    if (Object.hasOwn(latest, key)) fail('duplicate latest evidence key: ' + key);
    latest[key] = value;
  }

  pinned(latest, 'verified_bounded_restore_result', 'SUCCESS');
  pinned(latest, 'verified_bounded_privacy_replay', 'PASS');
  pinned(latest, 'verified_bounded_privacy_idempotency', 'PASS');
  pinned(latest, 'verified_bounded_privacy_access_nonresurrection', 'PASS');
  pinned(latest, 'verified_bounded_privacy_commerce_p5y', 'PASS');
  pinned(latest, 'verified_bounded_authoritative_source_scope', 'captured-window-only');
  pinned(latest, 'verified_restore_covers_live_frontier', 'false');
  pinned(latest, 'provider_managed_data_full_restore', 'false');
  pinned(latest, 'future_safe_privacy_reconciliation', 'false');
  pinned(latest, 'dr_ready', 'false');

  const backupRunId = positiveId(required(latest, 'verified_bounded_restore_backup_run_id'),
    'verified_bounded_restore_backup_run_id');
  const restoreRunId = positiveId(required(latest, 'verified_bounded_restore_run_id'),
    'verified_bounded_restore_run_id');
  positiveId(required(latest, 'verified_bounded_restore_privacy_ledger_run_id'),
    'verified_bounded_restore_privacy_ledger_run_id');
  positiveId(required(latest, 'verified_bounded_restore_read_only_completion_run_id'),
    'verified_bounded_restore_read_only_completion_run_id');
  positiveId(required(latest, 'verified_bounded_restore_artifact_id'),
    'verified_bounded_restore_artifact_id');

  const backupVersion = positiveVersion(required(latest, 'verified_bounded_restore_backup_migration'),
    'verified_bounded_restore_backup_migration');
  const observedLiveVersion = positiveVersion(
    required(latest, 'observed_live_production_migration_version_20261028'),
    'observed_live_production_migration_version_20261028',
  );
  const documentedRepositoryVersion = positiveVersion(
    required(latest, 'repository_latest_migration_file_version_20261028'),
    'repository_latest_migration_file_version_20261028',
  );
  if (backupVersion >= observedLiveVersion) {
    fail('latest dated evidence no longer describes the older-than-observed backup');
  }
  if (repositoryMigrationFrontier < documentedRepositoryVersion) {
    fail('repository is behind the recorded migration filename frontier');
  }
  if (repositoryMigrationFrontier > documentedRepositoryVersion &&
      eventName !== 'pull_request') {
    fail('repository migrations advanced beyond the dated evidence; refresh the documented repository observation');
  }
  if (!/^[a-f0-9]{40}$/u.test(required(latest, 'verified_bounded_restore_head_sha'))) {
    fail('restore head SHA is invalid');
  }
  if (!/^[a-f0-9]{64}$/u.test(required(latest, 'verified_bounded_restore_artifact_sha256'))) {
    fail('restore artifact SHA-256 is invalid');
  }
  const events = Number(required(latest, 'verified_bounded_privacy_replay_events'));
  if (!Number.isSafeInteger(events) || events <= 0) {
    fail('bounded replay must have independently recorded nonzero event evidence');
  }

  return Object.freeze({
    schema: DR_CURRENT_EVIDENCE_GUARD_SCHEMA_V1,
    restoreRunId,
    backupRunId,
    restoredBackupMigration: backupVersion,
    observedLiveMigrationAsOf20261028: observedLiveVersion,
    documentedRepositoryMigrationAsOf20261028: documentedRepositoryVersion,
    repositoryMigrationFrontier,
    repositoryCandidateBeyondObservation:
      repositoryMigrationFrontier > documentedRepositoryVersion,
    restoredBackupCoversObservedLive: false,
    providerManagedDataFullRestore: false,
    futureSafePrivacyReconciliation: false,
    drReady: false,
    admission: 'BLOCKED_STALE_SCHEMA_AND_HOSTED_PRIVACY_GAPS',
  });
}
