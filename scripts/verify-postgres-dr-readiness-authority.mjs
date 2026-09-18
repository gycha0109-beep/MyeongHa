import { readFile } from 'node:fs/promises';

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
  /^\|\s*`P0-PR-01`\s*\|[^|\n]*\|\s*\*\*OPEN-P0\*\*\s*\|/m,
  'the P0-PR-01 decision-register row itself must remain OPEN-P0 while retention/legal authority is unresolved',
);
requireFragment('privacy', '실제 legal/accounting/backup retention');
requireFragment('privacy', '`OPEN-P0: P0-PR-01`');
requireRegex(
  'sourceGaps',
  /SRC-06[\s\S]{0,2000}BLOCKING BEFORE FINAL DELETION DDL BASELINE/,
  'SRC-06 must remain blocking before final deletion DDL authority is resolved',
);
requireFragment('restoreHarness', 'privacy_reconciliation: "not_exercised_by_this_workflow"');
requireFragment('restoreHarness', 'dr_ready: false');
requireFragment('restoreRunbook', 'Production state: BACKUP PRODUCTION-PROVEN / CURRENT-SCHEMA BACKUP PROVEN / CURRENT-SCHEMA RESTORE PENDING / DR NOT READY');
requireFragment('restoreRunbook', 'backup schema freshness             = CURRENT-SCHEMA BACKUP PROVEN');
requireFragment('restoreRunbook', 'fresh current-schema backup         = PROVEN — run 35329018925');
requireFragment('restoreRunbook', 'fresh current-schema restore        = PENDING MANUAL DRILL');
requireFragment('restoreRunbook', 'isolated application restore       = EVIDENCED — run 35325070718 against historical backup 35260191079');
requireFragment('restoreRunbook', 'application integrity/auth baseline= PASS — latest run 35325070718');
requireFragment('restoreRunbook', 'restore evidence envelope runtime  = PROVEN — run 35325070718');
requireFragment('restoreRunbook', 'restored-DB synthetic replay       = PROVEN — run 35325070718 / NON-AUTHORITATIVE');
requireFragment('restoreRunbook', 'provider-managed full restore      = NOT PROVEN');
requireFragment('restoreRunbook', 'Restore drill: PASSED for MyeongHa application-data portability and application-critical Auth identity continuity');
requireFragment('restoreRunbook', 'scripts/run-postgres-privacy-reconciliation-synthetic-drill.sh');
requireFragment('restoreRunbook', 'authoritative_post_backup_source=false');
requireFragment('restoreRunbook', 'Artifact `10538807602` contains the resulting `restore-evidence.json`');
requireFragment('restoreRunbook', 'Run `35325070718` runtime-proved these mechanics against the restored schema');
requireFragment('restoreRunbook', '- [x] current production schema captured by a governed backup after migration `1120` — run `35329018925`');
requireFragment('restoreRunbook', '- [ ] restore drill completed from current-schema backup `35329018925`');
requireFragment('restoreRunbook', '- [x] isolated restore mechanics completed — run `35325070718` against governed backup `35260191079`');
requireFragment('restoreRunbook', '- [x] integrity verification passed for selected backup — run `35325070718`');
requireFragment('restoreRunbook', '- [x] authorization verification passed at the governed database-level baseline for selected backup — run `35325070718`');
requireFragment('restoreRunbook', '- [x] restored-DB synthetic privacy replay mechanics exercised — run `35325070718` (non-authoritative)');
requireFragment('restoreRunbook', '- [x] synthetic drill data-loss window measured — `82s` (diagnostic, not approved RPO)');
requireFragment('restoreRunbook', 'RPO: OPEN DECISION');
requireFragment('restoreRunbook', 'RTO: OPEN DECISION');
requireFragment('restoreRunbook', 'DR Ready = FALSE / NOT EVIDENCED');

for (const staleFragment of [
  'RESTORE NOT YET PASSED',
  'Restore drill: EXECUTED / NOT YET PASSED',
  'isolated restore                = NOT YET EVIDENCED',
]) {
  if (files.restoreRunbook.includes(staleFragment)) {
    throw new Error(`${paths.restoreRunbook} contains stale restore-state evidence after latest successful runtime-proof run 35325070718: ${staleFragment}`);
  }
}

const requiredStatusFragments = [
  'backup_run_id: 35329018925',
  'latest_proven_backup_source_sha: e1a6500968f7722666cae2038fd49ddf3f9d3540',
  'backup_artifact_id: 10540625562',
  'backup_artifact_name: myeongha-postgres-20260918T092042Z',
  'backup_manifest_created_at_utc: 2026-09-18T09:23:19Z',
  'backup_workflow_completed_at_utc: 2026-09-18T09:23:23Z',
  'backup_artifact_expires_at: 2026-10-18T09:23:19Z',
  'backup_encrypted_sha256: 96c40cb4c61f71d56a97dd9af34a2c31eb4674809a501f435b2634c12043a394',
  'production_schema_latest_deployed_migration: 1120',
  'production_schema_deploy_run_id: 35324012524',
  'production_schema_deploy_head_sha: eddc1c331b6a8c0f47f54c150acd2f6cc5c7c0c2',
  'backup_schema_freshness: CURRENT_SCHEMA_BACKUP_PROVEN',
  'backup_refresh_required: false',
  'current_schema_restore_runtime: PENDING_MANUAL_DRILL_ON_BACKUP_35329018925',
  'restore_run_id: 35325070718',
  'restore_source_backup_run_id: 35260191079',
  'restore_result: SUCCESS',
  'restore_runtime_head_sha: eddc1c331b6a8c0f47f54c150acd2f6cc5c7c0c2',
  'restore_evidence_artifact_id: 10538807602',
  'restore_evidence_artifact_expires_at: 2026-10-18T08:35:28Z',
  'restore_evidence_envelope: IMPLEMENTED_CI_VERIFIED',
  'restore_evidence_envelope_runtime: PROVEN_ON_RUN_35325070718',
  'restored_db_synthetic_privacy_replay: IMPLEMENTED_CI_VERIFIED',
  'restored_db_synthetic_privacy_replay_runtime: PROVEN_ON_RUN_35325070718',
  'isolated_restore_validation_duration_seconds: 4',
  'manual_drill_workflow_elapsed_seconds: 58',
  'synthetic_data_loss_window_seconds: 82',
  'provider_managed_data_full_restore: false',
  'provider_managed_data_blocks_projected: 3',
  'provider_managed_data_blocks_skipped: 27',
  'synthetic_privacy_replay_event_count: 4',
  'authoritative_post_backup_source: false',
  'post_backup_privacy_delta_count: 0',
  'privacy_reconciliation: BLOCKED_BY_P0_PR_01_AND_ISSUE_964',
  'rpo_authority: OPEN_DECISION',
  'rto_authority: OPEN_DECISION',
  'dr_ready: false',
];
for (const fragment of requiredStatusFragments) requireFragment('readinessStatus', fragment);

const forbiddenReadyFragments = [
  'current_schema_restore_runtime: PROVEN',
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
      throw new Error(`${paths[key]} contains forbidden DR-ready promotion while canonical authority remains open: ${fragment}`);
    }
  }
}

console.log('PostgreSQL DR readiness authority guard PASS: restore mechanics are evidenced, but OPEN retention/privacy and RPO/RTO authority keeps dr_ready=false.');
