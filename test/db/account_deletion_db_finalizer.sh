#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -v ON_ERROR_STOP=1)
fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }

subject_id="fb200000-0000-0000-0000-000000000001"
auth_id="fb100000-0000-0000-0000-000000000001"
job_id="fb800000-0000-0000-0000-000000000001"
outbox_id="fb810000-0000-0000-0000-000000000001"
lock_owner="account-deletion-finalizer-test"
guest_subject_id="fb200000-0000-0000-0000-000000000002"
guest_session_id="fb210000-0000-0000-0000-000000000002"
merge_job_id="fb220000-0000-0000-0000-000000000002"
merge_action_id="fb230000-0000-0000-0000-000000000002"
profile_id="fb300000-0000-0000-0000-000000000001"
revision_id="fb310000-0000-0000-0000-000000000001"
attacker_revision_id="fb310000-0000-0000-0000-000000000002"
reading_session_id="fb500000-0000-0000-0000-000000000001"
reading_id="fb510000-0000-0000-0000-000000000001"
execution_id="fb520000-0000-0000-0000-000000000001"
commerce_link_id="fb600000-0000-0000-0000-000000000001"

"${psql_base[@]}" <<SQL
insert into auth.users(id) values ('$auth_id');
insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('$subject_id','member','$auth_id','active',null,clock_timestamp(),clock_timestamp()),
  ('$guest_subject_id','guest',null,'active',null,clock_timestamp(),clock_timestamp());
insert into public.profiles(subject_id,display_name,locale,timezone,onboarding_state,created_at,updated_at)
values ('$subject_id','PII','ko','Asia/Seoul','done',clock_timestamp(),clock_timestamp());
insert into public.guest_sessions(id,subject_id,token_hash,expires_at,consumed_at,claimed_by_subject_id,created_at)
values ('$guest_session_id','$guest_subject_id','sha256:guest-finalizer',clock_timestamp()+interval '1 day',clock_timestamp(),'$subject_id',clock_timestamp()-interval '1 second');
insert into public.subject_merge_jobs(id,guest_subject_id,member_subject_id,guest_session_id,policy_version,status,conflicts_jsonb,resolution_jsonb,idempotency_key,created_at,completed_at)
values ('$merge_job_id','$guest_subject_id','$subject_id','$guest_session_id','test','completed','{"pii":"secret"}'::jsonb,'{"pii":"secret"}'::jsonb,'secret-dedupe',clock_timestamp(),clock_timestamp());
insert into public.subject_merge_actions(id,merge_job_id,action_dedupe_key,domain_key,resource_type,source_resource_id,action_type,target_resource_id,status,created_at,completed_at)
values ('$merge_action_id','$merge_job_id','secret-action','memory','memory_item','secret-source','import_new','secret-target','applied',clock_timestamp(),clock_timestamp());
insert into public.birth_profiles(id,subject_id,profile_kind,label,current_revision_id,archived_at,created_at,updated_at)
values ('$profile_id','$subject_id','self','PII BIRTH',null,null,clock_timestamp(),clock_timestamp());
insert into public.birth_profile_revisions(id,birth_profile_id,subject_id,revision_no,calendar_type,birth_date,birth_time,time_known,is_leap_month,sex,input_hash,created_at)
values ('$revision_id','$profile_id','$subject_id',1,'solar','1990-01-01','12:00',true,false,'male','sha256:birth-finalizer',clock_timestamp());
insert into public.birth_profile_revisions(id,birth_profile_id,subject_id,revision_no,calendar_type,birth_date,birth_time,time_known,is_leap_month,sex,input_hash,created_at)
values ('$attacker_revision_id','$profile_id','$subject_id',2,'solar','1990-01-01','12:00',true,false,'male','sha256:birth-finalizer-attacker',clock_timestamp());
update public.birth_profiles set current_revision_id='$revision_id' where id='$profile_id';
insert into public.saju_domain_runtime(saju_domain,availability,capability_version,required_engine_version,updated_at)
values ('general','available','test-v1',null,clock_timestamp())
on conflict (saju_domain) do update
set availability=excluded.availability,
    capability_version=excluded.capability_version,
    required_engine_version=excluded.required_engine_version,
    updated_at=excluded.updated_at;
insert into public.reading_sessions(id,subject_id,saju_domain,domain_capability_version,source_birth_revision_id,target_birth_revision_id,state,next_attempt_no,current_reading_id,created_at,updated_at)
values ('$reading_session_id','$subject_id','general','test-v1','$revision_id',null,'active',2,null,clock_timestamp(),clock_timestamp());
insert into public.readings(id,reading_session_id,subject_id,saju_domain,attempt_no,parent_reading_id,source_turn_id,requested_thread_character_id,requested_character_id,requested_character_content_bundle_id,execution_status,request_idempotency_key,request_hash,request_contract_version,request_snapshot_jsonb,next_execution_attempt_no,committed_execution_attempt_id,created_at,completed_at)
values ('$reading_id','$reading_session_id','$subject_id','general',1,null,null,null,null,null,'pending','finalizer-reading','sha256:reading','reading-request-v1','{}'::jsonb,2,null,clock_timestamp(),null);
insert into public.reading_execution_attempts(id,reading_id,subject_id,execution_attempt_no,state,transport_key,saju_engine_key,requested_engine_version,resolved_engine_version,external_request_ref,started_at,finished_at,error_code)
values ('$execution_id','$reading_id','$subject_id',1,'running','test','saju-public','v1',null,'secret-ref',clock_timestamp(),null,null);
update public.readings set committed_execution_attempt_id='$execution_id' where id='$reading_id';
update public.reading_sessions set current_reading_id='$reading_id' where id='$reading_session_id';
insert into public.commerce_account_links(id,subject_id,provider,external_account_fingerprint,status,verified_at,revoked_at,created_at)
values ('$commerce_link_id','$subject_id','test-provider','sha256:retain','active',clock_timestamp(),null,clock_timestamp());
SQL

if "${psql_base[@]}" -c "delete from public.birth_profile_revisions where id='$revision_id';" >/dev/null 2>&1; then fail "birth revision delete escaped immutable guard"; fi
if "${psql_base[@]}" -c "delete from public.reading_execution_attempts where id='$execution_id';" >/dev/null 2>&1; then fail "reading execution delete escaped immutable guard"; fi
pass "ordinary immutable DELETEs remain rejected"

# A custom GUC is caller-controlled. Prove that possessing direct DELETE on an immutable
# table plus setting the finalizer GUC cannot activate the exception outside the
# SECURITY DEFINER finalizer owner context.
"${psql_base[@]}" <<SQL
create role finalizer_guc_attacker nologin;
grant usage on schema public to finalizer_guc_attacker;
grant select on public.birth_profile_revisions to finalizer_guc_attacker;
grant delete on public.birth_profile_revisions to finalizer_guc_attacker;
SQL
guc_attack_log="$(mktemp)"
set +e
"${psql_base[@]}" -c "set role finalizer_guc_attacker; select pg_catalog.set_config('myeongha.account_deletion_finalizer_subject_id','$subject_id',true); delete from public.birth_profile_revisions where id='$attacker_revision_id';" >/dev/null 2>"$guc_attack_log"
guc_attack_rc=$?
set -e
grep -q 'birth profile revisions are append-only' "$guc_attack_log" || {
  cat "$guc_attack_log" >&2
  rm -f "$guc_attack_log"
  fail "forged GUC was rejected for the wrong reason"
}
rm -f "$guc_attack_log"
"${psql_base[@]}" <<SQL
revoke delete on public.birth_profile_revisions from finalizer_guc_attacker;
revoke select on public.birth_profile_revisions from finalizer_guc_attacker;
revoke usage on schema public from finalizer_guc_attacker;
drop role finalizer_guc_attacker;
SQL
[[ "$guc_attack_rc" -ne 0 ]] || fail "caller-controlled finalizer GUC bypassed immutable DELETE guard"
attacker_revision_count="$("${psql_base[@]}" -Atc "select count(*) from public.birth_profile_revisions where id='$attacker_revision_id';")"
[[ "$attacker_revision_count" == "1" ]] || fail "GUC attacker deleted immutable revision"
pass "caller-controlled finalizer GUC cannot bypass immutable guards"

"${psql_base[@]}" <<SQL
select * from public.cmd_start_account_deletion_v1('$subject_id','$job_id','finalizer-start','$outbox_id');
update public.outbox_events set status='processing',locked_at=clock_timestamp(),lock_owner='$lock_owner',lease_expires_at=clock_timestamp()+interval '10 minutes' where id='$outbox_id';
SQL

if "${psql_base[@]}" -c "select * from public.internal_finalize_account_deletion_db_v1('$subject_id','$job_id','wrong-worker');" >/dev/null 2>&1; then fail "foreign worker finalized"; fi
pass "exact outbox worker ownership enforced"

"${psql_base[@]}" <<SQL
create table public._finalizer_blocker(subject_id uuid primary key references public.profiles(subject_id));
insert into public._finalizer_blocker values ('$subject_id');
SQL
set +e
"${psql_base[@]}" -c "select * from public.internal_finalize_account_deletion_db_v1('$subject_id','$job_id','$lock_owner');" >/dev/null 2>&1
blocker_rc=$?
set -e
[[ "$blocker_rc" -ne 0 ]] || fail "late FK blocker did not abort"
rollback_state="$("${psql_base[@]}" -Atc "select s.status||'|'||(select count(*) from public.readings where subject_id='$subject_id')||'|'||coalesce(dj.finalization_policy_version,'NULL') from public.subjects s join public.data_deletion_jobs dj on dj.id='$job_id' where s.id='$subject_id';")"
[[ "$rollback_state" == "deletion_pending|1|NULL" ]] || fail "rollback mismatch: $rollback_state"
pass "mid-finalization failure rolled back atomically"
"${psql_base[@]}" -c "drop table public._finalizer_blocker;"

result="$("${psql_base[@]}" -Atc "select (finalized::int)||'|'||(replayed::int)||'|'||(auth_mapping_present::int) from public.internal_finalize_account_deletion_db_v1('$subject_id','$job_id','$lock_owner');")"
[[ "$result" == "1|0|1" ]] || fail "finalizer result mismatch: $result"

deleted="$("${psql_base[@]}" -Atc "select (select count(*) from public.profiles where subject_id='$subject_id')||'|'||(select count(*) from public.birth_profile_revisions where subject_id='$subject_id')||'|'||(select count(*) from public.readings where subject_id='$subject_id')||'|'||(select count(*) from public.reading_execution_attempts where subject_id='$subject_id')||'|'||(select count(*) from public.guest_sessions where claimed_by_subject_id='$subject_id');")"
[[ "$deleted" == "0|0|0|0|0" ]] || fail "DELETE representatives remain: $deleted"

retain="$("${psql_base[@]}" -Atc "select count(*)||'|'||status||'|'||case when revoked_at is null then 'NO' else 'YES' end from public.commerce_account_links where id='$commerce_link_id' group by status,revoked_at;")"
[[ "$retain" == "1|revoked|YES" ]] || fail "Commerce RETAIN/revocation mismatch: $retain"

subject_state="$("${psql_base[@]}" -Atc "select status||'|'||case when auth_user_id='$auth_id' then 'AUTH' else 'NOAUTH' end from public.subjects where id='$subject_id';")"
[[ "$subject_state" == "deleted|AUTH" ]] || fail "Subject tombstone mismatch: $subject_state"

job_state="$("${psql_base[@]}" -Atc "select status||'|'||finalization_policy_version||'|'||case when db_finalized_at is null then 'NO' else 'YES' end from public.data_deletion_jobs where id='$job_id';")"
[[ "$job_state" == "running|account-deletion-finalization-v1|YES" ]] || fail "job marker mismatch: $job_state"

merge_state="$("${psql_base[@]}" -Atc "select case when guest_session_id is null then 'DETACHED' else 'ATTACHED' end||'|'||conflicts_jsonb::text||'|'||coalesce(resolution_jsonb::text,'NULL')||'|'||idempotency_key from public.subject_merge_jobs where id='$merge_job_id';")"
[[ "$merge_state" == "DETACHED|{}|NULL|anonymized:$merge_job_id" ]] || fail "merge job anonymization mismatch: $merge_state"

action_state="$("${psql_base[@]}" -Atc "select action_dedupe_key||'|'||source_resource_id||'|'||coalesce(target_resource_id,'NULL') from public.subject_merge_actions where id='$merge_action_id';")"
[[ "$action_state" == "anonymized:$merge_action_id|anonymized|anonymized" ]] || fail "merge action anonymization mismatch: $action_state"

auth_exists="$("${psql_base[@]}" -Atc "select count(*) from auth.users where id='$auth_id';")"
[[ "$auth_exists" == "1" ]] || fail "hosted Auth row was deleted by DB finalizer"

replay="$("${psql_base[@]}" -Atc "select (finalized::int)||'|'||(replayed::int)||'|'||(auth_mapping_present::int) from public.internal_finalize_account_deletion_db_v1('$subject_id','$job_id','$lock_owner');")"
[[ "$replay" == "1|1|1" ]] || fail "idempotent replay mismatch: $replay"

public_exec="$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.internal_finalize_account_deletion_db_v1(uuid,uuid,text)','EXECUTE') then '1' else '0' end;")"
api_exec="$("${psql_base[@]}" -Atc "select case when has_function_privilege('myeongha_api_executor','public.internal_finalize_account_deletion_db_v1(uuid,uuid,text)','EXECUTE') then '1' else '0' end;")"
[[ "$public_exec|$api_exec" == "0|0" ]] || fail "destructive runtime authority leaked: $public_exec|$api_exec"

pass "DELETE/ANONYMIZE/RETAIN boundary, rollback, replay, and closed runtime authority verified"
echo "Account deletion DB finalizer PASS"
