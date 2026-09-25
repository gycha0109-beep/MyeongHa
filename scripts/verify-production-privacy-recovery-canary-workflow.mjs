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
  'watchtower_track:',
  'operation:',
  'resume_canary_run_id:',
  'resume_backup_run_id:',
  'worker_credential_action:',
  'worker_credential_confirmation:',
  'MYEONGHA_WATCHTOWER_TRACK: ${{ inputs.watchtower_track }}',
  'MYEONGHA_PRIVACY_CANARY_OPERATION: ${{ inputs.operation }}',
  'MYEONGHA_PRIVACY_CANARY_RESUME_RUN_ID: ${{ inputs.resume_canary_run_id }}',
  'MYEONGHA_PRIVACY_CANARY_RESUME_BACKUP_RUN_ID: ${{ inputs.resume_backup_run_id }}',
  'MYEONGHA_WORKER_CREDENTIAL_ACTION: ${{ inputs.worker_credential_action }}',
  'MYEONGHA_WORKER_CREDENTIAL_CONFIRMATION: ${{ inputs.worker_credential_confirmation }}',
  '[[ "$MYEONGHA_WATCHTOWER_TRACK" == \'ops\' ]]',
  'Synchronize dedicated worker login password from protected secret',
  'node scripts/run-production-privacy-recovery-canary.mjs sync-worker-password',
  'Verify dedicated worker database authority before mutation',
  'node scripts/run-production-privacy-recovery-canary.mjs preflight-worker',
  'Provision ephemeral API canary login',
  'node scripts/run-production-privacy-recovery-canary.mjs provision-api-login',
  'Remove ephemeral API canary login',
  'if: always()',
  'node scripts/run-production-privacy-recovery-canary.mjs cleanup-api-login',
  'MYEONGHA_WORKER_DATABASE_URL: ${{ secrets.MYEONGHA_WORKER_DATABASE_URL }}',
  'MYEONGHA_SUPABASE_AUTH_ADMIN_SECRET: ${{ secrets.MYEONGHA_SUPABASE_AUTH_ADMIN_SECRET }}',
  'MYEONGHA_WORKER_DATABASE_PRINCIPAL: myeongha_worker_runtime',
  'MYEONGHA_PRIVACY_CANARY_ADMIN_DATABASE_URL',
  'node scripts/run-production-privacy-recovery-canary.mjs prepare',
  'gh workflow run production-postgres-backup.yml --ref main',
  'node scripts/run-production-privacy-recovery-canary.mjs execute',
  'Recover stranded canary state from Production',
  'node scripts/run-production-privacy-recovery-canary.mjs recover-resume-state',
  'Resume dedicated worker for already-started deletion',
  'node scripts/run-production-privacy-recovery-canary.mjs resume',
  'Resolve governed pre-deletion backup',
  'steps.backup-ref.outputs.run_id',
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

for (const fragment of [
  '\n  push:',
  '\n  schedule:',
  '\n  pull_request:',
  'cancel-in-progress: true',
  'MYEONGHA_DATABASE_URL: ${{ secrets.MYEONGHA_DATABASE_URL }}',
  'VERCEL_TOKEN:',
  'env?decrypt=true',
  'Resolve governed Production API database binding from Vercel',
  'SUPABASE_ACCESS_TOKEN',
]) {
  forbidFragment(workflow, fragment, workflowPath);
}

const runtimePathsIndex = workflow.indexOf(
  'Prepare protected canary runtime paths',
);
const workerSyncIndex = workflow.indexOf(
  'Synchronize dedicated worker login password from protected secret',
);
const workerPreflightIndex = workflow.indexOf(
  'Verify dedicated worker database authority before mutation',
);
const provisionIndex = workflow.indexOf(
  'Provision ephemeral API canary login',
);
const prepareIndex = workflow.indexOf(
  'Create disposable hosted Auth + Production application canary state',
);
const executeIndex = workflow.indexOf(
  'Start deletion through API executor and run dedicated worker',
);
const cleanupLoginIndex = workflow.indexOf(
  'Remove ephemeral API canary login',
);
const recoverIndex = workflow.indexOf(
  'Recover stranded canary state from Production',
);
const resumeIndex = workflow.indexOf(
  'Resume dedicated worker for already-started deletion',
);
const backupRefIndex = workflow.indexOf(
  'Resolve governed pre-deletion backup',
);
const ledgerIndex = workflow.indexOf(
  'Dispatch and wait for canonical non-zero privacy recovery ledger',
);
const workerCredentialIndex = workflow.indexOf(
  '[[ -n "${MYEONGHA_WORKER_DATABASE_URL:-}" ]]',
);
if (
  runtimePathsIndex < 0 ||
  workerSyncIndex < 0 ||
  workerPreflightIndex < 0 ||
  provisionIndex < 0 ||
  prepareIndex < 0 ||
  executeIndex < 0 ||
  cleanupLoginIndex < 0 ||
  recoverIndex < 0 ||
  resumeIndex < 0 ||
  backupRefIndex < 0 ||
  ledgerIndex < 0 ||
  workerCredentialIndex < 0 ||
  workerCredentialIndex > prepareIndex ||
  runtimePathsIndex > workerSyncIndex ||
  workerSyncIndex > workerPreflightIndex ||
  workerPreflightIndex > provisionIndex ||
  provisionIndex > prepareIndex ||
  executeIndex > cleanupLoginIndex ||
  recoverIndex > resumeIndex ||
  resumeIndex > backupRefIndex ||
  cleanupLoginIndex > backupRefIndex ||
  backupRefIndex > ledgerIndex
) {
  throw new Error(
    `${workflowPath} must preflight the dedicated worker before mutation, keep fresh API-login lifecycle ordering, recover resume state before resumed execution, and resolve one governed backup before ledger dispatch.`,
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
  "const API_EXECUTION_ROLE = 'myeongha_api_executor';",
  "const API_CANARY_ROLE_MARKER = 'myeongha:privacy-canary-api-login:v1';",
  "const WORKER_DATABASE_PRINCIPAL = 'myeongha_worker_runtime';",
  "const WORKER_EXECUTION_ROLE = 'myeongha_system_executor';",
  "const WORKER_ROLE_MARKER = 'myeongha:production-worker-login-principal:v1';",
  "myeongha_privacy_canary_",
  "randomBytes(32).toString('hex')",
  "create role \${roleIdentifier}",
  "grant \${API_EXECUTION_ROLE} to \${roleIdentifier}",
  "MYEONGHA_DATABASE_PRINCIPAL=\${roleName}",
  "MYEONGHA_DATABASE_URL=\${databaseUrl}",
  "expectedApiDatabasePrincipal()",
  "API_CANARY_ROLE_CLEANUP_GUARD_FAILED",
  "drop role \${roleIdentifier}",
  "requiredEnv('MYEONGHA_DATABASE_URL')",
  "requiredEnv('MYEONGHA_SUPABASE_AUTH_ADMIN_SECRET')",
  "requiredEnv('MYEONGHA_WORKER_DATABASE_URL')",
  'canonicalWorkerDatabaseUrl()',
  "requiredEnv('SUPABASE_PRODUCTION_SESSION_POOLER_HOST')",
  "url.hostname = poolerHost",
  "url.port = '5432'",
  "url.username = qualifiedPrincipal",
  "url.pathname = '/postgres'",
  "url.searchParams.set('sslmode', 'require')",
  "WORKER_DATABASE_URL_SOURCE_PRINCIPAL_INVALID",
  "WORKER_DATABASE_POOLER_HOST_INVALID",
  'MYEONGHA_WORKER_DATABASE_URL: canonicalWorkerDatabaseUrl()',
  'classifyWorkerDatabaseFailure(error)',
  "WORKER_DB_ROUTING_INVALID",
  "WORKER_DB_AUTH_INVALID",
  "WORKER_DB_TRANSPORT_INVALID",
  'readWorkerRoleProvisioning()',
  'assertWorkerRoleProvisioned()',
  'protectedWorkerPassword()',
  'syncWorkerPassword()',
  "requiredEnv('MYEONGHA_WORKER_CREDENTIAL_ACTION')",
  "requiredEnv('MYEONGHA_WORKER_CREDENTIAL_CONFIRMATION')",
  "SYNC_PRODUCTION_WORKER_PASSWORD",
  "WORKER_PASSWORD_SYNC_CONFIRMATION_REQUIRED",
  "WORKER_DATABASE_PASSWORD_INVALID",
  "WORKER_PASSWORD_SYNC_STATE_CHANGED",
  "WORKER_PASSWORD_SYNC_SQL_INVALID",
  "WORKER_PASSWORD_SYNC_VERIFY_FAILED",
  "MYEONGHA_PRODUCTION_PRIVACY_CANARY_WORKER_PASSWORD_SYNC_PASS",
  "MYEONGHA_PRODUCTION_PRIVACY_CANARY_WORKER_PASSWORD_SYNC_SKIP",
  'pg_catalog.pg_has_role($1::name, $2::name, \'MEMBER\')',
  "WORKER_ROLE_MISSING",
  "WORKER_ROLE_SHAPE_INVALID",
  "WORKER_EXECUTION_ROLE_UNAVAILABLE",
  "WORKER_ROLE_PASSWORD_MISSING",
  'createNodePostgresAccountDeletionWorkerPoolV1',
  'MYEONGHA_PRODUCTION_PRIVACY_CANARY_WORKER_DB_PREFLIGHT_PASS',
  "if (mode === 'sync-worker-password') return syncWorkerPassword();",
  "requiredEnv('MYEONGHA_PRIVACY_CANARY_RESUME_RUN_ID')",
  "cal.external_account_fingerprint like $2::text",
  "phase: 'deletion_started'",
  "MYEONGHA_PRODUCTION_PRIVACY_CANARY_RESUME_STATE_RECOVERED",
  "MYEONGHA_PRODUCTION_PRIVACY_CANARY_RESUME_PASS",
  "canaryOperation: state.sourceCanaryRunId === undefined ? 'fresh' : 'resume'",
  'resumedFromCanaryRunId:',
  'await assertApiRuntimePrincipal(client);',
  "phase: 'preparing'",
  "state.phase = 'prepared';",
  "state.phase = 'deletion_started';",
  "state.phase = 'completed';",
  'SET LOCAL ROLE myeongha_api_executor',
  'public.begin_member_subject_context_v1',
  'public.cmd_start_account_deletion_runtime_v1',
  'parseProductionAccountDeletionWorkerDbConfigV1',
  'MYEONGHA_WORKER_DATABASE_PRINCIPAL: WORKER_DATABASE_PRINCIPAL',
  'createProductionAccountDeletionWorkerRuntimeV1',
  "row?.subject_status !== 'deleted'",
  "row?.job_status !== 'completed'",
  "row?.outbox_status !== 'processed'",
  "row?.commerce_status !== 'revoked'",
  'row?.profile_count !== 0',
  'await assertHostedUserAbsent(secret, state.authUserId);',
  "fixtureClass: 'synthetic-disposable-member'",
  "accountDeletionStartAuthority: 'ephemeral-canary-login->myeongha_api_executor/cmd_start_account_deletion_runtime_v1'",
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
  "const API_DATABASE_PRINCIPAL = 'myeongha_runtime';",
  'customer_id',
  'customerId',
  'generic retry',
  'SUPABASE_ACCESS_TOKEN',
  'api.supabase.com/v1/projects',
  'selectHostedAuthCanaryAdminKey',
  'dead-letter',
]) {
  forbidFragment(runtime, fragment, runtimePath);
}

console.log(
  'Production privacy recovery canary workflow verification passed: workflow_dispatch-only, ops attribution, explicit one-time worker-password synchronization, pre-mutation worker DB preflight, fresh-or-resume canary recovery, ephemeral least-privilege API login, dedicated worker, hosted Auth cleanup, governed backup binding, non-zero canonical ledger gate, identifier-free evidence, and DR fail-closed semantics are pinned.',
);
