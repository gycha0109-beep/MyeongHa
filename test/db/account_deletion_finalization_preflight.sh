#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -v ON_ERROR_STOP=1)
fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }

subject_id="f9200000-0000-0000-0000-000000000001"
auth_id="f9100000-0000-0000-0000-000000000001"
job_id="f9800000-0000-0000-0000-000000000001"
start_outbox_id="f9810000-0000-0000-0000-000000000001"
other_job_id="f9800000-0000-0000-0000-000000000002"
other_outbox_id="f9810000-0000-0000-0000-000000000002"
payload_outbox_id="f9810000-0000-0000-0000-000000000003"
lock_owner="finalization-preflight-test"

"${psql_base[@]}" <<SQL
insert into auth.users(id) values ('$auth_id') on conflict do nothing;

insert into public.subjects(
  id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at
) values (
  '$subject_id','member','$auth_id','active',null,clock_timestamp(),clock_timestamp()
);

select * from public.cmd_start_account_deletion_v1(
  '$subject_id',
  '$job_id',
  'finalization-preflight-start',
  '$start_outbox_id'
);
SQL

read_preflight() {
  local owner="${1:-$lock_owner}"
  "${psql_base[@]}" -Atc "
    select
      case when subject_found then '1' else '0' end||'|'||
      case when subject_member then '1' else '0' end||'|'||
      case when subject_deletion_pending then '1' else '0' end||'|'||
      case when deletion_job_found then '1' else '0' end||'|'||
      case when deletion_job_account_running then '1' else '0' end||'|'||
      case when account_start_outbox_ready then '1' else '0' end||'|'||
      case when auth_mapping_present then '1' else '0' end||'|'||
      linked_outbox_count::text||'|'||
      blocking_outbox_count::text||'|'||
      case when db_preconditions_met then '1' else '0' end
    from public.internal_account_deletion_finalization_preflight_v1(
      '$subject_id',
      '$job_id',
      '$owner'
    );
  "
}

pending="$(read_preflight)"
[[ "$pending" == "1|1|1|1|1|0|1|1|1|0" ]] ||
  fail "pending deletion-start event must block handoff: $pending"
pass "pending ACCOUNT_DELETION_STARTED fails closed"

"${psql_base[@]}" -c "
  update public.outbox_events
  set status='processing',
      locked_at=clock_timestamp()-interval '10 minutes',
      lock_owner='$lock_owner',
      lease_expires_at=clock_timestamp()-interval '5 minutes'
  where id='$start_outbox_id';
"

expired_lease="$(read_preflight)"
[[ "$expired_lease" == "1|1|1|1|1|0|1|1|1|0" ]] ||
  fail "expired processing lease must fail closed: $expired_lease"
pass "expired ACCOUNT_DELETION_STARTED lease fails closed"

"${psql_base[@]}" -c "
  update public.outbox_events
  set locked_at=clock_timestamp(),
      lock_owner='$lock_owner',
      lease_expires_at=clock_timestamp()+interval '5 minutes'
  where id='$start_outbox_id';
"

foreign_owner="$(read_preflight 'other-worker')"
[[ "$foreign_owner" == "1|1|1|1|1|0|1|1|1|0" ]] ||
  fail "foreign worker must not inherit another worker lease: $foreign_owner"
pass "foreign outbox worker fails closed"

processing="$(read_preflight)"
[[ "$processing" == "1|1|1|1|1|1|1|1|0|1" ]] ||
  fail "active owned processing lease should satisfy DB-local preconditions: $processing"
pass "exact outbox owner with active lease permits DB-finalizer handoff"

"${psql_base[@]}" <<SQL
insert into public.data_deletion_jobs(
  id,subject_id,scope,target_resource_type,target_resource_id,request_dedupe_key,
  status,retention_exceptions_jsonb,requested_at,started_at,completed_at,error_code
) values (
  '$other_job_id','$subject_id','conversation','conversation_thread','synthetic-target',
  'finalization-preflight-other','requested',null,clock_timestamp(),null,null,null
);

insert into public.outbox_events(
  id,aggregate_type,aggregate_id,event_type,event_schema_version,dedupe_key,
  payload_jsonb,status,attempt_count,available_at,created_at
) values (
  '$other_outbox_id','data_deletion_job','$other_job_id','SYNTHETIC_PENDING_DELETE_WORK',
  'test-v1','test-v1','{}'::jsonb,'pending',0,clock_timestamp(),clock_timestamp()
);
SQL

blocked_aggregate="$(read_preflight)"
[[ "$blocked_aggregate" == "1|1|1|1|1|1|1|2|1|0" ]] ||
  fail "subject-linked aggregate outbox must block preflight: $blocked_aggregate"
pass "data_deletion_job aggregate association blocks nonterminal outbox work"

"${psql_base[@]}" -c "
  update public.outbox_events
  set status='processed', processed_at=clock_timestamp()
  where id='$other_outbox_id';
"

aggregate_terminal="$(read_preflight)"
[[ "$aggregate_terminal" == "1|1|1|1|1|1|1|2|0|1" ]] ||
  fail "processed aggregate outbox should release blocker: $aggregate_terminal"
pass "processed linked aggregate is terminal"

"${psql_base[@]}" -c "
  insert into public.outbox_events(
    id,aggregate_type,aggregate_id,event_type,event_schema_version,dedupe_key,
    payload_jsonb,status,attempt_count,available_at,created_at
  ) values (
    '$payload_outbox_id','synthetic_unmapped','synthetic-id','SYNTHETIC_SUBJECT_PAYLOAD',
    'test-v1','test-v1',
    jsonb_build_object('subjectId','$subject_id'),
    'pending',0,clock_timestamp(),clock_timestamp()
  );
"

blocked_payload="$(read_preflight)"
[[ "$blocked_payload" == "1|1|1|1|1|1|1|3|1|0" ]] ||
  fail "top-level payload subjectId must block preflight even for unknown aggregate: $blocked_payload"
pass "payload subjectId fallback fails closed for unmapped aggregate type"

"${psql_base[@]}" -c "
  update public.outbox_events
  set status='processed', processed_at=clock_timestamp()
  where id='$payload_outbox_id';
"

ready="$(read_preflight)"
[[ "$ready" == "1|1|1|1|1|1|1|3|0|1" ]] ||
  fail "terminal subject-linked outbox should restore DB-local readiness: $ready"
pass "all currently linked outbox work terminal -> DB-local preconditions met"

mismatch="$("${psql_base[@]}" -Atc "
  select
    case when subject_found then '1' else '0' end||'|'||
    case when deletion_job_found then '1' else '0' end||'|'||
    case when db_preconditions_met then '1' else '0' end
  from public.internal_account_deletion_finalization_preflight_v1(
    '$subject_id',
    'f9800000-0000-0000-0000-000000000099',
    '$lock_owner'
  );
")"
[[ "$mismatch" == "1|0|0" ]] || fail "missing/mismatched job must fail closed: $mismatch"
pass "missing deletion job returns false readiness"

missing_subject="$("${psql_base[@]}" -Atc "
  select
    case when subject_found then '1' else '0' end||'|'||
    case when db_preconditions_met then '1' else '0' end
  from public.internal_account_deletion_finalization_preflight_v1(
    'f9200000-0000-0000-0000-000000000099',
    '$job_id',
    '$lock_owner'
  );
")"
[[ "$missing_subject" == "0|0" ]] || fail "missing subject must fail closed: $missing_subject"
pass "missing subject returns false readiness"

public_exec="$("${psql_base[@]}" -Atc "
  select case when has_function_privilege(
    'public',
    'public.internal_account_deletion_finalization_preflight_v1(uuid,uuid,text)',
    'EXECUTE'
  ) then '1' else '0' end;
")"
[[ "$public_exec" == "0" ]] || fail "PUBLIC must not execute internal finalization preflight"
pass "PUBLIC EXECUTE revoked"

echo "Account deletion finalization preflight PASS"
