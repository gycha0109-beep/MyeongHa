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
requireFragment('restoreRunbook', 'Production state: BACKUP PRODUCTION-PROVEN / ISOLATED APPLICATION RESTORE EVIDENCED / DR NOT READY');
requireFragment('restoreRunbook', 'isolated application restore       = EVIDENCED — run 35280075274');
requireFragment('restoreRunbook', 'application integrity/auth baseline= PASS — run 35280075274');
requireFragment('restoreRunbook', 'provider-managed full restore      = NOT PROVEN');
requireFragment('restoreRunbook', 'Restore drill: PASSED for MyeongHa application-data portability and application-critical Auth identity continuity');
requireFragment('restoreRunbook', '- [x] isolated restore completed — run `35280075274`');
requireFragment('restoreRunbook', '- [x] integrity verification passed — run `35280075274`');
requireFragment('restoreRunbook', '- [x] authorization verification passed at the governed database-level baseline — run `35280075274`');
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
    throw new Error(`${paths.restoreRunbook} contains stale restore-state evidence after successful run 35280075274: ${staleFragment}`);
  }
}

const requiredStatusFragments = [
  'restore_run_id: 35280075274',
  'restore_result: SUCCESS',
  'isolated_restore_validation_duration_seconds: 3',
  'synthetic_data_loss_window_seconds: 82',
  'post_backup_privacy_delta_count: 0',
  'privacy_reconciliation: BLOCKED_BY_P0_PR_01_AND_ISSUE_964',
  'rpo_authority: OPEN_DECISION',
  'rto_authority: OPEN_DECISION',
  'dr_ready: false',
];
for (const fragment of requiredStatusFragments) requireFragment('readinessStatus', fragment);

const forbiddenReadyFragments = [
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
