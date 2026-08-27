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
  ('81000000-0000-0000-0000-000000000001'),
  ('81000000-0000-0000-0000-000000000002'),
  ('81000000-0000-0000-0000-000000000005')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('82000000-0000-0000-0000-000000000001','member','81000000-0000-0000-0000-000000000001','active',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('82000000-0000-0000-0000-000000000002','member','81000000-0000-0000-0000-000000000002','active',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('82000000-0000-0000-0000-000000000003','guest',null,'active',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('82000000-0000-0000-0000-000000000004','guest',null,'merged','82000000-0000-0000-0000-000000000001',timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-02 00:00:00+00'),
  ('82000000-0000-0000-0000-000000000005','member','81000000-0000-0000-0000-000000000005','deletion_pending',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-03 00:00:00+00'),
  ('82000000-0000-0000-0000-000000000006','member',null,'deleted',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-04 00:00:00+00');

insert into public.life_facts(
  id,subject_id,fact_type,schema_version,value_jsonb,valid_from,valid_to,source_kind,
  source_message_id,source_merge_action_id,supersedes_fact_id,confirmed_at,revoked_at,created_at
) values
  ('83000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000001','employment_status','life-fact-v1','{"value":"old-role"}',timestamptz '2025-01-01 00:00:00+00',timestamptz '2026-07-31 23:59:59+00','user_explicit',null,null,null,timestamptz '2026-08-10 10:00:00+00',null,timestamptz '2026-08-10 10:00:00+00');

insert into public.life_facts(
  id,subject_id,fact_type,schema_version,value_jsonb,valid_from,valid_to,source_kind,
  source_message_id,source_merge_action_id,supersedes_fact_id,confirmed_at,revoked_at,created_at
) values
  ('83000000-0000-0000-0000-000000000002','82000000-0000-0000-0000-000000000001','employment_status','life-fact-v1','{"value":"new-role"}',timestamptz '2026-08-01 00:00:00+00',null,'profile_edit',null,null,'83000000-0000-0000-0000-000000000001',timestamptz '2026-08-20 10:00:00+00',null,timestamptz '2026-08-20 10:00:00+00'),
  ('83000000-0000-0000-0000-000000000003','82000000-0000-0000-0000-000000000001','residence','life-fact-v1','{"value":"seoul"}',null,null,'user_explicit',null,null,null,timestamptz '2026-08-15 10:00:00+00',timestamptz '2026-08-22 10:00:00+00',timestamptz '2026-08-15 10:00:00+00'),
  ('83000000-0000-0000-0000-000000000004','82000000-0000-0000-0000-000000000002','employment_status','life-fact-v1','{"value":"other-owner"}',null,null,'user_explicit',null,null,null,timestamptz '2026-08-25 10:00:00+00',null,timestamptz '2026-08-25 10:00:00+00'),
  ('83000000-0000-0000-0000-000000000005','82000000-0000-0000-0000-000000000003','planned_event','life-fact-v1','{"value":"guest-fact"}',null,null,'user_explicit',null,null,null,timestamptz '2026-08-18 10:00:00+00',null,timestamptz '2026-08-18 10:00:00+00'),
  ('83000000-0000-0000-0000-000000000006','82000000-0000-0000-0000-000000000005','planned_event','life-fact-v1','{"value":"pending-delete"}',null,null,'user_explicit',null,null,null,timestamptz '2026-08-19 10:00:00+00',null,timestamptz '2026-08-19 10:00:00+00');
SQL

rows=$("${psql_base[@]}" -Atc "select life_fact_id||'|'||fact_type||'|'||(value_jsonb->>'value')||'|'||coalesce(supersedes_fact_id::text,'NULL')||'|'||case when revoked_at is null then 'active' else 'revoked' end from public.qry_life_record_ledger_v1('82000000-0000-0000-0000-000000000001');")
expected=$'83000000-0000-0000-0000-000000000002|employment_status|new-role|83000000-0000-0000-0000-000000000001|active\n83000000-0000-0000-0000-000000000003|residence|seoul|NULL|revoked\n83000000-0000-0000-0000-000000000001|employment_status|old-role|NULL|active'
[[ "$rows" == "$expected" ]] || fail "Life Record ledger projection mismatch: $rows"
pass "owner Life Record ledger returns deterministic supersession and revocation history"

[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_life_record_ledger_v1('82000000-0000-0000-0000-000000000001');")" == "3" ]] || fail "owner Life Record ledger row count mismatch"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_life_record_ledger_v1('82000000-0000-0000-0000-000000000001') where life_fact_id='83000000-0000-0000-0000-000000000004';")" == "0" ]] || fail "cross-owner Life Fact leaked into ledger"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_life_record_ledger_v1('82000000-0000-0000-0000-000000000003');")" == "1" ]] || fail "active guest Life Record ledger was not readable"
pass "Life Record ledger is owner-scoped and available to active canonical guests/members"

shape=$("${psql_base[@]}" -Atc "select row_to_json(q)::text from public.qry_life_record_ledger_v1('82000000-0000-0000-0000-000000000001') q limit 1;")
[[ "$shape" == *'"source_kind"'* ]] || fail "Life Record ledger omitted source provenance"
[[ "$shape" == *'"confirmed_at"'* ]] || fail "Life Record ledger omitted confirmation provenance"
[[ "$shape" == *'"revoked_at"'* ]] || fail "Life Record ledger omitted revocation lifecycle"
[[ "$shape" != *'"subject_id"'* ]] || fail "redundant subject identity leaked into owner-scoped ledger row"
[[ "$shape" != *'memory_proposal'* ]] || fail "Memory Proposal authority leaked into Life Record ledger"
[[ "$shape" != *'grantee_character'* ]] || fail "record grant authority leaked into Life Record ledger"
pass "Life Record ledger preserves Life Fact provenance without crossing Memory/Grant authority"

before=$("${psql_base[@]}" -Atc "select string_agg(id::text||':'||coalesce(revoked_at::text,'NULL')||':'||coalesce(supersedes_fact_id::text,'NULL'),',' order by id) from public.life_facts where subject_id='82000000-0000-0000-0000-000000000001';")
"${psql_base[@]}" -Atc "select count(*) from public.qry_life_record_ledger_v1('82000000-0000-0000-0000-000000000001');" >/dev/null
after=$("${psql_base[@]}" -Atc "select string_agg(id::text||':'||coalesce(revoked_at::text,'NULL')||':'||coalesce(supersedes_fact_id::text,'NULL'),',' order by id) from public.life_facts where subject_id='82000000-0000-0000-0000-000000000001';")
[[ "$before" == "$after" ]] || fail "Life Record read mutated authoritative history"
pass "Life Record ledger read is projection-only"

expect_fail "deletion-pending Life Record generic read is denied" "life record read requires an active canonical subject" "select * from public.qry_life_record_ledger_v1('82000000-0000-0000-0000-000000000005');"
expect_fail "merged Life Record read is denied" "life record read requires an active canonical subject" "select * from public.qry_life_record_ledger_v1('82000000-0000-0000-0000-000000000004');"
expect_fail "deleted Life Record read is denied" "life record read requires an active canonical subject" "select * from public.qry_life_record_ledger_v1('82000000-0000-0000-0000-000000000006');"
expect_fail "Life Record subject is required" "life record subject is required" "select * from public.qry_life_record_ledger_v1(null);"

public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.qry_life_record_ledger_v1(uuid)','EXECUTE') then '1' else '0' end;")
[[ "$public_exec" == "0" ]] || fail "Life Record ledger query unexpectedly executable by PUBLIC"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == "59" ]] || fail "public table catalog changed"
pass "Life Record ledger query PUBLIC EXECUTE remains revoked and public table catalog remains 59"

echo "Life Record ledger query tests passed"
