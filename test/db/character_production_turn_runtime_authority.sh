#!/usr/bin/env bash
set -euo pipefail

PSQL=(psql -X -v ON_ERROR_STOP=1 --set=VERBOSITY=verbose)

SUBJECT='11390000-0000-0000-0000-000000000001'
OTHER_SUBJECT='12109000-0000-0000-0000-000000000001'
BUNDLE='11391000-0000-0000-0000-000000000001'
READING='12103100-0000-0000-0000-000000000001'
CHARACTER='test-unlockable-reader'
RELEASE='d2000000-0000-4000-8000-000000000001'
THREAD='d3000000-0000-4000-8000-000000000001'
PARTICIPANT='d3100000-0000-4000-8000-000000000001'
TURN='d4000000-0000-4000-8000-000000000001'
USER_MESSAGE='d5000000-0000-4000-8000-000000000001'
ATTEMPT='d6000000-0000-4000-8000-000000000001'
GEN_LOG='d7000000-0000-4000-8000-000000000001'
GUARD_LOG='d7000000-0000-4000-8000-000000000002'
MESSAGE='d8000000-0000-4000-8000-000000000001'
GROUNDING='d9000000-0000-4000-8000-000000000001'
OUTBOX='da000000-0000-4000-8000-000000000001'
HASH='sha256:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

expect_failure() {
  local label="$1"
  local expected="$2"
  local sql="$3"
  local output
  local status

  set +e
  output="$( "${PSQL[@]}" -c "$sql" 2>&1 )"
  status=$?
  set -e

  if [[ $status -eq 0 ]]; then
    echo "FAIL $label: statement unexpectedly succeeded" >&2
    exit 10
  fi
  if [[ "$output" != *"$expected"* ]]; then
    echo "FAIL $label: expected $expected" >&2
    echo "$output" >&2
    exit 11
  fi
  echo "PASS $label -> $expected"
}

runtime_query() {
  local sql="$1"
  "${PSQL[@]}" -At -F '|' <<SQL
begin;
select pg_catalog.set_config('myeongha.subject_id','$SUBJECT',true);
set local role myeongha_api_executor;
$sql
commit;
SQL
}

"${PSQL[@]}" <<SQL
insert into public.content_releases(
  id, release_key, content_bundle_id, status, is_default,
  rollout_policy_version, rollout_seed, activated_at, created_at
) values (
  '$RELEASE',
  'character-production-turn-runtime-test',
  '$BUNDLE',
  'active',
  false,
  'character-production-turn-test-v1',
  'character-production-turn-seed',
  clock_timestamp(),
  clock_timestamp()
);

insert into public.conversation_threads(
  id, subject_id, thread_type, status, title,
  active_content_release_id, active_content_bundle_id,
  content_revision, next_sequence_no, created_at, updated_at
) values (
  '$THREAD',
  '$SUBJECT',
  'single_character',
  'active',
  'character-production-turn-runtime',
  '$RELEASE',
  '$BUNDLE',
  0,
  1,
  clock_timestamp(),
  clock_timestamp()
);

insert into public.conversation_thread_characters(
  id, thread_id, character_id, content_bundle_id, role, joined_at
) values (
  '$PARTICIPANT',
  '$THREAD',
  '$CHARACTER',
  '$BUNDLE',
  'primary',
  clock_timestamp() - interval '1 minute'
);

insert into public.reading_groundings(
  id, reading_id, subject_id,
  grounding_adapter_key, grounding_version, coverage_state,
  approved_blocks_jsonb, semantic_claims_jsonb,
  qualifiers_jsonb, prohibited_inferences_jsonb,
  grounding_hash, created_at
) values (
  '$GROUNDING',
  '$READING',
  '$SUBJECT',
  'character-production-test',
  'v1',
  'partial',
  null,
  jsonb_build_array(jsonb_build_object('semanticKey','TEST_GROUNDED_MEANING')),
  '[]'::jsonb,
  '[]'::jsonb,
  'sha256:test:character-production-grounding',
  clock_timestamp()
);

select * from public.cmd_receive_chat_turn_v1(
  '$SUBJECT',
  '$THREAD',
  'character-production-turn-1',
  'sha256:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  'chat-request-v1',
  jsonb_build_object(
    'clientTurnId','character-production-turn-1',
    'text','production follow-up',
    'clientCapability','0.0.1-dev'
  ),
  '$RELEASE',
  '$BUNDLE',
  '$TURN',
  '$USER_MESSAGE',
  'production follow-up',
  null,
  'sha256:v1:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
);
SQL

expect_failure   'executor direct AI execution insert remains denied'   'permission denied for table ai_execution_logs'   "begin;
   select pg_catalog.set_config('myeongha.subject_id','$SUBJECT',true);
   set local role myeongha_api_executor;
   insert into public.ai_execution_logs(
     id, subject_id, turn_id, stage, status, created_at
   ) values (
     'db000000-0000-4000-8000-000000000001',
     '$SUBJECT','$TURN','renderer','success',clock_timestamp()
   );
   rollback;"

expect_failure   'cross-subject runtime call is denied'   'subject execution context mismatch'   "begin;
   select pg_catalog.set_config('myeongha.subject_id','$OTHER_SUBJECT',true);
   set local role myeongha_api_executor;
   select * from public.cmd_character_production_allocate_attempt_runtime_v1(
     '$SUBJECT','$TURN','$ATTEMPT','planner-v1'
   );
   rollback;"

allocate_result="$(runtime_query "select attempt_id,attempt_no,replayed
from public.cmd_character_production_allocate_attempt_runtime_v1(
  '$SUBJECT','$TURN','$ATTEMPT','planner-v1'
);")"
allocate_result="$(printf '%s
' "$allocate_result" | grep -E '^[0-9a-f-]+\|[0-9]+\|[tf]$' | tail -1)"
if [[ "$allocate_result" != "$ATTEMPT|1|f" ]]; then
  echo "FAIL Production attempt allocation: $allocate_result" >&2
  exit 20
fi
echo "PASS Production attempt allocation is subject-bound"

replay_result="$(runtime_query "select attempt_id,attempt_no,replayed
from public.cmd_character_production_allocate_attempt_runtime_v1(
  '$SUBJECT','$TURN','d6000000-0000-4000-8000-000000000099','planner-v1'
);")"
replay_result="$(printf '%s
' "$replay_result" | grep -E '^[0-9a-f-]+\|[0-9]+\|[tf]$' | tail -1)"
if [[ "$replay_result" != "$ATTEMPT|1|t" ]]; then
  echo "FAIL active attempt replay authority: $replay_result" >&2
  exit 21
fi
echo "PASS active attempt replay returns the authoritative attempt without allocating another"

runtime_query "select public.cmd_character_production_context_ready_runtime_v1(
  '$SUBJECT','$TURN','$ATTEMPT'
);" >/dev/null

expect_failure   'wrong Reader/Character provenance is denied'   'character_production_reading_reader_conflict'   "begin;
   select pg_catalog.set_config('myeongha.subject_id','$SUBJECT',true);
   set local role myeongha_api_executor;
   select public.cmd_character_production_stage_generated_runtime_v1(
     '$SUBJECT','$TURN','$ATTEMPT',
     'd7000000-0000-4000-8000-000000000090',
     'test-coming-soon-reader',
     '$READING','$BUNDLE',
     'openai','gpt-test','renderer-v1','prompt-v1',
     jsonb_build_object('schemaVersion','v1'),
     '$HASH'
   );
   rollback;"

expect_failure   'wrong content bundle is denied'   'character_production_turn_binding_conflict'   "begin;
   select pg_catalog.set_config('myeongha.subject_id','$SUBJECT',true);
   set local role myeongha_api_executor;
   select public.cmd_character_production_stage_generated_runtime_v1(
     '$SUBJECT','$TURN','$ATTEMPT',
     'd7000000-0000-4000-8000-000000000091',
     '$CHARACTER',
     '$READING','ffffffff-ffff-4fff-8fff-ffffffffffff',
     'openai','gpt-test','renderer-v1','prompt-v1',
     jsonb_build_object('schemaVersion','v1'),
     '$HASH'
   );
   rollback;"

runtime_query "select public.cmd_character_production_stage_generated_runtime_v1(
  '$SUBJECT','$TURN','$ATTEMPT','$GEN_LOG',
  '$CHARACTER','$READING','$BUNDLE',
  'openai','gpt-test','renderer-v1','prompt-v1',
  jsonb_build_object(
    'schemaVersion','v1',
    'framingBefore','big picture',
    'protectedSajuSegments',jsonb_build_array(),
    'protectedSajuDisclosures',jsonb_build_array(),
    'calculationAmbiguity',jsonb_build_array(),
    'framingAfter','follow up',
    'emotion','calm',
    'animationCue',null,
    'memoryProposals',jsonb_build_array(
      jsonb_build_object('proposalType','memory','value','must-not-auto-commit')
    ),
    'relationshipEventProposals',jsonb_build_array(
      jsonb_build_object('eventType','MUST_NOT_AUTO_COMMIT')
    ),
    'suggestedActions',jsonb_build_array()
  ),
  '$HASH'
);" >/dev/null

generated_shape="$("${PSQL[@]}" -At -F '|' -c "select
  (select state from public.chat_turns where id='$TURN'),
  (select state from public.chat_turn_attempts where id='$ATTEMPT'),
  (select count(*) from public.ai_execution_logs where id='$GEN_LOG' and stage='renderer' and provider='openai' and model='gpt-test'),
  (select count(*) from public.ai_execution_groundings where ai_execution_log_id='$GEN_LOG' and grounding_id='$GROUNDING' and role='context'),
  (select generated_grounding_refs_jsonb::text from public.chat_turn_attempts where id='$ATTEMPT'),
  (select count(*) from public.conversation_messages where turn_id='$TURN' and sender_type='character');")"
expected_generated="generated|generated|1|1|[\"$GROUNDING\"]|0"
if [[ "$generated_shape" != "$expected_generated" ]]; then
  echo "FAIL generated provenance shape: $generated_shape" >&2
  exit 22
fi
echo "PASS renderer provenance + exact existing Reading grounding are staged without public message"

expect_failure   'Output Guard validation hash mismatch is denied'   'character_production_validation_source_missing'   "begin;
   select pg_catalog.set_config('myeongha.subject_id','$SUBJECT',true);
   set local role myeongha_api_executor;
   select public.cmd_character_production_validate_runtime_v1(
     '$SUBJECT','$TURN','$ATTEMPT',
     'd7000000-0000-4000-8000-000000000092',
     'character-output-guard-v1',
     'sha256:v1:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'
   );
   rollback;"

runtime_query "select public.cmd_character_production_validate_runtime_v1(
  '$SUBJECT','$TURN','$ATTEMPT','$GUARD_LOG',
  'character-output-guard-v1','$HASH'
);" >/dev/null

validation_shape="$("${PSQL[@]}" -At -F '|' -c "select
  (select state from public.chat_turns where id='$TURN'),
  (select state from public.chat_turn_attempts where id='$ATTEMPT'),
  (select count(*) from public.ai_execution_logs where id='$GUARD_LOG' and stage='output_guard' and status='success'),
  (select count(*) from public.ai_execution_groundings where ai_execution_log_id='$GUARD_LOG' and grounding_id='$GROUNDING');")"
if [[ "$validation_shape" != 'validated|validated|1|1' ]]; then
  echo "FAIL Output Guard validation provenance: $validation_shape" >&2
  exit 23
fi
echo "PASS Output Guard provenance preserves the same generated hash + grounding set"

expect_failure   'commit renderer provider mismatch is denied'   'character_production_commit_renderer_provenance_conflict'   "begin;
   select pg_catalog.set_config('myeongha.subject_id','$SUBJECT',true);
   set local role myeongha_api_executor;
   select * from public.cmd_character_production_commit_runtime_v1(
     '$SUBJECT','$THREAD','$TURN','$ATTEMPT',
     '$MESSAGE','$OUTBOX','$CHARACTER',
     'wrong-provider','gpt-test','$HASH'
   );
   rollback;"

commit_result="$(runtime_query "select turn_id,attempt_id,message_id,sequence_no,replayed
from public.cmd_character_production_commit_runtime_v1(
  '$SUBJECT','$THREAD','$TURN','$ATTEMPT',
  '$MESSAGE','$OUTBOX','$CHARACTER',
  'openai','gpt-test','$HASH'
);")"
commit_result="$(printf '%s
' "$commit_result" | grep -E '^[0-9a-f-]+\|[0-9a-f-]+\|[0-9a-f-]+\|[0-9]+\|[tf]$' | tail -1)"
if [[ "$commit_result" != "$TURN|$ATTEMPT|$MESSAGE|2|f" ]]; then
  echo "FAIL validated Production commit: $commit_result" >&2
  exit 24
fi

side_effect_shape="$("${PSQL[@]}" -At -F '|' -c "select
  (select count(*) from public.conversation_messages where id='$MESSAGE' and sender_type='character'),
  (select count(*) from public.outbox_events where id='$OUTBOX'),
  (select count(*) from public.relationship_events where source_turn_id='$TURN'),
  (select count(*) from public.world_events where source_turn_id='$TURN'),
  (select count(*) from public.memory_items where source_turn_id='$TURN');")"
if [[ "$side_effect_shape" != '1|1|0|0|0' ]]; then
  echo "FAIL Production commit mutation boundary: $side_effect_shape" >&2
  exit 25
fi
echo "PASS commit publishes one assistant message/outbox and ignores raw relationship/world/memory proposals"

committed_read="$(runtime_query "select
  turn_id,attempt_id,message_id,sequence_no,provider_key,model_key,
  envelope_jsonb->>'schemaVersion'
from public.qry_character_production_committed_turn_runtime_v1(
  '$SUBJECT','$TURN'
);")"
committed_read="$(printf '%s
' "$committed_read" | grep -E '^[0-9a-f-]+\|' | tail -1)"
if [[ "$committed_read" != "$TURN|$ATTEMPT|$MESSAGE|2|openai|gpt-test|v1" ]]; then
  echo "FAIL committed replay projection: $committed_read" >&2
  exit 26
fi
echo "PASS committed replay returns stored message + renderer provenance"

recommit="$(runtime_query "select turn_id,attempt_id,message_id,sequence_no,replayed
from public.cmd_character_production_commit_runtime_v1(
  '$SUBJECT','$THREAD','$TURN','$ATTEMPT',
  'd8000000-0000-4000-8000-000000000099',
  'da000000-0000-4000-8000-000000000099',
  '$CHARACTER','openai','gpt-test','$HASH'
);")"
recommit="$(printf '%s
' "$recommit" | grep -E '^[0-9a-f-]+\|' | tail -1)"
if [[ "$recommit" != "$TURN|$ATTEMPT|$MESSAGE|2|t" ]]; then
  echo "FAIL committed turn replay: $recommit" >&2
  exit 27
fi

post_replay_counts="$("${PSQL[@]}" -At -F '|' -c "select
  (select count(*) from public.conversation_messages where turn_id='$TURN' and sender_type='character'),
  (select count(*) from public.outbox_events where aggregate_type='chat_turn' and aggregate_id='$TURN');")"
if [[ "$post_replay_counts" != '1|1' ]]; then
  echo "FAIL committed replay duplicated durable effects: $post_replay_counts" >&2
  exit 28
fi
echo "PASS committed retry converges on one authoritative message/outbox"

echo "Character Production turn runtime authority tests passed"
