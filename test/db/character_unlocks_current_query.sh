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
  ('7c100000-0000-0000-0000-000000000001')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('7c200000-0000-0000-0000-000000000001','guest',null,'active',null,clock_timestamp(),clock_timestamp()),
  ('7c200000-0000-0000-0000-000000000002','guest',null,'active',null,clock_timestamp(),clock_timestamp()),
  ('7c200000-0000-0000-0000-000000000003','guest',null,'deletion_pending',null,clock_timestamp(),clock_timestamp()),
  ('7c200000-0000-0000-0000-000000000004','member','7c100000-0000-0000-0000-000000000001','active',null,clock_timestamp(),clock_timestamp()),
  ('7c200000-0000-0000-0000-000000000005','guest',null,'merged','7c200000-0000-0000-0000-000000000004',clock_timestamp(),clock_timestamp());

insert into public.characters(character_id,created_at,retired_at) values
  ('unlock-alpha',clock_timestamp(),null),
  ('unlock-beta',clock_timestamp(),null),
  ('unlock-no-row',clock_timestamp(),null),
  ('unlock-retired',clock_timestamp()-interval '20 days',clock_timestamp()-interval '1 day')
on conflict (character_id) do nothing;

insert into public.world_events(
  id,subject_id,event_type,event_schema_version,event_dedupe_key,source_turn_id,content_bundle_id,payload_jsonb,occurred_at
) values (
  '7c300000-0000-0000-0000-000000000001','7c200000-0000-0000-0000-000000000001',
  'CHARACTER_UNLOCKED','v1','unlock-current-source-1',null,null,'{"internal":"causal-only"}'::jsonb,
  timestamptz '2026-08-25 09:00:00+00'
);

insert into public.character_unlocks(
  id,subject_id,character_id,status,revision,source_world_event_id,unlocked_at,created_at,updated_at
) values
  ('7c400000-0000-0000-0000-000000000001','7c200000-0000-0000-0000-000000000001','unlock-alpha','unlocked',2,'7c300000-0000-0000-0000-000000000001',timestamptz '2026-08-25 09:00:00+00',timestamptz '2026-08-20 00:00:00+00',timestamptz '2026-08-25 09:00:00+00'),
  ('7c400000-0000-0000-0000-000000000002','7c200000-0000-0000-0000-000000000001','unlock-beta','locked',0,null,null,timestamptz '2026-08-20 00:00:00+00',timestamptz '2026-08-20 00:00:00+00',timestamptz '2026-08-20 00:00:00+00'),
  ('7c400000-0000-0000-0000-000000000003','7c200000-0000-0000-0000-000000000001','unlock-retired','unlocked',1,null,timestamptz '2026-08-22 08:00:00+00',timestamptz '2026-08-21 00:00:00+00',timestamptz '2026-08-22 08:00:00+00'),
  ('7c400000-0000-0000-0000-000000000004','7c200000-0000-0000-0000-000000000002','unlock-alpha','unlocked',5,null,timestamptz '2026-08-23 08:00:00+00',timestamptz '2026-08-21 00:00:00+00',timestamptz '2026-08-23 08:00:00+00'),
  ('7c400000-0000-0000-0000-000000000005','7c200000-0000-0000-0000-000000000003','unlock-alpha','locked',0,null,null,timestamptz '2026-08-21 00:00:00+00',timestamptz '2026-08-21 00:00:00+00'),
  ('7c400000-0000-0000-0000-000000000006','7c200000-0000-0000-0000-000000000004','unlock-beta','unlocked',3,null,timestamptz '2026-08-24 08:00:00+00',timestamptz '2026-08-21 00:00:00+00',timestamptz '2026-08-24 08:00:00+00'),
  ('7c400000-0000-0000-0000-000000000007','7c200000-0000-0000-0000-000000000005','unlock-alpha','unlocked',1,null,timestamptz '2026-08-21 08:00:00+00',timestamptz '2026-08-21 00:00:00+00',timestamptz '2026-08-21 08:00:00+00');
SQL

projection=$("${psql_base[@]}" -At -F '|' -c "select character_id,status,revision,coalesce(to_char(unlocked_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS'),'NULL'),to_char(updated_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS') from public.qry_character_unlocks_v1('7c200000-0000-0000-0000-000000000001');")
expected=$'unlock-alpha|unlocked|2|2026-08-25 09:00:00|2026-08-25 09:00:00\nunlock-beta|locked|0|NULL|2026-08-20 00:00:00\nunlock-retired|unlocked|1|2026-08-22 08:00:00|2026-08-22 08:00:00'
[[ "$projection" == "$expected" ]] || fail "character unlock projection mismatch: $projection"
pass "character unlock read returns stored current rows in deterministic character order"

[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_character_unlocks_v1('7c200000-0000-0000-0000-000000000001');")" == "3" ]] || fail "character unlock read fabricated a row for a character without stored projection"
pass "missing character unlock row is not fabricated as implicit locked state"

member_projection=$("${psql_base[@]}" -Atc "select character_id||'|'||status||'|'||revision from public.qry_character_unlocks_v1('7c200000-0000-0000-0000-000000000004');")
[[ "$member_projection" == "unlock-beta|unlocked|3" ]] || fail "active member character unlock projection mismatch: $member_projection"
pass "active member subject can read its stored unlock projection"

[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_character_unlocks_v1('7c200000-0000-0000-0000-000000000001') where character_id='unlock-alpha' and revision=5;")" == "0" ]] || fail "character unlock read exposed another owner's projection"
pass "character unlock projection is strictly owner-scoped"

retired=$("${psql_base[@]}" -Atc "select character_id||'|'||status from public.qry_character_unlocks_v1('7c200000-0000-0000-0000-000000000001') where character_id='unlock-retired';")
[[ "$retired" == "unlock-retired|unlocked" ]] || fail "retired character historical unlock projection was hidden or rewritten: $retired"
pass "retired character stored unlock state remains readable without inventing runtime availability semantics"

json_shape=$("${psql_base[@]}" -Atc "select coalesce(jsonb_agg(to_jsonb(q) order by q.character_id),'[]'::jsonb)::text from public.qry_character_unlocks_v1('7c200000-0000-0000-0000-000000000001') q;")
for required in character_id status revision unlocked_at updated_at; do
  [[ "$json_shape" == *"\"$required\""* ]] || fail "character unlock projection omitted field $required: $json_shape"
done
for forbidden in subject_id source_world_event_id created_at '"id"'; do
  [[ "$json_shape" != *"$forbidden"* ]] || fail "character unlock projection leaked internal field $forbidden: $json_shape"
done
pass "character unlock projection omits owner/internal causal provenance"

before=$("${psql_base[@]}" -At -F '|' -c "select status,revision,coalesce(source_world_event_id::text,'NULL'),coalesce(to_char(unlocked_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS'),'NULL') from public.character_unlocks where id='7c400000-0000-0000-0000-000000000001';")
"${psql_base[@]}" -Atc "select count(*) from public.qry_character_unlocks_v1('7c200000-0000-0000-0000-000000000001');" >/dev/null
after=$("${psql_base[@]}" -At -F '|' -c "select status,revision,coalesce(source_world_event_id::text,'NULL'),coalesce(to_char(unlocked_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS'),'NULL') from public.character_unlocks where id='7c400000-0000-0000-0000-000000000001';")
[[ "$before" == "$after" ]] || fail "character unlock read mutated current projection: before=$before after=$after"
[[ "$("${psql_base[@]}" -Atc "select payload_jsonb->>'internal' from public.world_events where id='7c300000-0000-0000-0000-000000000001';")" == "causal-only" ]] || fail "character unlock read mutated causal world event"
pass "character unlock read is projection-only and does not mutate causal authority"

expect_fail "deletion-pending subject unlock read is denied" "character unlock read requires an active canonical subject" "select * from public.qry_character_unlocks_v1('7c200000-0000-0000-0000-000000000003');"
expect_fail "merged guest unlock read is denied" "character unlock read requires an active canonical subject" "select * from public.qry_character_unlocks_v1('7c200000-0000-0000-0000-000000000005');"
expect_fail "unknown subject unlock read is denied" "character unlock read requires an active canonical subject" "select * from public.qry_character_unlocks_v1('7c200000-0000-0000-0000-000000000099');"
expect_fail "character unlock subject is required" "character unlock subject is required" "select * from public.qry_character_unlocks_v1(null);"

volatility=$("${psql_base[@]}" -Atc "select provolatile from pg_proc where oid='public.qry_character_unlocks_v1(uuid)'::regprocedure;")
[[ "$volatility" == "s" ]] || fail "character unlock query is not STABLE: $volatility"
public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.qry_character_unlocks_v1(uuid)','EXECUTE') then '1' else '0' end;")
[[ "$public_exec" == "0" ]] || fail "character unlock query unexpectedly executable by PUBLIC"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == "60" ]] || fail "public table catalog changed"
pass "character unlock query is STABLE, PUBLIC EXECUTE revoked, and public table catalog remains 60"

echo "current Character Unlock projection query tests passed"