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
  ('e1100000-0000-0000-0000-000000000001'),
  ('e1100000-0000-0000-0000-000000000002'),
  ('e1100000-0000-0000-0000-000000000003')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('e2100000-0000-0000-0000-000000000001','member','e1100000-0000-0000-0000-000000000001','active',null,clock_timestamp(),clock_timestamp()),
  ('e2100000-0000-0000-0000-000000000002','member','e1100000-0000-0000-0000-000000000002','active',null,clock_timestamp(),clock_timestamp()),
  ('e2100000-0000-0000-0000-000000000003','member','e1100000-0000-0000-0000-000000000003','deletion_pending',null,clock_timestamp(),clock_timestamp());

insert into public.characters(character_id,created_at,retired_at) values
  ('life-grant-alpha',clock_timestamp(),null),
  ('life-grant-beta',clock_timestamp(),null),
  ('life-grant-retired',clock_timestamp()-interval '10 days',clock_timestamp()-interval '1 day')
on conflict (character_id) do nothing;

insert into public.life_facts(
  id,subject_id,fact_type,schema_version,value_jsonb,valid_from,valid_to,source_kind,
  source_message_id,source_merge_action_id,supersedes_fact_id,confirmed_at,revoked_at,created_at
) values
  ('e3100000-0000-0000-0000-000000000001','e2100000-0000-0000-0000-000000000001','grant-example','life-v1','{"value":"primary"}',null,null,'user_explicit',null,null,null,clock_timestamp(),null,clock_timestamp()),
  ('e3100000-0000-0000-0000-000000000002','e2100000-0000-0000-0000-000000000001','grant-example','life-v1','{"value":"retired-target"}',null,null,'user_explicit',null,null,null,clock_timestamp(),null,clock_timestamp()),
  ('e3100000-0000-0000-0000-000000000003','e2100000-0000-0000-0000-000000000002','grant-example','life-v1','{"value":"other-owner"}',null,null,'user_explicit',null,null,null,clock_timestamp(),null,clock_timestamp()),
  ('e3100000-0000-0000-0000-000000000004','e2100000-0000-0000-0000-000000000003','grant-example','life-v1','{"value":"pending-owner"}',null,null,'user_explicit',null,null,null,clock_timestamp(),null,clock_timestamp()),
  ('e3100000-0000-0000-0000-000000000005','e2100000-0000-0000-0000-000000000001','supersede-example','life-v1','{"value":"old"}',null,null,'user_explicit',null,null,null,clock_timestamp(),null,clock_timestamp()),
  ('e3100000-0000-0000-0000-000000000006','e2100000-0000-0000-0000-000000000001','supersede-example','life-v1','{"value":"new"}',null,null,'user_explicit',null,null,'e3100000-0000-0000-0000-000000000005',clock_timestamp(),null,clock_timestamp()),
  ('e3100000-0000-0000-0000-000000000007','e2100000-0000-0000-0000-000000000001','revoked-example','life-v1','{"value":"revoked"}',null,null,'user_explicit',null,null,null,clock_timestamp(),timestamptz '2026-08-20 00:00:00+00',clock_timestamp()),
  ('e3100000-0000-0000-0000-000000000008','e2100000-0000-0000-0000-000000000001','race-example','life-v1','{"value":"race"}',null,null,'user_explicit',null,null,null,clock_timestamp(),null,clock_timestamp());

insert into public.record_access_grants(
  id,subject_id,life_fact_id,memory_item_id,grantee_character_id,grant_reason,granted_at,revoked_at
) values
  ('e4100000-0000-0000-0000-000000000001','e2100000-0000-0000-0000-000000000001','e3100000-0000-0000-0000-000000000001',null,'life-grant-alpha','user_choice',clock_timestamp(),null),
  ('e4100000-0000-0000-0000-000000000002','e2100000-0000-0000-0000-000000000001','e3100000-0000-0000-0000-000000000001',null,'life-grant-beta','user_choice',clock_timestamp(),null),
  ('e4100000-0000-0000-0000-000000000003','e2100000-0000-0000-0000-000000000001','e3100000-0000-0000-0000-000000000002',null,'life-grant-retired','user_choice',clock_timestamp(),null),
  ('e4100000-0000-0000-0000-000000000004','e2100000-0000-0000-0000-000000000001','e3100000-0000-0000-0000-000000000002',null,'life-grant-beta','user_choice',clock_timestamp(),timestamptz '2026-01-01 00:00:00+00'),
  ('e4100000-0000-0000-0000-000000000005','e2100000-0000-0000-0000-000000000002','e3100000-0000-0000-0000-000000000003',null,'life-grant-alpha','user_choice',clock_timestamp(),null),
  ('e4100000-0000-0000-0000-000000000006','e2100000-0000-0000-0000-000000000003','e3100000-0000-0000-0000-000000000004',null,'life-grant-alpha','user_choice',clock_timestamp(),null),
  ('e4100000-0000-0000-0000-000000000007','e2100000-0000-0000-0000-000000000001','e3100000-0000-0000-0000-000000000005',null,'life-grant-alpha','user_choice',clock_timestamp(),null),
  ('e4100000-0000-0000-0000-000000000008','e2100000-0000-0000-0000-000000000001','e3100000-0000-0000-0000-000000000007',null,'life-grant-alpha','user_choice',clock_timestamp(),null),
  ('e4100000-0000-0000-0000-000000000009','e2100000-0000-0000-0000-000000000001','e3100000-0000-0000-0000-000000000008',null,'life-grant-beta','user_choice',clock_timestamp(),null);
SQL

result=$("${psql_base[@]}" -Atc "select life_fact_id||'|'||character_id||'|'||revoked_grant_count||'|'||case when replayed then '1' else '0' end from public.cmd_revoke_life_fact_character_grant_v1('e2100000-0000-0000-0000-000000000001','e3100000-0000-0000-0000-000000000001','life-grant-alpha');")
[[ "$result" == "e3100000-0000-0000-0000-000000000001|life-grant-alpha|1|0" ]] || fail "Life Fact grant revoke result mismatch: $result"

preserved=$("${psql_base[@]}" -Atc "select (select count(*) from public.life_facts where id='e3100000-0000-0000-0000-000000000001' and revoked_at is null)::text||'|'||(select count(*) from public.record_access_grants where life_fact_id='e3100000-0000-0000-0000-000000000001' and grantee_character_id='life-grant-beta' and revoked_at is null)::text||'|'||(select count(*) from public.record_access_grants where life_fact_id='e3100000-0000-0000-0000-000000000002' and grantee_character_id='life-grant-retired' and revoked_at is null)::text||'|'||(select count(*) from public.record_access_grants where subject_id='e2100000-0000-0000-0000-000000000002' and revoked_at is null)::text;")
[[ "$preserved" == "1|1|1|1" ]] || fail "Life Fact grant revoke changed unrelated authority: $preserved"
[[ "$("${psql_base[@]}" -Atc "select revoked_at from public.record_access_grants where id='e4100000-0000-0000-0000-000000000004';")" == "2026-01-01 00:00:00+00" ]] || fail "Life Fact grant revoke rewrote historical revoked grant"
pass "individual Life Fact grant revoke preserves Life Fact and unrelated grants"

replay=$("${psql_base[@]}" -Atc "select revoked_grant_count||'|'||case when replayed then '1' else '0' end from public.cmd_revoke_life_fact_character_grant_v1('e2100000-0000-0000-0000-000000000001','e3100000-0000-0000-0000-000000000001','life-grant-alpha');")
[[ "$replay" == "0|1" ]] || fail "Life Fact grant revoke replay mismatch: $replay"
pass "repeat individual Life Fact grant revoke is a state-derived no-op replay"

retired=$("${psql_base[@]}" -Atc "select revoked_grant_count||'|'||case when replayed then '1' else '0' end from public.cmd_revoke_life_fact_character_grant_v1('e2100000-0000-0000-0000-000000000001','e3100000-0000-0000-0000-000000000002','life-grant-retired');")
[[ "$retired" == "1|0" ]] || fail "retired-character Life Fact grant revoke mismatch: $retired"
pass "retired character historical Life Fact grant remains revocable"

superseded=$("${psql_base[@]}" -Atc "select revoked_grant_count||'|'||case when replayed then '1' else '0' end from public.cmd_revoke_life_fact_character_grant_v1('e2100000-0000-0000-0000-000000000001','e3100000-0000-0000-0000-000000000005','life-grant-alpha');")
[[ "$superseded" == "1|0" ]] || fail "superseded Life Fact grant revoke mismatch: $superseded"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.life_facts where id='e3100000-0000-0000-0000-000000000006' and supersedes_fact_id='e3100000-0000-0000-0000-000000000005' and revoked_at is null;")" == "1" ]] || fail "superseded Life Fact grant revoke changed successor authority"
pass "superseded Life Fact explicit permission remains independently revocable"

revoked_fact=$("${psql_base[@]}" -Atc "select revoked_grant_count||'|'||case when replayed then '1' else '0' end from public.cmd_revoke_life_fact_character_grant_v1('e2100000-0000-0000-0000-000000000001','e3100000-0000-0000-0000-000000000007','life-grant-alpha');")
[[ "$revoked_fact" == "1|0" ]] || fail "revoked Life Fact historical grant revoke mismatch: $revoked_fact"
[[ "$("${psql_base[@]}" -Atc "select revoked_at from public.life_facts where id='e3100000-0000-0000-0000-000000000007';")" == "2026-08-20 00:00:00+00" ]] || fail "grant revoke rewrote Life Fact revoke provenance"
pass "Life Fact revoke provenance and grant revoke authority remain independent"

expect_fail "cross-owner Life Fact probe is denied" "life fact was not found for this subject" "select * from public.cmd_revoke_life_fact_character_grant_v1('e2100000-0000-0000-0000-000000000002','e3100000-0000-0000-0000-000000000001','life-grant-beta');"
expect_fail "unknown Life Fact revoke is denied" "life fact was not found for this subject" "select * from public.cmd_revoke_life_fact_character_grant_v1('e2100000-0000-0000-0000-000000000001','e3100000-0000-0000-0000-000000000099','life-grant-beta');"
expect_fail "unknown character revoke is denied" "character was not found" "select * from public.cmd_revoke_life_fact_character_grant_v1('e2100000-0000-0000-0000-000000000001','e3100000-0000-0000-0000-000000000001','life-grant-missing');"
expect_fail "deletion-pending subject cannot revoke Life Fact grant" "life fact grant revoke requires an active canonical subject" "select * from public.cmd_revoke_life_fact_character_grant_v1('e2100000-0000-0000-0000-000000000003','e3100000-0000-0000-0000-000000000004','life-grant-alpha');"
expect_fail "Life Fact grant subject is required" "subject id is required" "select * from public.cmd_revoke_life_fact_character_grant_v1(null,'e3100000-0000-0000-0000-000000000001','life-grant-alpha');"
expect_fail "Life Fact id is required" "life fact id is required" "select * from public.cmd_revoke_life_fact_character_grant_v1('e2100000-0000-0000-0000-000000000001',null,'life-grant-alpha');"
expect_fail "Life Fact grant character is required" "character id is required" "select * from public.cmd_revoke_life_fact_character_grant_v1('e2100000-0000-0000-0000-000000000001','e3100000-0000-0000-0000-000000000001','');"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.record_access_grants where id='e4100000-0000-0000-0000-000000000006' and revoked_at is null;")" == "1" ]] || fail "denied lifecycle request mutated grant"

rm -f /tmp/life-fact-grant-revoke-1.out /tmp/life-fact-grant-revoke-2.out
(
  "${psql_base[@]}" -Atc "begin; select revoked_grant_count||'|'||case when replayed then '1' else '0' end from public.cmd_revoke_life_fact_character_grant_v1('e2100000-0000-0000-0000-000000000001','e3100000-0000-0000-0000-000000000008','life-grant-beta'); select pg_sleep(0.4); commit;" > /tmp/life-fact-grant-revoke-1.out 2>&1
) & p1=$!
sleep 0.08
(
  "${psql_base[@]}" -Atc "select revoked_grant_count||'|'||case when replayed then '1' else '0' end from public.cmd_revoke_life_fact_character_grant_v1('e2100000-0000-0000-0000-000000000001','e3100000-0000-0000-0000-000000000008','life-grant-beta');" > /tmp/life-fact-grant-revoke-2.out 2>&1
) & p2=$!
wait $p1
wait $p2
race=$(cat /tmp/life-fact-grant-revoke-1.out /tmp/life-fact-grant-revoke-2.out)
[[ "$race" == *"1|0"* ]] || { cat /tmp/life-fact-grant-revoke-1.out /tmp/life-fact-grant-revoke-2.out >&2; fail "Life Fact grant revoke race missing mutation"; }
[[ "$race" == *"0|1"* ]] || { cat /tmp/life-fact-grant-revoke-1.out /tmp/life-fact-grant-revoke-2.out >&2; fail "Life Fact grant revoke race missing replay"; }
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.record_access_grants where life_fact_id='e3100000-0000-0000-0000-000000000008' and grantee_character_id='life-grant-beta' and revoked_at is null;")" == "0" ]] || fail "Life Fact grant revoke race left active grant"
pass "concurrent duplicate Life Fact grant revoke -> one mutation plus one no-op replay"

security_definer=$("${psql_base[@]}" -Atc "select case when prosecdef then '1' else '0' end from pg_proc where oid='public.cmd_revoke_life_fact_character_grant_v1(uuid,uuid,text)'::regprocedure;")
[[ "$security_definer" == "0" ]] || fail "Life Fact grant revoke unexpectedly uses SECURITY DEFINER"
search_path=$("${psql_base[@]}" -Atc "select array_to_string(proconfig, ',') from pg_proc where oid='public.cmd_revoke_life_fact_character_grant_v1(uuid,uuid,text)'::regprocedure;")
[[ "$search_path" == "search_path=public, pg_temp" ]] || fail "Life Fact grant revoke search_path mismatch: $search_path"
public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.cmd_revoke_life_fact_character_grant_v1(uuid,uuid,text)','EXECUTE') then '1' else '0' end;")
[[ "$public_exec" == "0" ]] || fail "Life Fact grant revoke unexpectedly executable by PUBLIC"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == "59" ]] || fail "public table catalog changed"
pass "Life Fact grant revoke command is INVOKER, explicit search_path, PUBLIC-revoked, and public table catalog remains 59"

echo "individual Life Fact grant revoke persistence/concurrency tests passed"
