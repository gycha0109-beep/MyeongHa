import { readFile } from 'node:fs/promises';

function fail(message) {
  throw new Error('Account deletion worker execution identity verifier rejected: ' + message);
}

const migration = await readFile(
  'supabase/migrations/1200_account_deletion_worker_execution_identity.sql',
  'utf8',
);

for (const fragment of [
  'create role myeongha_system_executor',
  'create role myeongha_worker_runtime',
  'myeongha:system-execution-role:v1',
  'myeongha:production-worker-login-principal:v1',
  'grant myeongha_system_executor to myeongha_worker_runtime',
  'internal_claim_account_deletion_outbox_v1',
  "event_type is distinct from 'ACCOUNT_DELETION_STARTED'",
  "event_schema_version is distinct from 'v1'",
  "dedupe_key is distinct from 'account-delete-start-v1'",
  "v_claim.payload_jsonb ->> 'scope' is distinct from 'account'",
  'security definer',
  'grant execute on function public.internal_account_deletion_resume_state_v1',
  'grant execute on function public.internal_finalize_account_deletion_db_v1',
  'grant execute on function public.internal_complete_account_deletion_v1',
  'to myeongha_system_executor',
]) {
  if (!migration.toLowerCase().includes(fragment.toLowerCase())) {
    fail('migration missing boundary: ' + fragment);
  }
}

if (/grant\s+(?:select|insert|update|delete|truncate|references|trigger)\s+on\s+public\./i.test(migration)) {
  fail('system worker identity must not receive direct public table CRUD grants');
}
if (/grant\s+execute\s+on\s+function\s+public\.cmd_claim_outbox_event_v1[\s\S]*?to\s+myeongha_system_executor/i.test(migration)) {
  fail('system worker identity must not receive generic outbox claim EXECUTE');
}
if (/password\s+'[^']+'/i.test(migration)) {
  fail('runtime worker credential material must not be committed in migration');
}

console.log(
  'Account deletion worker execution identity static contract PASS',
  JSON.stringify({
    systemRole: 'myeongha_system_executor',
    loginPrincipal: 'myeongha_worker_runtime',
    directTableCrud: false,
    genericOutboxClaim: false,
  }),
);
