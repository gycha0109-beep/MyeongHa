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
  ('e1000000-0000-0000-0000-000000000001'),
  ('e1000000-0000-0000-0000-000000000002'),
  ('e1000000-0000-0000-0000-000000000003')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('e2000000-0000-0000-0000-000000000001','member','e1000000-0000-0000-0000-000000000001','active',null,clock_timestamp(),clock_timestamp()),
  ('e2000000-0000-0000-0000-000000000002','member','e1000000-0000-0000-0000-000000000002','active',null,clock_timestamp(),clock_timestamp()),
  ('e2000000-0000-0000-0000-000000000003','member','e1000000-0000-0000-0000-000000000003','deletion_pending',null,clock_timestamp(),clock_timestamp());

insert into public.characters(character_id,created_at,retired_at) values
  ('forget-alpha',clock_timestamp(),null),
  ('forget-beta',clock_timestamp(),null),
  ('forget-retired',clock_timestamp()-interval '10 days',clock_timestamp()-interval '1 day')
on conflict (character_id) do nothing;

insert into public.life_facts(
  id,subject_id,fact_type,schema_version,value_jsonb,valid_from,valid_to,source_kind,
  source_message_id,source_merge_action_id,supersedes_fact_id,confirmed_at,revoked_at,created_at
) values
  ('e3000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001','work','fact-v1','{"value":"a"}',null,null,'user_explicit',null,null,null,clock_timestamp(),null,clock_timestamp()),
  ('e3000000-0000-0000-0000-000000000002','e2000000-0000-0000-0000-000000000001','home','fact-v1','{"value":"b"}',null,null,'user_explicit',null,null,null,clock_timestamp(),null,clock_timestamp()),
  ('e3000000-0000-0000-0000-000000000003','e2000000-0000-0000-0000-000000000002','work','fact-v1','{"value":"other"}',null,null,'user_explicit',null,null,null,clock_timestamp(),null,clock_timestamp()),
  ('e3000000-0000-0000-0000-000000000004','e2000000-0000-0000-0000-000000000003','work','fact-v1','{"value":"pending"}',null,null,'user_explicit',null,null,null,clock_timestamp(),null,clock_timestamp());

insert into public.memory_items(
  id,subject_id,memory_type,schema_version,content_jsonb,source_kind,source_turn_id,source_message_id,
  source_merge_action_id,created_by_character_id,revoked_at,created_at
) values
  ('e4000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001','shared_detail','memory-v1','{"value":"m1"}','user_approved',null,null,null,'forget-alpha',null,clock_timestamp()),
  ('e4000000-0000-0000-0000-000000000002','e2000000-0000-0000-0000-000000000001','shared_detail','memory-v1','{"value":"m2"}','user_approved',null,null,null,'forget-beta',null,clock_timestamp());

insert into public.record_access_grants(
  id,subject_id,life_fact_id,memory_item_id,grantee_character_id,grant_reason,granted_at,revoked_at
) values
  ('e5000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001',null,'forget-alpha','user_choice',clock_timestamp(),null),
  ('e5000000-0000-0000-0000-000000000002','e2000000-0000-0000-0000-000000000001',null,'e4000000-0000-0000-0000-000000000001','forget-alpha','user_choice',clock_timestamp(),null),
  ('e5000000-0000-0000-0000-000000000003','e2000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000002',null,'forget-beta','user_choice',clock_timestamp(),null),
  ('e5000000-0000-0000-0000-000000000004','e2000000-0000-0000-0000-000000000001',null,'e4000000-0000-0000-0000-000000000002','forget-alpha','user_choice',clock_timestamp(),timestamptz '2026-01-01 00:00:00+00'),
  ('e5000000-0000-0000-0000-000000000005','e2000000-0000-0000-0000-000000000002','e3000000-0000-0000-0000-000000000003',null,'forget-alpha','user_choice',clock_timestamp(),null),
  ('e5000000-0000-0000-0000-000000000006','e2000000-0000-0000-0000-000000000003','e3000000-0000-0000-0000-000000000004',null,'forget-alpha','user_choice',clock_timestamp(),null),
  ('e5000000-0000-0000-0000-000000000007','e2000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000002',null,'forget-retired','user_choice',clock_timestamp(),null);
SQL

result=$("${psql_base[@]}" -Atc "select character_id||'|'||revoked_grant_count||'|'||case when replayed then '1' else '0' end from public.cmd_forget_character_records_v1('e2000000-0000-0000-0000-000000000001','forget-alpha');")
[[ "$result" == "forget-alpha|2|0" ]] || fail "character forget result mismatch: $result"

active_alpha=$("${psql_base[@]}" -Atc "select count(*) from public.record_access_grants where subject_id='e2000000-0000-0000-0000-000000000001' and grantee_character_id='forget-alpha' and revoked_at is null;")
[[ "$active_alpha" == "0" ]] || fail "forgotten character still has active grants: $active_alpha"

preserved=$("${psql_base[@]}" -Atc "select (select count(*) from public.life_facts where subject_id='e2000000-0000-0000-0000-000000000001' and revoked_at is null)::text||'|'||(select count(*) from public.memory_items where subject_id='e2000000-0000-0000-0000-000000000001' and revoked_at is null)::text||'|'||(select count(*) from public.record_access_grants where subject_id='e2000000-0000-0000-0000-000000000001' and grantee_character_id='forget-beta' and revoked_at is null)::text||'|'||(select count(*) from public.record_access_grants where subject_id='e2000000-0000-0000-0000-000000000002' and grantee_character_id='forget-alpha' and revoked_at is null)::text;")
[[ "$preserved" == "2|2|1|1" ]] || fail "forget modified record/other-character/other-subject authority: $preserved"

prior_revoked=$("${psql_base[@]}" -Atc "select revoked_at from public.record_access_grants where id='e5000000-0000-0000-0000-000000000004';")
[[ "$prior_revoked" == "2026-01-01 00:00:00+00" ]] || fail "forget rewrote prior revoked grant timestamp: $prior_revoked"
pass "character forget revokes only this character active grants and preserves shared records/other grants"

replay=$("${psql_base[@]}" -Atc "select revoked_grant_count||'|'||case when replayed then '1' else '0' end from public.cmd_forget_character_records_v1('e2000000-0000-0000-0000-000000000001','forget-alpha');")
[[ "$replay" == "0|1" ]] || fail "character forget replay mismatch: $replay"
pass "character forget repeat is a state-derived no-op replay"

retired=$("${psql_base[@]}" -Atc "select revoked_grant_count||'|'||case when replayed then '1' else '0' end from public.cmd_forget_character_records_v1('e2000000-0000-0000-0000-000000000001','forget-retired');")
[[ "$retired" == "1|0" ]] || fail "retired character forget mismatch: $retired"
pass "retired character remains forgettable so historical grants can be revoked"

expect_fail "unknown character forget is denied" "character was not found" "select * from public.cmd_forget_character_records_v1('e2000000-0000-0000-0000-000000000001','forget-missing');"
expect_fail "unknown subject forget is denied" "subject was not found" "select * from public.cmd_forget_character_records_v1('e2000000-0000-0000-0000-000000000099','forget-alpha');"
expect_fail "deletion-pending subject cannot start character forget command" "character forget requires an active canonical subject" "select * from public.cmd_forget_character_records_v1('e2000000-0000-0000-0000-000000000003','forget-alpha');"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.record_access_grants where subject_id='e2000000-0000-0000-000000000003' and grantee_character_id='forget-alpha' and revoked_at is null;")" == "1" ]] || fail "denied forget mutated deletion-pending subject grant"

# Re-grant two records, then race duplicate forget calls. Subject row lock must linearize them.
"${psql_base[@]}" <<'SQL'
insert into public.record_access_grants(
  id,subject_id,life_fact_id,memory_item_id,grantee_character_id,grant_reason,granted_at,revoked_at
) values
  ('e5000000-0000-0000-0000-000000000011','e2000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001',null,'forget-alpha','user_choice',clock_timestamp(),null),
  ('e5000000-0000-0000-0000-000000000012','e2000000-0000-0000-0000-000000000001',null,'e4000000-0000-0000-0000-000000000001','forget-alpha','user_choice',clock_timestamp(),null);
SQL

rm -f /tmp/character-forget-1.out /tmp/character-forget-2.out
(
  "${psql_base[@]}" -Atc "begin; select revoked_grant_count||'|'||case when replayed then '1' else '0' end from public.cmd_forget_character_records_v1('e2000000-0000-0000-0000-000000000001','forget-alpha'); select pg_sleep(0.4); commit;" > /tmp/character-forget-1.out 2>&1
) & p1=$!
sleep 0.08
(
  "${psql_base[@]}" -Atc "select revoked_grant_count||'|'||case when replayed then '1' else '0' end from public.cmd_forget_character_records_v1('e2000000-0000-0000-0000-000000000001','forget-alpha');" > /tmp/character-forget-2.out 2>&1
) & p2=$!
wait $p1
wait $p2
race=$(cat /tmp/character-forget-1.out /tmp/character-forget-2.out)
[[ "$race" == *"2|0"* ]] || { cat /tmp/character-forget-1.out /tmp/character-forget-2.out >&2; fail "character forget race missing mutation"; }
[[ "$race" == *"0|1"* ]] || { cat /tmp/character-forget-1.out /tmp/character-forget-2.out >&2; fail "character forget race missing replay"; }
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.record_access_grants where subject_id='e2000000-0000-0000-0000-000000000001' and grantee_character_id='forget-alpha' and revoked_at is null;")" == "0" ]] || fail "character forget race left an active grant"
pass "concurrent duplicate character forget -> one mutation plus one no-op replay"

public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.cmd_forget_character_records_v1(uuid,text)','EXECUTE') then '1' else '0' end;")
[[ "$public_exec" == "0" ]] || fail "character forget command unexpectedly executable by PUBLIC"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == "59" ]] || fail "public table catalog changed"
pass "character forget command PUBLIC EXECUTE remains revoked and public table catalog remains 59"

echo "character forget grant revocation persistence/concurrency tests passed"
