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

requireFragment('operations', 'RPO = PT24H (24 hours) — PRODUCT OWNER APPROVED 2026-09-21');
requireFragment('operations', 'RTO = PT6H (6 hours) — PRODUCT OWNER APPROVED 2026-09-21');
requireFragment('operations', 'no `DR Ready` claim is allowed');
requireRegex(
  'decisions',
  /^\|\s*`P0-PR-01`\s*\|[^|\n]*\|\s*\*\*DECIDED\*\*\s*\|/m,
  'P0-PR-01 must remain DECIDED after product-owner approval',
);
requireFragment('decisions', '### P0-OPS-02');
requireFragment('decisions', 'rpo: PT24H');
requireFragment('decisions', 'rto: PT6H');
requireFragment('decisions', 'full_authoritative_rpo_comparison: PENDING');
requireFragment('decisions', 'full_authoritative_rto_comparison: PENDING');
requireFragment('privacy', '`P0-PR-01`은 2026-09-19 **DECIDED**다');
requireFragment('privacy', 'calendar `P5Y` RETAIN');
requireRegex(
  'sourceGaps',
  /SRC-06[\s\S]{0,2000}BLOCKING BEFORE FINAL DELETION DDL BASELINE/,
  'SRC-06 must remain blocking before final deletion DDL authority is resolved',
);
requireFragment('restoreHarness', 'privacy_reconciliation: "not_exercised_by_this_workflow"');
requireFragment('restoreHarness', 'dr_ready: false');
requireFragment('restoreRunbook', 'Production state: CURRENT-FRONTIER BACKUP+RESTORE PROVEN / DR NOT READY');
requireFragment('restoreRunbook', 'backup schema freshness             = CURRENT — backup frontier 1240 / deployed frontier 1240');
requireFragment('restoreRunbook', 'current-schema restore              = EVIDENCED — run 35554439453 / frontier 1240');
requireFragment('restoreRunbook', 'bounded privacy source authority    = RUNTIME-PROVEN — run 35539838537');
requireFragment('restoreRunbook', 'recovered finalization mechanics    = IMPLEMENTED / POST-MERGE CI GREEN');
requireFragment('restoreRunbook', 'recovered finalization on fresh restore = PROVEN — run 35554439453');
requireFragment('restoreRunbook', 'authoritative privacy reconciliation= NOT YET PROVEN');
requireFragment('restoreRunbook', 'future-safe privacy reconciliation  = false');
requireFragment('restoreRunbook', 'provider-managed full restore       = NOT PROVEN');
requireFragment('restoreRunbook', 'Restore drill: PASSED for MyeongHa application-data portability and application-critical Auth identity continuity');
requireFragment('restoreRunbook', 'scripts/run-postgres-privacy-reconciliation-synthetic-drill.sh');
requireFragment('restoreRunbook', 'AUTHORITATIVE_CAPTURED_WINDOW_V1');
requireFragment('restoreRunbook', 'Production PostgreSQL Privacy Recovery Ledger');
requireFragment('restoreRunbook', '35539838537');
requireFragment('restoreRunbook', '- [x] bounded captured-window privacy source authority runtime-proven — run `35539838537`');
requireFragment('restoreRunbook', '- [x] account-deletion finalizer and recovered-state finalization mechanics implemented / post-merge CI green');
requireFragment('restoreRunbook', '- [x] fresh governed backup captured after deployed migration `1240` — run `35553774002` / artifact `10619871426`');
requireFragment('restoreRunbook', '- [x] isolated restore completed from that current-frontier backup — run `35554439453`');
requireFragment('restoreRunbook', '- [x] recovered-state finalization drill executed on that fresh governed restore — run `35554439453`');
requireFragment('restoreRunbook', '- [x] synthetic drill data-loss window measured — `5s` (diagnostic, not approved RPO)');
requireFragment('restoreRunbook', 'RPO: APPROVED — PT24H (24 hours)');
requireFragment('restoreRunbook', 'RTO: APPROVED — PT6H (6 hours)');
requireFragment('restoreRunbook', 'DR Ready = FALSE / NOT EVIDENCED');

for (const staleFragment of [
  'RESTORE NOT YET PASSED',
  'Restore drill: EXECUTED / NOT YET PASSED',
  'isolated restore                = NOT YET EVIDENCED',
]) {
  if (files.restoreRunbook.includes(staleFragment)) {
    throw new Error(`${paths.restoreRunbook} contains stale restore-state evidence after latest successful runtime-proof run 35554439453: ${staleFragment}`);
  }
}

const requiredStatusFragments = [
  'latest_governed_backup_run_id: 35553774002',
  'latest_governed_backup_source_sha: 1b17da2b7979ceb92a6a5566dfcb8cf3d420967d',
  'latest_governed_backup_artifact_id: 10619871426',
  'latest_governed_backup_artifact_name: myeongha-postgres-20260921T021924Z',
  'latest_governed_backup_completed_at_utc: 2026-09-21T02:22:10Z',
  'latest_proven_backup_migration_frontier: 1240',
  'production_schema_latest_deployed_migration: 1240',
  'production_schema_deploy_run_id: 35552626339',
  'production_schema_deploy_head_sha: 1b17da2b7979ceb92a6a5566dfcb8cf3d420967d',
  'current_repository_migration_frontier: 1240',
  'latest_isolated_restore_run_id: 35554439453',
  'latest_isolated_restore_result: SUCCESS',
  'latest_isolated_restore_backup_run_id: 35553774002',
  'latest_isolated_restore_incident_reference_utc: 2026-09-21T02:22:15Z',
  'latest_isolated_restore_evidence_artifact_id: 10619098486',
  'latest_isolated_restore_evidence_artifact_expires_at: 2026-10-21T02:31:59Z',
  'latest_isolated_restore_evidence_artifact_digest: sha256:6f8b6d63a4cad01f5fe77c3eaeadfc7d965fefe177e1124a093b5eca78219f27',
  'latest_isolated_restore_backup_migration_frontier: 1240',
  'restore_evidence_envelope_runtime: PROVEN_ON_RUN_35554439453',
  'provider_managed_data_full_restore: false',
  'privacy_recovery_ledger_workflow: RUNTIME_PROVEN',
  'privacy_recovery_ledger_run_id: 35539838537',
  'privacy_recovery_ledger_result: SUCCESS',
  'privacy_recovery_ledger_runtime_head_sha: 5bb5de08ef211f78565d06c1f9c4ff0c0ec8a956',
  'privacy_recovery_ledger_backup_run_id: 35536655149',
  'privacy_recovery_ledger_backup_completed_at_utc: 2026-09-20T20:50:05Z',
  'privacy_recovery_ledger_artifact_id: 10614412005',
  'privacy_recovery_ledger_artifact_name: myeongha-privacy-ledger-20260920T214938Z',
  'privacy_recovery_ledger_artifact_expires_at: 2026-10-20T21:49:39Z',
  'privacy_recovery_ledger_artifact_digest: sha256:c048023ae254a8aa176a4c0c23f0853c699f902711bfefe350200ab4718f70ef',
  'privacy_recovery_ledger_authority_class: AUTHORITATIVE_CAPTURED_WINDOW_V1',
  'privacy_recovery_ledger_retention: P30D',
  'authoritative_post_backup_source: true_bounded_captured_window_only',
  'account_deletion_finalizer_runtime: IMPLEMENTED_AND_PROVIDER_MECHANICS_SEPARATELY_PROVEN',
  'recovered_state_finalization_drill: IMPLEMENTED_MERGED_POST_MERGE_CI_GREEN',
  'recovered_state_finalization_restored_backup_runtime: PROVEN_ON_RUN_35554439453',
  'privacy_reconciliation: BLOCKED_BY_PRODUCTION_NONZERO_AUTHORITATIVE_DELTA_PROOF',
  'authoritative_privacy_reconciliation: false',
  'future_safe_privacy_reconciliation: false',
  'rpo_authority: PRODUCT_OWNER_APPROVED_PT24H',
  'rto_authority: PRODUCT_OWNER_APPROVED_PT6H',
  'dr_ready: false',
]
for (const fragment of requiredStatusFragments) requireFragment('readinessStatus', fragment);

const forbiddenReadyFragments = [
  'authoritative_privacy_reconciliation: true',
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
    throw new Error(`${paths.readinessStatus} contains stale runtime evidence after current-schema restore run 35554439453: ${staleRuntimeFragment}`);
  }
}

const candidateFrontierNote =
  repositoryMigrationFrontier > productionMigrationFrontier
    ? ` Repository candidate migration ${repositoryMigrationFrontier} is pending deployment and is not covered by that recovery evidence.`
    : '';

console.log(
  `PostgreSQL DR readiness authority guard PASS: production is deployed through migration ${productionMigrationFrontier}; governed backup/restore freshness, Production authoritative reconciliation, provider recovery gaps, and full-procedure comparison against approved RPO/RTO objectives keep dr_ready=false.${candidateFrontierNote}`,
);
