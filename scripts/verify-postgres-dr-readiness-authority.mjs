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
requireFragment('restoreHarness', 'privacy_reconciliation: "not_exercised_by_this_workflow"');
requireFragment('restoreHarness', 'dr_ready: false');
requireFragment('restoreRunbook', 'Production state: CURRENT-FRONTIER BACKUP+RESTORE PROVEN / DR NOT READY');
requireFragment('restoreRunbook', 'backup schema freshness             = CURRENT — backup frontier 1305 / deployed frontier 1305');
requireFragment('restoreRunbook', 'current-schema restore              = EVIDENCED — run 35947730074 / frontier 1305');
requireFragment('restoreRunbook', 'bounded privacy source authority    = RUNTIME-PROVEN — run 35653303484 / AUTHORITATIVE_CAPTURED_WINDOW_V1');
requireFragment('restoreRunbook', 'recovered finalization mechanics    = IMPLEMENTED / POST-MERGE CI GREEN');
requireFragment('restoreRunbook', 'recovered finalization on current-frontier synthetic restore = PROVEN — run 35947730074 / synthetic captured-window mechanics');
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
requireFragment('restoreRunbook', '- [x] fresh governed backup captured after deployed migration `1305` — run `35944326928` / artifact `10786441202`');
requireFragment('restoreRunbook', '- [x] isolated restore completed from that current-frontier backup — run `35947730074`');
requireFragment('restoreRunbook', '- [x] recovered-state synthetic finalization drill executed on that fresh governed restore — run `35947730074`');
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
    throw new Error(`${paths.restoreRunbook} contains stale restore-state evidence after latest successful runtime-proof run 35947730074: ${staleFragment}`);
  }
}

const requiredStatusFragments = [
  'latest_governed_backup_run_id: 35944326928',
  'latest_governed_backup_source_sha: fcab2c63d3f682bd7e89bf048cff9d4d62c404dd',
  'latest_governed_backup_artifact_id: 10786441202',
  'latest_proven_backup_migration_frontier: 1305',
  'production_schema_latest_deployed_migration: 1305',
  'current_repository_migration_frontier: 1305',
  'latest_isolated_restore_run_id: 35947730074',
  'latest_isolated_restore_runtime_head_sha: fcab2c63d3f682bd7e89bf048cff9d4d62c404dd',
  'latest_isolated_restore_backup_run_id: 35944326928',
  'latest_isolated_restore_evidence_artifact_id: 10787108939',
  'latest_isolated_restore_backup_migration_frontier: 1305',
  'restore_evidence_envelope_runtime: PROVEN_ON_RUN_35947730074',
  'latest_isolated_restore_result: SUCCESS',
  'provider_managed_data_full_restore: false',
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

const candidateFrontierNote =
  repositoryMigrationFrontier > productionMigrationFrontier
    ? ` Repository candidate migration ${repositoryMigrationFrontier} is pending deployment and is not covered by that recovery evidence.`
    : '';

console.log(
  `PostgreSQL DR readiness authority guard PASS: production is deployed through migration ${productionMigrationFrontier}; Production non-zero bounded-window reconciliation and full authoritative RPO/RTO comparisons are proven, while provider-managed full-restore equivalence and future-safe recovery remain open so dr_ready=false.${candidateFrontierNote}`,
);
