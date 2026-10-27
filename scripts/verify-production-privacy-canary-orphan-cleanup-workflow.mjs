import { readFile } from 'node:fs/promises';

const workflowPath = '.github/workflows/production-privacy-canary-orphan-cleanup-one-shot.yml';
const runtimePath = 'scripts/run-production-privacy-recovery-canary.mjs';
const [workflow, runtime] = await Promise.all([
  readFile(workflowPath, 'utf8'),
  readFile(runtimePath, 'utf8'),
]);

function requireFragment(source, fragment, name) {
  if (!source.includes(fragment)) {
    throw new Error(`${name}: missing required bounded orphan-cleanup guard: ${fragment}`);
  }
}

for (const fragment of [
  'name: Production Privacy Canary Orphan Prestart Cleanup One-Shot',
  'workflow_dispatch:',
  'reviewed_main_sha:',
  'confirmation:',
  'environment: production',
  'cancel-in-progress: false',
  'group: production-privacy-recovery-canary',
  "MYEONGHA_PRIVACY_CANARY_ORPHAN_RUN_ID: '40322743599'",
  'CLEANUP_FAILED_PRIVACY_CANARY_40322743599',
  'ops(privacy): recover failed synthetic canary 40322743599',
  'GITHUB_SHA',
  'git diff --name-only HEAD^ HEAD',
  '0bc93474318f1af29b1fd0adab53c31ecea0d406',
  'and .conclusion == "failure"',
  'MYEONGHA_WORKER_DATABASE_SSL_ROOT_CERT_PEM:',
  'MYEONGHA_SUPABASE_AUTH_ADMIN_SECRET:',
  'SUPABASE_DB_PASSWORD:',
  'SUPABASE_PRODUCTION_SESSION_POOLER_HOST:',
  'node scripts/run-production-privacy-recovery-canary.mjs recover-orphan-prestart',
  'node scripts/run-production-privacy-recovery-canary.mjs cleanup-prestart',
  'node scripts/run-production-privacy-recovery-canary.mjs verify-orphan-prestart-cleanup',
  'production-privacy-canary-orphan-cleanup-one-shot.yml',
  'docs/ci/workflow-responsibility-map.json',
  'scripts/verify-production-privacy-canary-orphan-cleanup-workflow.mjs',
  'Production privacy authoritative recovery/DR status remains HOLD',
]) {
  requireFragment(workflow, fragment, workflowPath);
}

for (const forbidden of [
  '\n  push:',
  '\n  pull_request:',
  '\n  schedule:',
  'cancel-in-progress: true',
  'node scripts/run-production-privacy-recovery-canary.mjs prepare',
  'node scripts/run-production-privacy-recovery-canary.mjs execute',
  'gh workflow run ',
  'supabase db push',
  'NODE_TLS_REJECT_UNAUTHORIZED',
  'rejectUnauthorized: false',
]) {
  if (workflow.includes(forbidden)) {
    throw new Error(`${workflowPath}: forbidden Production cleanup operation ${forbidden}`);
  }
}

for (const fragment of [
  "const ORPHAN_PRESTART_SOURCE_RUN_ID = '40322743599';",
  'async function recoverOrphanPrestartState()',
  'async function verifyOrphanPrestartCleanup()',
  "requiredEnv('MYEONGHA_PRIVACY_CANARY_ORPHAN_RUN_ID')",
  'ORPHAN_SOURCE_RUN_NOT_APPROVED',
  'ORPHAN_PRESTART_NOT_EXACTLY_ONE',
  'ORPHAN_PRESTART_DATABASE_REMAINS',
  'MYEONGHA_PRODUCTION_PRIVACY_CANARY_ORPHAN_PRESTART_RECOVERED',
  'PASS_PRODUCTION_PRIVACY_CANARY_ORPHAN_PRESTART_CLEANUP',
  'join auth.users u on u.id=s.auth_user_id',
  "u.raw_user_meta_data->>'canary_run_id'=$4::text",
  "cal.provider=$1::text",
  "cal.external_account_fingerprint like $2::text",
  'not exists (',
  'from public.data_deletion_jobs dj',
  'from public.chat_credit_lots_v1 lot',
  'from public.chat_credit_turn_allocations_v1 allocation',
  "phase: 'prepared'",
  "state.phase !== 'cleaned'",
  'await assertHostedUserAbsent(resolveAdminSecret(), state.authUserId);',
  "if (mode === 'recover-orphan-prestart') return recoverOrphanPrestartState();",
  "if (mode === 'verify-orphan-prestart-cleanup') return verifyOrphanPrestartCleanup();",
  'CLEANUP_PRESTART_CREDIT_GUARD_FAILED',
  'CLEANUP_PRESTART_CREDIT_ALLOCATION_PRESENT',
  'credits_issued = 50 and credits_remaining = 50',
  'await client.query(\'ROLLBACK\')',
]) {
  requireFragment(runtime, fragment, runtimePath);
}

const recovery = runtime.slice(
  runtime.indexOf('async function recoverOrphanPrestartState()'),
  runtime.indexOf('async function cleanupPrestart()'),
);
for (const forbidden of [
  'createHostedUser(', 'startDeletion(', 'runWorker(', 'supabase migration',
  'drop role ', 'delete from auth.users',
]) {
  if (recovery.includes(forbidden)) {
    throw new Error(`${runtimePath}: orphan recovery may not create or mutate unrelated authority`);
  }
}

console.log('PASS_PRODUCTION_PRIVACY_CANARY_ORPHAN_ONE_SHOT_SOURCE_GUARDS');
