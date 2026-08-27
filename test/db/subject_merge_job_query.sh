#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -v ON_ERROR_STOP=1)

fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }

expect_fail() {
  local label="$1"
  local needle="$2"
  local sql="$3"
  local out rc
  set +e
  out=$("${psql_base[@]}" -c "$sql" 2>&1)
  rc=$?
  set -e
  if [[ $rc -eq 0 ]]; then
    echo "$out" >&2
    fail "$label unexpectedly succeeded"
  fi
  if [[ "$out" != *"$needle"* ]]; then
    echo "$out" >&2
    fail "$label failed for unexpected reason"
  fi
  pass "$label -> $needle"
}

"${psql_base[@]}" <<'SQL'
insert into auth.users(id) values
  ('53100000-0000-0000-0000-000000000001'),
  ('53100000-0000-0000-0000-000000000002'),
  ('53100000-0000-0000-0000-000000000003');

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('53200000-0000-0000-0000-000000000001','member','53100000-0000-0000-0000-000000000001','active',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('53200000-0000-0000-0000-000000000002','member','53100000-0000-0000-0000-000000000002','active',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('53200000-0000-0000-0000-000000000003','member','53100000-0000-0000-0000-000000000003','deletion_pending',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-03 00:00:00+00'),
  ('53200000-0000-0000-0000-000000000011','guest',null,'active',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('53200000-0000-0000-0000-000000000012','guest',null,'active',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('53200000-0000-0000-0000-000000000013','guest',null,'active',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('53200000-0000-0000-0000-000000000099','member',null,'deleted',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-04 00:00:00+00');

insert into public.guest_sessions(id,subject_id,token_hash,expires_at,consumed_at,claimed_by_subject_id,created_at) values
  ('53300000-0000-0000-0000-000000000011','53200000-0000-0000-0000-000000000011','sha256:merge-job-guest-11',timestamptz '2099-01-01 00:00:00+00',null,null,timestamptz '2026-08-01 00:00:00+00'),
  ('53300000-0000-0000-0000-000000000012','53200000-0000-0000-0000-000000000012','sha256:merge-job-guest-12',timestamptz '2099-01-01 00:00:00+00',null,null,timestamptz '2026-08-01 00:00:00+00'),
  ('53300000-0000-0000-0000-000000000013','53200000-0000-0000-0000-000000000013','sha256:merge-job-guest-13',timestamptz '2099-01-01 00:00:00+00',null,null,timestamptz '2026-08-01 00:00:00+00');

insert into public.subject_merge_jobs(
  id,guest_subject_id,member_subject_id,guest_session_id,policy_version,status,
  conflicts_jsonb,resolution_jsonb,idempotency_key,created_at,completed_at
) values
  ('53400000-0000-0000-0000-000000000001','53200000-0000-0000-0000-000000000011','53200000-0000-0000-0000-000000000001','53300000-0000-0000-0000-000000000011','merge-policy-v1','awaiting_resolution',jsonb_build_object('birthProfile',jsonb_build_object('kind','current_conflict')),null,'internal-merge-dedupe-1',timestamptz '2026-08-20 01:00:00+00',null),
  ('53400000-0000-0000-0000-000000000002','53200000-0000-0000-0000-000000000012','53200000-0000-0000-0000-000000000002','53300000-0000-0000-0000-000000000012','merge-policy-v1','running','{}'::jsonb,jsonb_build_object('selected','member_current'),'internal-merge-dedupe-2',timestamptz '2026-08-21 02:00:00+00',null),
  ('53400000-0000-0000-0000-000000000003','53200000-0000-0000-0000-000000000013','53200000-0000-0000-0000-000000000003','53300000-0000-0000-0000-000000000013','merge-policy-v1','completed','{}'::jsonb,jsonb_build_object('result','applied'),'internal-merge-dedupe-3',timestamptz '2026-08-22 03:00:00+00',timestamptz '2026-08-22 03:00:05+00');
SQL

active_row=$("${psql_base[@]}" -Atc "select merge_job_id||'|'||policy_version||'|'||status||'|'||conflicts_jsonb->'birthProfile'->>'kind'||'|'||coalesce(resolution_jsonb::text,'NULL') from public.qry_subject_merge_job_v1('53200000-0000-0000-0000-000000000001','53400000-0000-0000-0000-000000000001');")
[[ "$active_row" == "53400000-0000-0000-0000-000000000001|merge-policy-v1|awaiting_resolution|current_conflict|NULL" ]] || fail "active member merge job projection mismatch: $active_row"
pass "canonical member reads stored merge progress/conflict projection"

pending_row=$("${psql_base[@]}" -Atc "select merge_job_id||'|'||status||'|'||resolution_jsonb->>'result'||'|'||to_char(completed_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS') from public.qry_subject_merge_job_v1('53200000-0000-0000-0000-000000000003','53400000-0000-0000-0000-000000000003');")
[[ "$pending_row" == "53400000-0000-0000-0000-000000000003|completed|applied|2026-08-22 03:00:05" ]] || fail "deletion-pending member merge job polling mismatch: $pending_row"
pass "deletion-pending canonical member can poll an existing merge job without gaining merge-write authority"

[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_subject_merge_job_v1('53200000-0000-0000-0000-000000000001','53400000-0000-0000-0000-000000000002');")" == "0" ]] || fail "cross-member merge job was exposed"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_subject_merge_job_v1('53200000-0000-0000-0000-000000000001','53400000-0000-0000-0000-000000000099');")" == "0" ]] || fail "unknown merge job should return zero rows"
pass "merge job lookup is canonical-member scoped without cross-owner existence leakage"

projection_json=$("${psql_base[@]}" -Atc "select row_to_json(q)::text from public.qry_subject_merge_job_v1('53200000-0000-0000-0000-000000000001','53400000-0000-0000-0000-000000000001') q;")
[[ "$projection_json" == *"conflicts_jsonb"* ]] || fail "stored conflict result is missing from owner-visible projection"
[[ "$projection_json" != *"guest_subject_id"* ]] || fail "guest lineage identity leaked through merge job projection"
[[ "$projection_json" != *"member_subject_id"* ]] || fail "member owner key leaked through merge job projection"
[[ "$projection_json" != *"guest_session_id"* ]] || fail "guest session linkage leaked through merge job projection"
[[ "$projection_json" != *"idempotency_key"* ]] || fail "merge idempotency material leaked through merge job projection"
[[ "$projection_json" != *"internal-merge-dedupe-1"* ]] || fail "merge idempotency value leaked through merge job projection"
[[ "$projection_json" != *"sha256:merge-job-guest-11"* ]] || fail "guest verifier fingerprint leaked through merge job projection"
pass "merge job DTO exposes stored result while omitting identity/session/idempotency provenance"

before=$("${psql_base[@]}" -Atc "select status||'|'||conflicts_jsonb::text||'|'||coalesce(resolution_jsonb::text,'NULL')||'|'||idempotency_key from public.subject_merge_jobs where id='53400000-0000-0000-0000-000000000001';")
"${psql_base[@]}" -Atc "select count(*) from public.qry_subject_merge_job_v1('53200000-0000-0000-0000-000000000001','53400000-0000-0000-0000-000000000001');" >/dev/null
after=$("${psql_base[@]}" -Atc "select status||'|'||conflicts_jsonb::text||'|'||coalesce(resolution_jsonb::text,'NULL')||'|'||idempotency_key from public.subject_merge_jobs where id='53400000-0000-0000-0000-000000000001';")
[[ "$before" == "$after" ]] || fail "merge job read mutated authority"
pass "merge job query is projection-only"

expect_fail "guest source cannot use generic current merge job endpoint" "merge job read requires a current canonical member subject" "select * from public.qry_subject_merge_job_v1('53200000-0000-0000-0000-000000000011','53400000-0000-0000-0000-000000000001');"
expect_fail "deleted member merge job read is denied" "merge job read requires a current canonical member subject" "select * from public.qry_subject_merge_job_v1('53200000-0000-0000-0000-000000000099','53400000-0000-0000-0000-000000000001');"
expect_fail "unknown subject merge job read is denied" "merge job read requires a current canonical member subject" "select * from public.qry_subject_merge_job_v1('53200000-0000-0000-0000-000000000098','53400000-0000-0000-0000-000000000001');"
expect_fail "merge job subject is required" "merge job subject and job id are required" "select * from public.qry_subject_merge_job_v1(null,'53400000-0000-0000-0000-000000000001');"
expect_fail "merge job id is required" "merge job subject and job id are required" "select * from public.qry_subject_merge_job_v1('53200000-0000-0000-0000-000000000001',null);"

public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.qry_subject_merge_job_v1(uuid,uuid)','EXECUTE') then '1' else '0' end;")
[[ "$public_exec" == "0" ]] || fail "merge job query unexpectedly executable by PUBLIC"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == "59" ]] || fail "public table catalog changed"
pass "merge job query PUBLIC EXECUTE remains revoked and public table catalog remains 59"

echo "subject merge job query tests passed"
