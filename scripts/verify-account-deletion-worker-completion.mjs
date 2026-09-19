import { readFile } from 'node:fs/promises';

function fail(message) {
  throw new Error('Account deletion worker completion verifier rejected: ' + message);
}

const migration = await readFile(
  'supabase/migrations/1190_account_deletion_worker_completion_authority.sql',
  'utf8',
);

for (const fragment of [
  'internal_account_deletion_resume_state_v1',
  'internal_complete_account_deletion_v1',
  "'db_finalization_required'",
  "'auth_deletion_required'",
  "'completion_ack_required'",
  "'completed'",
  "finalization_policy_version is distinct from 'account-deletion-finalization-v1'",
  "auth_user_id is not null",
  "auth_user_id is null",
  "cmd_complete_outbox_event_v1",
  "event_type = 'ACCOUNT_DELETION_STARTED'",
  "event_schema_version = 'v1'",
  "dedupe_key = 'account-delete-start-v1'",
  'security definer',
  "'anon', 'authenticated', 'service_role', 'myeongha_api_executor'",
]) {
  if (!migration.toLowerCase().includes(fragment.toLowerCase())) {
    fail('migration missing boundary: ' + fragment);
  }
}

if (/grant\s+execute/i.test(migration)) {
  fail('worker resume/completion functions must not receive runtime EXECUTE grants');
}
if (/attempt_count\s*=|dead_letter|last_error_code\s*=|available_at\s*=/i.test(migration)) {
  fail('migration must not invent SRC-30 retry/failure/dead-letter mutations');
}
if (/delete\s+from\s+auth\.users/i.test(migration)) {
  fail('DB completion authority must not perform hosted Auth deletion itself');
}
if (!/update\s+public\.data_deletion_jobs[\s\S]*?status\s*=\s*'completed'[\s\S]*?completed_at\s*=\s*v_now/i.test(migration)) {
  fail('completion command must persist job completion');
}
if (!/v_outbox_lease_expires_at\s*<=\s*v_now/i.test(migration)) {
  fail('completion command must reject expired worker leases');
}

console.log(
  'Account deletion resumable worker completion static contract PASS',
  JSON.stringify({
    phases: [
      'db_finalization_required',
      'auth_deletion_required',
      'completion_ack_required',
      'completed',
    ],
    runtimeExecuteAuthorized: false,
    src30FailurePolicyInvented: false,
  }),
);
