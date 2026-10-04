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

subject_id="e1470000-0000-4000-8000-000000000001"
bundle_id="e1470000-0000-4000-8000-000000000002"
release_id="e1470000-0000-4000-8000-000000000003"
thread_id="e1470000-0000-4000-8000-000000000004"
thread_character_id="e1470000-0000-4000-8000-000000000005"
turn_id="e1470000-0000-4000-8000-000000000006"
user_message_id="e1470000-0000-4000-8000-000000000007"
attempt_id="e1470000-0000-4000-8000-000000000008"
renderer_log_id="e1470000-0000-4000-8000-000000000009"
guard_log_id="e1470000-0000-4000-8000-000000000010"
assistant_message_id="e1470000-0000-4000-8000-000000000011"
chat_outbox_id="e1470000-0000-4000-8000-000000000012"
post_turn_outbox_id="e1470000-0000-4000-8000-000000000013"
snapshot_hash="sha256:v1:e147-post-turn-snapshot"

"${psql_base[@]}" <<SQL
insert into public.subjects(
  id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at
) values (
  '$subject_id','guest',null,'active',null,clock_timestamp(),clock_timestamp()
);

insert into public.characters(character_id,created_at,retired_at)
values ('seyeon',clock_timestamp(),null)
on conflict (character_id) do nothing;

insert into public.content_bundles(
  id,content_version,content_hash,artifact_ref,artifact_schema_version,
  min_client_capability,asset_manifest_hash,cue_schema_version,
  manifest_jsonb,published_at
) values (
  '$bundle_id',
  'seyeon-post-turn-worker-v1',
  'sha256:v1:seyeon-post-turn-worker-bundle',
  'test://seyeon-post-turn-worker-v1',
  'content-artifact-v1',
  '0.0.1-dev',
  'sha256:v1:seyeon-post-turn-worker-assets',
  'cue-v1',
  '{}'::jsonb,
  clock_timestamp()
);

insert into public.content_releases(
  id,release_key,content_bundle_id,status,is_default,
  rollout_policy_version,rollout_seed,activated_at,created_at
) values (
  '$release_id',
  'seyeon-post-turn-worker-release',
  '$bundle_id',
  'active',false,'test-rollout-v1','seyeon-post-turn-worker-seed',
  clock_timestamp(),clock_timestamp()
);

insert into public.character_runtime_catalog(
  character_id,content_bundle_id,availability,enabled,published_at
) values (
  'seyeon','$bundle_id','available',true,clock_timestamp()
);

insert into public.conversation_threads(
  id,subject_id,thread_type,status,title,
  active_content_release_id,active_content_bundle_id,
  content_revision,next_sequence_no,created_at,updated_at
) values (
  '$thread_id','$subject_id','single_character','active',
  'seyeon-post-turn-worker',
  '$release_id','$bundle_id',
  0,1,clock_timestamp(),clock_timestamp()
);

insert into public.conversation_thread_characters(
  id,thread_id,character_id,content_bundle_id,role,joined_at
) values (
  '$thread_character_id','$thread_id','seyeon','$bundle_id',
  'primary',clock_timestamp() - interval '1 minute'
);
SQL

owner_shape=$("${psql_base[@]}" -At -F '|' -c "
select
  rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,
  rolinherit,rolreplication,rolbypassrls,
  has_schema_privilege('myeongha_seyeon_post_turn_owner','public','CREATE')
from pg_catalog.pg_roles
where rolname='myeongha_seyeon_post_turn_owner';
")
[[ "$owner_shape" == "f|f|f|f|f|f|f|f" ]] ||
  fail "post-turn owner privilege shape mismatch: $owner_shape"
pass "post-turn owner remains NOLOGIN/NOBYPASSRLS without schema CREATE"

function_shape=$("${psql_base[@]}" -At -F '|' -c "
select
  count(*) filter (
    where p.proname='cmd_commit_seyeon_chat_turn_runtime_v2'
      and p.prosecdef
      and owner.rolname='myeongha_seyeon_chat_runtime_owner'
      and has_function_privilege('myeongha_api_executor',p.oid,'EXECUTE')
      and not has_function_privilege('authenticated',p.oid,'EXECUTE')
  ),
  count(*) filter (
    where p.proname in (
      'cmd_claim_seyeon_post_turn_analysis_v1',
      'cmd_checkpoint_seyeon_post_turn_analysis_v1',
      'cmd_complete_seyeon_post_turn_analysis_v1'
    )
      and p.prosecdef
      and owner.rolname='myeongha_seyeon_post_turn_owner'
      and has_function_privilege('myeongha_api_executor',p.oid,'EXECUTE')
      and not has_function_privilege('authenticated',p.oid,'EXECUTE')
  )
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid=p.pronamespace
join pg_catalog.pg_roles owner on owner.oid=p.proowner
where n.nspname='public'
  and p.proname in (
    'cmd_commit_seyeon_chat_turn_runtime_v2',
    'cmd_claim_seyeon_post_turn_analysis_v1',
    'cmd_checkpoint_seyeon_post_turn_analysis_v1',
    'cmd_complete_seyeon_post_turn_analysis_v1'
  );
")
[[ "$function_shape" == "1|3" ]] ||
  fail "post-turn wrapper ownership/ACL mismatch: $function_shape"
pass "post-turn commit/worker wrappers are narrow SECURITY DEFINER surfaces"

"${psql_base[@]}" -At <<SQL >/dev/null
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_id',true);
select * from public.cmd_receive_seyeon_chat_turn_runtime_v1(
  '$subject_id','$thread_id',
  'seyeon-post-turn-worker-turn-1',
  'sha256:v1:e147-request',
  'chat-request-v1',
  jsonb_build_object(
    'threadId','$thread_id',
    'characterId','seyeon',
    'clientTurnId','seyeon-post-turn-worker-turn-1',
    'text','이번에는 제가 좀 도와드릴게요.',
    'clientCapability','0.0.1-dev'
  ),
  '$release_id','$bundle_id','$turn_id','$user_message_id',
  '이번에는 제가 좀 도와드릴게요.',
  'sha256:v1:e147-user'
);
select * from public.cmd_allocate_seyeon_chat_attempt_runtime_v1(
  '$subject_id','$turn_id','$attempt_id','seyeon-production-chat-planner-v1'
);
select public.cmd_mark_seyeon_chat_context_ready_runtime_v1(
  '$subject_id','$turn_id','$attempt_id'
);
select public.cmd_persist_seyeon_chat_generated_runtime_v1(
  '$subject_id','$turn_id','$attempt_id','$thread_character_id',
  '$renderer_log_id',
  'test-provider','test-renderer-model','seyeon-character-runtime-v2',
  '그럼 이번에는 조금 도움받아 볼게요.',
  jsonb_build_object(
    'schemaVersion','seyeon-dialogue-envelope-v2',
    'utterance','그럼 이번에는 조금 도움받아 볼게요.'
  ),
  'seyeon-dialogue-envelope-v2',
  'sha256:v1:e147-answer',
  '[]'::jsonb
);
select public.cmd_persist_seyeon_chat_validated_runtime_v1(
  '$subject_id','$turn_id','$attempt_id','$guard_log_id',
  'test-provider','test-review-model','seyeon-semantic-review-v2',
  'sha256:v1:e147-answer',
  jsonb_build_object(
    'schemaVersion','seyeon-production-chat-validation-v1',
    'passed',true,
    'generatedContentHash','sha256:v1:e147-answer'
  ),
  '[]'::jsonb
);
commit;
SQL

commit_result=$("${psql_base[@]}" -At -F '|' <<SQL
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_id',true);
select
  turn_id,
  attempt_id,
  assistant_message_id,
  sequence_no,
  committed_at is not null,
  post_turn_outbox_event_id,
  replayed
from public.cmd_commit_seyeon_chat_turn_runtime_v2(
  '$subject_id',
  '$thread_id',
  '$turn_id',
  '$attempt_id',
  '$assistant_message_id',
  '$chat_outbox_id',
  '$post_turn_outbox_id',
  jsonb_build_object(
    'schemaVersion','seyeon-post-turn-analysis-snapshot-v1',
    'mode','WRITE_DARK',
    'turnId','$turn_id',
    'userMessageId','$user_message_id',
    'assistantMessageId','$assistant_message_id',
    'preparedAt','2026-10-04T02:00:00.000Z',
    'productionAuthorityRef','seyeon-prod:e147',
    'interpretation',jsonb_build_object('schemaVersion','seyeon-turn-interpretation-v2'),
    'envelope',jsonb_build_object(
      'schemaVersion','seyeon-dialogue-envelope-v2',
      'utterance','그럼 이번에는 조금 도움받아 볼게요.'
    ),
    'eventAuthorityEvidence',jsonb_build_object('integrityDecisions','[]'::jsonb),
    'priorEvents','[]'::jsonb,
    'relationshipBefore',jsonb_build_object(
      'schemaVersion','seyeon-relationship-projection-exp-v2'
    ),
    'productionCausalBindings','[]'::jsonb,
    'identity',jsonb_build_object(
      'experimentalEventId','e1470000-0000-4000-8000-000000000014',
      'experimentalEventDedupeKey','e147:experimental',
      'productionEventId','e1470000-0000-4000-8000-000000000015',
      'relationshipSyncOutboxEventId','e1470000-0000-4000-8000-000000000016'
    )
  ),
  '$snapshot_hash'
);
commit;
SQL
)
[[ "$commit_result" == *"$turn_id|$attempt_id|$assistant_message_id|2|t|$post_turn_outbox_id|f"* ]] ||
  fail "post-turn atomic commit mismatch: $commit_result"
pass "Chat commit returns the dedicated post-turn outbox identity"

outbox_shape=$("${psql_base[@]}" -At -F '|' -c "
select
  count(*) filter (
    where id='$chat_outbox_id'
      and event_type='CHAT_TURN_COMMITTED'
      and status='pending'
  ),
  count(*) filter (
    where id='$post_turn_outbox_id'
      and event_type='SEYEON_POST_TURN_ANALYSIS_REQUESTED'
      and status='pending'
      and aggregate_type='chat_turn'
      and aggregate_id='$turn_id'
      and dedupe_key='seyeon-post-turn-v1'
      and payload_jsonb->>'turnId'='$turn_id'
      and payload_jsonb->>'attemptId'='$attempt_id'
      and payload_jsonb->>'userMessageId'='$user_message_id'
      and payload_jsonb->>'assistantMessageId'='$assistant_message_id'
      and payload_jsonb->>'snapshotHash'='$snapshot_hash'
      and payload_jsonb#>>'{snapshot,schemaVersion}'
        ='seyeon-post-turn-analysis-snapshot-v1'
  )
from public.outbox_events
where id in ('$chat_outbox_id','$post_turn_outbox_id');
")
[[ "$outbox_shape" == "1|1" ]] ||
  fail "atomic generic/dedicated outbox shape mismatch: $outbox_shape"
pass "generic Chat outbox and dedicated post-turn job commit together"

claim_result=$("${psql_base[@]}" -At -F '|' <<SQL
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_id',true);
select
  outbox_event_id,
  turn_id,
  attempt_id,
  user_message_id,
  user_text,
  assistant_message_id,
  assistant_text,
  committed_at is not null,
  snapshot_hash,
  checkpoint_jsonb is null,
  status,
  lock_owner,
  reclaimed
from public.cmd_claim_seyeon_post_turn_analysis_v1(
  '$subject_id',
  '$post_turn_outbox_id',
  'worker-e147',
  clock_timestamp() + interval '10 minutes'
);
commit;
SQL
)
[[ "$claim_result" == *"$post_turn_outbox_id|$turn_id|$attempt_id|$user_message_id|이번에는 제가 좀 도와드릴게요.|$assistant_message_id|그럼 이번에는 조금 도움받아 볼게요.|t|$snapshot_hash|t|processing|worker-e147|f"* ]] ||
  fail "post-turn claim material mismatch: $claim_result"
pass "dedicated worker claim restores the exact committed Chat material"

checkpoint_result=$("${psql_base[@]}" -At -F '|' <<SQL
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_id',true);
select outbox_event_id,status,replayed
from public.cmd_checkpoint_seyeon_post_turn_analysis_v1(
  '$subject_id',
  '$post_turn_outbox_id',
  'worker-e147',
  jsonb_build_object(
    'schemaVersion','seyeon-post-turn-analysis-checkpoint-v1',
    'decision','none'
  )
);
commit;
SQL
)
[[ "$checkpoint_result" == *"$post_turn_outbox_id|processing|f"* ]] ||
  fail "post-turn checkpoint mismatch: $checkpoint_result"
pass "worker persists one immutable post-turn authority checkpoint"

checkpoint_replay=$("${psql_base[@]}" -At -F '|' <<SQL
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_id',true);
select outbox_event_id,status,replayed
from public.cmd_checkpoint_seyeon_post_turn_analysis_v1(
  '$subject_id',
  '$post_turn_outbox_id',
  'worker-e147',
  jsonb_build_object(
    'schemaVersion','seyeon-post-turn-analysis-checkpoint-v1',
    'decision','none'
  )
);
commit;
SQL
)
[[ "$checkpoint_replay" == *"$post_turn_outbox_id|processing|t"* ]] ||
  fail "post-turn checkpoint replay mismatch: $checkpoint_replay"
pass "response-loss checkpoint replay is idempotent"

expect_fail   "post-turn checkpoint immutable conflict"   "checkpoint is immutable once written"   "begin; set local role myeongha_api_executor; select pg_catalog.set_config('myeongha.subject_id','$subject_id',true); select * from public.cmd_checkpoint_seyeon_post_turn_analysis_v1('$subject_id','$post_turn_outbox_id','worker-e147',jsonb_build_object('schemaVersion','seyeon-post-turn-analysis-checkpoint-v1','decision','rejected')); rollback;"

expect_fail   "post-turn checkpoint Production Event identity mismatch"   "outside committed snapshot authority"   "begin; set local role myeongha_api_executor; select pg_catalog.set_config('myeongha.subject_id','$subject_id',true); select * from public.cmd_checkpoint_seyeon_post_turn_analysis_v1('$subject_id','$post_turn_outbox_id','worker-e147',jsonb_build_object('schemaVersion','seyeon-post-turn-analysis-checkpoint-v1','decision','relationship_event','productionEvent',jsonb_build_object('schemaVersion','relationship-event-v1','authority','authorized_relationship_event_v1','subjectId','$subject_id','characterId','seyeon','eventId','e1470000-0000-4000-8000-000000000099'))); rollback;"

checkpoint_shape=$("${psql_base[@]}" -At -c "
select payload_jsonb#>>'{analysisCheckpoint,decision}'
from public.outbox_events
where id='$post_turn_outbox_id';
")
[[ "$checkpoint_shape" == "none" ]] ||
  fail "post-turn checkpoint was not persisted immutably: $checkpoint_shape"
pass "checkpoint survives independently from generic Chat outbox state"

generic_status=$("${psql_base[@]}" -At -c "
select status
from public.outbox_events
where id='$chat_outbox_id';
")
[[ "$generic_status" == "pending" ]] ||
  fail "post-turn claim consumed generic Chat outbox: $generic_status"
pass "post-turn worker leaves generic CHAT_TURN_COMMITTED independently pending"

complete_result=$("${psql_base[@]}" -At -F '|' <<SQL
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_id',true);
select outbox_event_id,status,processed_at is not null,replayed
from public.cmd_complete_seyeon_post_turn_analysis_v1(
  '$subject_id','$post_turn_outbox_id','worker-e147'
);
commit;
SQL
)
[[ "$complete_result" == *"$post_turn_outbox_id|processed|t|f"* ]] ||
  fail "post-turn completion mismatch: $complete_result"
pass "dedicated post-turn analysis job reaches processed state"

complete_replay=$("${psql_base[@]}" -At -F '|' <<SQL
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_id',true);
select outbox_event_id,status,processed_at is not null,replayed
from public.cmd_complete_seyeon_post_turn_analysis_v1(
  '$subject_id','$post_turn_outbox_id','worker-e147'
);
commit;
SQL
)
[[ "$complete_replay" == *"$post_turn_outbox_id|processed|t|t"* ]] ||
  fail "post-turn completion replay mismatch: $complete_replay"
pass "response-loss completion replay is read-only and idempotent"

rollback_turn_id="e1470000-0000-4000-8000-000000000020"
rollback_user_message_id="e1470000-0000-4000-8000-000000000021"
rollback_attempt_id="e1470000-0000-4000-8000-000000000022"
rollback_renderer_log_id="e1470000-0000-4000-8000-000000000023"
rollback_guard_log_id="e1470000-0000-4000-8000-000000000024"
rollback_assistant_message_id="e1470000-0000-4000-8000-000000000025"
rollback_chat_outbox_id="e1470000-0000-4000-8000-000000000026"
rollback_post_turn_outbox_id="e1470000-0000-4000-8000-000000000027"

"${psql_base[@]}" -At <<SQL >/dev/null
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_id',true);
select * from public.cmd_receive_seyeon_chat_turn_runtime_v1(
  '$subject_id','$thread_id',
  'seyeon-post-turn-worker-rollback-turn',
  'sha256:v1:e147-rollback-request',
  'chat-request-v1',
  jsonb_build_object(
    'threadId','$thread_id',
    'characterId','seyeon',
    'clientTurnId','seyeon-post-turn-worker-rollback-turn',
    'text','원자성 롤백 테스트예요.',
    'clientCapability','0.0.1-dev'
  ),
  '$release_id','$bundle_id',
  '$rollback_turn_id','$rollback_user_message_id',
  '원자성 롤백 테스트예요.',
  'sha256:v1:e147-rollback-user'
);
select * from public.cmd_allocate_seyeon_chat_attempt_runtime_v1(
  '$subject_id','$rollback_turn_id','$rollback_attempt_id',
  'seyeon-production-chat-planner-v1'
);
select public.cmd_mark_seyeon_chat_context_ready_runtime_v1(
  '$subject_id','$rollback_turn_id','$rollback_attempt_id'
);
select public.cmd_persist_seyeon_chat_generated_runtime_v1(
  '$subject_id','$rollback_turn_id','$rollback_attempt_id','$thread_character_id',
  '$rollback_renderer_log_id',
  'test-provider','test-renderer-model','seyeon-character-runtime-v2',
  '롤백될 답변입니다.',
  jsonb_build_object(
    'schemaVersion','seyeon-dialogue-envelope-v2',
    'utterance','롤백될 답변입니다.'
  ),
  'seyeon-dialogue-envelope-v2',
  'sha256:v1:e147-rollback-answer',
  '[]'::jsonb
);
select public.cmd_persist_seyeon_chat_validated_runtime_v1(
  '$subject_id','$rollback_turn_id','$rollback_attempt_id','$rollback_guard_log_id',
  'test-provider','test-review-model','seyeon-semantic-review-v2',
  'sha256:v1:e147-rollback-answer',
  jsonb_build_object(
    'schemaVersion','seyeon-production-chat-validation-v1',
    'passed',true,
    'generatedContentHash','sha256:v1:e147-rollback-answer'
  ),
  '[]'::jsonb
);
commit;
SQL

expect_fail \
  "post-turn handoff mismatch rolls back Chat commit" \
  "Se-yeon post-turn snapshot does not bind the authoritative user message" \
  "begin; set local role myeongha_api_executor; select pg_catalog.set_config('myeongha.subject_id','$subject_id',true); select * from public.cmd_commit_seyeon_chat_turn_runtime_v2('$subject_id','$thread_id','$rollback_turn_id','$rollback_attempt_id','$rollback_assistant_message_id','$rollback_chat_outbox_id','$rollback_post_turn_outbox_id',jsonb_build_object('schemaVersion','seyeon-post-turn-analysis-snapshot-v1','turnId','$rollback_turn_id','userMessageId','e1470000-0000-4000-8000-000000000099','assistantMessageId','$rollback_assistant_message_id'),'sha256:v1:e147-rollback-snapshot'); rollback;"

rollback_state=$("${psql_base[@]}" -At -F '|' -c "
select
  state,
  committed_attempt_id is null,
  committed_at is null
from public.chat_turns
where id='$rollback_turn_id';
")
[[ "$rollback_state" == "validated|t|t" ]] ||
  fail "failed post-turn handoff did not rollback Chat commit: $rollback_state"

rollback_outbox_count=$("${psql_base[@]}" -At -c "
select count(*)
from public.outbox_events
where id in ('$rollback_chat_outbox_id','$rollback_post_turn_outbox_id');
")
[[ "$rollback_outbox_count" == "0" ]] ||
  fail "failed post-turn handoff leaked an outbox row"
pass "post-turn handoff failure rolls back assistant commit and both outbox writes atomically"

expect_fail   "authenticated direct post-turn checkpoint"   "permission denied"   "begin; set local role authenticated; select * from public.cmd_checkpoint_seyeon_post_turn_analysis_v1('$subject_id','$post_turn_outbox_id','worker-e147',jsonb_build_object('schemaVersion','seyeon-post-turn-analysis-checkpoint-v1','decision','none')); rollback;"

expect_fail   "authenticated direct post-turn claim"   "permission denied"   "begin; set local role authenticated; select * from public.cmd_claim_seyeon_post_turn_analysis_v1('$subject_id','$post_turn_outbox_id','x',clock_timestamp()+interval '1 minute'); rollback;"

expect_fail   "foreign Subject post-turn claim"   "outbox event is not an eligible Se-yeon post-turn analysis request"   "begin; set local role myeongha_api_executor; select pg_catalog.set_config('myeongha.subject_id','e1470000-0000-4000-8000-000000000099',true); select * from public.cmd_claim_seyeon_post_turn_analysis_v1('e1470000-0000-4000-8000-000000000099','$post_turn_outbox_id','x',clock_timestamp()+interval '1 minute'); rollback;"

echo "Se-yeon durable post-turn analysis V1 DB checks passed."
