// This validates a dated read-only Production observation + an exact isolated
// restore artifact. It never upgrades version equality to DDL/Hosted/DR proof.
export const DR_CURRENT_EVIDENCE_GUARD_SCHEMA_V1 =
  'myeongha-postgres-dr-current-evidence-guard-v1';

function fail(reason) {
  throw new Error('PostgreSQL DR current evidence rejected: ' + reason);
}
function requireField(source, field) {
  if (!Object.hasOwn(source, field)) fail('missing latest evidence field: ' + field);
  return source[field];
}
function version(source, field) {
  const text = requireField(source, field);
  if (typeof text !== 'string' || !/^[1-9][0-9]*$/u.test(text)) {
    fail(field + ' must be a positive numeric identity');
  }
  const number = Number(text);
  if (!Number.isSafeInteger(number)) fail(field + ' must be a safe integer');
  return number;
}
function pinned(source, key, value) {
  if (requireField(source, key) !== value) {
    fail('latest evidence ' + key + ' must equal ' + value);
  }
}
function digest(source, field, length) {
  if (!new RegExp('^[0-9a-f]{' + length + '}$', 'u')
    .test(requireField(source, field))) {
    fail(field + ' has invalid fingerprint');
  }
}
function exactUtc(source, field) {
  const text = requireField(source, field);
  if (typeof text !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(text) ||
      !Number.isFinite(Date.parse(text)) ||
      new Date(text).toISOString() !== text.replace('Z', '.000Z')) {
    fail(field + ' must be canonical UTC');
  }
  return Date.parse(text);
}

export function validateDrCurrentEvidence(
  statusText, repositoryMigrationFrontier, eventName = 'local',
) {
  if (typeof statusText !== 'string') fail('readiness status must be text');
  if (!Number.isSafeInteger(repositoryMigrationFrontier) ||
      repositoryMigrationFrontier <= 0) fail('repository frontier invalid');

  const blocks = [...statusText.matchAll(
    /^## (\d{4}-\d{2}-\d{2}) verified restore status \(latest observation\)\n\s*```yaml\n([\s\S]*?)\n```/gmu,
  )];
  if (blocks.length !== 1) {
    fail('exactly one latest dated verified restore YAML block is required');
  }
  const latest = Object.create(null);
  for (const line of blocks[0][2].split('\n')) {
    if (line.trim() === '') continue;
    const match = line.match(/^([a-z][a-z0-9_]*):\s*([^\s#]+)\s*$/u);
    if (!match) fail('invalid latest evidence key/value syntax');
    const [, key, value] = match;
    if (Object.hasOwn(latest, key)) fail('duplicate latest evidence key: ' + key);
    latest[key] = value;
  }

  pinned(latest, 'verified_isolated_restore_result', 'SUCCESS');
  pinned(latest, 'verified_isolated_restore_authoritative_privacy',
    'not_exercised_without_production_ledger');
  pinned(latest, 'verified_isolated_restore_synthetic_privacy', 'PASS');
  pinned(latest, 'verified_isolated_restore_serving_gate', 'BLOCKED');
  pinned(latest, 'verified_restore_matches_observed_migration_version', 'true');
  pinned(latest, 'verified_full_schema_catalog_equivalence', 'false');
  pinned(latest, 'provider_managed_data_full_restore', 'false');
  pinned(latest, 'future_safe_privacy_reconciliation', 'false');
  pinned(latest, 'dr_ready', 'false');

  const restoreRunId = version(latest, 'verified_isolated_restore_run_id');
  const backupRunId = version(latest, 'verified_isolated_restore_backup_run_id');
  const artifactId = version(latest, 'verified_isolated_restore_artifact_id');
  const backupMigration = version(latest, 'verified_isolated_restore_backup_migration');
  const observedMigration = version(latest, 'observed_live_production_migration_version');
  const repositoryObserved = version(latest, 'repository_latest_migration_file_version');

  if (backupMigration !== observedMigration) {
    fail('restored backup migration does not match the observed Production version');
  }
  if (repositoryMigrationFrontier < repositoryObserved) {
    fail('repository is behind the recorded migration filename frontier');
  }
  if (repositoryMigrationFrontier > repositoryObserved &&
      eventName !== 'pull_request') {
    fail('repository migration advance is not covered by the dated observation');
  }
  digest(latest, 'verified_isolated_restore_head_sha', 40);
  digest(latest, 'verified_isolated_restore_backup_source_sha', 40);
  digest(latest, 'verified_isolated_restore_artifact_sha256', 64);
  if (exactUtc(latest, 'verified_isolated_restore_artifact_expires_at') <=
      Date.parse(blocks[0][1] + 'T00:00:00Z')) {
    fail('restore artifact expiration must follow dated latest evidence');
  }

  return Object.freeze({
    schema: DR_CURRENT_EVIDENCE_GUARD_SCHEMA_V1,
    latestEvidenceDate: blocks[0][1],
    restoreRunId,
    backupRunId,
    restoreArtifactId: artifactId,
    restoredBackupMigration: backupMigration,
    observedLiveMigrationVersion: observedMigration,
    documentedRepositoryMigrationVersion: repositoryObserved,
    repositoryMigrationFrontier,
    repositoryCandidateBeyondObservation: repositoryMigrationFrontier > repositoryObserved,
    restoredBackupMatchesObservedMigrationVersion: true,
    fullSchemaCatalogEquivalenceProven: false,
    authoritativePrivacyReplayForCurrentRestoreProven: false,
    syntheticPrivacyReplayProven: true,
    serviceResumptionAllowed: false,
    servingGate: 'BLOCKED',
    providerManagedDataFullRestore: false,
    futureSafePrivacyReconciliation: false,
    drReady: false,
  });
}
