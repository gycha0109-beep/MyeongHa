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
subject_id="d1430000-0000-4000-8000-000000000001"
character_id="seyeon"

# Reuse an existing Se-yeon Character row when the canonical seed is already present.
"${psql_base[@]}" <<SQL
insert into public.subjects(
  id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at
) values (
  '$subject_id','guest',null,'active',null,clock_timestamp(),clock_timestamp()
);

insert into public.characters(character_id,created_at,retired_at)
values ('$character_id',clock_timestamp(),null)
on conflict (character_id) do nothing;
SQL

empty_read=$("${psql_base[@]}" -At <<SQL
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_id',true);
select count(*)
from public.qry_production_relationship_runtime_v1(
  '$subject_id',
  '$character_id'
);
commit;
SQL
)
[[ "$empty_read" == *$'0
COMMIT'* ]] || fail "empty Production relationship read invented a baseline: $empty_read"
pass "Production relationship runtime read returns zero rows before first governed Event"

first_apply=$("${psql_base[@]}" -At -F '|' <<SQL
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_id',true);
select
  revision_after,
  attained_stage,
  current_condition
from public.cmd_apply_relationship_event_runtime_v1(
  '$subject_id',
  'd1430000-0000-4000-8000-000000000101',
  'd1430000-0000-4000-8000-000000000102',
  0,
  'history:seyeon-return',
  'd1430000-0000-4000-8000-000000000103',
  'seyeon-prod:return',
  '$character_id',
  'RETURN_AFTER_ABSENCE',
  '1',
  null,
  timestamptz '2026-09-28 01:00:00+00',
  'server_observation',
  'server:observation:return-v1',
  '[]'::jsonb,
  jsonb_build_array('seyeon-production-admission:return-v1'),
  jsonb_build_array('d1430000-0000-4000-8000-000000000104'),
  '[]'::jsonb,
  jsonb_build_array(
    jsonb_build_object(
      'factKey','return',
      'statement','server observed return',
      'sourceRefs',jsonb_build_array('server:observation:return-v1')
    )
  ),
  null,
  jsonb_build_object('observationKey','return-v1'),
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
  jsonb_build_object('behaviorAccess','STAGE_ALIGNED')
);
commit;
SQL
)
[[ "$first_apply" == *'1|S0_FIRST_MEETING|STABLE'* ]] || fail "first Se-yeon Production apply mismatch: $first_apply"

read_after_first=$("${psql_base[@]}" -At -F '|' <<SQL
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_id',true);
select
  revision,
  attained_stage,
  current_candidate_stage,
  current_condition,
  policy_version,
  policy_content_hash
from public.qry_production_relationship_runtime_v1(
  '$subject_id',
  '$character_id'
);
commit;
SQL
)
[[ "$read_after_first" == *"1|S0_FIRST_MEETING|S0_FIRST_MEETING|STABLE|relationship-policy-v1|$policy_hash"* ]] || fail "Production relationship read after first Event mismatch: $read_after_first"
pass "next-turn read pins the committed Production revision and policy identity"

conflict_apply=$("${psql_base[@]}" -At -F '|' <<SQL
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_id',true);
select
  revision_after,
  trust,
  friction,
  attained_stage,
  current_condition
from public.cmd_apply_relationship_event_runtime_v1(
  '$subject_id',
  'd1430000-0000-4000-8000-000000000101',
  'd1430000-0000-4000-8000-000000000202',
  1,
  'history:seyeon-conflict',
  'd1430000-0000-4000-8000-000000000203',
  'seyeon-prod:conflict',
  '$character_id',
  'CONFLICT_OPENED',
  '1',
  'seyeon.conflict_opened',
  timestamptz '2026-09-28 02:00:00+00',
  'server_observation',
  'server:observation:conflict-v1',
  '[]'::jsonb,
  jsonb_build_array('seyeon-production-admission:conflict-v1'),
  jsonb_build_array('d1430000-0000-4000-8000-000000000204'),
  '[]'::jsonb,
  jsonb_build_array(
    jsonb_build_object(
      'factKey','conflict',
      'statement','server observed relationship conflict',
      'sourceRefs',jsonb_build_array('server:observation:conflict-v1')
    )
  ),
  null,
  jsonb_build_object('conflictKey','conflict-v1'),
  'conflict_repair',
  'NEGATIVE',
  false,
  0,-6,8,
  null,
  'relationship-policy-v1',
  '$policy_hash',
  'S0_FIRST_MEETING',
  'S0_FIRST_MEETING',
  'OPEN_CONFLICT',
  'relationship-policy-state-v1',
  jsonb_build_object('behaviorAccess','RESTRICTED_BY_CONFLICT')
);
commit;
SQL
)
[[ "$conflict_apply" == *'2|0|8|S0_FIRST_MEETING|OPEN_CONFLICT'* ]] || fail "Se-yeon conflict apply mismatch: $conflict_apply"

conflict_read=$("${psql_base[@]}" -At -F '|' <<SQL
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_id',true);
select
  revision,
  attained_stage,
  current_condition,
  policy_state_jsonb ->> 'behaviorAccess'
from public.qry_production_relationship_runtime_v1(
  '$subject_id',
  '$character_id'
);
commit;
SQL
)
[[ "$conflict_read" == *'2|S0_FIRST_MEETING|OPEN_CONFLICT|RESTRICTED_BY_CONFLICT'* ]] || fail "Se-yeon Production conflict read mismatch: $conflict_read"
pass "conflict changes next-turn condition/access without regressing attained stage"

function_shape=$("${psql_base[@]}" -At -F '|' -c "select
  owner.rolname,
  p.prosecdef,
  has_function_privilege('myeongha_api_executor',p.oid,'EXECUTE'),
  has_function_privilege('public',p.oid,'EXECUTE')
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
join pg_roles owner on owner.oid=p.proowner
where n.nspname='public'
  and p.proname='qry_production_relationship_runtime_v1';")
[[ "$function_shape" == 'myeongha_relationship_apply_owner|t|t|f' ]] || fail "Production relationship read ACL/owner mismatch: $function_shape"
pass "Production relationship read remains a narrow SECURITY DEFINER surface"

expect_fail   "authenticated direct Production relationship runtime read"   "permission denied"   "begin; set local role authenticated; select * from public.qry_production_relationship_runtime_v1('$subject_id','$character_id'); rollback;"

# Durable fallback fixture: commit one real Se-yeon chat turn through the governed
# chat commands, enqueue one already-admitted Production relationship Event, then
# claim -> PHASE M apply -> complete in one worker transaction.
content_bundle_id="d1431000-0000-4000-8000-000000000001"
content_release_id="d1431000-0000-4000-8000-000000000002"
thread_id="d1431000-0000-4000-8000-000000000003"
thread_character_id="d1431000-0000-4000-8000-000000000004"
turn_id="d1431000-0000-4000-8000-000000000005"
user_message_id="d1431000-0000-4000-8000-000000000006"
attempt_id="d1431000-0000-4000-8000-000000000007"
renderer_log_id="d1431000-0000-4000-8000-000000000008"
guard_log_id="d1431000-0000-4000-8000-000000000009"
assistant_message_id="d1431000-0000-4000-8000-000000000010"
chat_outbox_id="d1431000-0000-4000-8000-000000000011"
relationship_outbox_id="d1431000-0000-4000-8000-000000000012"
relationship_event_id="d1431000-0000-4000-8000-000000000013"
relationship_history_id="d1431000-0000-4000-8000-000000000014"
relationship_provenance_id="d1431000-0000-4000-8000-000000000015"

"${psql_base[@]}" <<SQL
insert into public.content_bundles(
  id,content_version,content_hash,artifact_ref,artifact_schema_version,
  min_client_capability,asset_manifest_hash,cue_schema_version,
  manifest_jsonb,published_at
) values (
  '$content_bundle_id',
  'seyeon-prod-vertical-v1',
  'sha256:v1:seyeon-prod-vertical-bundle',
  'test://seyeon-prod-vertical-v1',
  'content-artifact-v1',
  '0.0.1-dev',
  'sha256:v1:seyeon-prod-vertical-assets',
  'cue-v1',
  '{}'::jsonb,
  clock_timestamp()
);

insert into public.content_releases(
  id,release_key,content_bundle_id,status,is_default,
  rollout_policy_version,rollout_seed,activated_at,created_at
) values (
  '$content_release_id',
  'seyeon-prod-vertical-release',
  '$content_bundle_id',
  'active',false,'test-rollout-v1','seyeon-prod-vertical-seed',
  clock_timestamp(),clock_timestamp()
);

insert into public.character_runtime_catalog(
  character_id,content_bundle_id,availability,enabled,published_at
) values (
  'seyeon','$content_bundle_id','available',true,clock_timestamp()
);

insert into public.conversation_threads(
  id,subject_id,thread_type,status,title,
  active_content_release_id,active_content_bundle_id,
  content_revision,next_sequence_no,created_at,updated_at
) values (
  '$thread_id','$subject_id','single_character','active',
  'seyeon-production-vertical',
  '$content_release_id','$content_bundle_id',
  0,1,clock_timestamp(),clock_timestamp()
);

insert into public.conversation_thread_characters(
  id,thread_id,character_id,content_bundle_id,role,joined_at
) values (
  '$thread_character_id','$thread_id','seyeon','$content_bundle_id',
  'primary',clock_timestamp() - interval '1 minute'
);

select * from public.cmd_receive_chat_turn_v1(
  '$subject_id',
  '$thread_id',
  'seyeon-prod-vertical-turn-1',
  'sha256:v1:seyeon-prod-vertical-request',
  'chat-request-v1',
  jsonb_build_object(
    'clientTurnId','seyeon-prod-vertical-turn-1',
    'text','도움을 받아줘',
    'clientCapability','0.0.1-dev'
  ),
  '$content_release_id',
  '$content_bundle_id',
  '$turn_id',
  '$user_message_id',
  '도움을 받아줘',
  null,
  'sha256:v1:seyeon-prod-vertical-user'
);

select * from public.cmd_allocate_chat_turn_attempt_v1(
  '$subject_id','$turn_id','$attempt_id','planner-v1'
);

select public.cmd_mark_chat_turn_context_ready_v1(
  '$subject_id','$turn_id','$attempt_id'
);

insert into public.ai_execution_logs(
  id,subject_id,turn_id,turn_attempt_id,stage,provider,model,
  prompt_version,content_release_id,content_bundle_id,character_id,
  input_ref_jsonb,output_ref_jsonb,status,created_at
) values (
  '$renderer_log_id','$subject_id','$turn_id','$attempt_id',
  'renderer','test-provider','test-model','renderer-prompt-v1',
  '$content_release_id','$content_bundle_id','seyeon',
  jsonb_build_object('turnId','$turn_id'),
  jsonb_build_object('generatedContentHash','sha256:v1:seyeon-prod-vertical-answer'),
  'success',clock_timestamp()
);

select public.cmd_mark_chat_turn_generated_v1(
  '$subject_id',
  '$turn_id',
  '$attempt_id',
  '$renderer_log_id',
  'renderer-v1',
  '$thread_character_id',
  '응. 이번에는 받을게.',
  jsonb_build_object('emotion','reserved_warmth'),
  'seyeon-dialogue-v2',
  'sha256:v1:seyeon-prod-vertical-answer',
  '[]'::jsonb
);

insert into public.ai_execution_logs(
  id,subject_id,turn_id,turn_attempt_id,stage,provider,model,
  prompt_version,content_release_id,content_bundle_id,character_id,
  input_ref_jsonb,output_ref_jsonb,status,created_at
) values (
  '$guard_log_id','$subject_id','$turn_id','$attempt_id',
  'output_guard','test-provider','test-guard','guard-prompt-v1',
  '$content_release_id','$content_bundle_id','seyeon',
  jsonb_build_object('turnId','$turn_id'),
  jsonb_build_object('generatedContentHash','sha256:v1:seyeon-prod-vertical-answer'),
  'success',clock_timestamp()
);

select public.cmd_validate_chat_turn_attempt_v1(
  '$subject_id',
  '$turn_id',
  '$attempt_id',
  '$guard_log_id',
  'output-guard-v1',
  jsonb_build_object('passed',true),
  true,
  'failed_final'
);

select * from public.cmd_commit_chat_turn_v1(
  '$subject_id',
  '$thread_id',
  '$turn_id',
  '$attempt_id',
  '$assistant_message_id',
  '$chat_outbox_id',
  null,null,null
);
SQL

assistant_occurred_at=$("${psql_base[@]}" -Atc "
select date_trunc('milliseconds',created_at)
from public.conversation_messages
where id='$assistant_message_id';
")

production_event_json=$("${psql_base[@]}" -Atc "
select jsonb_build_object(
  'schemaVersion','relationship-event-v1',
  'authority','authorized_relationship_event_v1',
  'eventId','$relationship_event_id',
  'dedupeKey','seyeon-prod:accepted-help:durable-v1',
  'subjectId','$subject_id',
  'characterId','seyeon',
  'eventKind','CARE_ACCEPTED_BY_CHARACTER',
  'eventSchemaVersion','1',
  'characterBehaviorKey','seyeon.accepted_help',
  'occurredAt',to_jsonb(timestamptz '$assistant_occurred_at'),
  'source',jsonb_build_object(
    'sourceKind','conversation_turn',
    'sourceRef','$turn_id',
    'sourceMessageRefs',jsonb_build_array('$assistant_message_id'),
    'authorityRefs',jsonb_build_array('seyeon-production-admission:durable-v1')
  ),
  'causalPredecessorEventIds','[]'::jsonb,
  'facts',jsonb_build_array(
    jsonb_build_object(
      'factKey','accepted_help',
      'statement','Guarded committed Se-yeon output accepted help.',
      'sourceRefs',jsonb_build_array('$assistant_message_id')
    )
  ),
  'characterInterpretation',null,
  'payload',jsonb_build_object('careKey','durable-care-v1')
);
")

enqueue_result=$("${psql_base[@]}" -At -F '|' <<SQL
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_id',true);
select outbox_event_id,status,replayed
from public.cmd_enqueue_seyeon_relationship_sync_v1(
  '$subject_id',
  '$relationship_outbox_id',
  '$turn_id',
  '$production_event_json'::jsonb
);
commit;
SQL
)
[[ "$enqueue_result" == *"$relationship_outbox_id|pending|f"* ]] || fail "relationship sync enqueue mismatch: $enqueue_result"
pass "committed Se-yeon turn can enqueue one admitted Production relationship sync request"

worker_result=$("${psql_base[@]}" -At -F '|' <<SQL
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_id',true);

select
  status,
  reclaimed
from public.cmd_claim_seyeon_relationship_sync_v1(
  '$subject_id',
  '$relationship_outbox_id',
  'seyeon-relationship-worker-v1',
  clock_timestamp() + interval '5 minutes'
);

select
  revision_after,
  closeness,
  trust,
  current_condition
from public.cmd_apply_relationship_event_runtime_v1(
  '$subject_id',
  'd1430000-0000-4000-8000-000000000101',
  '$relationship_history_id',
  2,
  'history:seyeon-durable-care-v1',
  '$relationship_event_id',
  'seyeon-prod:accepted-help:durable-v1',
  'seyeon',
  'CARE_ACCEPTED_BY_CHARACTER',
  '1',
  'seyeon.accepted_help',
  timestamptz '$assistant_occurred_at',
  'conversation_turn',
  '$turn_id',
  jsonb_build_array('$assistant_message_id'),
  jsonb_build_array('seyeon-production-admission:durable-v1'),
  jsonb_build_array('$relationship_provenance_id'),
  '[]'::jsonb,
  jsonb_build_array(
    jsonb_build_object(
      'factKey','accepted_help',
      'statement','Guarded committed Se-yeon output accepted help.',
      'sourceRefs',jsonb_build_array('$assistant_message_id')
    )
  ),
  null,
  jsonb_build_object('careKey','durable-care-v1'),
  'care',
  'APPLIED',
  true,
  3,4,0,
  'care',
  'relationship-policy-v1',
  '$policy_hash',
  'S0_FIRST_MEETING',
  'S0_FIRST_MEETING',
  'OPEN_CONFLICT',
  'relationship-policy-state-v1',
  jsonb_build_object(
    'behaviorAccess','RESTRICTED_BY_CONFLICT',
    'fixture','durable-sync'
  )
);

select
  status,
  replayed
from public.cmd_complete_seyeon_relationship_sync_v1(
  '$subject_id',
  '$relationship_outbox_id',
  'seyeon-relationship-worker-v1'
);
commit;
SQL
)
[[ "$worker_result" == *processing|f'* ]] || fail "relationship sync claim mismatch: $worker_result"
[[ "$worker_result" == *3|3|4|OPEN_CONFLICT'* ]] || fail "relationship sync apply mismatch: $worker_result"
[[ "$worker_result" == *processed|f'* ]] || fail "relationship sync completion mismatch: $worker_result"
pass "durable worker claim -> PHASE M apply -> completion commits as one governed processing transaction"

durable_shape=$("${psql_base[@]}" -At -F '|' -c "
select
  oe.status,
  s.revision,
  s.closeness,
  s.trust,
  s.current_condition,
  (s.last_interaction_at is not null)
from public.outbox_events oe
join public.user_character_states s
  on s.subject_id='$subject_id'
 and s.character_id='seyeon'
where oe.id='$relationship_outbox_id';
")
[[ "$durable_shape" == 'processed|3|3|4|OPEN_CONFLICT|t' ]] || fail "durable relationship sync state mismatch: $durable_shape"
pass "processed sync updates next-turn relationship projection and direct-interaction timestamp"

enqueue_replay=$("${psql_base[@]}" -At -F '|' <<SQL
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_id',true);
select outbox_event_id,status,replayed
from public.cmd_enqueue_seyeon_relationship_sync_v1(
  '$subject_id',
  'd1431000-0000-4000-8000-000000000099',
  '$turn_id',
  '$production_event_json'::jsonb
);
commit;
SQL
)
[[ "$enqueue_replay" == *"$relationship_outbox_id|processed|t"* ]] || fail "relationship sync enqueue replay mismatch: $enqueue_replay"
pass "response-loss enqueue retry reuses the original durable sync request"

expect_fail   "authenticated direct relationship sync enqueue"   "permission denied"   "begin; set local role authenticated; select * from public.cmd_enqueue_seyeon_relationship_sync_v1('$subject_id','$relationship_outbox_id','$turn_id','$production_event_json'::jsonb); rollback;"

echo "Se-yeon Production relationship vertical slice V1 DB tests passed"
