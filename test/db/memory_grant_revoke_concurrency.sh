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
  ('f1000000-0000-0000-0000-000000000001'),
  ('f1000000-0000-0000-0000-000000000002'),
  ('f1000000-0000-0000-0000-000000000003')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('f2000000-0000-0000-0000-000000000001','member','f1000000-0000-0000-0000-000000000001','active',null,clock_timestamp(),clock_timestamp()),
  ('f2000000-0000-0000-0000-000000000002','member','f1000000-0000-0000-0000-000000000002','active',null,clock_timestamp(),clock_timestamp()),
  ('f2000000-0000-0000-0000-000000000003','member','f1000000-0000-0000-0000-000000000003','deletion_pending',null,clock_timestamp(),clock_timestamp());

insert into public.characters(character_id,created_at,retired_at) values
  ('grant-alpha',clock_timestamp(),null),
  ('grant-beta',clock_timestamp(),null),
  ('grant-retired',clock_timestamp()-interval '10 days',clock_timestamp()-interval '1 day')
on conflict (character_id) do nothing;

insert into public.memory_items(
  id,subject_id,memory_type,schema_version,content_jsonb,source_kind,source_turn_id,source_message_id,
  source_merge_action_id,created_by_character_id,revoked_at,created_at
) values
  ('f3000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','shared_detail','memory-v1','{"value":"owner-a"}','user_approved',null,null,null,'grant-alpha',null,clock_timestamp()),
  ('f3000000-0000-0000-0000-000000000002','f2000000-0000-0000-0000-000000000001','shared_detail','memory-v1','{"value":"owner-b"}','user_approved',null,null,null,'grant-beta',null,clock_timestamp()),
  ('f3000000-0000-0000-0000-000000000003','f2000000-0000-0000-0000-000000000002','shared_detail','memory-v1','{"value":"other"}','user_approved',null,null,null,'grant-alpha',null,clock_timestamp()),
  ('f3000000-0000-0000-0000-000000000004','f2000000-0000-0000-0000-000000000003','shared_detail','memory-v1','{"value":"pending"}','user_approved',null,null,null,'grant-alpha',null,clock_timestamp());

insert into public.record_access_grants(
  id,subject_id,life_fact_id,memory_item_id,grantee_character_id,grant_reason,granted_at,revoked_at
) values
  ('f4000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001',null,'f3000000-0000-0000-0000-000000000001','grant-alpha','user_choice',clock_timestamp(),null),
  ('f4000000-0000-0000-0000-000000000002','f2000000-0000-0000-0000-000000000001',null,'f3000000-0000-0000-0000-000000000001','grant-beta','user_choice',clock_timestamp(),null),
  ('f4000000-0000-0000-0000-000000000003','f2000000-0000-0000-0000-000000000001',null,'f3000000-0000-0000-0000-000000000002','grant-alpha','user_choice',clock_timestamp(),null),
  ('f4000000-0000-0000-0000-000000000004','f2000000-0000-0000-0000-000000000001',null,'f3000000-0000-0000-0000-000000000002','grant-beta','user_choice',clock_timestamp(),timestamptz '2026-01-01 00:00:00+00'),
  ('f4000000-0000-0000-0000-000000000005','f2000000-0000-0000-0000-000000000002',null,'f3000000-0000-0000-0000-000000000003','grant-alpha','user_choice',clock_timestamp(),null),
  ('f4000000-0000-0000-0000-000000000006','f2000000-0000-0000-0000-000000000003',null,'f3000000-0000-0000-0000-000000000004','grant-alpha','user_choice',clock_timestamp(),null),
  ('f4000000-0000-0000-0000-000000000007','f2000000-0000-0000-0000-000000000001',null,'f3000000-0000-0000-0000-000000000002','grant-retired','user_choice',clock_timestamp(),null);
SQL

result=$("${psql_base[@]}" -Atc "select memory_item_id||'|'||character_id||'|'||revoked_grant_count||'|'||case when replayed then '1' else '0' end from public.cmd_revoke_memory_character_grant_v1('f2000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000001','grant-alpha');")
[[ "$result" == "f3000000-0000-0000-0000-000000000001|grant-alpha|1|0" ]] || fail "memory grant revoke result mismatch: $result"

preserved=$("${psql_base[@]}" -Atc "select (select count(*) from public.memory_items where id='f3000000-0000-0000-0000-000000000001' and revoked_at is null)::text||'|'||(select count(*) from public.record_access_grants where memory_item_id='f3000000-0000-0000-0000-000000000001' and grantee_character_id='grant-beta' and revoked_at is null)::text||'|'||(select count(*) from public.record_access_grants where memory_item_id='f3000000-0000-0000-0000-000000000002' and grantee_character_id='grant-alpha' and revoked_at is null)::text||'|'||(select count(*) from public.record_access_grants where subject_id='f2000000-0000-0000-0000-000000000002' and revoked_at is null)::text;")
[[ "$preserved" == "1|1|1|1" ]] || fail "memory grant revoke changed unrelated authority: $preserved"
[[ "$("${psql_base[@]}" -Atc "select revoked_at from public.record_access_grants where id='f4000000-0000-0000-0000-000000000004';")" == "2026-01-01 00:00:00+00" ]] || fail "memory grant revoke rewrote historical revoked grant"
pass "individual memory grant revoke preserves Memory and unrelated grants"

replay=$("${psql_base[@]}" -Atc "select revoked_grant_count||'|'||case when replayed then '1' else '0' end from public.cmd_revoke_memory_character_grant_v1('f2000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000001','grant-alpha');")
[[ "$replay" == "0|1" ]] || fail "memory grant revoke replay mismatch: $replay"
pass "repeat individual revoke is a state-derived no-op replay"

retired=$("${psql_base[@]}" -Atc "select revoked_grant_count||'|'||case when replayed then '1' else '0' end from public.cmd_revoke_memory_character_grant_v1('f2000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000002','grant-retired');")
[[ "$retired" == "1|0" ]] || fail "retired-character grant revoke mismatch: $retired"
pass "retired character historical Memory grant remains revocable"

expect_fail "cross-owner memory probe is denied" "memory item was not found for this subject" "select * from public.cmd_revoke_memory_character_grant_v1('f2000000-0000-0000-0000-000000000002','f3000000-0000-0000-0000-000000000001','grant-beta');"
expect_fail "unknown memory revoke is denied" "memory item was not found for this subject" "select * from public.cmd_revoke_memory_character_grant_v1('f2000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000099','grant-beta');"
expect_fail "unknown character revoke is denied" "character was not found" "select * from public.cmd_revoke_memory_character_grant_v1('f2000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000002','grant-missing');"
expect_fail "deletion-pending subject cannot revoke Memory grant" "memory grant revoke requires an active canonical subject" "select * from public.cmd_revoke_memory_character_grant_v1('f2000000-0000-0000-0000-000000000003','f3000000-0000-0000-0000-000000000004','grant-alpha');"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.record_access_grants where id='f4000000-0000-0000-0000-000000000006' and revoked_at is null;")" == "1" ]] || fail "denied lifecycle request mutated grant"

"${psql_base[@]}" <<'SQL'
insert into public.record_access_grants(
  id,subject_id,life_fact_id,memory_item_id,grantee_character_id,grant_reason,granted_at,revoked_at
) values
  ('f4000000-0000-0000-0000-000000000011','f2000000-0000-0000-0000-000000000001',null,'f3000000-0000-0000-0000-000000000001','grant-alpha','user_choice',clock_timestamp(),null);
SQL

rm -f /tmp/memory-grant-revoke-1.out /tmp/memory-grant-revoke-2.out
(
  "${psql_base[@]}" -Atc "begin; select revoked_grant_count||'|'||case when replayed then '1' else '0' end from public.cmd_revoke_memory_character_grant_v1('f2000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000001','grant-alpha'); select pg_sleep(0.4); commit;" > /tmp/memory-grant-revoke-1.out 2>&1
) & p1=$!
sleep 0.08
(
  "${psql_base[@]}" -Atc "select revoked_grant_count||'|'||case when replayed then '1' else '0' end from public.cmd_revoke_memory_character_grant_v1('f2000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000001','grant-alpha');" > /tmp/memory-grant-revoke-2.out 2>&1
) & p2=$!
wait $p1
wait $p2
race=$(cat /tmp/memory-grant-revoke-1.out /tmp/memory-grant-revoke-2.out)
[[ "$race" == *"1|0"* ]] || { cat /tmp/memory-grant-revoke-1.out /tmp/memory-grant-revoke-2.out >&2; fail "memory grant revoke race missing mutation"; }
[[ "$race" == *"0|1"* ]] || { cat /tmp/memory-grant-revoke-1.out /tmp/memory-grant-revoke-2.out >&2; fail "memory grant revoke race missing replay"; }
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.record_access_grants where memory_item_id='f3000000-0000-0000-0000-000000000001' and grantee_character_id='grant-alpha' and revoked_at is null;")" == "0" ]] || fail "memory grant revoke race left active grant"
pass "concurrent duplicate Memory grant revoke -> one mutation plus one no-op replay"

public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.cmd_revoke_memory_character_grant_v1(uuid,uuid,text)','EXECUTE') then '1' else '0' end;")
[[ "$public_exec" == "0" ]] || fail "memory grant revoke command unexpectedly executable by PUBLIC"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == "60" ]] || fail "public table catalog changed"
pass "Memory grant revoke command PUBLIC EXECUTE remains revoked and public table catalog remains 60"

echo "individual Memory grant revoke persistence/concurrency tests passed"
