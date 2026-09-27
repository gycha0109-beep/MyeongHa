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

policy_hash="sha256:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
snapshot_hash="sha256:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
source_hash="sha256:v1:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"

"${psql_base[@]}" <<SQL
insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at)
values ('9a100000-0000-0000-0000-000000000001','guest',null,'active',null,clock_timestamp(),clock_timestamp());

insert into public.characters(character_id,created_at,retired_at)
values ('relationship-schema-v1-char',clock_timestamp(),null);

insert into public.relationship_policy_artifacts(
  policy_version,artifact_schema_version,content_hash,artifact_jsonb,created_at,retired_at
) values (
  'relationship-policy-v1',
  'relationship-policy-definition-v1',
  '$policy_hash',
  '{"schemaVersion":"relationship-policy-definition-v1","policyVersion":"relationship-policy-v1"}'::jsonb,
  clock_timestamp(),
  null
);

insert into public.relationship_policy_activations(
  id,policy_version,policy_content_hash,character_id,effective_from,activation_ref,created_at
) values (
  '9a110000-0000-0000-0000-000000000001',
  'relationship-policy-v1',
  '$policy_hash',
  'relationship-schema-v1-char',
  timestamptz '2026-09-27 00:00:00+00',
  'test:relationship-policy-v1',
  timestamptz '2026-09-27 00:00:00+00'
);

insert into public.user_character_states(
  id,subject_id,character_id,closeness,trust,friction,relationship_stage,policy_version,revision,
  last_interaction_at,created_at,updated_at,
  attained_stage,current_candidate_stage,current_condition,policy_content_hash,
  policy_state_schema_version,policy_state_jsonb
) values (
  '9a120000-0000-0000-0000-000000000001',
  '9a100000-0000-0000-0000-000000000001',
  'relationship-schema-v1-char',
  0,0,0,
  'S0_FIRST_MEETING',
  'relationship-policy-v1',
  0,
  null,
  clock_timestamp(),
  clock_timestamp(),
  'S0_FIRST_MEETING',
  'S0_FIRST_MEETING',
  'STABLE',
  '$policy_hash',
  'relationship-policy-state-v1',
  '{}'::jsonb
);

begin;
set constraints all deferred;

insert into public.relationship_history_entries(
  id,subject_id,character_id,entry_kind,history_dedupe_key,
  state_revision_before,state_revision_after,applied_at
) values (
  '9a130000-0000-0000-0000-000000000001',
  '9a100000-0000-0000-0000-000000000001',
  'relationship-schema-v1-char',
  'event',
  'history:return-1',
  0,1,
  timestamptz '2026-09-27 00:01:00+00'
);

insert into public.relationship_event_records(
  id,history_entry_id,subject_id,character_id,event_type,event_schema_version,event_dedupe_key,
  character_behavior_key,occurred_at,source_kind,source_ref,
  source_turn_id,source_world_event_id,source_merge_action_id,source_server_observation_ref,
  facts_jsonb,character_interpretation_jsonb,payload_jsonb,
  relationship_family,applied_effect_disposition,progression_credited,
  delta_closeness,delta_trust,delta_friction,milestone_kind,
  policy_version,policy_content_hash,created_at
) values (
  '9a140000-0000-0000-0000-000000000001',
  '9a130000-0000-0000-0000-000000000001',
  '9a100000-0000-0000-0000-000000000001',
  'relationship-schema-v1-char',
  'RETURN_AFTER_ABSENCE','1','event:return-1',
  null,
  timestamptz '2026-09-27 00:00:30+00',
  'server_observation','observation:return-1',
  null,null,null,'observation:return-1',
  '[{"factKey":"returned","statement":"server observed return","sourceRefs":["observation:return-1"]}]'::jsonb,
  null,
  '{"observationKey":"return-1"}'::jsonb,
  'return','NON_PROGRESSION',false,
  0,0,0,null,
  'relationship-policy-v1','$policy_hash',
  timestamptz '2026-09-27 00:01:00+00'
);

insert into public.relationship_event_provenance_refs(
  id,event_id,subject_id,character_id,ref_kind,ordinal,ref_value,source_message_id,created_at
) values (
  '9a150000-0000-0000-0000-000000000001',
  '9a140000-0000-0000-0000-000000000001',
  '9a100000-0000-0000-0000-000000000001',
  'relationship-schema-v1-char',
  'authority',1,'authority:return-1',null,
  timestamptz '2026-09-27 00:01:00+00'
);

set constraints all immediate;
commit;

update public.user_character_states
set revision=1, updated_at=clock_timestamp()
where id='9a120000-0000-0000-0000-000000000001';

begin;
set constraints all deferred;

insert into public.relationship_history_entries(
  id,subject_id,character_id,entry_kind,history_dedupe_key,
  state_revision_before,state_revision_after,applied_at
) values (
  '9a130000-0000-0000-0000-000000000002',
  '9a100000-0000-0000-0000-000000000001',
  'relationship-schema-v1-char',
  'correction',
  'history:correction-1',
  1,2,
  timestamptz '2026-09-27 00:02:00+00'
);

insert into public.relationship_event_records(
  id,history_entry_id,subject_id,character_id,event_type,event_schema_version,event_dedupe_key,
  character_behavior_key,occurred_at,source_kind,source_ref,
  source_turn_id,source_world_event_id,source_merge_action_id,source_server_observation_ref,
  facts_jsonb,character_interpretation_jsonb,payload_jsonb,
  relationship_family,applied_effect_disposition,progression_credited,
  delta_closeness,delta_trust,delta_friction,milestone_kind,
  policy_version,policy_content_hash,created_at
) values (
  '9a140000-0000-0000-0000-000000000002',
  '9a130000-0000-0000-0000-000000000002',
  '9a100000-0000-0000-0000-000000000001',
  'relationship-schema-v1-char',
  'CHARACTER_DETAIL_REMEMBERED','1','event:recognition-corrected',
  'relationship-schema-v1-char.detail_remembered',
  timestamptz '2026-09-27 00:00:30+00',
  'server_observation','observation:recognition-corrected',
  null,null,null,'observation:recognition-corrected',
  '[{"factKey":"detail","statement":"corrected recognition event","sourceRefs":["observation:recognition-corrected"]}]'::jsonb,
  '{"statement":"character-owned interpretation","sourceRefs":["authority:recognition-corrected"]}'::jsonb,
  '{"detailKey":"detail-1"}'::jsonb,
  'recognition','APPLIED',true,
  3,4,0,'recognition',
  'relationship-policy-v1','$policy_hash',
  timestamptz '2026-09-27 00:02:00+00'
);

insert into public.relationship_event_provenance_refs(
  id,event_id,subject_id,character_id,ref_kind,ordinal,ref_value,source_message_id,created_at
) values (
  '9a150000-0000-0000-0000-000000000002',
  '9a140000-0000-0000-0000-000000000002',
  '9a100000-0000-0000-0000-000000000001',
  'relationship-schema-v1-char',
  'authority',1,'authority:recognition-corrected',null,
  timestamptz '2026-09-27 00:02:00+00'
);

insert into public.relationship_event_adjustments(
  id,history_entry_id,subject_id,character_id,adjustment_type,target_event_id,replacement_event_id,
  reason_code,reason_text,authority_ref,recorded_at
) values (
  '9a160000-0000-0000-0000-000000000001',
  '9a130000-0000-0000-0000-000000000002',
  '9a100000-0000-0000-0000-000000000001',
  'relationship-schema-v1-char',
  'correction',
  '9a140000-0000-0000-0000-000000000001',
  '9a140000-0000-0000-0000-000000000002',
  'authority_correction',
  'replace the original occurrence with authority-backed corrected evidence',
  'authority:correction-1',
  timestamptz '2026-09-27 00:02:00+00'
);

set constraints all immediate;
commit;

update public.user_character_states
set closeness=3, trust=4, revision=2, updated_at=clock_timestamp()
where id='9a120000-0000-0000-0000-000000000001';

begin;
set constraints all deferred;

insert into public.relationship_history_entries(
  id,subject_id,character_id,entry_kind,history_dedupe_key,
  state_revision_before,state_revision_after,applied_at
) values (
  '9a130000-0000-0000-0000-000000000003',
  '9a100000-0000-0000-0000-000000000001',
  'relationship-schema-v1-char',
  'retraction',
  'history:retraction-1',
  2,3,
  timestamptz '2026-09-27 00:03:00+00'
);

insert into public.relationship_event_adjustments(
  id,history_entry_id,subject_id,character_id,adjustment_type,target_event_id,replacement_event_id,
  reason_code,reason_text,authority_ref,recorded_at
) values (
  '9a160000-0000-0000-0000-000000000002',
  '9a130000-0000-0000-0000-000000000003',
  '9a100000-0000-0000-0000-000000000001',
  'relationship-schema-v1-char',
  'retraction',
  '9a140000-0000-0000-0000-000000000002',
  null,
  'authority_retraction',
  'remove corrected evidence after later authority invalidation',
  'authority:retraction-1',
  timestamptz '2026-09-27 00:03:00+00'
);

set constraints all immediate;
commit;

update public.user_character_states
set closeness=0, trust=0, revision=3, updated_at=clock_timestamp()
where id='9a120000-0000-0000-0000-000000000001';

insert into public.relationship_state_snapshots(
  id,subject_id,character_id,through_revision,policy_version,policy_content_hash,
  snapshot_schema_version,snapshot_jsonb,snapshot_hash,source_fingerprint,created_at
) values (
  '9a170000-0000-0000-0000-000000000001',
  '9a100000-0000-0000-0000-000000000001',
  'relationship-schema-v1-char',
  3,
  'relationship-policy-v1',
  '$policy_hash',
  'relationship-snapshot-v1',
  '{"scores":{"closeness":0,"trust":0,"friction":0},"attainedStage":"S0_FIRST_MEETING"}'::jsonb,
  '$snapshot_hash',
  '$source_hash',
  clock_timestamp()
);

select 'relationship persistence valid flow passed' as result;
SQL

expect_fail "relationship score bounds reject overflow"   "user_character_states_closeness_bounds_v1_check"   "update public.user_character_states set closeness=101 where id='9a120000-0000-0000-0000-000000000001';"

expect_fail "legacy relationship_events writes are disabled"   "tr_relationship_legacy_events_disabled_v1"   "insert into public.relationship_events(id,subject_id,character_id,event_type,event_schema_version,event_dedupe_key,delta_closeness,delta_trust,delta_friction,policy_version,state_revision_before,state_revision_after,applied_at) values ('9a180000-0000-0000-0000-000000000001','9a100000-0000-0000-0000-000000000001','relationship-schema-v1-char','legacy','v1','legacy-write',0,0,0,'relationship-policy-v1',3,4,clock_timestamp());"

expect_fail "history rows are append-only on update"   "tr_relationship_subject_owned_immutable_v1"   "update public.relationship_history_entries set history_dedupe_key='changed' where id='9a130000-0000-0000-0000-000000000001';"

expect_fail "history rows are append-only on delete"   "tr_relationship_subject_owned_immutable_v1"   "delete from public.relationship_history_entries where id='9a130000-0000-0000-0000-000000000001';"

expect_fail "policy artifacts are immutable"   "tr_relationship_policy_immutable_v1"   "update public.relationship_policy_artifacts set artifact_schema_version='changed' where policy_version='relationship-policy-v1';"

expect_fail "one physical revision cannot be occupied twice"   "relationship_history_entries_revision_unique"   "insert into public.relationship_history_entries(id,subject_id,character_id,entry_kind,history_dedupe_key,state_revision_before,state_revision_after,applied_at) values ('9a130000-0000-0000-0000-000000000009','9a100000-0000-0000-0000-000000000001','relationship-schema-v1-char','event','duplicate-revision',2,3,clock_timestamp());"

expect_fail "snapshot cannot move beyond current projection"   "ct_relationship_snapshot_revision_v1"   "begin; set constraints all deferred; insert into public.relationship_state_snapshots(id,subject_id,character_id,through_revision,policy_version,policy_content_hash,snapshot_schema_version,snapshot_jsonb,snapshot_hash,source_fingerprint,created_at) values ('9a170000-0000-0000-0000-000000000009','9a100000-0000-0000-0000-000000000001','relationship-schema-v1-char',4,'relationship-policy-v1','$policy_hash','relationship-snapshot-v1','{}'::jsonb,'$snapshot_hash','$source_hash',clock_timestamp()); set constraints all immediate; commit;"

expect_fail "causal outcome requires predecessor link"   "ct_relationship_event_causal_shape_v1"   "begin; set constraints all deferred; insert into public.relationship_history_entries(id,subject_id,character_id,entry_kind,history_dedupe_key,state_revision_before,state_revision_after,applied_at) values ('9a130000-0000-0000-0000-000000000010','9a100000-0000-0000-0000-000000000001','relationship-schema-v1-char','event','missing-cause',3,4,clock_timestamp()); insert into public.relationship_event_records(id,history_entry_id,subject_id,character_id,event_type,event_schema_version,event_dedupe_key,character_behavior_key,occurred_at,source_kind,source_ref,source_turn_id,source_world_event_id,source_merge_action_id,source_server_observation_ref,facts_jsonb,character_interpretation_jsonb,payload_jsonb,relationship_family,applied_effect_disposition,progression_credited,delta_closeness,delta_trust,delta_friction,milestone_kind,policy_version,policy_content_hash,created_at) values ('9a140000-0000-0000-0000-000000000010','9a130000-0000-0000-0000-000000000010','9a100000-0000-0000-0000-000000000001','relationship-schema-v1-char','COMMITMENT_KEPT','1','event:missing-cause',null,clock_timestamp(),'server_observation','observation:missing-cause',null,null,null,'observation:missing-cause','[{"factKey":"promise","statement":"kept","sourceRefs":["observation:missing-cause"]}]'::jsonb,null,'{"commitmentKey":"promise-1"}'::jsonb,'commitment','APPLIED',true,4,5,0,'commitment_follow_through','relationship-policy-v1','$policy_hash',clock_timestamp()); insert into public.relationship_event_provenance_refs(id,event_id,subject_id,character_id,ref_kind,ordinal,ref_value,source_message_id,created_at) values ('9a150000-0000-0000-0000-000000000010','9a140000-0000-0000-0000-000000000010','9a100000-0000-0000-0000-000000000001','relationship-schema-v1-char','authority',1,'authority:missing-cause',null,clock_timestamp()); set constraints all immediate; commit;"

revision_state=$("${psql_base[@]}" -Atc "select revision||'|'||closeness||'|'||trust from public.user_character_states where id='9a120000-0000-0000-0000-000000000001';")
[[ "$revision_state" == "3|0|0" ]] || fail "projection state drifted: $revision_state"

history_count=$("${psql_base[@]}" -Atc "select count(*) from public.relationship_history_entries where subject_id='9a100000-0000-0000-0000-000000000001';")
[[ "$history_count" == "3" ]] || fail "expected three committed history entries, found $history_count"

pass "relationship persistence schema v1 guards"
echo "relationship persistence schema v1 PASS"
