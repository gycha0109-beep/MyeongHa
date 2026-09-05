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
insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('2b200000-0000-0000-0000-000000000001','guest',null,'active',null,clock_timestamp(),clock_timestamp()),
  ('2b200000-0000-0000-0000-000000000002','guest',null,'active',null,clock_timestamp(),clock_timestamp()),
  ('2b200000-0000-0000-0000-000000000003','guest',null,'deletion_pending',null,clock_timestamp(),clock_timestamp());

insert into public.characters(character_id,created_at,retired_at) values
  ('relationship-alpha',clock_timestamp(),null),
  ('relationship-beta',clock_timestamp(),null),
  ('relationship-retired',clock_timestamp(),clock_timestamp());

insert into public.user_character_states(
  id,subject_id,character_id,closeness,trust,friction,relationship_stage,policy_version,revision,
  last_interaction_at,created_at,updated_at
) values
  ('2b300000-0000-0000-0000-000000000001','2b200000-0000-0000-0000-000000000001','relationship-alpha',14,9,2,'acquainted','relationship-policy-v1',2,timestamptz '2026-08-25 10:00:00+00',timestamptz '2026-08-20 00:00:00+00',timestamptz '2026-08-25 10:00:00+00'),
  ('2b300000-0000-0000-0000-000000000002','2b200000-0000-0000-0000-000000000002','relationship-beta',30,20,1,'trusted','relationship-policy-v1',1,timestamptz '2026-08-24 10:00:00+00',timestamptz '2026-08-20 00:00:00+00',timestamptz '2026-08-24 10:00:00+00'),
  ('2b300000-0000-0000-0000-000000000003','2b200000-0000-0000-0000-000000000001','relationship-retired',7,4,3,'acquainted','relationship-policy-v1',0,null,timestamptz '2026-08-20 00:00:00+00',timestamptz '2026-08-20 00:00:00+00');

insert into public.relationship_events(
  id,subject_id,character_id,event_type,event_schema_version,event_dedupe_key,source_turn_id,
  source_world_event_id,source_merge_action_id,delta_closeness,delta_trust,delta_friction,policy_version,
  state_revision_before,state_revision_after,payload_jsonb,applied_at
) values
  ('2b400000-0000-0000-0000-000000000001','2b200000-0000-0000-0000-000000000001','relationship-alpha','RETURN_VISIT','v1','relationship-history-1',null,null,null,4,2,0,'relationship-policy-v1',1,2,'{"internal":"ledger-only"}'::jsonb,timestamptz '2026-08-25 10:00:00+00');
SQL

projection=$("${psql_base[@]}" -Atc "select state_id||'|'||character_id||'|'||closeness||'|'||trust||'|'||friction||'|'||relationship_stage||'|'||policy_version||'|'||revision||'|'||coalesce(to_char(last_interaction_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS'),'NULL') from public.qry_character_relationship_v1('2b200000-0000-0000-0000-000000000001','relationship-alpha');")
[[ "$projection" == "2b300000-0000-0000-0000-000000000001|relationship-alpha|14|9|2|acquainted|relationship-policy-v1|2|2026-08-25 10:00:00" ]] || fail "current relationship projection mismatch: $projection"
pass "relationship read returns the stored current projection exactly"

[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_character_relationship_v1('2b200000-0000-0000-0000-000000000001','relationship-beta');")" == "0" ]] || fail "relationship read fabricated a baseline or exposed another owner's state"
pass "missing owner/character projection returns zero rows instead of inventing baseline state"

retired=$("${psql_base[@]}" -Atc "select character_id||'|'||revision from public.qry_character_relationship_v1('2b200000-0000-0000-0000-000000000001','relationship-retired');")
[[ "$retired" == "relationship-retired|0" ]] || fail "retired character historical current projection was hidden or rewritten: $retired"
pass "retired character projection remains readable without inventing content-disable semantics"

before=$("${psql_base[@]}" -Atc "select closeness||'|'||trust||'|'||friction||'|'||revision from public.user_character_states where id='2b300000-0000-0000-0000-000000000001';")
"${psql_base[@]}" -Atc "select count(*) from public.qry_character_relationship_v1('2b200000-0000-0000-0000-000000000001','relationship-alpha');" >/dev/null
after=$("${psql_base[@]}" -Atc "select closeness||'|'||trust||'|'||friction||'|'||revision from public.user_character_states where id='2b300000-0000-0000-0000-000000000001';")
[[ "$before" == "$after" ]] || fail "relationship read mutated projection authority: before=$before after=$after"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.relationship_events where id='2b400000-0000-0000-0000-000000000001' and payload_jsonb ->> 'internal'='ledger-only';")" == "1" ]] || fail "relationship read mutated source ledger"
pass "relationship read is projection-only and does not recalculate or mutate ledger/projection"

expect_fail "unknown character relationship read is denied" "character was not found" "select * from public.qry_character_relationship_v1('2b200000-0000-0000-0000-000000000001','relationship-missing');"
expect_fail "deletion-pending subject relationship read is denied" "relationship read requires an active canonical subject" "select * from public.qry_character_relationship_v1('2b200000-0000-0000-0000-000000000003','relationship-alpha');"
expect_fail "unknown subject relationship read is denied" "relationship read requires an active canonical subject" "select * from public.qry_character_relationship_v1('2b200000-0000-0000-0000-000000000099','relationship-alpha');"
expect_fail "relationship read identity is required" "relationship subject/character identity is required" "select * from public.qry_character_relationship_v1('2b200000-0000-0000-0000-000000000001','   ');"

public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.qry_character_relationship_v1(uuid,text)','EXECUTE') then '1' else '0' end;")
[[ "$public_exec" == "0" ]] || fail "relationship query unexpectedly executable by PUBLIC"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == "60" ]] || fail "public table catalog changed"
pass "relationship query PUBLIC EXECUTE remains revoked and public table catalog remains 60"

echo "current relationship projection query tests passed"
