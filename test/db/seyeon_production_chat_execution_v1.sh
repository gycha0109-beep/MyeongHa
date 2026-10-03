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
  out=$(${"psql_base[@]"} -c "$sql" 2>&1)
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

subject_id="d1460000-0000-4000-8000-000000000001"
bundle_id="d1460000-0000-4000-8000-000000000002"
release_id="d1460000-0000-4000-8000-000000000003"
thread_id="d1460000-0000-4000-8000-000000000004"
thread_character_id="d1460000-0000-4000-8000-000000000005"
turn_id="d1460000-0000-4000-8000-000000000006"
user_message_id="d1460000-0000-4000-8000-000000000007"
attempt_id="d1460000-0000-4000-8000-000000000008"
renderer_log_id="d1460000-0000-4000-8000-000000000009"
guard_log_id="d1460000-0000-4000-8000-000000000010"
assistant_message_id="d1460000-0000-4000-8000-000000000011"
chat_outbox_id="d1460000-0000-4000-8000-000000000012"

"${"psql_base[@]"}" <<SQL
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
  'seyeon-chat-execution-v1',
  'sha256:v1:seyeon-chat-execution-bundle',
  'test://seyeon-chat-execution-v1',
  'content-artifact-v1',
  '0.0.1-dev',
  'sha256:v1:seyeon-chat-execution-assets',
  'cue-v1',
  '{}'::jsonb,
  clock_timestamp()
);

insert into public.content_releases(
  id,release_key,content_bundle_id,status,is_default,
  rollout_policy_version,rollout_seed,activated_at,created_at
) values (
  '$release_id',
  'seyeon-chat-execution-release',
  '$bundle_id',
  'active',false,'test-rollout-v1','seyeon-chat-execution-seed',
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
  'seyeon-production-chat-execution',
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

function_shape=$("${"psql_base[@]"}" -At -F '|' -c "
select
  count(*) filter (where p.prosecdef),
  count(*) filter (where owner.rolname='myeongha_seyeon_chat_runtime_owner'),
  count(*) filter (where has_function_privilege('myeongha_api_executor',p.oid,'EXECUTE')),
  count(*) filter (where has_function_privilege('authenticated',p.oid,'EXECUTE'))
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid=p.pronamespace
join pg_catalog.pg_roles owner on owner.oid=p.proowner
where n.nspname='public'
  and p.proname in (
    'cmd_receive_seyeon_chat_turn_runtime_v1',
    'cmd_allocate_seyeon_chat_attempt_runtime_v1',
    'cmd_mark_seyeon_chat_context_ready_runtime_v1',
    'cmd_persist_seyeon_chat_generated_runtime_v1',
    'cmd_persist_seyeon_chat_validated_runtime_v1',
    'cmd_commit_seyeon_chat_turn_runtime_v1'
  );
")
[[ "$function_shape" == "6|6|6|0" ]] || fail "runtime wrapper ACL/owner mismatch: $function_shape"
pass "all Se-yeon Production Chat wrappers are narrow SECURITY DEFINER API surfaces"

helper_acl=$("${"psql_base[@]"}" -At -c "
select has_function_privilege(
  'myeongha_api_executor',
  'public.assert_seyeon_chat_thread_runtime_v1(uuid,uuid)',
  'EXECUTE'
);
")
[[ "$helper_acl" == "f" ]] || fail "internal Se-yeon thread helper leaked to API executor"
pass "thread authority helper is not an API executor surface"

receive_result=$("${"psql_base[@]"}" -At -F '|' <<SQL
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_id',true);
select
  turn_id,user_message_id,user_text,thread_character_id,
  content_release_id,content_bundle_id,replayed
from public.cmd_receive_seyeon_chat_turn_runtime_v1(
  '$subject_id','$thread_id',
  'seyeon-chat-execution-turn-1',
  'sha256:v1:seyeon-chat-execution-request',
  'chat-request-v1',
  jsonb_build_object(
    'threadId','$thread_id',
    'characterId','seyeon',
    'clientTurnId','seyeon-chat-execution-turn-1',
    'text','오늘 뭐 하고 있었어요?',
    'clientCapability','0.0.1-dev'
  ),
  '$release_id','$bundle_id','$turn_id','$user_message_id',
  '오늘 뭐 하고 있었어요?',
  'sha256:v1:seyeon-chat-execution-user'
);
commit;
SQL
)
[[ "$receive_result" == *"$turn_id|$user_message_id|오늘 뭐 하고 있었어요?|$thread_character_id|$release_id|$bundle_id|f"* ]] ||
  fail "Se-yeon runtime receive mismatch: $receive_result"
pass "receive wrapper persists the exact current user message and pinned binding"

attempt_result=$("${"psql_base[@]"}" -At -F '|' <<SQL
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_id',true);
select attempt_id,attempt_no,replayed
from public.cmd_allocate_seyeon_chat_attempt_runtime_v1(
  '$subject_id','$turn_id','$attempt_id','seyeon-production-chat-planner-v1'
);
commit;
SQL
)
[[ "$attempt_result" == *"$attempt_id|1|f"* ]] ||
  fail "Se-yeon runtime attempt allocation mismatch: $attempt_result"
pass "attempt allocation uses the existing Chat state machine"

context_result=$("${"psql_base[@]"}" -At <<SQL
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_id',true);
select public.cmd_mark_seyeon_chat_context_ready_runtime_v1(
  '$subject_id','$turn_id','$attempt_id'
);
commit;
SQL
)
[[ "$context_result" == *"f"* ]] ||
  fail "Se-yeon context-ready transition mismatch: $context_result"
pass "context-ready transition is persisted before provider execution"

generated_result=$("${"psql_base[@]"}" -At <<SQL
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_id',true);
select public.cmd_persist_seyeon_chat_generated_runtime_v1(
  '$subject_id','$turn_id','$attempt_id','$thread_character_id',
  '$renderer_log_id',
  'test-provider','test-renderer-model','seyeon-character-runtime-v2',
  '저는 오늘 여기저기 좀 돌아다녔어요.',
  jsonb_build_object(
    'schemaVersion','seyeon-dialogue-envelope-v2',
    'utterance','저는 오늘 여기저기 좀 돌아다녔어요.'
  ),
  'seyeon-dialogue-envelope-v2',
  'sha256:v1:seyeon-chat-execution-answer',
  '[]'::jsonb
);
commit;
SQL
)
[[ "$generated_result" == *"f"* ]] ||
  fail "Se-yeon generated persistence mismatch: $generated_result"
pass "renderer provenance and generated payload are staged atomically"

validated_result=$("${"psql_base[@]"}" -At <<SQL
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_id',true);
select public.cmd_persist_seyeon_chat_validated_runtime_v1(
  '$subject_id','$turn_id','$attempt_id','$guard_log_id',
  'test-provider','test-review-model','seyeon-semantic-review-v2',
  'sha256:v1:seyeon-chat-execution-answer',
  jsonb_build_object(
    'schemaVersion','seyeon-production-chat-validation-v1',
    'passed',true,
    'generatedContentHash','sha256:v1:seyeon-chat-execution-answer'
  ),
  '[]'::jsonb
);
commit;
SQL
)
[[ "$validated_result" == *"f"* ]] ||
  fail "Se-yeon validated persistence mismatch: $validated_result"
pass "Output Guard provenance validates the exact staged generation"

commit_result=$("${"psql_base[@]"}" -At -F '|' <<SQL
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_id',true);
select
  turn_id,attempt_id,assistant_message_id,sequence_no,
  committed_at is not null,replayed
from public.cmd_commit_seyeon_chat_turn_runtime_v1(
  '$subject_id','$thread_id','$turn_id','$attempt_id',
  '$assistant_message_id','$chat_outbox_id'
);
commit;
SQL
)
[[ "$commit_result" == *"$turn_id|$attempt_id|$assistant_message_id|2|t|f"* ]] ||
  fail "Se-yeon runtime commit mismatch: $commit_result"
pass "validated Se-yeon answer commits one authoritative assistant message"

message_counts=$("${"psql_base[@]"}" -At -F '|' -c "
select
  count(*) filter (where sender_type='user'),
  count(*) filter (where sender_type='character')
from public.conversation_messages
where turn_id='$turn_id';
")
[[ "$message_counts" == "1|1" ]] ||
  fail "Se-yeon committed message cardinality mismatch: $message_counts"

provenance=$("${"psql_base[@]"}" -At -F '|' -c "
select
  ct.state,
  a.state,
  count(distinct l.stage),
  min(case when l.stage='renderer' then l.output_ref_jsonb->>'generatedContentHash' end),
  min(case when l.stage='output_guard' then l.output_ref_jsonb->>'generatedContentHash' end)
from public.chat_turns ct
join public.chat_turn_attempts a
  on a.id=ct.committed_attempt_id and a.turn_id=ct.id
left join public.ai_execution_logs l
  on l.turn_id=ct.id and l.turn_attempt_id=a.id
where ct.id='$turn_id'
group by ct.state,a.state;
")
[[ "$provenance" == "committed|committed|2|sha256:v1:seyeon-chat-execution-answer|sha256:v1:seyeon-chat-execution-answer" ]] ||
  fail "Se-yeon committed provenance mismatch: $provenance"
pass "one user + one assistant message commit with renderer/output-guard provenance"

receive_replay=$("${"psql_base[@]"}" -At -F '|' <<SQL
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_id',true);
select turn_id,user_message_id,replayed
from public.cmd_receive_seyeon_chat_turn_runtime_v1(
  '$subject_id','$thread_id',
  'seyeon-chat-execution-turn-1',
  'sha256:v1:seyeon-chat-execution-request',
  'chat-request-v1',
  jsonb_build_object(
    'threadId','$thread_id',
    'characterId','seyeon',
    'clientTurnId','seyeon-chat-execution-turn-1',
    'text','오늘 뭐 하고 있었어요?',
    'clientCapability','0.0.1-dev'
  ),
  '$release_id','$bundle_id',
  'd1460000-0000-4000-8000-000000000099',
  'd1460000-0000-4000-8000-000000000098',
  '오늘 뭐 하고 있었어요?',
  'sha256:v1:seyeon-chat-execution-user'
);
commit;
SQL
)
[[ "$receive_replay" == *"$turn_id|$user_message_id|t"* ]] ||
  fail "Se-yeon receive replay mismatch: $receive_replay"

message_counts_after_replay=$("${"psql_base[@]"}" -At -F '|' -c "
select
  count(*) filter (where sender_type='user'),
  count(*) filter (where sender_type='character')
from public.conversation_messages
where turn_id='$turn_id';
")
[[ "$message_counts_after_replay" == "1|1" ]] ||
  fail "Se-yeon receive replay duplicated messages: $message_counts_after_replay"
pass "same clientTurnId receive replay does not duplicate committed messages"

expect_fail   "authenticated direct Se-yeon chat runtime receive"   "permission denied"   "begin; set local role authenticated; select * from public.cmd_receive_seyeon_chat_turn_runtime_v1('$subject_id','$thread_id','x','h','chat-request-v1','{}'::jsonb,'$release_id','$bundle_id',gen_random_uuid(),gen_random_uuid(),'x','h'); rollback;"

expect_fail   "API executor forged content binding"   "Server-prepared Chat content does not match the pinned thread binding"   "begin; set local role myeongha_api_executor; select pg_catalog.set_config('myeongha.subject_id','$subject_id',true); select * from public.cmd_receive_seyeon_chat_turn_runtime_v1('$subject_id','$thread_id','forged-binding','h','chat-request-v1','{}'::jsonb,'d1460000-0000-4000-8000-000000000099','$bundle_id',gen_random_uuid(),gen_random_uuid(),'x','h'); rollback;"

owner_shape=$("${"psql_base[@]"}" -At -F '|' -c "
select
  rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,
  rolinherit,rolreplication,rolbypassrls,
  has_schema_privilege(
    'myeongha_seyeon_chat_runtime_owner','public','CREATE'
  )
from pg_catalog.pg_roles
where rolname='myeongha_seyeon_chat_runtime_owner';
")
[[ "$owner_shape" == "f|f|f|f|f|f|f|f" ]] ||
  fail "Se-yeon chat runtime owner privilege shape mismatch: $owner_shape"
pass "runtime owner remains NOLOGIN/NOBYPASSRLS without schema CREATE"

echo "Se-yeon Production Chat execution V1 DB checks passed."
