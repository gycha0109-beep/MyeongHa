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

"${psql_base[@]}" >/dev/null <<'SQL'
insert into auth.users(id) values
  ('52000000-0000-0000-0000-000000000001'),
  ('52000000-0000-0000-0000-000000000002'),
  ('52000000-0000-0000-0000-000000000003')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('52100000-0000-0000-0000-000000000001','member','52000000-0000-0000-0000-000000000001','active',null,timestamptz '2026-08-22 01:00:00+00',timestamptz '2026-08-22 01:00:00+00'),
  ('52100000-0000-0000-0000-000000000002','member','52000000-0000-0000-0000-000000000002','active',null,timestamptz '2026-08-22 02:00:00+00',timestamptz '2026-08-22 02:00:00+00'),
  ('52100000-0000-0000-0000-000000000003','guest',null,'active',null,timestamptz '2026-08-22 03:00:00+00',timestamptz '2026-08-22 03:00:00+00'),
  ('52100000-0000-0000-0000-000000000004','member','52000000-0000-0000-0000-000000000003','deletion_pending',null,timestamptz '2026-08-22 04:00:00+00',timestamptz '2026-08-22 04:00:00+00');

insert into public.content_bundles(
  id,content_version,content_hash,artifact_ref,artifact_schema_version,min_client_capability,
  asset_manifest_hash,cue_schema_version,manifest_jsonb,published_at,retired_at
) values (
  '52200000-0000-0000-0000-000000000001','chat-stream-fixture-v52',
  'sha256:v1:5200000000000000000000000000000000000000000000000000000000000001',
  'artifact:chat-stream-v52','v1','web-v1',
  'sha256:v1:5200000000000000000000000000000000000000000000000000000000000002',
  'v1','{}'::jsonb,timestamptz '2026-08-22 00:00:00+00',null
);

insert into public.content_releases(
  id,release_key,content_bundle_id,status,is_default,rollout_jsonb,rollout_policy_version,
  rollout_seed,activated_at,retired_at,created_at
) values (
  '52300000-0000-0000-0000-000000000001','chat-stream-release-v52',
  '52200000-0000-0000-0000-000000000001','active',false,null,'v1','fixture-v52',
  timestamptz '2026-08-22 00:05:00+00',null,timestamptz '2026-08-22 00:00:00+00'
);

insert into public.characters(character_id,created_at,retired_at)
values ('char-chat-stream-52',timestamptz '2026-08-22 00:00:00+00',null);

insert into public.character_runtime_catalog(
  character_id,content_bundle_id,availability,enabled,release_at,retire_at,published_at
) values (
  'char-chat-stream-52','52200000-0000-0000-0000-000000000001','available',true,
  null,null,timestamptz '2026-08-22 00:00:00+00'
);

insert into public.conversation_threads(
  id,subject_id,thread_type,status,title,active_content_release_id,active_content_bundle_id,
  content_revision,next_sequence_no,created_at,updated_at,deleted_at
) values
  ('52400000-0000-0000-0000-000000000001','52100000-0000-0000-0000-000000000001','single_character','active','active owner thread','52300000-0000-0000-0000-000000000001','52200000-0000-0000-0000-000000000001',0,1,timestamptz '2026-08-22 05:00:00+00',timestamptz '2026-08-22 05:30:00+00',null),
  ('52400000-0000-0000-0000-000000000002','52100000-0000-0000-0000-000000000001','system','archived','archived owner thread',null,null,0,2,timestamptz '2026-08-22 06:00:00+00',timestamptz '2026-08-22 06:30:00+00',null),
  ('52400000-0000-0000-0000-000000000003','52100000-0000-0000-0000-000000000001','system','deleted','deleted owner thread',null,null,0,2,timestamptz '2026-08-22 07:00:00+00',timestamptz '2026-08-22 07:30:00+00',timestamptz '2026-08-22 07:30:00+00'),
  ('52400000-0000-0000-0000-000000000004','52100000-0000-0000-0000-000000000002','system','active','other owner thread',null,null,0,2,timestamptz '2026-08-22 08:00:00+00',timestamptz '2026-08-22 08:30:00+00',null),
  ('52400000-0000-0000-0000-000000000005','52100000-0000-0000-0000-000000000003','system','active','guest thread',null,null,0,2,timestamptz '2026-08-22 09:00:00+00',timestamptz '2026-08-22 09:30:00+00',null),
  ('52400000-0000-0000-0000-000000000006','52100000-0000-0000-0000-000000000004','system','archived','deletion-pending owner thread',null,null,0,2,timestamptz '2026-08-22 10:00:00+00',timestamptz '2026-08-22 10:30:00+00',null);

insert into public.conversation_thread_characters(
  id,thread_id,character_id,content_bundle_id,role,joined_at,left_at
) values (
  '52500000-0000-0000-0000-000000000001','52400000-0000-0000-0000-000000000001',
  'char-chat-stream-52','52200000-0000-0000-0000-000000000001','primary',
  timestamptz '2026-08-22 05:00:00+00',null
);

-- Build the visible user/character history through the existing authoritative
-- receive -> attempt -> context -> generate -> validate -> commit command path.
-- The stream query is therefore tested against a real committed message shape,
-- not a fixture-only illegal state jump.
select * from public.cmd_receive_chat_turn_v1(
  '52100000-0000-0000-0000-000000000001',
  '52400000-0000-0000-0000-000000000001',
  'chat-stream-turn-v52',
  'sha256:v1:5200000000000000000000000000000000000000000000000000000000000003',
  'v1',
  '{"text":"hello"}'::jsonb,
  '52300000-0000-0000-0000-000000000001',
  '52200000-0000-0000-0000-000000000001',
  '52600000-0000-0000-0000-000000000001',
  '52800000-0000-0000-0000-000000000001',
  'hello',
  null,
  'sha256:v1:5200000000000000000000000000000000000000000000000000000000000011'
);

select * from public.cmd_allocate_chat_turn_attempt_v1(
  '52100000-0000-0000-0000-000000000001',
  '52600000-0000-0000-0000-000000000001',
  '52700000-0000-0000-0000-000000000001',
  'planner-v1'
);

select public.cmd_mark_chat_turn_context_ready_v1(
  '52100000-0000-0000-0000-000000000001',
  '52600000-0000-0000-0000-000000000001',
  '52700000-0000-0000-0000-000000000001'
);

insert into public.ai_execution_logs(
  id,subject_id,turn_id,turn_attempt_id,stage,provider,model,prompt_version,
  content_release_id,content_bundle_id,character_id,input_ref_jsonb,output_ref_jsonb,status,created_at
) values (
  '52a00000-0000-0000-0000-000000000001',
  '52100000-0000-0000-0000-000000000001',
  '52600000-0000-0000-0000-000000000001',
  '52700000-0000-0000-0000-000000000001',
  'renderer','test-provider','test-model','renderer-prompt-v1',
  '52300000-0000-0000-0000-000000000001','52200000-0000-0000-0000-000000000001',
  'char-chat-stream-52',
  '{"source":"chat-stream-test"}'::jsonb,
  '{"generatedContentHash":"sha256:v1:5200000000000000000000000000000000000000000000000000000000000012"}'::jsonb,
  'success',clock_timestamp()
);

select public.cmd_mark_chat_turn_generated_v1(
  '52100000-0000-0000-0000-000000000001',
  '52600000-0000-0000-0000-000000000001',
  '52700000-0000-0000-0000-000000000001',
  '52a00000-0000-0000-0000-000000000001',
  'renderer-v1',
  '52500000-0000-0000-0000-000000000001',
  'answer',
  '{"emotion":"neutral"}'::jsonb,
  'character-message/v1',
  'sha256:v1:5200000000000000000000000000000000000000000000000000000000000012',
  '[]'::jsonb
);

insert into public.ai_execution_logs(
  id,subject_id,turn_id,turn_attempt_id,stage,provider,model,prompt_version,
  content_release_id,content_bundle_id,character_id,input_ref_jsonb,output_ref_jsonb,status,created_at
) values (
  '52b00000-0000-0000-0000-000000000001',
  '52100000-0000-0000-0000-000000000001',
  '52600000-0000-0000-0000-000000000001',
  '52700000-0000-0000-0000-000000000001',
  'output_guard','test-provider','test-guard','guard-prompt-v1',
  '52300000-0000-0000-0000-000000000001','52200000-0000-0000-0000-000000000001',
  'char-chat-stream-52',
  '{"source":"chat-stream-test"}'::jsonb,
  '{"generatedContentHash":"sha256:v1:5200000000000000000000000000000000000000000000000000000000000012"}'::jsonb,
  'success',clock_timestamp()
);

select public.cmd_validate_chat_turn_attempt_v1(
  '52100000-0000-0000-0000-000000000001',
  '52600000-0000-0000-0000-000000000001',
  '52700000-0000-0000-0000-000000000001',
  '52b00000-0000-0000-0000-000000000001',
  'output-guard-v1',
  '{"passed":true}'::jsonb,
  true,
  'failed_final'
);

select * from public.cmd_commit_chat_turn_v1(
  '52100000-0000-0000-0000-000000000001',
  '52400000-0000-0000-0000-000000000001',
  '52600000-0000-0000-0000-000000000001',
  '52700000-0000-0000-0000-000000000001',
  '52800000-0000-0000-0000-000000000002',
  '52900000-0000-0000-0000-000000000001',
  null,
  null,
  null
);

insert into public.conversation_messages(
  id,thread_id,subject_id,turn_id,sequence_no,sender_type,thread_character_id,
  character_content_bundle_id,body_text,message_payload_jsonb,message_schema_version,
  content_hash,created_at,redacted_at,redaction_reason
) values
  ('52800000-0000-0000-0000-000000000003','52400000-0000-0000-0000-000000000001','52100000-0000-0000-0000-000000000001',null,3,'system',null,null,'REDACTED_SECRET_TEXT','{"secret":"REDACTED_SECRET_PAYLOAD"}'::jsonb,'system-message/v1','sha256:v1:5200000000000000000000000000000000000000000000000000000000000013',timestamptz '2026-08-22 05:13:00+00',timestamptz '2026-08-22 05:20:00+00','conversation_delete'),
  ('52800000-0000-0000-0000-000000000004','52400000-0000-0000-0000-000000000002','52100000-0000-0000-0000-000000000001',null,1,'system',null,null,'archived visible',null,null,'sha256:v1:5200000000000000000000000000000000000000000000000000000000000014',timestamptz '2026-08-22 06:10:00+00',null,null),
  ('52800000-0000-0000-0000-000000000005','52400000-0000-0000-0000-000000000003','52100000-0000-0000-0000-000000000001',null,1,'system',null,null,'deleted thread secret',null,null,'sha256:v1:5200000000000000000000000000000000000000000000000000000000000015',timestamptz '2026-08-22 07:10:00+00',null,null),
  ('52800000-0000-0000-0000-000000000006','52400000-0000-0000-0000-000000000004','52100000-0000-0000-0000-000000000002',null,1,'system',null,null,'other owner secret',null,null,'sha256:v1:5200000000000000000000000000000000000000000000000000000000000016',timestamptz '2026-08-22 08:10:00+00',null,null),
  ('52800000-0000-0000-0000-000000000007','52400000-0000-0000-0000-000000000005','52100000-0000-0000-0000-000000000003',null,1,'system',null,null,'guest visible',null,null,'sha256:v1:5200000000000000000000000000000000000000000000000000000000000017',timestamptz '2026-08-22 09:10:00+00',null,null),
  ('52800000-0000-0000-0000-000000000008','52400000-0000-0000-0000-000000000006','52100000-0000-0000-0000-000000000004',null,1,'system',null,null,'deletion-pending history',null,null,'sha256:v1:5200000000000000000000000000000000000000000000000000000000000018',timestamptz '2026-08-22 10:10:00+00',null,null);

update public.conversation_threads
set next_sequence_no=4
where id='52400000-0000-0000-0000-000000000001';
SQL

lifecycle_shape=$("${psql_base[@]}" -At -F '|' -c "select
  (select state from public.chat_turns where id='52600000-0000-0000-0000-000000000001'),
  (select state from public.chat_turn_attempts where id='52700000-0000-0000-0000-000000000001'),
  (select committed_message_id::text from public.chat_turn_attempts where id='52700000-0000-0000-0000-000000000001');")
[[ "$lifecycle_shape" == 'committed|committed|52800000-0000-0000-0000-000000000002' ]] || fail "authoritative chat fixture did not reach committed state: $lifecycle_shape"
pass "chat stream fixture uses committed chat command lifecycle"

before_state=$("${psql_base[@]}" -At -F '|' -c "select
  (select status||'|'||next_sequence_no::text||'|'||updated_at::text from public.conversation_threads where id='52400000-0000-0000-0000-000000000001'),
  (select count(*)::text||'|'||count(*) filter (where redacted_at is not null)::text from public.conversation_messages where thread_id='52400000-0000-0000-0000-000000000001');")

stream=$("${psql_base[@]}" -At -F '|' -c "select
  message_id,sequence_no,sender_type,coalesce(character_id,'<null>'),coalesce(body_text,'<null>'),
  coalesce(message_payload_jsonb::text,'<null>'),coalesce(message_schema_version,'<null>'),redacted
from public.qry_chat_thread_stream_v1(
  '52100000-0000-0000-0000-000000000001',
  '52400000-0000-0000-0000-000000000001',0
);")
expected_stream=$'52800000-0000-0000-0000-000000000001|1|user|<null>|hello|<null>|<null>|f\n52800000-0000-0000-0000-000000000002|2|character|char-chat-stream-52|answer|{"emotion": "neutral"}|character-message/v1|f\n52800000-0000-0000-0000-000000000003|3|system|<null>|<null>|<null>|system-message/v1|t'
[[ "$stream" == "$expected_stream" ]] || fail "chat stream projection mismatch: $stream"
pass "active owner stream preserves sequence order and stable character identity"

[[ "$stream" != *'REDACTED_SECRET_TEXT'* ]] || fail "redacted body leaked from chat stream"
[[ "$stream" != *'REDACTED_SECRET_PAYLOAD'* ]] || fail "redacted payload leaked from chat stream"
pass "redacted tombstone remains in sequence while body and payload are force-masked"

cursor_stream=$("${psql_base[@]}" -At -F '|' -c "select sequence_no,sender_type,redacted from public.qry_chat_thread_stream_v1(
  '52100000-0000-0000-0000-000000000001','52400000-0000-0000-0000-000000000001',1
);")
expected_cursor=$'2|character|f\n3|system|t'
[[ "$cursor_stream" == "$expected_cursor" ]] || fail "sequence cursor mismatch: $cursor_stream"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_chat_thread_stream_v1('52100000-0000-0000-0000-000000000001','52400000-0000-0000-0000-000000000001',3);")" == '0' ]] || fail "terminal sequence cursor should return zero rows"
pass "sequence_no cursor returns only later messages without offset semantics"

archived=$("${psql_base[@]}" -At -F '|' -c "select sequence_no,body_text from public.qry_chat_thread_stream_v1(
  '52100000-0000-0000-0000-000000000001','52400000-0000-0000-0000-000000000002',0
);")
[[ "$archived" == '1|archived visible' ]] || fail "archived owner thread read mismatch: $archived"
pass "archived owner thread remains readable history"

guest=$("${psql_base[@]}" -At -F '|' -c "select sequence_no,body_text from public.qry_chat_thread_stream_v1(
  '52100000-0000-0000-0000-000000000003','52400000-0000-0000-0000-000000000005',0
);")
[[ "$guest" == '1|guest visible' ]] || fail "active guest thread read mismatch: $guest"
pass "active canonical guest can read its own chat stream"

projection_json=$("${psql_base[@]}" -Atc "select row_to_json(q)::text from public.qry_chat_thread_stream_v1(
  '52100000-0000-0000-0000-000000000001','52400000-0000-0000-0000-000000000001',0
) q where sequence_no=2;")
for required in message_id sequence_no sender_type character_id body_text message_payload_jsonb message_schema_version created_at redacted redacted_at; do
  [[ "$projection_json" == *"\"$required\""* ]] || fail "chat stream projection omitted $required: $projection_json"
done
for forbidden in subject_id turn_id thread_id thread_character_id character_content_bundle_id content_hash redaction_reason; do
  [[ "$projection_json" != *"\"$forbidden\""* ]] || fail "chat stream projection leaked internal field $forbidden: $projection_json"
done
pass "chat stream DTO projection omits ownership, attempt, internal participation, hash and redaction-reason provenance"

expect_fail "deleted thread is unavailable" "chat thread is unavailable for this subject" \
  "select * from public.qry_chat_thread_stream_v1('52100000-0000-0000-0000-000000000001','52400000-0000-0000-0000-000000000003',0);"
expect_fail "cross-subject thread probe is unavailable" "chat thread is unavailable for this subject" \
  "select * from public.qry_chat_thread_stream_v1('52100000-0000-0000-0000-000000000001','52400000-0000-0000-0000-000000000004',0);"
expect_fail "unknown thread is unavailable" "chat thread is unavailable for this subject" \
  "select * from public.qry_chat_thread_stream_v1('52100000-0000-0000-0000-000000000001','52400000-0000-0000-0000-000000000099',0);"
expect_fail "deletion-pending subject generic current stream is denied" "chat stream read requires an active canonical subject" \
  "select * from public.qry_chat_thread_stream_v1('52100000-0000-0000-0000-000000000004','52400000-0000-0000-0000-000000000006',0);"
expect_fail "chat stream subject is required" "chat stream subject is required" \
  "select * from public.qry_chat_thread_stream_v1(null,'52400000-0000-0000-0000-000000000001',0);"
expect_fail "chat stream thread is required" "chat stream thread is required" \
  "select * from public.qry_chat_thread_stream_v1('52100000-0000-0000-0000-000000000001',null,0);"
expect_fail "negative cursor is invalid" "chat stream cursor must be a non-negative sequence number" \
  "select * from public.qry_chat_thread_stream_v1('52100000-0000-0000-0000-000000000001','52400000-0000-0000-0000-000000000001',-1);"
expect_fail "null cursor is invalid" "chat stream cursor must be a non-negative sequence number" \
  "select * from public.qry_chat_thread_stream_v1('52100000-0000-0000-0000-000000000001','52400000-0000-0000-0000-000000000001',null);"

after_state=$("${psql_base[@]}" -At -F '|' -c "select
  (select status||'|'||next_sequence_no::text||'|'||updated_at::text from public.conversation_threads where id='52400000-0000-0000-0000-000000000001'),
  (select count(*)::text||'|'||count(*) filter (where redacted_at is not null)::text from public.conversation_messages where thread_id='52400000-0000-0000-0000-000000000001');")
[[ "$before_state" == "$after_state" ]] || fail "chat stream read mutated thread/message authority"
pass "chat thread stream query is read-only"

public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.qry_chat_thread_stream_v1(uuid,uuid,bigint)','EXECUTE') then '1' else '0' end;")
[[ "$public_exec" == '0' ]] || fail "chat thread stream query unexpectedly executable by PUBLIC"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == '60' ]] || fail "public table catalog changed"
pass "chat stream read remains API-mediated and public table catalog remains 60"

echo "chat thread stream query tests passed"
