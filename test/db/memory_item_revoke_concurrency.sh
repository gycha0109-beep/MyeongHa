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
  ('81000000-0000-0000-0000-000000000003')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('82000000-0000-0000-0000-000000000001','member','81000000-0000-0000-0000-000000000001','active',null,clock_timestamp(),clock_timestamp()),
  ('82000000-0000-0000-0000-000000000002','member','81000000-0000-0000-0000-000000000002','active',null,clock_timestamp(),clock_timestamp()),
  ('82000000-0000-0000-0000-000000000003','member','81000000-0000-0000-0000-000000000003','deletion_pending',null,clock_timestamp(),clock_timestamp());

insert into public.characters(character_id,created_at,retired_at) values
  ('memory-item-alpha',clock_timestamp(),null),
  ('memory-item-beta',clock_timestamp(),null)
on conflict (character_id) do nothing;

insert into public.memory_items(
  id,subject_id,memory_type,schema_version,content_jsonb,source_kind,source_turn_id,source_message_id,
  source_merge_action_id,created_by_character_id,revoked_at,created_at
) values
  ('83000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000001','shared_detail','memory-v1','{"value":"preserve-me"}','user_approved',null,null,null,'memory-item-alpha',null,clock_timestamp()),
  ('83000000-0000-0000-0000-000000000002','82000000-0000-0000-0000-000000000001','preference','memory-v1','{"value":"unrelated"}','user_approved',null,null,null,'memory-item-beta',null,clock_timestamp()),
  ('83000000-0000-0000-0000-000000000003','82000000-0000-0000-0000-000000000002','shared_detail','memory-v1','{"value":"other-owner"}','user_approved',null,null,null,'memory-item-alpha',null,clock_timestamp()),
  ('83000000-0000-0000-0000-000000000004','82000000-0000-0000-0000-000000000003','shared_detail','memory-v1','{"value":"pending-delete"}','user_approved',null,null,null,'memory-item-alpha',null,clock_timestamp()),
  ('83000000-0000-0000-0000-000000000005','82000000-0000-0000-0000-000000000001','planned_event','memory-v1','{"value":"race"}','user_approved',null,null,null,'memory-item-alpha',null,clock_timestamp());

insert into public.record_access_grants(
  id,subject_id,life_fact_id,memory_item_id,grantee_character_id,grant_reason,granted_at,revoked_at
) values
  ('84000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000001',null,'83000000-0000-0000-0000-000000000001','memory-item-alpha','user_choice',clock_timestamp(),null),
  ('84000000-0000-0000-0000-000000000002','82000000-0000-0000-0000-000000000001',null,'83000000-0000-0000-0000-000000000001','memory-item-beta','user_choice',clock_timestamp(),null),
  ('84000000-0000-0000-0000-000000000003','82000000-0000-0000-0000-000000000001',null,'83000000-0000-0000-0000-000000000002','memory-item-alpha','user_choice',clock_timestamp(),null),
  ('84000000-0000-0000-0000-000000000004','82000000-0000-0000-0000-000000000002',null,'83000000-0000-0000-0000-000000000003','memory-item-alpha','user_choice',clock_timestamp(),null);
SQL

result=$("${psql_base[@]}" -Atc "select memory_item_id||'|'||case when revoked_at is not null then '1' else '0' end||'|'||case when replayed then '1' else '0' end from public.cmd_revoke_memory_item_v1('82000000-0000-0000-0000-000000000001','83000000-0000-0000-0000-000000000001');")
[[ "$result" == "83000000-0000-0000-0000-000000000001|1|0" ]] || fail "Memory Item revoke result mismatch: $result"

preserved=$("${psql_base[@]}" -Atc "select (select count(*) from public.memory_items where id='83000000-0000-0000-0000-000000000001' and memory_type='shared_detail' and schema_version='memory-v1' and content_jsonb ->> 'value' = 'preserve-me' and source_kind='user_approved' and created_by_character_id='memory-item-alpha')::text||'|'||(select count(*) from public.record_access_grants where memory_item_id='83000000-0000-0000-0000-000000000001' and revoked_at is null)::text||'|'||(select count(*) from public.memory_items where id='83000000-0000-0000-0000-000000000002' and revoked_at is null)::text||'|'||(select count(*) from public.memory_items where subject_id='82000000-0000-0000-0000-000000000002' and revoked_at is null)::text;")
[[ "$preserved" == "1|2|1|1" ]] || fail "Memory Item revoke changed provenance/grants/unrelated authority: $preserved"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.memory_items where id='83000000-0000-0000-0000-000000000001' and revoked_at is null;")" == "0" ]] || fail "revoked Memory Item still qualifies as current-context row"
pass "Memory Item revoke preserves content/source/grants while excluding the Memory from current context"

first_revoked_at=$("${psql_base[@]}" -Atc "select revoked_at from public.memory_items where id='83000000-0000-0000-0000-000000000001';")
replay=$("${psql_base[@]}" -Atc "select case when revoked_at::text='${first_revoked_at}' then '1' else '0' end||'|'||case when replayed then '1' else '0' end from public.cmd_revoke_memory_item_v1('82000000-0000-0000-0000-000000000001','83000000-0000-0000-0000-000000000001');")
[[ "$replay" == "1|1" ]] || fail "Memory Item revoke replay mismatch: $replay"
pass "repeat Memory Item revoke replays the original revocation timestamp"

expect_fail "cross-owner Memory Item probe is denied" "memory item was not found for this subject" "select * from public.cmd_revoke_memory_item_v1('82000000-0000-0000-0000-000000000002','83000000-0000-0000-0000-000000000001');"
expect_fail "unknown Memory Item revoke is denied" "memory item was not found for this subject" "select * from public.cmd_revoke_memory_item_v1('82000000-0000-0000-0000-000000000001','83000000-0000-0000-0000-000000000099');"
expect_fail "deletion-pending subject cannot start standalone Memory Item revoke" "memory item revoke requires an active canonical subject" "select * from public.cmd_revoke_memory_item_v1('82000000-0000-0000-0000-000000000003','83000000-0000-0000-0000-000000000004');"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.memory_items where id='83000000-0000-0000-0000-000000000004' and revoked_at is null;")" == "1" ]] || fail "denied lifecycle request mutated Memory Item"

rm -f /tmp/memory-item-revoke-1.out /tmp/memory-item-revoke-2.out
(
  "${psql_base[@]}" -Atc "begin; select case when replayed then '1' else '0' end from public.cmd_revoke_memory_item_v1('82000000-0000-0000-0000-000000000001','83000000-0000-0000-0000-000000000005'); select pg_sleep(0.4); commit;" > /tmp/memory-item-revoke-1.out 2>&1
) & p1=$!
sleep 0.08
(
  "${psql_base[@]}" -Atc "select case when replayed then '1' else '0' end from public.cmd_revoke_memory_item_v1('82000000-0000-0000-0000-000000000001','83000000-0000-0000-0000-000000000005');" > /tmp/memory-item-revoke-2.out 2>&1
) & p2=$!
wait $p1
wait $p2
race=$(cat /tmp/memory-item-revoke-1.out /tmp/memory-item-revoke-2.out)
[[ "$race" == *"0"* ]] || { cat /tmp/memory-item-revoke-1.out /tmp/memory-item-revoke-2.out >&2; fail "Memory Item revoke race missing mutation"; }
[[ "$race" == *"1"* ]] || { cat /tmp/memory-item-revoke-1.out /tmp/memory-item-revoke-2.out >&2; fail "Memory Item revoke race missing replay"; }
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.memory_items where id='83000000-0000-0000-0000-000000000005' and revoked_at is not null;")" == "1" ]] || fail "Memory Item revoke race did not terminalize exactly one Memory"
pass "concurrent duplicate Memory Item revoke -> one mutation plus one authoritative replay"

public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.cmd_revoke_memory_item_v1(uuid,uuid)','EXECUTE') then '1' else '0' end;")
[[ "$public_exec" == "0" ]] || fail "Memory Item revoke command unexpectedly executable by PUBLIC"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == "60" ]] || fail "public table catalog changed"
pass "Memory Item revoke command PUBLIC EXECUTE remains revoked and public table catalog remains 60"

echo "Memory Item revoke persistence/concurrency tests passed"
