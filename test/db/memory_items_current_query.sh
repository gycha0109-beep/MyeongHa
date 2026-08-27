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
  ('6b100000-0000-0000-0000-000000000001'),
  ('6b100000-0000-0000-0000-000000000002'),
  ('6b100000-0000-0000-0000-000000000004')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('6b200000-0000-0000-0000-000000000001','member','6b100000-0000-0000-0000-000000000001','active',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('6b200000-0000-0000-0000-000000000002','member','6b100000-0000-0000-0000-000000000002','active',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('6b200000-0000-0000-0000-000000000003','guest',null,'active',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('6b200000-0000-0000-0000-000000000004','member','6b100000-0000-0000-0000-000000000004','deletion_pending',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-03 00:00:00+00');

insert into public.characters(character_id,created_at,retired_at) values
  ('memory-list-alpha',timestamptz '2026-07-01 00:00:00+00',null),
  ('memory-list-beta',timestamptz '2026-07-01 00:00:00+00',null)
on conflict (character_id) do nothing;

insert into public.memory_items(
  id,subject_id,memory_type,schema_version,content_jsonb,source_kind,source_turn_id,source_message_id,
  source_merge_action_id,created_by_character_id,revoked_at,created_at
) values
  ('6b300000-0000-0000-0000-000000000001','6b200000-0000-0000-0000-000000000001','consultation_detail','memory-v1','{"value":"owner-active"}','user_approved',null,null,null,'memory-list-alpha',null,timestamptz '2026-08-20 00:00:00+00'),
  ('6b300000-0000-0000-0000-000000000002','6b200000-0000-0000-0000-000000000001','consultation_detail','memory-v1','{"value":"owner-revoked"}','user_approved',null,null,null,'memory-list-alpha',timestamptz '2026-08-23 00:00:00+00',timestamptz '2026-08-21 00:00:00+00'),
  ('6b300000-0000-0000-0000-000000000003','6b200000-0000-0000-0000-000000000002','consultation_detail','memory-v1','{"value":"other-owner"}','user_approved',null,null,null,'memory-list-beta',null,timestamptz '2026-08-20 00:00:00+00'),
  ('6b300000-0000-0000-0000-000000000004','6b200000-0000-0000-0000-000000000003','consultation_detail','memory-v1','{"value":"guest-active"}','user_approved',null,null,null,'memory-list-alpha',null,timestamptz '2026-08-20 00:00:00+00'),
  ('6b300000-0000-0000-0000-000000000005','6b200000-0000-0000-0000-000000000004','consultation_detail','memory-v1','{"value":"pending-delete"}','user_approved',null,null,null,'memory-list-alpha',null,timestamptz '2026-08-20 00:00:00+00'),
  ('6b300000-0000-0000-0000-000000000006','6b200000-0000-0000-0000-000000000001','relationship_memory','memory-v1','{"value":"owner-private"}','user_approved',null,null,null,null,null,timestamptz '2026-08-22 00:00:00+00');

insert into public.record_access_grants(
  id,subject_id,life_fact_id,memory_item_id,grantee_character_id,grant_reason,granted_at,revoked_at
) values
  ('6b400000-0000-0000-0000-000000000001','6b200000-0000-0000-0000-000000000001',null,'6b300000-0000-0000-0000-000000000001','memory-list-alpha','user_choice',timestamptz '2026-08-20 10:00:00+00',null);
SQL

rows=$("${psql_base[@]}" -Atc "select memory_item_id||'|'||memory_type||'|'||schema_version||'|'||(content_jsonb->>'value')||'|'||coalesce(created_by_character_id,'NULL')||'|'||to_char(created_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS') from public.qry_memory_items_v1('6b200000-0000-0000-0000-000000000001');")
expected=$'6b300000-0000-0000-0000-000000000006|relationship_memory|memory-v1|owner-private|NULL|2026-08-22 00:00:00\n6b300000-0000-0000-0000-000000000001|consultation_detail|memory-v1|owner-active|memory-list-alpha|2026-08-20 00:00:00'
[[ "$rows" == "$expected" ]] || fail "current Memory Item projection mismatch: $rows"
pass "current Memory Item owner projection returns active records in deterministic order"

[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_memory_items_v1('6b200000-0000-0000-0000-000000000001') where memory_item_id='6b300000-0000-0000-0000-000000000002';")" == "0" ]] || fail "revoked Memory Item leaked into current projection"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.record_access_grants where memory_item_id='6b300000-0000-0000-0000-000000000006' and revoked_at is null;")" == "0" ]] || fail "private Memory fixture unexpectedly has a character grant"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_memory_items_v1('6b200000-0000-0000-0000-000000000001') where memory_item_id='6b300000-0000-0000-0000-000000000006';")" == "1" ]] || fail "private zero-grant Memory Item was hidden from its owner"
pass "revoked Memory is excluded while private zero-grant Memory remains owner-visible"

other_rows=$("${psql_base[@]}" -Atc "select string_agg(memory_item_id::text,',' order by memory_item_id) from public.qry_memory_items_v1('6b200000-0000-0000-0000-000000000002');")
[[ "$other_rows" == "6b300000-0000-0000-0000-000000000003" ]] || fail "cross-owner Memory Item isolation mismatch: $other_rows"
pass "Memory list is strictly owner-scoped"

[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_memory_items_v1('6b200000-0000-0000-0000-000000000003');")" == "1" ]] || fail "active guest Memory list was not readable"
pass "active canonical guest/member can read owned current Memory Items"

dto_ok=$("${psql_base[@]}" -Atc "select case when ((to_jsonb(q) ?& array['memory_item_id','memory_type','schema_version','content_jsonb','created_by_character_id','created_at']::text[]) and not (to_jsonb(q) ?| array['subject_id','source_turn_id','source_message_id','source_merge_action_id','source_kind','revoked_at']::text[])) then '1' else '0' end from public.qry_memory_items_v1('6b200000-0000-0000-0000-000000000001') q where q.memory_item_id='6b300000-0000-0000-0000-000000000001';")
[[ "$dto_ok" == "1" ]] || fail "Memory Item projection leaked internal provenance or missed required fields"
pass "Memory Item DTO exposes content identity while hiding internal provenance"

before=$("${psql_base[@]}" -Atc "select string_agg(id::text||':'||coalesce(revoked_at::text,'NULL'),',' order by id) from public.memory_items where subject_id='6b200000-0000-0000-0000-000000000001';")
"${psql_base[@]}" -Atc "select count(*) from public.qry_memory_items_v1('6b200000-0000-0000-0000-000000000001');" >/dev/null
after=$("${psql_base[@]}" -Atc "select string_agg(id::text||':'||coalesce(revoked_at::text,'NULL'),',' order by id) from public.memory_items where subject_id='6b200000-0000-0000-0000-000000000001';")
[[ "$before" == "$after" ]] || fail "Memory Item read mutated record authority"
[[ "$("${psql_base[@]}" -Atc "select provolatile from pg_proc where oid='public.qry_memory_items_v1(uuid)'::regprocedure;")" == "s" ]] || fail "Memory Item query is not STABLE"
pass "Memory Item read is stable and projection-only"

expect_fail "deletion-pending Memory list generic read is denied" "memory list requires an active canonical subject" "select * from public.qry_memory_items_v1('6b200000-0000-0000-0000-000000000004');"
expect_fail "unknown Memory list subject is denied" "memory list requires an active canonical subject" "select * from public.qry_memory_items_v1('6b200000-0000-0000-0000-000000000099');"
expect_fail "Memory list subject is required" "memory list subject is required" "select * from public.qry_memory_items_v1(null);"

public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.qry_memory_items_v1(uuid)','EXECUTE') then '1' else '0' end;")
[[ "$public_exec" == "0" ]] || fail "Memory Item query unexpectedly executable by PUBLIC"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == "59" ]] || fail "public table catalog changed"
pass "Memory Item query PUBLIC EXECUTE remains revoked and public table catalog remains 59"

echo "current Memory Item projection tests passed"
