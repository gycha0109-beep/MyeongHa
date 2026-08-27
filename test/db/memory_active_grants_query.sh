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
  ('6a100000-0000-0000-0000-000000000001'),
  ('6a100000-0000-0000-0000-000000000002'),
  ('6a100000-0000-0000-0000-000000000004')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('6a200000-0000-0000-0000-000000000001','member','6a100000-0000-0000-0000-000000000001','active',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('6a200000-0000-0000-0000-000000000002','member','6a100000-0000-0000-0000-000000000002','active',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('6a200000-0000-0000-0000-000000000003','guest',null,'active',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('6a200000-0000-0000-0000-000000000004','member','6a100000-0000-0000-0000-000000000004','deletion_pending',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-03 00:00:00+00');

insert into public.characters(character_id,created_at,retired_at) values
  ('memory-scope-alpha',timestamptz '2026-07-01 00:00:00+00',null),
  ('memory-scope-beta',timestamptz '2026-07-01 00:00:00+00',null),
  ('memory-scope-retired',timestamptz '2026-06-01 00:00:00+00',timestamptz '2026-08-15 00:00:00+00')
on conflict (character_id) do nothing;

insert into public.memory_items(
  id,subject_id,memory_type,schema_version,content_jsonb,source_kind,source_turn_id,source_message_id,
  source_merge_action_id,created_by_character_id,revoked_at,created_at
) values
  ('6a300000-0000-0000-0000-000000000001','6a200000-0000-0000-0000-000000000001','consultation_detail','memory-v1','{"value":"owner-active"}','user_approved',null,null,null,'memory-scope-alpha',null,timestamptz '2026-08-20 00:00:00+00'),
  ('6a300000-0000-0000-0000-000000000002','6a200000-0000-0000-0000-000000000001','consultation_detail','memory-v1','{"value":"owner-revoked"}','user_approved',null,null,null,'memory-scope-alpha',timestamptz '2026-08-22 00:00:00+00',timestamptz '2026-08-19 00:00:00+00'),
  ('6a300000-0000-0000-0000-000000000003','6a200000-0000-0000-0000-000000000002','consultation_detail','memory-v1','{"value":"other-owner"}','user_approved',null,null,null,'memory-scope-alpha',null,timestamptz '2026-08-20 00:00:00+00'),
  ('6a300000-0000-0000-0000-000000000004','6a200000-0000-0000-0000-000000000003','consultation_detail','memory-v1','{"value":"guest-active"}','user_approved',null,null,null,'memory-scope-alpha',null,timestamptz '2026-08-20 00:00:00+00'),
  ('6a300000-0000-0000-0000-000000000005','6a200000-0000-0000-0000-000000000004','consultation_detail','memory-v1','{"value":"pending-delete"}','user_approved',null,null,null,'memory-scope-alpha',null,timestamptz '2026-08-20 00:00:00+00');

insert into public.life_facts(
  id,subject_id,fact_type,schema_version,value_jsonb,valid_from,valid_to,source_kind,
  source_message_id,source_merge_action_id,supersedes_fact_id,confirmed_at,revoked_at,created_at
) values
  ('6a350000-0000-0000-0000-000000000001','6a200000-0000-0000-0000-000000000001','residence','life-fact-v1','{"value":"seoul"}',null,null,'user_explicit',null,null,null,timestamptz '2026-08-18 00:00:00+00',null,timestamptz '2026-08-18 00:00:00+00');

insert into public.record_access_grants(
  id,subject_id,life_fact_id,memory_item_id,grantee_character_id,grant_reason,granted_at,revoked_at
) values
  ('6a400000-0000-0000-0000-000000000001','6a200000-0000-0000-0000-000000000001',null,'6a300000-0000-0000-0000-000000000001','memory-scope-alpha','user_choice',timestamptz '2026-08-20 10:00:00+00',null),
  ('6a400000-0000-0000-0000-000000000002','6a200000-0000-0000-0000-000000000001',null,'6a300000-0000-0000-0000-000000000001','memory-scope-beta','user_choice',timestamptz '2026-08-20 11:00:00+00',timestamptz '2026-08-21 00:00:00+00'),
  ('6a400000-0000-0000-0000-000000000003','6a200000-0000-0000-0000-000000000001',null,'6a300000-0000-0000-0000-000000000001','memory-scope-retired','user_choice',timestamptz '2026-08-20 12:00:00+00',null),
  ('6a400000-0000-0000-0000-000000000004','6a200000-0000-0000-0000-000000000001',null,'6a300000-0000-0000-0000-000000000002','memory-scope-alpha','user_choice',timestamptz '2026-08-19 10:00:00+00',null),
  ('6a400000-0000-0000-0000-000000000005','6a200000-0000-0000-0000-000000000002',null,'6a300000-0000-0000-0000-000000000003','memory-scope-alpha','user_choice',timestamptz '2026-08-20 10:00:00+00',null),
  ('6a400000-0000-0000-0000-000000000006','6a200000-0000-0000-0000-000000000003',null,'6a300000-0000-0000-0000-000000000004','memory-scope-alpha','user_choice',timestamptz '2026-08-20 10:00:00+00',null),
  ('6a400000-0000-0000-0000-000000000007','6a200000-0000-0000-0000-000000000004',null,'6a300000-0000-0000-0000-000000000005','memory-scope-alpha','user_choice',timestamptz '2026-08-20 10:00:00+00',null),
  ('6a400000-0000-0000-0000-000000000008','6a200000-0000-0000-0000-000000000001','6a350000-0000-0000-0000-000000000001',null,'memory-scope-alpha','user_choice',timestamptz '2026-08-20 09:00:00+00',null);
SQL

rows=$("${psql_base[@]}" -Atc "select grant_id||'|'||character_id||'|'||grant_reason||'|'||to_char(granted_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS') from public.qry_memory_active_grants_v1('6a200000-0000-0000-0000-000000000001','6a300000-0000-0000-0000-000000000001');")
expected=$'6a400000-0000-0000-0000-000000000001|memory-scope-alpha|user_choice|2026-08-20 10:00:00\n6a400000-0000-0000-0000-000000000003|memory-scope-retired|user_choice|2026-08-20 12:00:00'
[[ "$rows" == "$expected" ]] || fail "active Memory grants projection mismatch: $rows"
pass "current Memory grant projection returns only active explicit grants in deterministic order"

[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_memory_active_grants_v1('6a200000-0000-0000-0000-000000000001','6a300000-0000-0000-0000-000000000001') where character_id='memory-scope-beta';")" == "0" ]] || fail "revoked Memory grant leaked into current projection"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_memory_active_grants_v1('6a200000-0000-0000-0000-000000000001','6a300000-0000-0000-0000-000000000001') where grant_id='6a400000-0000-0000-0000-000000000008';")" == "0" ]] || fail "Life Fact grant leaked into Memory grant projection"
pass "revoked grants and Life Fact grants are excluded from current Memory scope"

[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_memory_active_grants_v1('6a200000-0000-0000-0000-000000000003','6a300000-0000-0000-0000-000000000004');")" == "1" ]] || fail "active guest Memory grant projection was not readable"
pass "active canonical guest/member can read owned current Memory grant scope"

before=$("${psql_base[@]}" -Atc "select string_agg(id::text||':'||coalesce(revoked_at::text,'NULL'),',' order by id) from public.record_access_grants where subject_id='6a200000-0000-0000-0000-000000000001';")
"${psql_base[@]}" -Atc "select count(*) from public.qry_memory_active_grants_v1('6a200000-0000-0000-0000-000000000001','6a300000-0000-0000-0000-000000000001');" >/dev/null
after=$("${psql_base[@]}" -Atc "select string_agg(id::text||':'||coalesce(revoked_at::text,'NULL'),',' order by id) from public.record_access_grants where subject_id='6a200000-0000-0000-0000-000000000001';")
[[ "$before" == "$after" ]] || fail "Memory grant read mutated permission authority"
pass "Memory grant read is projection-only"

expect_fail "revoked Memory current grants are not retrievable" "active memory item was not found for this subject" "select * from public.qry_memory_active_grants_v1('6a200000-0000-0000-0000-000000000001','6a300000-0000-0000-0000-000000000002');"
expect_fail "cross-owner Memory grant probe is denied" "active memory item was not found for this subject" "select * from public.qry_memory_active_grants_v1('6a200000-0000-0000-0000-000000000002','6a300000-0000-0000-0000-000000000001');"
expect_fail "unknown Memory grant probe is denied" "active memory item was not found for this subject" "select * from public.qry_memory_active_grants_v1('6a200000-0000-0000-0000-000000000001','6a300000-0000-0000-0000-000000000099');"
expect_fail "deletion-pending Memory grant generic read is denied" "memory grant read requires an active canonical subject" "select * from public.qry_memory_active_grants_v1('6a200000-0000-0000-0000-000000000004','6a300000-0000-0000-0000-000000000005');"
expect_fail "Memory grant subject is required" "memory grant subject is required" "select * from public.qry_memory_active_grants_v1(null,'6a300000-0000-0000-0000-000000000001');"
expect_fail "Memory item is required" "memory item is required" "select * from public.qry_memory_active_grants_v1('6a200000-0000-0000-0000-000000000001',null);"

public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.qry_memory_active_grants_v1(uuid,uuid)','EXECUTE') then '1' else '0' end;")
[[ "$public_exec" == "0" ]] || fail "Memory grant query unexpectedly executable by PUBLIC"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == "59" ]] || fail "public table catalog changed"
pass "Memory grant query PUBLIC EXECUTE remains revoked and public table catalog remains 59"

echo "current Memory grant projection tests passed"
