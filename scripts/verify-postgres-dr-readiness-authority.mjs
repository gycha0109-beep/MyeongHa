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
requireFragment('restoreRunbook', 'Production state: CURRENT-FRONTIER BACKUP+RESTORE PROVEN / DR NOT READY');
requireFragment('restoreRunbook', 'backup schema freshness             = CURRENT — backup frontier 1230 / deployed frontier 1230');
requireFragment('restoreRunbook', 'current-schema restore              = EVIDENCED — run 35546262378 / frontier 1230');
requireFragment('restoreRunbook', 'bounded privacy source authority    = RUNTIME-PROVEN — run 35539838537');
requireFragment('restoreRunbook', 'recovered finalization mechanics    = IMPLEMENTED / POST-MERGE CI GREEN');
requireFragment('restoreRunbook', 'recovered finalization on fresh restore = PROVEN — run 35546262378');
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
requireFragment('restoreRunbook', '- [x] fresh governed backup captured after deployed migration `1230` — run `35536655149` / artifact `10612622254`');
requireFragment('restoreRunbook', '- [x] isolated restore completed from that current-frontier backup — run `35546262378`');
requireFragment('restoreRunbook', '- [x] recovered-state finalization drill executed on that fresh governed restore — run `35546262378`');
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
    throw new Error(`${paths.restoreRunbook} contains stale restore-state evidence after latest successful runtime-proof run 35546262378: ${staleFragment}`);
  }
}

const requiredStatusFragments = [
  'latest_governed_backup_run_id: 35536655149',
  'latest_governed_backup_source_sha: 00580651fa79c6361a03d09f207b6c27678d2714',
  'latest_governed_backup_artifact_id: 10612622254',
  'latest_governed_backup_artifact_name: myeongha-postgres-20260920T204732Z',
  'latest_governed_backup_completed_at_utc: 2026-09-20T20:50:05Z',
  'latest_proven_backup_migration_frontier: 1230',
  'production_schema_latest_deployed_migration: 1230',
  'production_schema_deploy_run_id: 35522337472',
  'production_schema_deploy_head_sha: 217698890a49c525ab043ac902037f2029227fa4',
  'current_repository_migration_frontier: 1230',
  'latest_isolated_restore_run_id: 35546262378',
  'latest_isolated_restore_result: SUCCESS',
  'latest_isolated_restore_backup_run_id: 35536655149',
  'latest_isolated_restore_incident_reference_utc: 2026-09-20T20:50:09Z',
  'latest_isolated_restore_evidence_artifact_id: 10615818654',
  'latest_isolated_restore_evidence_artifact_expires_at: 2026-10-21T00:01:09Z',
  'latest_isolated_restore_evidence_artifact_digest: sha256:31ef8410a2f2c3760311df80c3b077836644ed6035d5e5d58813d28a6bff3bfc',
  'latest_isolated_restore_backup_migration_frontier: 1230',
  'restore_evidence_envelope_runtime: PROVEN_ON_RUN_35546262378',
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
  'recovered_state_finalization_restored_backup_runtime: PROVEN_ON_RUN_35546262378',
  'privacy_reconciliation: BLOCKED_BY_PRODUCTION_NONZERO_AUTHORITATIVE_DELTA_PROOF',
  'authoritative_privacy_reconciliation: false',
  'future_safe_privacy_reconciliation: false',
  'rpo_authority: OPEN_DECISION',
  'rto_authority: OPEN_DECISION',
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
    throw new Error(`${paths.readinessStatus} contains stale runtime evidence after current-schema restore run 35546262378: ${staleRuntimeFragment}`);
  }
}

const candidateFrontierNote =
  repositoryMigrationFrontier > productionMigrationFrontier
    ? ` Repository candidate migration ${repositoryMigrationFrontier} is pending deployment and is not covered by that recovery evidence.`
    : '';

console.log(
  `PostgreSQL DR readiness authority guard PASS: production is deployed through migration ${productionMigrationFrontier}; governed backup/restore freshness, recovered-state authoritative reconciliation, and OPEN RPO/RTO authority keep dr_ready=false.${candidateFrontierNote}`,
);
