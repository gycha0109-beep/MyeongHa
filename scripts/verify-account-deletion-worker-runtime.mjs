import { readFile } from 'node:fs/promises';

function fail(message) {
  throw new Error('Account deletion worker runtime verifier rejected: ' + message);
}

const config = await readFile(
  'apps/api/src/production-account-deletion-worker-db-config.ts',
  'utf8',
);
const runtime = await readFile(
  'apps/api/src/production-account-deletion-worker-runtime.ts',
  'utf8',
);
const postgres = await readFile(
  'apps/api/src/postgres-account-deletion-worker.ts',
  'utf8',
);
const migration = await readFile(
  'supabase/migrations/1210_account_deletion_worker_processed_replay.sql',
  'utf8',
);

for (const fragment of [
  'MYEONGHA_WORKER_DATABASE_URL',
  'MYEONGHA_WORKER_DATABASE_PRINCIPAL',
  'myeongha_worker_runtime',
  'myeongha_system_executor',
]) {
  if (!config.includes(fragment)) fail('worker DB config missing ' + fragment);
}

for (const fragment of [
  'publicRoute: null',
  'routeMounted: false',
  'ownsBatchDiscovery: false',
  'ownsRetryPolicy: false',
  'claimCommitsBeforeProviderIo: true',
  'runClaimedAccountDeletionWorkerV1',
]) {
  if (!runtime.includes(fragment)) fail('runtime boundary missing ' + fragment);
}

for (const fragment of [
  'SET LOCAL ROLE',
  'internal_claim_account_deletion_outbox_v1',
  'internal_account_deletion_resume_state_v1',
  'internal_finalize_account_deletion_db_v1',
  'internal_complete_account_deletion_v1',
]) {
  if (!postgres.includes(fragment)) fail('PostgreSQL adapter missing ' + fragment);
}

for (const fragment of [
  "v_event.status = 'processed'",
  'v_event.lock_owner is distinct from v_owner',
  'Read-only replay',
  "event_type is distinct from 'ACCOUNT_DELETION_STARTED'",
]) {
  if (!migration.includes(fragment)) fail('processed replay boundary missing ' + fragment);
}

if (/setInterval|while\s*\(\s*true\s*\)|dead_letter|attempt_count\s*=|last_error_code\s*=/u.test(runtime + postgres + migration)) {
  fail('runtime must not invent polling/retry/dead-letter policy');
}

console.log(
  'Account deletion worker concrete runtime static contract PASS',
  JSON.stringify({
    publicRoute: false,
    batchDiscovery: false,
    retryPolicy: false,
    processedReplay: 'same-owner-read-only',
  }),
);
