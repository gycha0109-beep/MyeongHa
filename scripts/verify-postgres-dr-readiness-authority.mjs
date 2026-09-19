import { readdir, readFile } from 'node:fs/promises';

const paths = {
  operations: 'docs/architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md',
  decisions: 'docs/P0_DECISION_REGISTER.md',
  privacy: 'docs/AUTH_RLS_PRIVACY_SPEC.md',
  sourceGaps: 'docs/SOURCE_AUTHORITY_GAPS.md',
  restoreHarness: 'scripts/run-postgres-isolated-restore-drill.sh',
  restoreRunbook: 'docs/operations/POSTGRES_BACKUP_RESTORE_RUNBOOK_V1.md',
  readinessStatus: 'docs/operations/POSTGRES_DR_READINESS_STATUS_V1.md',
};

const entries = await Promise.all(
  Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, 'utf8')]),
);
const files = Object.fromEntries(entries);
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
const productionMigrationMatch = files.readinessStatus.match(
  /^production_schema_latest_deployed_migration:\s*(\d+)\s*$/m,
);
if (!productionMigrationMatch) {
  throw new Error(
    `${paths.readinessStatus} is missing production_schema_latest_deployed_migration authority`,
  );
}
const productionMigrationFrontier = Number(productionMigrationMatch[1]);
if (!Number.isSafeInteger(productionMigrationFrontier)) {
  throw new Error('Production migration frontier is not a safe integer');
}
if (repositoryMigrationFrontier < productionMigrationFrontier) {
  throw new Error(
    `Repository migration frontier ${repositoryMigrationFrontier} is behind deployed production migration ${productionMigrationFrontier}.`,
  );
}
if (repositoryMigrationFrontier > productionMigrationFrontier) {
  const eventName = process.env.GITHUB_EVENT_NAME ?? 'local';
  if (eventName !== 'pull_request') {
    throw new Error(
      `PostgreSQL DR evidence covers deployed migration ${productionMigrationFrontier}, but repository migration frontier is ${repositoryMigrationFrontier}. ` +
      'After merge/deployment, capture and restore a new governed production backup before claiming current-production-schema recovery.',
    );
  }
  console.log(
    `PostgreSQL DR pre-deploy guard: PR candidate migration frontier ${repositoryMigrationFrontier} is ahead of deployed production ${productionMigrationFrontier}; ` +
    'existing backup/restore evidence remains authoritative only for the deployed production frontier and does not cover the candidate schema.',
  );
}

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

requireFragment('operations', 'RPO = OPEN DECISION');
requireFragment('operations', 'RTO = OPEN DECISION');
requireFragment('operations', 'no `DR Ready` claim is allowed');
requireRegex(
  'decisions',
  /^\|\s*`P0-PR-01`\s*\|[^|\n]*\|\s*\*\*DECIDED\*\*\s*\|/m,
  'P0-PR-01 must remain DECIDED after product-owner approval',
);
requireFragment('privacy', '`P0-PR-01`은 2026-09-19 **DECIDED**다');
requireFragment('privacy', 'calendar `P5Y` RETAIN');
requireRegex(
  'sourceGaps',
  /SRC-06[\s\S]{0,2000}BLOCKING BEFORE FINAL DELETION DDL BASELINE/,
  'SRC-06 must remain blocking before final deletion DDL authority is resolved',
);
requireFragment('restoreHarness', 'privacy_reconciliation: "not_exercised_by_this_workflow"');
requireFragment('restoreHarness', 'dr_ready: false');
requireFragment('restoreRunbook', 'Production state: BACKUP PRODUCTION-PROVEN / CURRENT-SCHEMA BACKUP+RESTORE EVIDENCED / DR NOT READY');
requireFragment('restoreRunbook', 'backup schema freshness             = CURRENT THROUGH DEPLOYED MIGRATION 1120');
requireFragment('restoreRunbook', 'current-schema restore              = EVIDENCED — run 35331742188');
requireFragment('restoreRunbook', 'isolated application restore       = EVIDENCED — latest run 35331742188');
requireFragment('restoreRunbook', 'application integrity/auth baseline= PASS — latest run 35331742188');
requireFragment('restoreRunbook', 'restore evidence envelope runtime  = PROVEN — run 35331742188');
requireFragment('restoreRunbook', 'restored-DB synthetic replay       = PROVEN — run 35331742188 / NON-AUTHORITATIVE');
requireFragment('restoreRunbook', 'provider-managed full restore      = NOT PROVEN');
requireFragment('restoreRunbook', 'Restore drill: PASSED for MyeongHa application-data portability and application-critical Auth identity continuity');
requireFragment('restoreRunbook', 'scripts/run-postgres-privacy-reconciliation-synthetic-drill.sh');
requireFragment('restoreRunbook', 'authoritative_post_backup_source=false');
requireFragment('restoreRunbook', 'Artifact `10541321355` contains the resulting `restore-evidence.json`');
requireFragment('restoreRunbook', 'Latest run `35331742188` runtime-proved these mechanics against the fresh current-schema restore');
requireFragment('restoreRunbook', '- [x] current production schema captured by governed backup `35329018925` after migration `1120`');
requireFragment('restoreRunbook', '- [x] restore drill completed from that current-schema backup — run `35331742188`');
requireFragment('restoreRunbook', '- [x] isolated restore mechanics completed — run `35331742188` against governed backup `35329018925`');
requireFragment('restoreRunbook', '- [x] integrity verification passed for current-schema backup — run `35331742188`');
requireFragment('restoreRunbook', '- [x] authorization verification passed at the governed database-level baseline — run `35331742188`');
requireFragment('restoreRunbook', '- [x] restored-DB synthetic privacy replay mechanics exercised — run `35331742188` (non-authoritative)');
requireFragment('restoreRunbook', '- [x] synthetic drill data-loss window measured — `4s` (diagnostic, not approved RPO)');
requireFragment('restoreRunbook', 'RPO: OPEN DECISION');
requireFragment('restoreRunbook', 'RTO: OPEN DECISION');
requireFragment('restoreRunbook', 'DR Ready = FALSE / NOT EVIDENCED');

for (const staleFragment of [
  'RESTORE NOT YET PASSED',
  'Restore drill: EXECUTED / NOT YET PASSED',
  'isolated restore                = NOT YET EVIDENCED',
]) {
  if (files.restoreRunbook.includes(staleFragment)) {
    throw new Error(`${paths.restoreRunbook} contains stale restore-state evidence after latest successful runtime-proof run 35331742188: ${staleFragment}`);
  }
}

const requiredStatusFragments = [
  'backup_run_id: 35329018925',
  'latest_proven_backup_source_sha: e1a6500968f7722666cae2038fd49ddf3f9d3540',
  'backup_artifact_id: 10540625562',
  'backup_artifact_name: myeongha-postgres-20260918T092042Z',
  'backup_artifact_expires_at: 2026-10-18T09:23:19Z',
  'backup_encrypted_sha256: 96c40cb4c61f71d56a97dd9af34a2c31eb4674809a501f435b2634c12043a394',
  'production_schema_latest_deployed_migration: 1120',
  'production_schema_deploy_run_id: 35324012524',
  'production_schema_deploy_head_sha: eddc1c331b6a8c0f47f54c150acd2f6cc5c7c0c2',
  'backup_schema_freshness: CURRENT_FOR_DEPLOYED_MIGRATION_1120',
  'backup_refresh_required: false',
  'backup_to_restore_head_migration_delta_count: 0',
  'restore_run_id: 35331742188',
  'restore_result: SUCCESS',
  'restore_runtime_head_sha: f736381f21171a1480292988e97c61ca68a5e62b',
  'restore_evidence_artifact_id: 10541321355',
  'restore_evidence_artifact_expires_at: 2026-10-18T09:52:36Z',
  'restore_evidence_envelope: IMPLEMENTED_CI_VERIFIED',
  'restore_evidence_envelope_runtime: PROVEN_ON_RUN_35331742188',
  'restored_db_synthetic_privacy_replay: IMPLEMENTED_CI_VERIFIED',
  'restored_db_synthetic_privacy_replay_runtime: PROVEN_ON_RUN_35331742188',
  'isolated_restore_validation_duration_seconds: 2',
  'manual_drill_workflow_elapsed_seconds: 52',
  'synthetic_data_loss_window_seconds: 4',
  'provider_managed_data_full_restore: false',
  'provider_managed_data_blocks_projected: 3',
  'provider_managed_data_blocks_skipped: 27',
  'synthetic_privacy_replay_event_count: 4',
  'authoritative_post_backup_source: false',
  'authoritative_post_backup_delta_audit_for_current_backup: SUCCESSFUL_COUNT_ONLY_OBSERVATION',
  'post_backup_privacy_delta_count_audit_workflow: RUNTIME_PROVEN',
  'post_backup_privacy_delta_count_audit_last_run_id: 35353128407',
  'post_backup_privacy_delta_count_audit_last_run_result: SUCCESS',
  'privacy_delta_audit_observed_delta_total: 0',
  'privacy_delta_audit_observed_deltas: false',
  'privacy_recovery_ledger_candidate_workflow: RUNTIME_PROVEN',
  'privacy_recovery_ledger_candidate_run_id: 35361080803',
  'privacy_recovery_ledger_candidate_result: SUCCESS',
  'privacy_recovery_ledger_candidate_runtime_head_sha: c8899478dba523f2ccfe1f6f00cda14a952a0273',
  'privacy_recovery_ledger_candidate_backup_run_id: 35329018925',
  'privacy_recovery_ledger_candidate_backup_completed_at_utc: 2026-09-18T09:23:19.000Z',
  'privacy_recovery_ledger_candidate_captured_at_utc: 2026-09-18T15:13:38.000Z',
  'privacy_recovery_ledger_candidate_artifact_id: 10553934875',
  'privacy_recovery_ledger_candidate_artifact_name: myeongha-privacy-ledger-20260918T151342Z',
  'privacy_recovery_ledger_candidate_artifact_expires_at: 2026-10-18T15:13:42Z',
  'privacy_recovery_ledger_candidate_artifact_digest: sha256:dfa03b55d90011ea9b5ce52ec166fb6eb789a91874bafcc8341cd6e4c68543b0',
  'privacy_recovery_ledger_candidate_encrypted_sha256: 91e2ea2fd615385d86d9864d7670b3139752a090fbe49884a8743258ccd938b5',
  'privacy_recovery_ledger_candidate_source_digest: sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
  'privacy_recovery_ledger_candidate_event_count: 0',
  'privacy_recovery_ledger_candidate_replay_planner_accepted: true',
  'privacy_recovery_ledger_candidate_unsupported_delta_guard: PASS_ZERO_UNSUPPORTED',
  'privacy_recovery_ledger_candidate_artifact_plaintext_identifier_payload_uploaded: false',
  'privacy_recovery_ledger_candidate_source_authority: CANDIDATE_NON_AUTHORITATIVE',
  'privacy_reconciliation: BLOCKED_BY_FINALIZER_AND_AUTHORITATIVE_NONZERO_RECOVERY_PROOF',
  'rpo_authority: OPEN_DECISION',
  'rto_authority: OPEN_DECISION',
  'dr_ready: false',
]
for (const fragment of requiredStatusFragments) requireFragment('readinessStatus', fragment);

const forbiddenReadyFragments = [
  'backup_schema_freshness: STALE_AFTER_PRODUCTION_MIGRATION_1120',
  'backup_refresh_required: true',
  'restore_evidence_envelope_runtime: PENDING_CURRENT_MAIN_MANUAL_DRILL',
  'restored_db_synthetic_privacy_replay_runtime: PENDING_CURRENT_MAIN_MANUAL_DRILL',
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
    throw new Error(`${paths.readinessStatus} contains stale runtime evidence after current-schema restore run 35331742188: ${staleRuntimeFragment}`);
  }
}

const candidateFrontierNote =
  repositoryMigrationFrontier > productionMigrationFrontier
    ? ` Repository candidate migration ${repositoryMigrationFrontier} is pending deployment and is not covered by that recovery evidence.`
    : '';

console.log(
  `PostgreSQL DR readiness authority guard PASS: production backup/restore is evidenced through deployed migration ${productionMigrationFrontier}; P0-PR-01 is DECIDED, while finalizer/recovery proof and OPEN RPO/RTO authority keep dr_ready=false.${candidateFrontierNote}`,
);
