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
  ('4d100000-0000-0000-0000-000000000001'),
  ('4d100000-0000-0000-0000-000000000002');

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('4d200000-0000-0000-0000-000000000001','member','4d100000-0000-0000-0000-000000000001','active',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('4d200000-0000-0000-0000-000000000002','member','4d100000-0000-0000-0000-000000000002','deletion_pending',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-02 00:00:00+00'),
  ('4d200000-0000-0000-0000-000000000003','guest',null,'active',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('4d200000-0000-0000-0000-000000000004','guest',null,'merged','4d200000-0000-0000-0000-000000000001',timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-03 00:00:00+00'),
  ('4d200000-0000-0000-0000-000000000005','member',null,'deleted',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-04 00:00:00+00');

insert into public.data_deletion_jobs(
  id,subject_id,scope,target_resource_type,target_resource_id,request_dedupe_key,status,
  retention_exceptions_jsonb,requested_at,started_at,completed_at,error_code
) values
  ('4d300000-0000-0000-0000-000000000001','4d200000-0000-0000-0000-000000000001','memory','memory_item','mem-42','internal-dedupe-a','requested',jsonb_build_object('legal_hold','internal-only'),timestamptz '2026-08-10 01:00:00+00',null,null,null),
  ('4d300000-0000-0000-0000-000000000002','4d200000-0000-0000-0000-000000000002','account',null,null,'internal-dedupe-b','running',jsonb_build_object('commerce','retained-by-policy'),timestamptz '2026-08-11 02:00:00+00',timestamptz '2026-08-11 02:00:01+00',null,null),
  ('4d300000-0000-0000-0000-000000000003','4d200000-0000-0000-0000-000000000003','life_fact','life_fact','fact-7','internal-dedupe-c','completed',null,timestamptz '2026-08-12 03:00:00+00',timestamptz '2026-08-12 03:00:01+00',timestamptz '2026-08-12 03:00:02+00',null),
  ('4d300000-0000-0000-0000-000000000004','4d200000-0000-0000-0000-000000000004','memory','memory_item','mem-old','internal-dedupe-d','requested',null,timestamptz '2026-08-13 04:00:00+00',null,null,null),
  ('4d300000-0000-0000-0000-000000000005','4d200000-0000-0000-0000-000000000005','target_person','target_person','target-old','internal-dedupe-e','failed',null,timestamptz '2026-08-14 05:00:00+00',timestamptz '2026-08-14 05:00:01+00',null,'internal_failure');
SQL

active_row=$("${psql_base[@]}" -Atc "select deletion_job_id||'|'||scope||'|'||coalesce(target_resource_type,'NULL')||'|'||coalesce(target_resource_id,'NULL')||'|'||status||'|'||to_char(requested_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS') from public.qry_data_deletion_job_v1('4d200000-0000-0000-0000-000000000001','4d300000-0000-0000-0000-000000000001');")
[[ "$active_row" == "4d300000-0000-0000-0000-000000000001|memory|memory_item|mem-42|requested|2026-08-10 01:00:00" ]] || fail "active subject deletion job projection mismatch: $active_row"
pass "active canonical subject reads its deletion job current projection"

pending_row=$("${psql_base[@]}" -Atc "select deletion_job_id||'|'||scope||'|'||status||'|'||to_char(started_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS') from public.qry_data_deletion_job_v1('4d200000-0000-0000-0000-000000000002','4d300000-0000-0000-0000-000000000002');")
[[ "$pending_row" == "4d300000-0000-0000-0000-000000000002|account|running|2026-08-11 02:00:01" ]] || fail "deletion-pending account job polling mismatch: $pending_row"
pass "deletion-pending canonical member can continue polling account deletion progress"

guest_row=$("${psql_base[@]}" -Atc "select deletion_job_id||'|'||scope||'|'||status from public.qry_data_deletion_job_v1('4d200000-0000-0000-0000-000000000003','4d300000-0000-0000-0000-000000000003');")
[[ "$guest_row" == "4d300000-0000-0000-0000-000000000003|life_fact|completed" ]] || fail "active guest deletion job read mismatch: $guest_row"
pass "active canonical guest is not silently excluded from owner-scoped deletion job read"

[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_data_deletion_job_v1('4d200000-0000-0000-0000-000000000001','4d300000-0000-0000-0000-000000000002');")" == "0" ]] || fail "cross-owner deletion job was exposed"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_data_deletion_job_v1('4d200000-0000-0000-0000-000000000001','4d300000-0000-0000-0000-000000000099');")" == "0" ]] || fail "unknown deletion job should return zero rows"
pass "job lookup is owner-scoped and does not reveal cross-owner or unknown resource existence"

projection_json=$("${psql_base[@]}" -Atc "select row_to_json(q)::text from public.qry_data_deletion_job_v1('4d200000-0000-0000-0000-000000000001','4d300000-0000-0000-0000-000000000001') q;")
[[ "$projection_json" != *"request_dedupe_key"* ]] || fail "internal request dedupe material leaked through deletion job projection"
[[ "$projection_json" != *"retention_exceptions_jsonb"* ]] || fail "internal retention exception policy leaked through deletion job projection"
[[ "$projection_json" != *"internal-dedupe-a"* ]] || fail "internal dedupe value leaked through deletion job projection"
[[ "$projection_json" != *"legal_hold"* ]] || fail "internal retention exception value leaked through deletion job projection"
pass "deletion job read omits internal dedupe and retention-exception policy material"

before=$("${psql_base[@]}" -Atc "select status||'|'||request_dedupe_key||'|'||retention_exceptions_jsonb::text from public.data_deletion_jobs where id='4d300000-0000-0000-0000-000000000001';")
"${psql_base[@]}" -Atc "select count(*) from public.qry_data_deletion_job_v1('4d200000-0000-0000-0000-000000000001','4d300000-0000-0000-0000-000000000001');" >/dev/null
after=$("${psql_base[@]}" -Atc "select status||'|'||request_dedupe_key||'|'||retention_exceptions_jsonb::text from public.data_deletion_jobs where id='4d300000-0000-0000-0000-000000000001';")
[[ "$before" == "$after" ]] || fail "read query mutated deletion job authority"
pass "deletion job read is projection-only and leaves deletion authority unchanged"

expect_fail "merged guest generic deletion job read is denied" "deletion job read requires an active or deletion-pending canonical subject" "select * from public.qry_data_deletion_job_v1('4d200000-0000-0000-0000-000000000004','4d300000-0000-0000-0000-000000000004');"
expect_fail "deleted subject deletion job read is denied" "deletion job read requires an active or deletion-pending canonical subject" "select * from public.qry_data_deletion_job_v1('4d200000-0000-0000-0000-000000000005','4d300000-0000-0000-0000-000000000005');"
expect_fail "unknown subject deletion job read is denied" "deletion job read requires an active or deletion-pending canonical subject" "select * from public.qry_data_deletion_job_v1('4d200000-0000-0000-0000-000000000099','4d300000-0000-0000-0000-000000000001');"
expect_fail "deletion job ids are required" "deletion job subject and job id are required" "select * from public.qry_data_deletion_job_v1(null,'4d300000-0000-0000-0000-000000000001');"
expect_fail "deletion job id is required" "deletion job subject and job id are required" "select * from public.qry_data_deletion_job_v1('4d200000-0000-0000-0000-000000000001',null);"

public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.qry_data_deletion_job_v1(uuid,uuid)','EXECUTE') then '1' else '0' end;")
[[ "$public_exec" == "0" ]] || fail "data deletion job query unexpectedly executable by PUBLIC"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == "60" ]] || fail "public table catalog changed"
pass "data deletion job query PUBLIC EXECUTE remains revoked and public table catalog remains 60"

echo "data deletion job query tests passed"
