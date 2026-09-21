import { readFile } from 'node:fs/promises';

const workflowPath = '.github/workflows/production-privacy-recovery-canary.yml';
const runtimePath = 'scripts/run-production-privacy-recovery-canary.mjs';

const [workflow, runtime] = await Promise.all([
  readFile(workflowPath, 'utf8'),
  readFile(runtimePath, 'utf8'),
]);

function requireFragment(text, fragment, source) {
  if (!text.includes(fragment)) {
    throw new Error(`${source} is missing required Production privacy canary fragment: ${fragment}`);
  }
}

function forbidFragment(text, fragment, source) {
  if (text.includes(fragment)) {
    throw new Error(`${source} contains forbidden Production privacy canary fragment: ${fragment}`);
  }
}

for (const fragment of [
  'name: Production Privacy Recovery Canary',
  'workflow_dispatch:',
  "Type RUN_SYNTHETIC_PRODUCTION_PRIVACY_CANARY",
  'actions: write',
  'contents: read',
  'cancel-in-progress: false',
  'environment: production',
  'MYEONGHA_WORKER_DATABASE_URL: ${{ secrets.MYEONGHA_WORKER_DATABASE_URL }}',
  'MYEONGHA_WORKER_DATABASE_PRINCIPAL: myeongha_worker_runtime',
  'MYEONGHA_PRIVACY_CANARY_ADMIN_DATABASE_URL',
  'node scripts/run-production-privacy-recovery-canary.mjs prepare',
  'gh workflow run production-postgres-backup.yml --ref main',
  'node scripts/run-production-privacy-recovery-canary.mjs execute',
  'gh workflow run production-postgres-privacy-recovery-ledger.yml',
  '-f "backup_run_id=$BACKUP_RUN_ID"',
  '.eventCount > 0',
  '(.eventTypeCounts.ACCOUNT_DELETION_STARTED // 0) >= 1',
  '.authoritativePrivacyReconciliation == false',
  '.futureSafePrivacyReconciliation == false',
  '.drReady == false',
  'production-privacy-recovery-canary-${{ github.run_id }}',
  'if: failure()',
  'cleanup-prestart',
]) {
  requireFragment(workflow, fragment, workflowPath);
}

for (const fragment of ['\n  push:', '\n  schedule:', '\n  pull_request:', 'cancel-in-progress: true']) {
  forbidFragment(workflow, fragment, workflowPath);
}

const prepareIndex = workflow.indexOf(
  'Create disposable hosted Auth + Production application canary state',
);
const workerCredentialIndex = workflow.indexOf(
  '[[ -n "${MYEONGHA_WORKER_DATABASE_URL:-}" ]]',
);
if (workerCredentialIndex < 0 || prepareIndex < 0 || workerCredentialIndex > prepareIndex) {
  throw new Error(
    `${workflowPath} must fail closed on the dedicated worker credential before creating Production canary state.`,
  );
}

if (
  workflow.includes('MYEONGHA_PRIVACY_CANARY_STATE_PATH }}') ||
  workflow.includes('production-privacy-canary-state.json\n          retention-days')
) {
  throw new Error(`${workflowPath} must never upload the identifier-bearing ephemeral canary state.`);
}

for (const fragment of [
  "const CONFIRMATION = 'RUN_SYNTHETIC_PRODUCTION_PRIVACY_CANARY';",
  "const PROVIDER = 'myeongha-privacy-canary-v1';",
  "phase: 'preparing'",
  "state.phase = 'prepared';",
  "state.phase = 'deletion_started';",
  "state.phase = 'completed';",
  'SET LOCAL ROLE myeongha_api_executor',
  'public.begin_member_subject_context_v1',
  'public.cmd_start_account_deletion_runtime_v1',
  'parseProductionAccountDeletionWorkerDbConfigV1',
  "MYEONGHA_WORKER_DATABASE_PRINCIPAL: 'myeongha_worker_runtime'",
  'createProductionAccountDeletionWorkerRuntimeV1',
  "row?.subject_status !== 'deleted'",
  "row?.job_status !== 'completed'",
  "row?.outbox_status !== 'processed'",
  "row?.commerce_status !== 'revoked'",
  'row?.profile_count !== 0',
  'await assertHostedUserAbsent(secret, state.authUserId);',
  "fixtureClass: 'synthetic-disposable-member'",
  "accountDeletionStartAuthority: 'myeongha_api_executor/cmd_start_account_deletion_runtime_v1'",
  "workerAuthority: 'myeongha_worker_runtime->myeongha_system_executor'",
  "personalizationNonResurrectionGuard: 'pass'",
  "commerceP5yRetentionGuard: 'retained-revoked-pass'",
  'outputContainsIdentifiers: false',
  'outputContainsRowPayloads: false',
  'authoritativePrivacyReconciliation: false',
  'futureSafePrivacyReconciliation: false',
  'drReady: false',
]) {
  requireFragment(runtime, fragment, runtimePath);
}

for (const fragment of [
  'customer_id',
  'customerId',
  'generic retry',
  'dead-letter',
]) {
  forbidFragment(runtime, fragment, runtimePath);
}

console.log(
  'Production privacy recovery canary workflow verification passed: workflow_dispatch-only, synthetic fixture, API-executor deletion start, dedicated worker, hosted Auth cleanup, non-zero canonical ledger gate, identifier-free evidence, and DR fail-closed semantics are pinned.',
);
