#!/usr/bin/env bash
set -euo pipefail

fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }
query() { psql -X -q -v ON_ERROR_STOP=1 -Atc "$1"; }

test "$(query "select has_function_privilege('myeongha_api_executor','public.cmd_stage_chat_turn_generated_runtime_v1(uuid,uuid,uuid,uuid,text,text,text,text,text,jsonb,text,text,jsonb)','EXECUTE')::int;")" = 1 || fail "missing generation wrapper"
test "$(query "select has_function_privilege('myeongha_api_executor','public.cmd_validate_chat_turn_generated_runtime_v1(uuid,uuid,uuid,uuid,text,jsonb,boolean,text)','EXECUTE')::int;")" = 1 || fail "missing validation wrapper"
test "$(query "select has_function_privilege('myeongha_api_executor','public.cmd_commit_chat_turn_no_effects_runtime_v1(uuid,uuid,uuid,uuid,uuid,uuid)','EXECUTE')::int;")" = 1 || fail "missing commit wrapper"
test "$(query "select has_function_privilege('myeongha_api_executor','public.cmd_mark_chat_turn_generated_v1(uuid,uuid,uuid,uuid,text,uuid,text,jsonb,text,text,jsonb)','EXECUTE')::int;")" = 0 || fail "legacy generation bypass available"
test "$(query "select has_table_privilege('myeongha_api_executor','public.ai_execution_logs','INSERT')::int;")" = 0 || fail "direct AI log insert available"
test "$(query "select has_table_privilege('myeongha_api_executor','public.outbox_events','INSERT')::int;")" = 0 || fail "direct outbox insert available"
pass "API executor is wrapper-only for generation / validation / commit"

psql -X -q -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
insert into auth.users(id) values ('13090000-0000-0000-0000-000000000001') on conflict do nothing;
insert into public.subjects(id,kind,auth_user_id,status,created_at,updated_at) values
('13091000-0000-0000-0000-000000000001','member','13090000-0000-0000-0000-000000000001','active',now(),now());

insert into public.content_bundles(
 id,content_version,content_hash,artifact_ref,artifact_schema_version,
 min_client_capability,asset_manifest_hash,cue_schema_version,manifest_jsonb,published_at
) values (
 '13092000-0000-0000-0000-000000000001','chat-turn-generation-authority-v1',
 'sha256:v1:1309aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
 'private://chat-turn-generation-authority/v1','character-artifact-v1','client-cap-v1',
 'sha256:v1:1309bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
 'cue-v1','{}'::jsonb,now()
);
insert into public.content_releases(
 id,release_key,content_bundle_id,status,is_default,rollout_policy_version,rollout_seed,activated_at,created_at
) values (
 '13093000-0000-0000-0000-000000000001','chat-turn-generation-authority-release-v1',
 '13092000-0000-0000-0000-000000000001','active',false,'test-rollout-v1','test-seed',now(),now()
);
insert into public.characters(character_id,created_at) values ('chat-generation-char',now());
insert into public.character_runtime_catalog(character_id,content_bundle_id,availability,enabled,published_at) values
('chat-generation-char','13092000-0000-0000-0000-000000000001','available',true,now());
insert into public.conversation_threads(
 id,subject_id,thread_type,status,title,active_content_release_id,active_content_bundle_id,
 content_revision,next_sequence_no,created_at,updated_at
) values (
 '13094000-0000-0000-0000-000000000001','13091000-0000-0000-0000-000000000001',
 'single_character','active','generation-authority-test',
 '13093000-0000-0000-0000-000000000001','13092000-0000-0000-0000-000000000001',
 0,1,now(),now()
);
insert into public.conversation_thread_characters(
 id,thread_id,character_id,content_bundle_id,role,joined_at
) values (
 '13094100-0000-0000-0000-000000000001','13094000-0000-0000-0000-000000000001',
 'chat-generation-char','13092000-0000-0000-0000-000000000001','primary',now()
);
SQL

psql -X -q -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
begin;
set local role myeongha_api_executor;
select subject_id from public.begin_member_subject_context_v1('13090000-0000-0000-0000-000000000001'::uuid);
select * from public.cmd_receive_chat_turn_runtime_v1(
 '13091000-0000-0000-0000-000000000001'::uuid,
 '13094000-0000-0000-0000-000000000001'::uuid,
 'generation-turn-1','sha256:v1:generation-request-1','chat-request-v1',
 '{"threadId":"13094000-0000-0000-0000-000000000001","clientTurnId":"generation-turn-1","text":"hello","clientCapability":"client-cap-v1"}'::jsonb,
 '13093000-0000-0000-0000-000000000001'::uuid,
 '13092000-0000-0000-0000-000000000001'::uuid,
 '13095000-0000-0000-0000-000000000001'::uuid,
 '13096000-0000-0000-0000-000000000001'::uuid,
 'hello',null,'sha256:v1:generation-user-1'
);
select * from public.cmd_allocate_chat_turn_attempt_runtime_v1(
 '13091000-0000-0000-0000-000000000001'::uuid,
 '13095000-0000-0000-0000-000000000001'::uuid,
 '13097000-0000-0000-0000-000000000001'::uuid,'planner-v1'
);
select public.cmd_mark_chat_turn_context_ready_runtime_v1(
 '13091000-0000-0000-0000-000000000001'::uuid,
 '13095000-0000-0000-0000-000000000001'::uuid,
 '13097000-0000-0000-0000-000000000001'::uuid
);
commit;
SQL

psql -X -q -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
begin;
set local role myeongha_api_executor;
select subject_id from public.begin_member_subject_context_v1('13090000-0000-0000-0000-000000000001'::uuid);
select public.cmd_stage_chat_turn_generated_runtime_v1(
 '13091000-0000-0000-0000-000000000001'::uuid,
 '13095000-0000-0000-0000-000000000001'::uuid,
 '13097000-0000-0000-0000-000000000001'::uuid,
 '13098000-0000-0000-0000-000000000001'::uuid,
 'test-provider','test-model','renderer-prompt-v1','renderer-v1',
 '검증된 답변입니다.',
 '{"schemaVersion":"v1","framingBefore":"검증된 답변입니다.","protectedSajuSegments":[],"protectedSajuDisclosures":[],"calculationAmbiguity":[],"framingAfter":null,"emotion":"neutral","animationCue":null,"memoryProposals":[],"relationshipEventProposals":[],"suggestedActions":[]}'::jsonb,
 'character-dialogue-v1','sha256:v1:validated-answer','[]'::jsonb
);
commit;
SQL

generated_shape="$(query "select t.state||'|'||a.state||'|'||a.generated_thread_character_id::text||'|'||l.provider||'|'||l.model||'|'||(select count(*) from public.conversation_messages m where m.turn_id=t.id and m.sender_type='character') from public.chat_turns t join public.chat_turn_attempts a on a.turn_id=t.id join public.ai_execution_logs l on l.id=a.generation_ai_execution_log_id where t.id='13095000-0000-0000-0000-000000000001'::uuid and a.id='13097000-0000-0000-0000-000000000001'::uuid;")"
test "$generated_shape" = 'generated|generated|13094100-0000-0000-0000-000000000001|test-provider|test-model|0' || fail "generated shape: $generated_shape"
pass "generation resolves primary participant and stages no public message"

psql -X -q -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
begin;
set local role myeongha_api_executor;
select subject_id from public.begin_member_subject_context_v1('13090000-0000-0000-0000-000000000001'::uuid);
select public.cmd_validate_chat_turn_generated_runtime_v1(
 '13091000-0000-0000-0000-000000000001'::uuid,
 '13095000-0000-0000-0000-000000000001'::uuid,
 '13097000-0000-0000-0000-000000000001'::uuid,
 '13098100-0000-0000-0000-000000000001'::uuid,
 'myeongha-character-output-guard-v1',
 '{"schemaVersion":"v1","passed":true,"generatedContentHash":"sha256:v1:validated-answer"}'::jsonb,
 true,'failed_final'
);
commit;
SQL

validated_shape="$(query "select t.state||'|'||a.state||'|'||g.stage||'|'||g.provider||'|'||g.model||'|'||g.status||'|'||(select count(*) from public.conversation_messages m where m.turn_id=t.id and m.sender_type='character') from public.chat_turns t join public.chat_turn_attempts a on a.turn_id=t.id join public.ai_execution_logs g on g.id=a.validation_ai_execution_log_id where t.id='13095000-0000-0000-0000-000000000001'::uuid and a.id='13097000-0000-0000-0000-000000000001'::uuid;")"
test "$validated_shape" = 'validated|validated|output_guard|myeongha-server|deterministic-output-guard-v1|success|0' || fail "validated shape: $validated_shape"
pass "validation records deterministic Output Guard provenance"

commit_result="$(psql -X -q -v ON_ERROR_STOP=1 -At -F '|' <<'SQL' | grep -v '^$' | tail -n1
begin;
set local role myeongha_api_executor;
select subject_id from public.begin_member_subject_context_v1('13090000-0000-0000-0000-000000000001'::uuid);
select turn_id,attempt_id,message_id,sequence_no,replayed
from public.cmd_commit_chat_turn_no_effects_runtime_v1(
 '13091000-0000-0000-0000-000000000001'::uuid,
 '13094000-0000-0000-0000-000000000001'::uuid,
 '13095000-0000-0000-0000-000000000001'::uuid,
 '13097000-0000-0000-0000-000000000001'::uuid,
 '13099000-0000-0000-0000-000000000001'::uuid,
 '13099100-0000-0000-0000-000000000001'::uuid
);
commit;
SQL
)"
test "$commit_result" = '13095000-0000-0000-0000-000000000001|13097000-0000-0000-0000-000000000001|13099000-0000-0000-0000-000000000001|2|f' || fail "commit result: $commit_result"

commit_shape="$(query "select t.state||'|'||a.state||'|'||(select count(*) from public.conversation_messages m where m.turn_id=t.id and m.sender_type='character')||'|'||(select count(*) from public.relationship_events e where e.source_turn_id=t.id)||'|'||(select count(*) from public.world_events e where e.source_turn_id=t.id)||'|'||(select count(*) from public.memory_items m where m.source_turn_id=t.id)||'|'||(select count(*) from public.outbox_events o where o.aggregate_type='chat_turn' and o.aggregate_id=t.id::text) from public.chat_turns t join public.chat_turn_attempts a on a.turn_id=t.id where t.id='13095000-0000-0000-0000-000000000001'::uuid and a.id='13097000-0000-0000-0000-000000000001'::uuid;")"
test "$commit_shape" = 'committed|committed|1|0|0|0|1' || fail "side-effect shape: $commit_shape"
pass "no-effects commit publishes message/outbox without relationship/world/memory mutation"

message_shape="$(query "select body_text||'|'||message_schema_version||'|'||(message_payload_jsonb->>'framingBefore')||'|'||content_hash from public.conversation_messages where id='13099000-0000-0000-0000-000000000001'::uuid;")"
test "$message_shape" = '검증된 답변입니다.|character-dialogue-v1|검증된 답변입니다.|sha256:v1:validated-answer' || fail "message mismatch: $message_shape"
pass "committed message equals staged validated envelope"

set +e
bypass_output="$(psql -X -v ON_ERROR_STOP=1 <<'SQL' 2>&1
begin;
set local role myeongha_api_executor;
select subject_id from public.begin_member_subject_context_v1('13090000-0000-0000-0000-000000000001'::uuid);
insert into public.ai_execution_logs(
 id,subject_id,stage,provider,model,prompt_version,status,created_at
) values (
 '13098200-0000-0000-0000-000000000001'::uuid,
 '13091000-0000-0000-0000-000000000001'::uuid,
 'renderer','bypass','bypass','bypass','success',now()
);
commit;
SQL
)"
bypass_status=$?
set -e
test "$bypass_status" -ne 0 || fail "direct AI log insert unexpectedly succeeded"
echo "$bypass_output" | grep -Fq "permission denied" || fail "direct AI log insert failed for unexpected reason"
pass "API executor cannot bypass generation wrapper"

echo "Chat turn generation runtime authority tests passed"
