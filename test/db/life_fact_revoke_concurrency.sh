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
  ('71000000-0000-0000-0000-000000000001'),
  ('71000000-0000-0000-0000-000000000002'),
  ('71000000-0000-0000-0000-000000000003')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('72000000-0000-0000-0000-000000000001','member','71000000-0000-0000-0000-000000000001','active',null,clock_timestamp(),clock_timestamp()),
  ('72000000-0000-0000-0000-000000000002','member','71000000-0000-0000-0000-000000000002','active',null,clock_timestamp(),clock_timestamp()),
  ('72000000-0000-0000-0000-000000000003','member','71000000-0000-0000-0000-000000000003','deletion_pending',null,clock_timestamp(),clock_timestamp());

insert into public.characters(character_id,created_at,retired_at) values
  ('life-revoke-alpha',clock_timestamp(),null),
  ('life-revoke-beta',clock_timestamp(),null)
on conflict (character_id) do nothing;

insert into public.life_facts(
  id,subject_id,fact_type,schema_version,value_jsonb,valid_from,valid_to,source_kind,
  source_message_id,source_merge_action_id,supersedes_fact_id,confirmed_at,revoked_at,created_at
) values
  ('73000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000001','employment_status','life-fact-v1','{"value":"employed"}',null,null,'user_explicit',null,null,null,clock_timestamp(),null,clock_timestamp()),
  ('73000000-0000-0000-0000-000000000002','72000000-0000-0000-0000-000000000001','relationship_status','life-fact-v1','{"value":"dating"}',null,null,'user_explicit',null,null,null,clock_timestamp(),null,clock_timestamp()),
  ('73000000-0000-0000-0000-000000000003','72000000-0000-0000-0000-000000000001','relationship_status','life-fact-v1','{"value":"single"}',null,null,'profile_edit',null,null,'73000000-0000-0000-0000-000000000002',clock_timestamp(),null,clock_timestamp()),
  ('73000000-0000-0000-0000-000000000004','72000000-0000-0000-0000-000000000002','employment_status','life-fact-v1','{"value":"other-owner"}',null,null,'user_explicit',null,null,null,clock_timestamp(),null,clock_timestamp()),
  ('73000000-0000-0000-0000-000000000005','72000000-0000-0000-0000-000000000003','employment_status','life-fact-v1','{"value":"pending-delete"}',null,null,'user_explicit',null,null,null,clock_timestamp(),null,clock_timestamp()),
  ('73000000-0000-0000-0000-000000000006','72000000-0000-0000-0000-000000000001','planned_event','life-fact-v1','{"value":"race"}',null,null,'user_explicit',null,null,null,clock_timestamp(),null,clock_timestamp());

insert into public.record_access_grants(
  id,subject_id,life_fact_id,memory_item_id,grantee_character_id,grant_reason,granted_at,revoked_at
) values
  ('74000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000001',null,'life-revoke-alpha','user_choice',clock_timestamp(),null),
  ('74000000-0000-0000-0000-000000000002','72000000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000001',null,'life-revoke-beta','user_choice',clock_timestamp(),null),
  ('74000000-0000-0000-0000-000000000003','72000000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000003',null,'life-revoke-alpha','user_choice',clock_timestamp(),null),
  ('74000000-0000-0000-0000-000000000004','72000000-0000-0000-0000-000000000002','73000000-0000-0000-0000-000000000004',null,'life-revoke-alpha','user_choice',clock_timestamp(),null);
SQL

result=$("${psql_base[@]}" -Atc "select life_fact_id||'|'||case when revoked_at is not null then '1' else '0' end||'|'||case when replayed then '1' else '0' end from public.cmd_revoke_life_fact_v1('72000000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000001');")
[[ "$result" == "73000000-0000-0000-0000-000000000001|1|0" ]] || fail "life fact revoke result mismatch: $result"

preserved=$("${psql_base[@]}" -Atc "select (select count(*) from public.life_facts where id='73000000-0000-0000-0000-000000000001' and fact_type='employment_status' and schema_version='life-fact-v1' and value_jsonb='{"value":"employed"}'::jsonb and source_kind='user_explicit')::text||'|'||(select count(*) from public.record_access_grants where life_fact_id='73000000-0000-0000-0000-000000000001' and revoked_at is null)::text||'|'||(select count(*) from public.life_facts where id='73000000-0000-0000-0000-000000000003' and revoked_at is null)::text||'|'||(select count(*) from public.life_facts where subject_id='72000000-0000-0000-0000-000000000002' and revoked_at is null)::text;")
[[ "$preserved" == "1|2|1|1" ]] || fail "life fact revoke changed provenance/unrelated authority: $preserved"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.life_facts where id='73000000-0000-0000-0000-000000000001' and revoked_at is null;")" == "0" ]] || fail "revoked Life Fact still qualifies as current-context row"
pass "Life Fact revoke preserves structured history/grants while excluding the fact from current context"

first_revoked_at=$("${psql_base[@]}" -Atc "select revoked_at from public.life_facts where id='73000000-0000-0000-0000-000000000001';")
replay=$("${psql_base[@]}" -Atc "select case when revoked_at::text='${first_revoked_at}' then '1' else '0' end||'|'||case when replayed then '1' else '0' end from public.cmd_revoke_life_fact_v1('72000000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000001');")
[[ "$replay" == "1|1" ]] || fail "life fact revoke replay mismatch: $replay"
pass "repeat Life Fact revoke replays the original revocation timestamp"

historical=$("${psql_base[@]}" -Atc "select case when revoked_at is not null then '1' else '0' end||'|'||case when replayed then '1' else '0' end from public.cmd_revoke_life_fact_v1('72000000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000002');")
[[ "$historical" == "1|0" ]] || fail "superseded historical Life Fact revoke mismatch: $historical"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.life_facts where id='73000000-0000-0000-0000-000000000003' and supersedes_fact_id='73000000-0000-0000-0000-000000000002' and revoked_at is null;")" == "1" ]] || fail "revoking superseded fact damaged successor lineage"
pass "superseded historical Life Fact remains independently revocable without damaging its successor"

expect_fail "cross-owner Life Fact probe is denied" "life fact was not found for this subject" "select * from public.cmd_revoke_life_fact_v1('72000000-0000-0000-0000-000000000002','73000000-0000-0000-0000-000000000001');"
expect_fail "unknown Life Fact revoke is denied" "life fact was not found for this subject" "select * from public.cmd_revoke_life_fact_v1('72000000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000099');"
expect_fail "deletion-pending subject cannot start standalone Life Fact revoke" "life fact revoke requires an active canonical subject" "select * from public.cmd_revoke_life_fact_v1('72000000-0000-0000-0000-000000000003','73000000-0000-0000-0000-000000000005');"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.life_facts where id='73000000-0000-0000-0000-000000000005' and revoked_at is null;")" == "1" ]] || fail "denied lifecycle request mutated Life Fact"

rm -f /tmp/life-fact-revoke-1.out /tmp/life-fact-revoke-2.out
(
  "${psql_base[@]}" -Atc "begin; select case when replayed then '1' else '0' end from public.cmd_revoke_life_fact_v1('72000000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000006'); select pg_sleep(0.4); commit;" > /tmp/life-fact-revoke-1.out 2>&1
) & p1=$!
sleep 0.08
(
  "${psql_base[@]}" -Atc "select case when replayed then '1' else '0' end from public.cmd_revoke_life_fact_v1('72000000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000006');" > /tmp/life-fact-revoke-2.out 2>&1
) & p2=$!
wait $p1
wait $p2
race=$(cat /tmp/life-fact-revoke-1.out /tmp/life-fact-revoke-2.out)
[[ "$race" == *"0"* ]] || { cat /tmp/life-fact-revoke-1.out /tmp/life-fact-revoke-2.out >&2; fail "Life Fact revoke race missing mutation"; }
[[ "$race" == *"1"* ]] || { cat /tmp/life-fact-revoke-1.out /tmp/life-fact-revoke-2.out >&2; fail "Life Fact revoke race missing replay"; }
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.life_facts where id='73000000-0000-0000-0000-000000000006' and revoked_at is not null;")" == "1" ]] || fail "Life Fact revoke race did not terminalize exactly one fact"
pass "concurrent duplicate Life Fact revoke -> one mutation plus one authoritative replay"

public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.cmd_revoke_life_fact_v1(uuid,uuid)','EXECUTE') then '1' else '0' end;")
[[ "$public_exec" == "0" ]] || fail "Life Fact revoke command unexpectedly executable by PUBLIC"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == "59" ]] || fail "public table catalog changed"
pass "Life Fact revoke command PUBLIC EXECUTE remains revoked and public table catalog remains 59"

echo "Life Fact revoke persistence/concurrency tests passed"
