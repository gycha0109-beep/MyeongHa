import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { validateDrCurrentEvidence } from './validate-postgres-dr-current-evidence.mjs';

const paths = {
  operations: 'docs/architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md',
  decisions: 'docs/P0_DECISION_REGISTER.md',
  privacy: 'docs/AUTH_RLS_PRIVACY_SPEC.md',
  sourceGaps: 'docs/SOURCE_AUTHORITY_GAPS.md',
  backupExport: 'scripts/operations/export-production-postgres-backup.sh',
  strictDump: 'scripts/operations/run-production-postgres-strict-dump.sh',
  backupWorkflow: '.github/workflows/production-postgres-backup.yml',
  restoreHarness: 'scripts/run-postgres-isolated-restore-drill.sh',
  restoreEnvelope: 'scripts/build-postgres-restore-evidence-envelope.mjs',
  restoreRunbook: 'docs/operations/POSTGRES_BACKUP_RESTORE_RUNBOOK_V1.md',
  readinessStatus: 'docs/operations/POSTGRES_DR_READINESS_STATUS_V1.md',
};

const entries = await Promise.all(
  Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, 'utf8')]),
);
const files = Object.fromEntries(entries);

execFileSync('bash', ['-n', paths.backupExport], { stdio: 'inherit' });
execFileSync('bash', ['-n', paths.strictDump], { stdio: 'inherit' });
execFileSync('bash', ['-n', paths.restoreHarness], { stdio: 'inherit' });

const migrationFiles = await readdir('supabase/migrations');
const migrationNumbers = migrationFiles
  .map((name) => name.match(/^(\d+)_.*\.sql$/))
  .filter(Boolean)
  .map((match) => Number(match[1]))
  .filter(Number.isSafeInteger);
if (migrationNumbers.length === 0) {
  throw new Error('No numbered SQL migrations found under supabase/migrations');
}
const repositoryMigrationFrontier = Math.max(...migrationNumbers);
// The September 1310 snapshot is deliberately historical and must never be
// used as current Production authority. A dated October observation is a
// bounded snapshot, not a live Supabase query or a serving promotion.
const currentEvidence = validateDrCurrentEvidence(
  files.readinessStatus,
  repositoryMigrationFrontier,
  process.env.GITHUB_EVENT_NAME ?? 'local',
);

function requireFragment(key, fragment) {
  if (!files[key].includes(fragment)) {
    throw new Error(`${paths[key]} is missing required DR authority fragment: ${fragment}`);
  }
}

function requireRegex(key, regex, description) {
  if (!regex.test(files[key])) {
    throw new Error(`${paths[key]} does not satisfy DR authority contract: ${description}`);
  }
}

requireFragment('operations', 'RPO = PT24H (24 hours) — PRODUCT OWNER APPROVED 2026-09-21');
requireFragment('operations', 'RTO = PT6H (6 hours) — PRODUCT OWNER APPROVED 2026-09-21');
requireFragment('operations', 'No `DR Ready` claim is allowed until the separate provider-managed full-restore equivalence gate is also evidenced.');
requireRegex(
  'decisions',
  /^\|\s*`P0-PR-01`\s*\|[^|\n]*\|\s*\*\*DECIDED\*\*\s*\|/m,
  'P0-PR-01 must remain DECIDED after product-owner approval',
);
requireFragment('decisions', '### P0-OPS-02');
requireFragment('decisions', 'rpo: PT24H');
requireFragment('decisions', 'rto: PT6H');
requireFragment('decisions', 'authoritative_privacy_reconciliation: PROVEN_BOUNDED_CAPTURED_WINDOW_RUN_35659483080');
requireFragment('decisions', 'full_authoritative_rpo_comparison: PASS_RUN_35659483080_5536S');
requireFragment('decisions', 'full_authoritative_rto_comparison: PASS_RUN_35659483080_67S');
requireFragment('decisions', 'provider_managed_full_restore_equivalence: NOT_PROVEN');
requireFragment('privacy', '`P0-PR-01`은 2026-09-19 **DECIDED**다');
requireFragment('privacy', 'calendar `P5Y` RETAIN');
requireRegex(
  'sourceGaps',
  /SRC-06[\s\S]{0,2000}BLOCKING BEFORE FINAL DELETION DDL BASELINE/,
  'SRC-06 must remain blocking before final deletion DDL authority is resolved',
);
requireFragment('backupExport', "select max(version::bigint)");
requireFragment('backupExport', "public.member_auth_rate_limit_buckets");
requireFragment('strictDump', '--exclude-table "public.member_auth_rate_limit_buckets"');
requireFragment('strictDump', '--env PGSSLMODE=verify-full');
requireFragment('strictDump', '--env PGSSLROOTCERT="$container_root_certificate"');
requireFragment('backupExport', 'migration_frontier');
requireFragment('backupExport', 'ephemeral_data_exclusions');
requireFragment('backupWorkflow', 'postgresql-client');
requireFragment('restoreHarness', 'backup_migration_frontier');
requireFragment('restoreHarness', 'member_auth_rate_limit_schema_restore');
requireFragment('restoreHarness', 'member_auth_rate_limit_unlogged');
requireFragment('restoreHarness', 'member_auth_rate_limit_ephemeral_data_restore');
requireFragment('restoreHarness', 'member_auth_rate_limit_owner_restore');
requireFragment('restoreHarness', 'member_auth_rate_limit_acl_restore');
requireFragment('restoreHarness', 'member_auth_rate_limit_synthetic_admission');
requireFragment('restoreHarness', 'privacy_reconciliation: "not_exercised_by_this_workflow"');
requireFragment('restoreHarness', 'dr_ready: false');
requireFragment('restoreEnvelope', 'backupManifest.migration_frontier');
requireFragment('restoreEnvelope', "public.member_auth_rate_limit_buckets");
requireFragment('restoreEnvelope', "member_auth_rate_limit_synthetic_admission: 'pass'");
requireFragment('restoreRunbook', 'Production state: OBSERVED-MIGRATION-VERSION-MATCHED PG17 RESTORE PROVEN / HOSTED AND DR NOT READY');
requireFragment('restoreRunbook', '#40799522511');
requireFragment('restoreRunbook', '#40817391430');
requireFragment('restoreRunbook', 'backup schema freshness             = CURRENT — backup frontier 1310 / deployed frontier 1310');
requireFragment('restoreRunbook', 'current-schema restore              = EVIDENCED — run 36295215761 / frontier 1310');
requireFragment('restoreRunbook', 'bounded privacy source authority    = RUNTIME-PROVEN — run 35653303484 / AUTHORITATIVE_CAPTURED_WINDOW_V1');
requireFragment('restoreRunbook', 'recovered finalization mechanics    = IMPLEMENTED / POST-MERGE CI GREEN');
requireFragment('restoreRunbook', 'recovered finalization on current-frontier synthetic restore = PROVEN — run 36295215761 / synthetic captured-window mechanics');
requireFragment('restoreRunbook', 'authoritative privacy reconciliation= PROVEN — run 35659483080 / bounded captured window only');
requireFragment('restoreRunbook', 'future-safe privacy reconciliation  = false');
requireFragment('restoreRunbook', 'full authoritative achieved evidence comparison **PASS** — `5536s`');
requireFragment('restoreRunbook', 'full authoritative achieved evidence comparison **PASS** — `67s`');
requireFragment('restoreRunbook', 'provider-managed full restore       = NOT PROVEN');
requireFragment('restoreRunbook', 'Restore drill: PASSED for MyeongHa application-data portability and application-critical Auth identity continuity');
requireFragment('restoreRunbook', 'scripts/run-postgres-privacy-reconciliation-synthetic-drill.sh');
requireFragment('restoreRunbook', 'AUTHORITATIVE_CAPTURED_WINDOW_V1');
requireFragment('restoreRunbook', 'Production PostgreSQL Privacy Recovery Ledger');
requireFragment('restoreRunbook', '35539838537');
requireFragment('restoreRunbook', '- [x] bounded captured-window privacy source authority runtime-proven — run `35539838537`');
requireFragment('restoreRunbook', '- [x] account-deletion finalizer and recovered-state finalization mechanics implemented / post-merge CI green');
requireFragment('restoreRunbook', '- [x] fresh governed backup captured after deployed migration `1310` — run `36294430134` / artifact `10923756192`');
requireFragment('restoreRunbook', '- [x] isolated restore completed from that current-frontier backup — run `36295215761`');
requireFragment('restoreRunbook', '- [x] recovered-state synthetic finalization drill executed on that fresh governed restore — run `36295215761`');
requireFragment('restoreRunbook', '- [x] authoritative privacy/deletion/legal-retention reconciliation exercised for the applicable captured window — run `35659483080`');
requireFragment('restoreRunbook', '- [x] achieved recovery duration measured across the full authoritative recovery procedure — `67s`');
requireFragment('restoreRunbook', '- [x] full authoritative data-loss window measured — `5536s`');
requireFragment('restoreRunbook', 'RPO: APPROVED — PT24H (24 hours)');
requireFragment('restoreRunbook', 'RTO: APPROVED — PT6H (6 hours)');
requireFragment('restoreRunbook', 'DR Ready = FALSE / NOT EVIDENCED');

for (const staleFragment of [
  'RESTORE NOT YET PASSED',
  'Restore drill: EXECUTED / NOT YET PASSED',
  'isolated restore                = NOT YET EVIDENCED',
]) {
  if (files.restoreRunbook.includes(staleFragment)) {
    throw new Error(`${paths.restoreRunbook} contains stale restore-state evidence after latest successful runtime-proof run 36295215761: ${staleFragment}`);
  }
}

const requiredStatusFragments = [
  'verified_isolated_restore_run_id: 40817391430',
  'verified_isolated_restore_result: SUCCESS',
  'verified_isolated_restore_backup_run_id: 40812111605',
  'verified_isolated_restore_backup_migration: 20261029012948',
  'verified_isolated_restore_artifact_id: 12872589146',
  'verified_isolated_restore_artifact_sha256: 38dc5b4024cdb45d7e69ef5793bd89010b67089602217bdb4413082a390b79fb',
  'verified_provider_rows_skipped_in_loopback: 112',
  'verified_provider_rows_projected_in_loopback: 53',
  'verified_provider_rows_replayed_in_loopback: 54',
  'verified_isolated_restore_authoritative_privacy: not_exercised_without_production_ledger',
  'verified_isolated_restore_synthetic_privacy: PASS',
  'verified_isolated_restore_serving_gate: BLOCKED',
  'verified_restore_matches_observed_migration_version: true',
  'verified_full_schema_catalog_equivalence: false',
  'latest_governed_backup_run_id: 36294430134',
  'latest_governed_backup_source_sha: 1d67dda2c17d35b7bf089d733981bd2425a0a0c5',
  'latest_governed_backup_artifact_id: 10923756192',
  'latest_proven_backup_migration_frontier: 1310',
  'production_schema_latest_deployed_migration: 1310',
  'current_repository_migration_frontier: 1310',
  'latest_isolated_restore_run_id: 36295215761',
  'latest_isolated_restore_runtime_head_sha: 195fe1fb0af5c3d2f2ef1556085710d669bec50e',
  'latest_isolated_restore_backup_run_id: 36294430134',
  'latest_isolated_restore_evidence_artifact_id: 10923587751',
  'latest_isolated_restore_backup_migration_frontier: 1310',
  'restore_evidence_envelope_runtime: PROVEN_ON_RUN_36295215761',
  'latest_isolated_restore_result: SUCCESS',
  'provider_managed_data_full_restore: false',
  'member_auth_rate_limit_schema_restore: PASS',
  'member_auth_rate_limit_unlogged: true',
  'member_auth_rate_limit_ephemeral_data_restore: EXCLUDED',
  'member_auth_rate_limit_owner_restore: PASS',
  'member_auth_rate_limit_acl_restore: PASS',
  'member_auth_rate_limit_synthetic_admission: PASS',
  'privacy_recovery_ledger_authority_class: AUTHORITATIVE_CAPTURED_WINDOW_V1',
  'authoritative_post_backup_source: true_bounded_captured_window_only',
  'account_deletion_finalizer_runtime: IMPLEMENTED_AND_PROVIDER_MECHANICS_SEPARATELY_PROVEN',
  'authoritative_privacy_reconciliation_run_id: 35659483080',
  'authoritative_privacy_reconciliation_result: SUCCESS',
  'authoritative_privacy_reconciliation_runtime_head_sha: 31746f635ae249811842b8d225c2734e4d1b4c51',
  'authoritative_privacy_reconciliation_backup_run_id: 35643472159',
  'authoritative_privacy_reconciliation_backup_completed_at_utc: 2026-09-21T19:16:17Z',
  'authoritative_privacy_reconciliation_ledger_run_id: 35653303484',
  'authoritative_privacy_reconciliation_canary_run_id: 35653222211',
  'authoritative_privacy_reconciliation_incident_reference_utc: 2026-09-21T20:48:33Z',
  'authoritative_privacy_reconciliation_evidence_artifact_id: 10666580699',
  'authoritative_privacy_reconciliation_evidence_artifact_digest: sha256:58d56b54f1b3ffe1d21fd1934bf3c2edce0826bb624bf261fad30b766f127c28',
  'authoritative_privacy_reconciliation: true',
  'authoritative_privacy_reconciliation_scope: BOUNDED_CAPTURED_WINDOW_ONLY',
  'future_safe_privacy_reconciliation: false',
  'privacy_reconciliation: PRODUCTION_NONZERO_AUTHORITATIVE_CAPTURED_WINDOW_PROVEN',
  'full_authoritative_data_loss_window_seconds: 5536',
  'full_authoritative_recovery_duration_seconds: 67',
  'rpo_authority: PRODUCT_OWNER_APPROVED_PT24H',
  'rpo_full_authoritative_comparison: PASS_5536S_LE_PT24H',
  'rto_authority: PRODUCT_OWNER_APPROVED_PT6H',
  'rto_full_authoritative_comparison: PASS_67S_LE_PT6H',
  'dr_ready: false',
]
for (const fragment of requiredStatusFragments) requireFragment('readinessStatus', fragment);

const forbiddenReadyFragments = [
  'future_safe_privacy_reconciliation: true',
  'dr_ready: true',
  '"dr_ready": true',
  'DR Ready = TRUE',
  'DR Ready: TRUE',
];
for (const [key, text] of Object.entries(files)) {
  for (const fragment of forbiddenReadyFragments) {
    if (text.includes(fragment)) {
      throw new Error(`${paths[key]} contains forbidden DR-ready promotion while DR authority remains incomplete: ${fragment}`);
    }
  }
}

for (const staleRuntimeFragment of [
  'backup_run_id: 35260191079',
  'restore_run_id: 35325070718',
  'synthetic_data_loss_window_seconds: 82',
  'post_backup_privacy_delta_count: 0',
]) {
  if (files.readinessStatus.includes(staleRuntimeFragment)) {
    throw new Error(`${paths.readinessStatus} contains stale runtime evidence after authoritative current-schema restore run 35659483080: ${staleRuntimeFragment}`);
  }
}

console.log(
  `PostgreSQL DR authority guard PASS (serving BLOCKED): latest isolated restore ${currentEvidence.restoreRunId} ` +
  `passed from backup ${currentEvidence.backupRunId} at migration ${currentEvidence.restoredBackupMigration}; ` +
  `this matches the observed Production migration VERSION ${currentEvidence.observedLiveMigrationVersion}, ` +
  `not full schema/ACL or Hosted Auth/Storage equivalence. Current restore exercised synthetic privacy only; ` +
  `the older real captured-window replay remains a separate historical proof. ` +
  `Repository frontier ${currentEvidence.repositoryMigrationFrontier}; independent future privacy ` +
  `continuity and serving S8 HOLD; dr_ready=false.` +
  (currentEvidence.repositoryCandidateBeyondObservation
    ? ' PR-only candidate migration advance is unverified by current-production recovery evidence.'
    : ''),
);
