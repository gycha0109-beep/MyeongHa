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

role_shape="$("${psql_base[@]}" -At -F '|' -c "
select rolname,rolcanlogin::int,rolsuper::int,rolcreatedb::int,rolcreaterole::int,rolinherit::int,rolreplication::int,rolbypassrls::int,
       coalesce(pg_catalog.shobj_description(oid,'pg_authid'),'')
from pg_catalog.pg_roles
where rolname in ('myeongha_system_executor','myeongha_worker_runtime')
order by rolname;")"
expected_role_shape=$'myeongha_system_executor|0|0|0|0|0|0|0|myeongha:system-execution-role:v1\nmyeongha_worker_runtime|1|0|0|0|0|0|0|myeongha:production-worker-login-principal:v1'
[[ "$role_shape" == "$expected_role_shape" ]] || fail "worker role shape mismatch: $role_shape"

membership="$("${psql_base[@]}" -At -F '|' -c "
select
  pg_catalog.pg_has_role('myeongha_worker_runtime','myeongha_system_executor','MEMBER')::int,
  pg_catalog.pg_has_role('myeongha_runtime','myeongha_system_executor','MEMBER')::int,
  pg_catalog.pg_has_role('myeongha_api_executor','myeongha_system_executor','MEMBER')::int,
  pg_catalog.pg_has_role('myeongha_system_executor','myeongha_api_executor','MEMBER')::int;")"
[[ "$membership" == "1|0|0|0" ]] || fail "worker role membership mismatch: $membership"
pass "P0-AUTH-01 worker identity is separate from ordinary API execution"

subject_id="fd200000-0000-0000-0000-000000000001"
auth_id="fd100000-0000-0000-0000-000000000001"
job_id="fd800000-0000-0000-0000-000000000001"
outbox_id="fd810000-0000-0000-0000-000000000001"
wrong_outbox_id="fd810000-0000-0000-0000-000000000002"
lock_owner="account-deletion-system-role-test"

"${psql_base[@]}" <<SQL
insert into auth.users(id) values ('$auth_id');
insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at)
values ('$subject_id','member','$auth_id','deletion_pending',null,clock_timestamp(),clock_timestamp());
insert into public.data_deletion_jobs(
  id,subject_id,scope,target_resource_type,target_resource_id,request_dedupe_key,
  status,retention_exceptions_jsonb,requested_at,started_at,completed_at,error_code
) values (
  '$job_id','$subject_id','account',null,null,'worker-role-test','running',null,
  clock_timestamp(),clock_timestamp(),null,null
);
insert into public.outbox_events(
  id,aggregate_type,aggregate_id,event_type,event_schema_version,dedupe_key,payload_jsonb,
  status,attempt_count,available_at,created_at
) values
(
  '$outbox_id','data_deletion_job','$job_id','ACCOUNT_DELETION_STARTED','v1',
  'account-delete-start-v1',
  jsonb_build_object('deletionJobId','$job_id'::uuid,'subjectId','$subject_id'::uuid,'scope','account'),
  'pending',0,clock_timestamp(),clock_timestamp()
),
(
  '$wrong_outbox_id','data_deletion_job','$job_id','WRONG_EVENT','v1',
  'account-delete-start-v1',
  jsonb_build_object('deletionJobId','$job_id'::uuid,'subjectId','$subject_id'::uuid,'scope','account'),
  'pending',0,clock_timestamp(),clock_timestamp()
);
SQL

generic_exec="$("${psql_base[@]}" -Atc "select has_function_privilege('myeongha_system_executor','public.cmd_claim_outbox_event_v1(uuid,text,timestamptz)','EXECUTE')::int;")"
[[ "$generic_exec" == "0" ]] || fail "system executor gained generic outbox claim authority"

table_privs="$("${psql_base[@]}" -At -F '|' -c "
select
  has_table_privilege('myeongha_system_executor','public.outbox_events','SELECT')::int,
  has_table_privilege('myeongha_system_executor','public.outbox_events','UPDATE')::int,
  has_table_privilege('myeongha_system_executor','public.data_deletion_jobs','UPDATE')::int,
  has_table_privilege('myeongha_system_executor','public.subjects','UPDATE')::int;")"
[[ "$table_privs" == "0|0|0|0" ]] || fail "system executor gained direct table CRUD: $table_privs"
pass "system executor has no generic outbox claim or direct lifecycle table CRUD"

worker_grants="$("${psql_base[@]}" -At -F '|' -c "
select
  has_function_privilege('myeongha_system_executor','public.internal_claim_account_deletion_outbox_v1(uuid,text,timestamptz)','EXECUTE')::int,
  has_function_privilege('myeongha_system_executor','public.internal_account_deletion_resume_state_v1(uuid,uuid,text)','EXECUTE')::int,
  has_function_privilege('myeongha_system_executor','public.internal_finalize_account_deletion_db_v1(uuid,uuid,text)','EXECUTE')::int,
  has_function_privilege('myeongha_system_executor','public.internal_complete_account_deletion_v1(uuid,uuid,text)','EXECUTE')::int;")"
[[ "$worker_grants" == "1|1|1|1" ]] || fail "worker lifecycle grants mismatch: $worker_grants"

ordinary_grants="$("${psql_base[@]}" -At -F '|' -c "
select
  has_function_privilege('myeongha_api_executor','public.internal_claim_account_deletion_outbox_v1(uuid,text,timestamptz)','EXECUTE')::int,
  has_function_privilege('myeongha_runtime','public.internal_claim_account_deletion_outbox_v1(uuid,text,timestamptz)','EXECUTE')::int,
  has_function_privilege('anon','public.internal_claim_account_deletion_outbox_v1(uuid,text,timestamptz)','EXECUTE')::int,
  has_function_privilege('authenticated','public.internal_claim_account_deletion_outbox_v1(uuid,text,timestamptz)','EXECUTE')::int,
  has_function_privilege('service_role','public.internal_claim_account_deletion_outbox_v1(uuid,text,timestamptz)','EXECUTE')::int;")"
[[ "$ordinary_grants" == "0|0|0|0|0" ]] || fail "worker-only claim leaked: $ordinary_grants"
pass "worker-only lifecycle functions are isolated from ordinary/API/platform roles"

claim="$("${psql_base[@]}" -At -F '|' -c "
set role myeongha_system_executor;
select outbox_event_id,subject_id,deletion_job_id,reclaimed::int
from public.internal_claim_account_deletion_outbox_v1(
  '$outbox_id','$lock_owner',clock_timestamp()+interval '10 minutes'
);
reset role;")"
claim="$(printf '%s\n' "$claim" | grep -E '^[0-9a-f-]+\|' | tail -n1)"
[[ "$claim" == "$outbox_id|$subject_id|$job_id|0" ]] || fail "account deletion claim wrapper mismatch: $claim"

phase="$("${psql_base[@]}" -At -F '|' -c "
set role myeongha_system_executor;
select phase,auth_user_id::text
from public.internal_account_deletion_resume_state_v1('$subject_id','$job_id','$lock_owner');
reset role;")"
phase="$(printf '%s\n' "$phase" | grep -E '^[a-z_]+\|' | tail -n1)"
[[ "$phase" == "db_finalization_required|$auth_id" ]] || fail "system executor resume authority mismatch: $phase"
pass "system executor can claim and read only the account-deletion lifecycle boundary"

expect_fail   "wrong event contract claim rolls back"   "exact ACCOUNT_DELETION_STARTED event contract"   "set role myeongha_system_executor; select * from public.internal_claim_account_deletion_outbox_v1('$wrong_outbox_id','$lock_owner',clock_timestamp()+interval '10 minutes');"

wrong_state="$("${psql_base[@]}" -At -F '|' -c "select status,coalesce(lock_owner,'NULL'),case when lease_expires_at is null then 'NULL' else 'LEASE' end from public.outbox_events where id='$wrong_outbox_id';")"
[[ "$wrong_state" == "pending|NULL|NULL" ]] || fail "wrong-event claim mutation did not roll back: $wrong_state"
pass "event-specific wrapper rolls back generic claim on contract mismatch"

echo "Account deletion worker execution identity authority PASS"
