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

policy_hash="sha256:v1:262ae38b7b65684064809ab1818879f03d7ae562b02c30a843bc6c091f32690c"
subject_id="c1400000-0000-4000-8000-000000000001"
character_id="relationship-reliability-v1-char"

"${psql_base[@]}" <<SQL
insert into public.subjects(
  id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at
) values (
  '$subject_id','guest',null,'active',null,clock_timestamp(),clock_timestamp()
);

insert into public.characters(character_id,created_at,retired_at)
values ('$character_id',clock_timestamp(),null);
SQL

apply_event() {
  local expected_revision="$1"
  local history_id="$2"
  local history_dedupe="$3"
  local event_id="$4"
  local event_dedupe="$5"
  local occurred_at="$6"
  local source_ref="$7"
  local care_key="$8"
  local disposition="$9"
  local credited="${10}"
  local delta_c="${11}"
  local delta_t="${12}"
  local milestone_sql="${13}"
  local next_revision="${14}"
  local next_closeness="${15}"
  local next_trust="${16}"
  local provenance_id="${17}"

  "${psql_base[@]}" -At -F '|' <<SQL
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_id',true);
select
  applied,
  replayed,
  revision_after,
  closeness,
  trust
from public.cmd_apply_relationship_event_runtime_v1(
  '$subject_id',
  'c1400000-0000-4000-8000-000000009999',
  '$history_id',
  $expected_revision,
  '$history_dedupe',
  '$event_id',
  '$event_dedupe',
  '$character_id',
  'CARE_ACCEPTED_BY_CHARACTER',
  '1',
  '$character_id.accepted_care',
  timestamptz '$occurred_at',
  'server_observation',
  '$source_ref',
  '[]'::jsonb,
  jsonb_build_array('authority:$event_dedupe'),
  jsonb_build_array('$provenance_id'),
  '[]'::jsonb,
  jsonb_build_array(
    jsonb_build_object(
      'factKey','care',
      'statement','server observed accepted care',
      'sourceRefs',jsonb_build_array('$source_ref')
    )
  ),
  null,
  jsonb_build_object('careKey','$care_key'),
  'care',
  '$disposition',
  $credited,
  $delta_c,$delta_t,0,
  $milestone_sql,
  'relationship-policy-v1',
  '$policy_hash',
  'S0_FIRST_MEETING',
  'S0_FIRST_MEETING',
  'STABLE',
  'relationship-policy-state-v1',
  jsonb_build_object('fixtureRevision',$next_revision,'fixtureCloseness',$next_closeness,'fixtureTrust',$next_trust)
);
commit;
SQL
}

r1="$(apply_event   0   c1400000-0000-4000-8000-000000000101   history:care-a   c1400000-0000-4000-8000-000000000111   event:care-a   '2026-01-01 00:00:00+00' observation:care-a care-a   APPLIED true 3 4 "'care'" 1 3 4   c1400000-0000-4000-8000-000000000121)"
[[ "$r1" == *'t|f|1|3|4'* ]] || fail "care A apply mismatch: $r1"

r2="$(apply_event   1   c1400000-0000-4000-8000-000000000102   history:care-b   c1400000-0000-4000-8000-000000000112   event:care-b   '2026-01-02 00:00:00+00' observation:care-b care-b   APPLIED true 3 4 "'care'" 2 6 8   c1400000-0000-4000-8000-000000000122)"
[[ "$r2" == *'t|f|2|6|8'* ]] || fail "care B apply mismatch: $r2"

r3="$(apply_event   2   c1400000-0000-4000-8000-000000000103   history:care-c   c1400000-0000-4000-8000-000000000113   event:care-c   '2026-01-03 00:00:00+00' observation:care-c care-c   SUPPRESSED_POSITIVE_CREDIT false 0 0 null 3 6 8   c1400000-0000-4000-8000-000000000123)"
[[ "$r3" == *'t|f|3|6|8'* ]] || fail "care C suppression mismatch: $r3"
pass "three-care anti-farming baseline persisted"

correction_result=$("${psql_base[@]}" -At -F '|' <<SQL
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_id',true);

select
  revision_before,
  revision_after
from public.cmd_append_relationship_correction_runtime_v1(
  '$subject_id',
  '$character_id',
  3,
  1,
  'c1400000-0000-4000-8000-000000000201',
  'adjustment:care-a-to-disclosure',
  'c1400000-0000-4000-8000-000000000202',
  'c1400000-0000-4000-8000-000000000111',
  'authority_correction',
  'First occurrence was disclosure rather than accepted care.',
  'authority:correction-care-a',
  'c1400000-0000-4000-8000-000000000203',
  'event:disclosure-a',
  'CHARACTER_SELF_DISCLOSURE',
  '1',
  '$character_id.self_disclosure',
  timestamptz '2026-01-01 00:00:00+00',
  'server_observation',
  'observation:disclosure-a',
  '[]'::jsonb,
  jsonb_build_array('authority:disclosure-a'),
  jsonb_build_array('c1400000-0000-4000-8000-000000000204'),
  '[]'::jsonb,
  jsonb_build_array(
    jsonb_build_object(
      'factKey','disclosure',
      'statement','server observed disclosure',
      'sourceRefs',jsonb_build_array('observation:disclosure-a')
    )
  ),
  null,
  jsonb_build_object('topicKey','topic-a'),
  'disclosure',
  'APPLIED',
  true,
  2,2,0,
  null,
  'relationship-policy-v1',
  '$policy_hash'
);

select
  revision,
  closeness,
  trust
from public.cmd_commit_relationship_replay_projection_v1(
  '$subject_id',
  '$character_id',
  3,
  4,
  8,10,0,
  'S0_FIRST_MEETING',
  'S0_FIRST_MEETING',
  'STABLE',
  'relationship-policy-v1',
  '$policy_hash',
  'relationship-policy-state-v1',
  jsonb_build_object('fixture','corrected-care-window')
);
commit;
SQL
)
[[ "$correction_result" == *'3|4'* ]] || fail "correction revision mismatch: $correction_result"
[[ "$correction_result" == *'4|8|10'* ]] || fail "correction replay projection mismatch: $correction_result"
pass "correction replays anti-farming semantics into canonical projection"

adjustment_shape=$("${psql_base[@]}" -At -F '|' -c "select
  h.entry_kind,
  a.adjustment_type,
  a.target_event_id,
  a.replacement_event_id,
  s.revision,
  s.closeness,
  s.trust
from public.relationship_event_adjustments a
join public.relationship_history_entries h on h.id=a.history_entry_id
join public.user_character_states s
  on s.subject_id=a.subject_id and s.character_id=a.character_id
where a.id='c1400000-0000-4000-8000-000000000202';")
[[ "$adjustment_shape" == "correction|correction|c1400000-0000-4000-8000-000000000111|c1400000-0000-4000-8000-000000000203|4|8|10" ]] || fail "correction persistence mismatch: $adjustment_shape"

snapshot_hash="sha256:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
source_fingerprint="sha256:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

snapshot_write=$("${psql_base[@]}" -At -F '|' <<SQL
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_id',true);
select
  through_revision,
  replayed
from public.cmd_write_relationship_snapshot_runtime_v1(
  '$subject_id',
  '$character_id',
  'c1400000-0000-4000-8000-000000000301',
  4,
  'relationship-policy-v1',
  '$policy_hash',
  'relationship-snapshot-v1',
  jsonb_build_object('fixture','snapshot-rev4'),
  '$snapshot_hash',
  '$source_fingerprint'
);
commit;
SQL
)
[[ "$snapshot_write" == *'4|f'* ]] || fail "snapshot write mismatch: $snapshot_write"

snapshot_latest=$("${psql_base[@]}" -Atc "
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_id',true);
select snapshot_id
from public.qry_latest_valid_relationship_snapshot_v1(
  '$subject_id',
  '$character_id'
);
commit;
")
[[ "$snapshot_latest" == *'c1400000-0000-4000-8000-000000000301'* ]] || fail "valid snapshot not selected: $snapshot_latest"
pass "immutable snapshot is selectable before historical adjustment reaches behind it"

retraction_result=$("${psql_base[@]}" -At -F '|' <<SQL
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_id',true);
select revision_before, revision_after
from public.cmd_append_relationship_retraction_runtime_v1(
  '$subject_id',
  '$character_id',
  4,
  1,
  'c1400000-0000-4000-8000-000000000401',
  'adjustment:retract-care-b',
  'c1400000-0000-4000-8000-000000000402',
  'c1400000-0000-4000-8000-000000000112',
  'authority_retraction',
  'Second care occurrence was invalidated.',
  'authority:retract-care-b'
);

select revision, closeness, trust
from public.cmd_commit_relationship_replay_projection_v1(
  '$subject_id',
  '$character_id',
  4,
  5,
  5,6,0,
  'S0_FIRST_MEETING',
  'S0_FIRST_MEETING',
  'STABLE',
  'relationship-policy-v1',
  '$policy_hash',
  'relationship-policy-state-v1',
  jsonb_build_object('fixture','after-retraction')
);
commit;
SQL
)
[[ "$retraction_result" == *'4|5'* ]] || fail "retraction revision mismatch: $retraction_result"
[[ "$retraction_result" == *'5|5|6'* ]] || fail "retraction replay projection mismatch: $retraction_result"

snapshot_after_retraction=$("${psql_base[@]}" -At <<SQL
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_id',true);
select count(*)
from public.qry_latest_valid_relationship_snapshot_v1(
  '$subject_id',
  '$character_id'
);
commit;
SQL
)
[[ "$snapshot_after_retraction" == *$'0
COMMIT'* ]] || fail "historically invalidated snapshot remained selectable: $snapshot_after_retraction"
pass "later retraction semantically invalidates prior snapshot without mutating snapshot row"

expect_fail   "already-adjusted Event cannot be targeted again"   "must be an active Event"   "begin; set local role myeongha_api_executor; select pg_catalog.set_config('myeongha.subject_id','$subject_id',true); select * from public.cmd_append_relationship_retraction_runtime_v1('$subject_id','$character_id',5,1,'c1400000-0000-4000-8000-000000000501','adjustment:old-target-again','c1400000-0000-4000-8000-000000000502','c1400000-0000-4000-8000-000000000111','authority_retraction','old correction target must not be active','authority:old-target'); rollback;"

"${psql_base[@]}" -c "
update public.user_character_states
set closeness=99,
    trust=99
where subject_id='$subject_id'
  and character_id='$character_id';
" >/dev/null

rebuild_result=$("${psql_base[@]}" -At -F '|' <<SQL
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_id',true);
select
  revision,
  closeness,
  trust
from public.cmd_rebuild_relationship_projection_runtime_v1(
  '$subject_id',
  '$character_id',
  5,
  5,6,0,
  'S0_FIRST_MEETING',
  'S0_FIRST_MEETING',
  'STABLE',
  'relationship-policy-v1',
  '$policy_hash',
  'relationship-policy-state-v1',
  jsonb_build_object('fixture','rebuild-restored'),
  'ops:rebuild-test',
  'Restore intentionally corrupted projection from authoritative history.'
);
commit;
SQL
)
[[ "$rebuild_result" == *'5|5|6'* ]] || fail "projection rebuild mismatch: $rebuild_result"
pass "trusted rebuild repairs only derived projection without consuming history revision"

# Different new Events racing from the same expected revision must serialize:
# one applies, the other wakes after the lock and fails stale.
race_a_out="$(mktemp)"
race_a_err="$(mktemp)"
race_b_out="$(mktemp)"
race_b_err="$(mktemp)"
trap 'rm -f "$race_a_out" "$race_a_err" "$race_b_out" "$race_b_err"' EXIT

(
  "${psql_base[@]}" -At -F '|' >"$race_a_out" 2>"$race_a_err" <<SQL
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_id',true);
select revision_after
from public.cmd_apply_relationship_event_runtime_v1(
  '$subject_id',
  'c1400000-0000-4000-8000-000000009999',
  'c1400000-0000-4000-8000-000000000601',
  5,
  'history:race-a',
  'c1400000-0000-4000-8000-000000000611',
  'event:race-a',
  '$character_id',
  'RETURN_AFTER_ABSENCE',
  '1',
  null,
  timestamptz '2026-01-10 00:00:00+00',
  'server_observation',
  'observation:race-a',
  '[]'::jsonb,
  jsonb_build_array('authority:race-a'),
  jsonb_build_array('c1400000-0000-4000-8000-000000000621'),
  '[]'::jsonb,
  jsonb_build_array(jsonb_build_object('factKey','return','statement','race A return','sourceRefs',jsonb_build_array('observation:race-a'))),
  null,
  jsonb_build_object('observationKey','race-a'),
  'return',
  'NON_PROGRESSION',
  false,
  0,0,0,
  null,
  'relationship-policy-v1',
  '$policy_hash',
  'S0_FIRST_MEETING',
  'S0_FIRST_MEETING',
  'STABLE',
  'relationship-policy-state-v1',
  jsonb_build_object('fixture','race-a')
);
select pg_sleep(1.25);
commit;
SQL
) &
race_a_pid=$!

sleep 0.15

set +e
"${psql_base[@]}" -At -F '|' >"$race_b_out" 2>"$race_b_err" <<SQL
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_id',true);
select revision_after
from public.cmd_apply_relationship_event_runtime_v1(
  '$subject_id',
  'c1400000-0000-4000-8000-000000009999',
  'c1400000-0000-4000-8000-000000000602',
  5,
  'history:race-b',
  'c1400000-0000-4000-8000-000000000612',
  'event:race-b',
  '$character_id',
  'RETURN_AFTER_ABSENCE',
  '1',
  null,
  timestamptz '2026-01-11 00:00:00+00',
  'server_observation',
  'observation:race-b',
  '[]'::jsonb,
  jsonb_build_array('authority:race-b'),
  jsonb_build_array('c1400000-0000-4000-8000-000000000622'),
  '[]'::jsonb,
  jsonb_build_array(jsonb_build_object('factKey','return','statement','race B return','sourceRefs',jsonb_build_array('observation:race-b'))),
  null,
  jsonb_build_object('observationKey','race-b'),
  'return',
  'NON_PROGRESSION',
  false,
  0,0,0,
  null,
  'relationship-policy-v1',
  '$policy_hash',
  'S0_FIRST_MEETING',
  'S0_FIRST_MEETING',
  'STABLE',
  'relationship-policy-state-v1',
  jsonb_build_object('fixture','race-b')
);
commit;
SQL
race_b_rc=$?
set -e

wait "$race_a_pid"
[[ $race_b_rc -ne 0 ]] || fail "second concurrent new Event unexpectedly applied"
grep -q "expected revision is stale" "$race_b_err" || {
  cat "$race_b_err" >&2
  fail "second concurrent new Event failed for unexpected reason"
}

race_state=$("${psql_base[@]}" -At -F '|' -c "select revision,count(*)
from public.user_character_states s
join public.relationship_history_entries h
  on h.subject_id=s.subject_id and h.character_id=s.character_id
where s.subject_id='$subject_id'
  and s.character_id='$character_id'
group by revision;")
[[ "$race_state" == '6|6' ]] || fail "concurrent write serialization mismatch: $race_state"
pass "different concurrent Events serialize to one apply plus one stale retry candidate"

echo "Production relationship reliability V1 DB tests passed"
