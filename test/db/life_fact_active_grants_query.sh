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
  ('72100000-0000-0000-0000-000000000001'),
  ('72100000-0000-0000-0000-000000000002'),
  ('72100000-0000-0000-0000-000000000004')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('72200000-0000-0000-0000-000000000001','member','72100000-0000-0000-0000-000000000001','active',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('72200000-0000-0000-0000-000000000002','member','72100000-0000-0000-0000-000000000002','active',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('72200000-0000-0000-0000-000000000003','guest',null,'active',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('72200000-0000-0000-0000-000000000004','member','72100000-0000-0000-0000-000000000004','deletion_pending',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-03 00:00:00+00'),
  ('72200000-0000-0000-0000-000000000005','guest',null,'merged','72200000-0000-0000-0000-000000000001',timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-04 00:00:00+00');

insert into public.characters(character_id,created_at,retired_at) values
  ('life-scope-alpha',timestamptz '2026-07-01 00:00:00+00',null),
  ('life-scope-beta',timestamptz '2026-07-01 00:00:00+00',null),
  ('life-scope-retired',timestamptz '2026-06-01 00:00:00+00',timestamptz '2026-08-15 00:00:00+00')
on conflict (character_id) do nothing;

insert into public.life_facts(
  id,subject_id,fact_type,schema_version,value_jsonb,valid_from,valid_to,source_kind,
  source_message_id,source_merge_action_id,supersedes_fact_id,confirmed_at,revoked_at,created_at
) values
  ('72300000-0000-0000-0000-000000000001','72200000-0000-0000-0000-000000000001','status-example','life-v1','{"value":"old"}',null,null,'user_explicit',null,null,null,timestamptz '2026-08-18 00:00:00+00',null,timestamptz '2026-08-18 00:00:00+00'),
  ('72300000-0000-0000-0000-000000000002','72200000-0000-0000-0000-000000000001','status-example','life-v1','{"value":"new"}',null,null,'user_explicit',null,null,'72300000-0000-0000-0000-000000000001',timestamptz '2026-08-20 00:00:00+00',null,timestamptz '2026-08-20 00:00:00+00'),
  ('72300000-0000-0000-0000-000000000003','72200000-0000-0000-0000-000000000001','revoked-example','life-v1','{"value":"revoked"}',null,null,'user_explicit',null,null,null,timestamptz '2026-08-19 00:00:00+00',timestamptz '2026-08-21 00:00:00+00',timestamptz '2026-08-19 00:00:00+00'),
  ('72300000-0000-0000-0000-000000000004','72200000-0000-0000-0000-000000000002','status-example','life-v1','{"value":"other"}',null,null,'user_explicit',null,null,null,timestamptz '2026-08-18 00:00:00+00',null,timestamptz '2026-08-18 00:00:00+00'),
  ('72300000-0000-0000-0000-000000000005','72200000-0000-0000-0000-000000000003','status-example','life-v1','{"value":"guest"}',null,null,'user_explicit',null,null,null,timestamptz '2026-08-18 00:00:00+00',null,timestamptz '2026-08-18 00:00:00+00'),
  ('72300000-0000-0000-0000-000000000006','72200000-0000-0000-0000-000000000004','status-example','life-v1','{"value":"deleting"}',null,null,'user_explicit',null,null,null,timestamptz '2026-08-18 00:00:00+00',null,timestamptz '2026-08-18 00:00:00+00'),
  ('72300000-0000-0000-0000-000000000007','72200000-0000-0000-0000-000000000005','status-example','life-v1','{"value":"merged"}',null,null,'user_explicit',null,null,null,timestamptz '2026-08-18 00:00:00+00',null,timestamptz '2026-08-18 00:00:00+00');

insert into public.memory_items(
  id,subject_id,memory_type,schema_version,content_jsonb,source_kind,source_turn_id,source_message_id,
  source_merge_action_id,created_by_character_id,revoked_at,created_at
) values
  ('72500000-0000-0000-0000-000000000001','72200000-0000-0000-0000-000000000001','memory-example','memory-v1','{"value":"memory"}','user_approved',null,null,null,'life-scope-alpha',null,timestamptz '2026-08-20 00:00:00+00');

insert into public.record_access_grants(
  id,subject_id,life_fact_id,memory_item_id,grantee_character_id,grant_reason,granted_at,revoked_at
) values
  ('72400000-0000-0000-0000-000000000001','72200000-0000-0000-0000-000000000001','72300000-0000-0000-0000-000000000001',null,'life-scope-alpha','user_choice',timestamptz '2026-08-18 10:00:00+00',null),
  ('72400000-0000-0000-0000-000000000002','72200000-0000-0000-0000-000000000001','72300000-0000-0000-0000-000000000001',null,'life-scope-beta','user_choice',timestamptz '2026-08-18 11:00:00+00',timestamptz '2026-08-19 00:00:00+00'),
  ('72400000-0000-0000-0000-000000000003','72200000-0000-0000-0000-000000000001','72300000-0000-0000-0000-000000000001',null,'life-scope-retired','user_choice',timestamptz '2026-08-18 12:00:00+00',null),
  ('72400000-0000-0000-0000-000000000004','72200000-0000-0000-0000-000000000001','72300000-0000-0000-0000-000000000002',null,'life-scope-alpha','user_choice',timestamptz '2026-08-20 10:00:00+00',null),
  ('72400000-0000-0000-0000-000000000005','72200000-0000-0000-0000-000000000001','72300000-0000-0000-0000-000000000003',null,'life-scope-alpha','user_choice',timestamptz '2026-08-19 10:00:00+00',null),
  ('72400000-0000-0000-0000-000000000006','72200000-0000-0000-0000-000000000002','72300000-0000-0000-0000-000000000004',null,'life-scope-alpha','user_choice',timestamptz '2026-08-18 10:00:00+00',null),
  ('72400000-0000-0000-0000-000000000007','72200000-0000-0000-0000-000000000003','72300000-0000-0000-0000-000000000005',null,'life-scope-alpha','user_choice',timestamptz '2026-08-18 10:00:00+00',null),
  ('72400000-0000-0000-0000-000000000008','72200000-0000-0000-0000-000000000004','72300000-0000-0000-0000-000000000006',null,'life-scope-alpha','user_choice',timestamptz '2026-08-18 10:00:00+00',null),
  ('72400000-0000-0000-0000-000000000009','72200000-0000-0000-0000-000000000005','72300000-0000-0000-0000-000000000007',null,'life-scope-alpha','user_choice',timestamptz '2026-08-18 10:00:00+00',null),
  ('72400000-0000-0000-0000-000000000010','72200000-0000-0000-0000-000000000001',null,'72500000-0000-0000-0000-000000000001','life-scope-alpha','user_choice',timestamptz '2026-08-20 09:00:00+00',null);
SQL

rows=$("${psql_base[@]}" -Atc "select grant_id||'|'||character_id||'|'||grant_reason||'|'||to_char(granted_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS') from public.qry_life_fact_active_grants_v1('72200000-0000-0000-0000-000000000001','72300000-0000-0000-0000-000000000001');")
expected=$'72400000-0000-0000-0000-000000000001|life-scope-alpha|user_choice|2026-08-18 10:00:00\n72400000-0000-0000-0000-000000000003|life-scope-retired|user_choice|2026-08-18 12:00:00'
[[ "$rows" == "$expected" ]] || fail "active Life Fact grants projection mismatch: $rows"
pass "current Life Fact grant projection returns only active explicit grants in deterministic order"

[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_life_fact_active_grants_v1('72200000-0000-0000-0000-000000000001','72300000-0000-0000-0000-000000000001') where character_id='life-scope-beta';")" == "0" ]] || fail "revoked Life Fact grant leaked into current projection"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_life_fact_active_grants_v1('72200000-0000-0000-0000-000000000001','72300000-0000-0000-0000-000000000001') where grant_id='72400000-0000-0000-0000-000000000010';")" == "0" ]] || fail "Memory grant leaked into Life Fact grant projection"
pass "revoked grants and Memory grants are excluded from current Life Fact scope"

[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_life_fact_active_grants_v1('72200000-0000-0000-0000-000000000001','72300000-0000-0000-0000-000000000001');")" == "2" ]] || fail "superseded Life Fact explicit grant scope was hidden"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_life_fact_active_grants_v1('72200000-0000-0000-0000-000000000001','72300000-0000-0000-0000-000000000002');")" == "1" ]] || fail "current successor Life Fact explicit grant scope was not readable"
pass "grant visibility does not invent a supersession-based permission transition"

[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_life_fact_active_grants_v1('72200000-0000-0000-0000-000000000003','72300000-0000-0000-0000-000000000005');")" == "1" ]] || fail "active guest Life Fact grant projection was not readable"
pass "active canonical guest/member can read owned Life Fact grant scope"

before=$("${psql_base[@]}" -Atc "select string_agg(id::text||':'||coalesce(revoked_at::text,'NULL'),',' order by id) from public.record_access_grants where subject_id='72200000-0000-0000-0000-000000000001';")
"${psql_base[@]}" -Atc "select count(*) from public.qry_life_fact_active_grants_v1('72200000-0000-0000-0000-000000000001','72300000-0000-0000-0000-000000000001');" >/dev/null
after=$("${psql_base[@]}" -Atc "select string_agg(id::text||':'||coalesce(revoked_at::text,'NULL'),',' order by id) from public.record_access_grants where subject_id='72200000-0000-0000-0000-000000000001';")
[[ "$before" == "$after" ]] || fail "Life Fact grant read mutated permission authority"
pass "Life Fact grant read is projection-only"

expect_fail "revoked Life Fact current grants are not retrievable" "active Life Fact was not found for this subject" "select * from public.qry_life_fact_active_grants_v1('72200000-0000-0000-0000-000000000001','72300000-0000-0000-0000-000000000003');"
expect_fail "cross-owner Life Fact grant probe is denied" "active Life Fact was not found for this subject" "select * from public.qry_life_fact_active_grants_v1('72200000-0000-0000-0000-000000000002','72300000-0000-0000-0000-000000000001');"
expect_fail "unknown Life Fact grant probe is denied" "active Life Fact was not found for this subject" "select * from public.qry_life_fact_active_grants_v1('72200000-0000-0000-0000-000000000001','72300000-0000-0000-0000-000000000099');"
expect_fail "deletion-pending Life Fact grant generic read is denied" "Life Fact grant read requires an active canonical subject" "select * from public.qry_life_fact_active_grants_v1('72200000-0000-0000-0000-000000000004','72300000-0000-0000-0000-000000000006');"
expect_fail "merged Life Fact grant generic read is denied" "Life Fact grant read requires an active canonical subject" "select * from public.qry_life_fact_active_grants_v1('72200000-0000-0000-0000-000000000005','72300000-0000-0000-0000-000000000007');"
expect_fail "Life Fact grant subject is required" "Life Fact grant subject is required" "select * from public.qry_life_fact_active_grants_v1(null,'72300000-0000-0000-0000-000000000001');"
expect_fail "Life Fact is required" "Life Fact is required" "select * from public.qry_life_fact_active_grants_v1('72200000-0000-0000-0000-000000000001',null);"

volatility=$("${psql_base[@]}" -Atc "select provolatile from pg_proc where oid='public.qry_life_fact_active_grants_v1(uuid,uuid)'::regprocedure;")
[[ "$volatility" == "s" ]] || fail "Life Fact grant query is not STABLE: $volatility"
security_definer=$("${psql_base[@]}" -Atc "select case when prosecdef then '1' else '0' end from pg_proc where oid='public.qry_life_fact_active_grants_v1(uuid,uuid)'::regprocedure;")
[[ "$security_definer" == "0" ]] || fail "Life Fact grant query unexpectedly uses SECURITY DEFINER"
search_path=$("${psql_base[@]}" -Atc "select array_to_string(proconfig, ',') from pg_proc where oid='public.qry_life_fact_active_grants_v1(uuid,uuid)'::regprocedure;")
[[ "$search_path" == "search_path=public, pg_temp" ]] || fail "Life Fact grant query search_path mismatch: $search_path"
public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.qry_life_fact_active_grants_v1(uuid,uuid)','EXECUTE') then '1' else '0' end;")
[[ "$public_exec" == "0" ]] || fail "Life Fact grant query unexpectedly executable by PUBLIC"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == "60" ]] || fail "public table catalog changed"
pass "Life Fact grant query contract is STABLE/INVOKER, explicit search_path, PUBLIC-revoked, and table catalog remains 60"

echo "current Life Fact grant projection tests passed"
