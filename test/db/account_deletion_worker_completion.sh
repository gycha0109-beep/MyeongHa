#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -v ON_ERROR_STOP=1)
fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }

expect_fail() {
  local label="$1" needle="$2" sql="$3" out rc
  set +e
  out=$("${psql_base[@]}" -c "$sql" 2>&1)
  rc=$?
  set -e
  [[ $rc -ne 0 ]] || { echo "$out" >&2; fail "$label unexpectedly succeeded"; }
  [[ "$out" == *"$needle"* ]] || { echo "$out" >&2; fail "$label failed for unexpected reason"; }
  pass "$label -> $needle"
}

subject_id="fc200000-0000-0000-0000-000000000001"
auth_id="fc100000-0000-0000-0000-000000000001"
job_id="fc800000-0000-0000-0000-000000000001"
outbox_id="fc810000-0000-0000-0000-000000000001"
lock_owner="account-deletion-worker-completion-test"

"${psql_base[@]}" <<SQL
insert into auth.users(id) values ('$auth_id');
insert into public.subjects(
  id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at
) values (
  '$subject_id','member','$auth_id','deletion_pending',null,clock_timestamp(),clock_timestamp()
);
insert into public.data_deletion_jobs(
  id,subject_id,scope,target_resource_type,target_resource_id,request_dedupe_key,
  status,retention_exceptions_jsonb,requested_at,started_at,completed_at,error_code
) values (
  '$job_id','$subject_id','account',null,null,'resume-test','running',null,
  clock_timestamp(),clock_timestamp(),null,null
);
insert into public.outbox_events(
  id,aggregate_type,aggregate_id,event_type,event_schema_version,dedupe_key,
  payload_jsonb,status,locked_at,lock_owner,lease_expires_at,attempt_count,
  available_at,processed_at,last_error_code,dead_lettered_at,created_at
) values (
  '$outbox_id','data_deletion_job','$job_id','ACCOUNT_DELETION_STARTED','v1',
  'account-delete-start-v1',
  jsonb_build_object('deletionJobId','$job_id'::uuid,'subjectId','$subject_id'::uuid,'scope','account'),
  'processing',clock_timestamp(),'$lock_owner',clock_timestamp()+interval '10 minutes',0,
  clock_timestamp(),null,null,null,clock_timestamp()
);
SQL

phase="$("${psql_base[@]}" -At -F '|' -c "select phase,auth_user_id::text,outbox_status from public.internal_account_deletion_resume_state_v1('$subject_id','$job_id','$lock_owner');")"
[[ "$phase" == "db_finalization_required|$auth_id|processing" ]] || fail "initial resume phase mismatch: $phase"
pass "pre-finalizer crash resumes at DB finalization with durable Auth target"

expect_fail   "foreign worker cannot inspect privileged resume state"   "current unexpired worker lease"   "select * from public.internal_account_deletion_resume_state_v1('$subject_id','$job_id','foreign-worker');"

finalized="$("${psql_base[@]}" -At -F '|' -c "select finalized,replayed,auth_mapping_present from public.internal_finalize_account_deletion_db_v1('$subject_id','$job_id','$lock_owner');")"
[[ "$finalized" == "t|f|t" ]] || fail "DB finalizer mismatch: $finalized"

phase="$("${psql_base[@]}" -At -F '|' -c "select phase,auth_user_id::text,outbox_status from public.internal_account_deletion_resume_state_v1('$subject_id','$job_id','$lock_owner');")"
[[ "$phase" == "auth_deletion_required|$auth_id|processing" ]] || fail "post-finalizer resume phase mismatch: $phase"
pass "post-finalizer crash resumes at hosted Auth deletion"

# Hosted Supabase Auth deletion is represented by deleting the auth.users row.
# The governed FK must set the retained Subject auth mapping to NULL.
"${psql_base[@]}" -c "delete from auth.users where id='$auth_id';" >/dev/null
auth_mapping="$("${psql_base[@]}" -Atc "select coalesce(auth_user_id::text,'NULL') from public.subjects where id='$subject_id';")"
[[ "$auth_mapping" == "NULL" ]] || fail "hosted Auth delete did not clear Subject mapping"

phase="$("${psql_base[@]}" -At -F '|' -c "select phase,coalesce(auth_user_id::text,'NULL'),outbox_status from public.internal_account_deletion_resume_state_v1('$subject_id','$job_id','$lock_owner');")"
[[ "$phase" == "completion_ack_required|NULL|processing" ]] || fail "post-Auth resume phase mismatch: $phase"
pass "post-Auth crash resumes at completion ACK"

expect_fail   "foreign worker cannot complete account deletion"   "current unexpired worker lease"   "select * from public.internal_complete_account_deletion_v1('$subject_id','$job_id','foreign-worker');"

"${psql_base[@]}" -c "update public.outbox_events set lease_expires_at=clock_timestamp()-interval '1 second' where id='$outbox_id';" >/dev/null
expect_fail   "expired worker cannot complete account deletion"   "current unexpired worker lease"   "select * from public.internal_complete_account_deletion_v1('$subject_id','$job_id','$lock_owner');"

reclaimed="$("${psql_base[@]}" -At -F '|' -c "select status,lock_owner,reclaimed from public.cmd_claim_outbox_event_v1('$outbox_id','$lock_owner',clock_timestamp()+interval '10 minutes');")"
[[ "$reclaimed" == "processing|$lock_owner|t" ]] || fail "expired account deletion lease was not reclaimable: $reclaimed"
pass "expired account deletion lease remains reclaimable without invented failure transition"

# Prove completion atomicity: force the job update to fail after outbox completion was attempted.
"${psql_base[@]}" <<'SQL'
create or replace function public._account_deletion_completion_blocker()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'completed' then
    raise exception 'synthetic completion blocker';
  end if;
  return new;
end;
$$;
create trigger _account_deletion_completion_blocker
before update on public.data_deletion_jobs
for each row execute function public._account_deletion_completion_blocker();
SQL

expect_fail   "completion ACK rollback is atomic"   "synthetic completion blocker"   "select * from public.internal_complete_account_deletion_v1('$subject_id','$job_id','$lock_owner');"

atomic_state="$("${psql_base[@]}" -At -F '|' -c "select dj.status,coalesce(dj.completed_at::text,'NULL'),oe.status,coalesce(oe.processed_at::text,'NULL') from public.data_deletion_jobs dj join public.outbox_events oe on oe.id='$outbox_id' where dj.id='$job_id';")"
[[ "$atomic_state" == "running|NULL|processing|NULL" ]] || fail "completion rollback split job/outbox state: $atomic_state"
pass "job completion and outbox success completion roll back together"

"${psql_base[@]}" -c "drop trigger _account_deletion_completion_blocker on public.data_deletion_jobs; drop function public._account_deletion_completion_blocker();" >/dev/null

completed="$("${psql_base[@]}" -At -F '|' -c "select completed,replayed,(completed_at is not null)::int from public.internal_complete_account_deletion_v1('$subject_id','$job_id','$lock_owner');")"
[[ "$completed" == "t|f|1" ]] || fail "completion result mismatch: $completed"

state="$("${psql_base[@]}" -At -F '|' -c "select dj.status,(dj.completed_at is not null)::int,oe.status,(oe.processed_at is not null)::int,oe.lock_owner from public.data_deletion_jobs dj join public.outbox_events oe on oe.id='$outbox_id' where dj.id='$job_id';")"
[[ "$state" == "completed|1|processed|1|$lock_owner" ]] || fail "completion state mismatch: $state"
pass "job completion and outbox processed state commit atomically"

completed_at_before="$("${psql_base[@]}" -Atc "select completed_at::text from public.data_deletion_jobs where id='$job_id';")"
processed_at_before="$("${psql_base[@]}" -Atc "select processed_at::text from public.outbox_events where id='$outbox_id';")"

replay="$("${psql_base[@]}" -At -F '|' -c "select completed,replayed,(completed_at is not null)::int from public.internal_complete_account_deletion_v1('$subject_id','$job_id','$lock_owner');")"
[[ "$replay" == "t|t|1" ]] || fail "completion replay mismatch: $replay"

completed_at_after="$("${psql_base[@]}" -Atc "select completed_at::text from public.data_deletion_jobs where id='$job_id';")"
processed_at_after="$("${psql_base[@]}" -Atc "select processed_at::text from public.outbox_events where id='$outbox_id';")"
[[ "$completed_at_before" == "$completed_at_after" ]] || fail "completion replay rewrote completed_at"
[[ "$processed_at_before" == "$processed_at_after" ]] || fail "completion replay rewrote processed_at"

phase="$("${psql_base[@]}" -At -F '|' -c "select phase,coalesce(auth_user_id::text,'NULL'),outbox_status from public.internal_account_deletion_resume_state_v1('$subject_id','$job_id','$lock_owner');")"
[[ "$phase" == "completed|NULL|processed" ]] || fail "completed resume phase mismatch: $phase"
pass "completion response-loss replay is read-only and converges to completed phase"

expect_fail   "different worker cannot replay completed account deletion"   "completion replay state is inconsistent"   "select * from public.internal_complete_account_deletion_v1('$subject_id','$job_id','other-worker');"

for signature in   "public.internal_account_deletion_resume_state_v1(uuid,uuid,text)"   "public.internal_complete_account_deletion_v1(uuid,uuid,text)"; do
  public_exec="$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','$signature','EXECUTE') then '1' else '0' end;")"
  api_exec="$("${psql_base[@]}" -Atc "select case when has_function_privilege('myeongha_api_executor','$signature','EXECUTE') then '1' else '0' end;")"
  anon_exec="$("${psql_base[@]}" -Atc "select case when has_function_privilege('anon','$signature','EXECUTE') then '1' else '0' end;")"
  auth_exec="$("${psql_base[@]}" -Atc "select case when has_function_privilege('authenticated','$signature','EXECUTE') then '1' else '0' end;")"
  service_exec="$("${psql_base[@]}" -Atc "select case when has_function_privilege('service_role','$signature','EXECUTE') then '1' else '0' end;")"
  [[ "$public_exec|$api_exec|$anon_exec|$auth_exec|$service_exec" == "0|0|0|0|0" ]] || fail "worker completion authority leaked for $signature: $public_exec|$api_exec|$anon_exec|$auth_exec|$service_exec"
done
pass "resume/completion authority remains closed to all runtime API roles"

echo "Account deletion resumable worker completion authority PASS"
