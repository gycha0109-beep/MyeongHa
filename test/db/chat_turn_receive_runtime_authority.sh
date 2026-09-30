#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -q -v ON_ERROR_STOP=1)
fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }

query() { "${psql_base[@]}" -Atc "$1"; }

expect_failure_stdin() {
  local expected="$1"
  local tmp
  tmp="$(mktemp)"
  if "${psql_base[@]}" >"$tmp" 2>&1; then
    cat "$tmp" >&2
    rm -f "$tmp"
    fail "expected SQL failure containing: $expected"
  fi
  if ! grep -Fq "$expected" "$tmp"; then
    cat "$tmp" >&2
    rm -f "$tmp"
    fail "SQL failed for an unexpected reason; wanted: $expected"
  fi
  rm -f "$tmp"
}

[[ "$(query "select has_function_privilege('myeongha_api_executor','public.cmd_receive_chat_turn_runtime_v1(uuid,uuid,text,text,text,jsonb,uuid,uuid,uuid,uuid,text,jsonb,text)','EXECUTE')::int;")" == '1' ]] || fail "API executor lacks receive runtime wrapper"
[[ "$(query "select has_function_privilege('myeongha_api_executor','public.cmd_allocate_chat_turn_attempt_runtime_v1(uuid,uuid,uuid,text)','EXECUTE')::int;")" == '1' ]] || fail "API executor lacks attempt runtime wrapper"
[[ "$(query "select has_function_privilege('myeongha_api_executor','public.cmd_mark_chat_turn_context_ready_runtime_v1(uuid,uuid,uuid)','EXECUTE')::int;")" == '1' ]] || fail "API executor lacks context-ready runtime wrapper"
[[ "$(query "select has_function_privilege('myeongha_api_executor','public.cmd_mark_chat_turn_failed_runtime_v1(uuid,uuid,uuid,text,text)','EXECUTE')::int;")" == '1' ]] || fail "API executor lacks failed runtime wrapper"

[[ "$(query "select has_function_privilege('myeongha_api_executor','public.cmd_receive_chat_turn_v1(uuid,uuid,text,text,text,jsonb,uuid,uuid,uuid,uuid,text,jsonb,text)','EXECUTE')::int;")" == '0' ]] || fail "API executor can bypass receive wrapper"
[[ "$(query "select has_function_privilege('myeongha_api_executor','public.cmd_allocate_chat_turn_attempt_v1(uuid,uuid,uuid,text)','EXECUTE')::int;")" == '0' ]] || fail "API executor can bypass attempt wrapper"
[[ "$(query "select has_table_privilege('myeongha_api_executor','public.chat_turns','INSERT')::int;")" == '0' ]] || fail "API executor has direct chat_turn INSERT"
[[ "$(query "select has_table_privilege('myeongha_api_executor','public.chat_turns','UPDATE')::int;")" == '0' ]] || fail "API executor has direct chat_turn UPDATE"
[[ "$(query "select has_table_privilege('myeongha_api_executor','public.chat_turn_attempts','INSERT')::int;")" == '0' ]] || fail "API executor has direct attempt INSERT"
[[ "$(query "select has_table_privilege('myeongha_api_executor','public.conversation_messages','INSERT')::int;")" == '0' ]] || fail "API executor has direct message INSERT"
pass "API executor is wrapper-only for Chat receive lifecycle"

"${psql_base[@]}" <<'SQL' >/dev/null
insert into auth.users(id) values
  ('13080000-0000-0000-0000-000000000001'),
  ('13080000-0000-0000-0000-000000000002')
on conflict do nothing;

insert into public.subjects(id, kind, auth_user_id, status, created_at, updated_at)
values
  ('13081000-0000-0000-0000-000000000001', 'member', '13080000-0000-0000-0000-000000000001', 'active', now(), now()),
  ('13081000-0000-0000-0000-000000000002', 'member', '13080000-0000-0000-0000-000000000002', 'active', now(), now());

insert into public.content_bundles(
  id, content_version, content_hash, artifact_ref, artifact_schema_version,
  min_client_capability, asset_manifest_hash, cue_schema_version,
  manifest_jsonb, published_at
) values (
  '13082000-0000-0000-0000-000000000001',
  'chat-turn-receive-authority-v1',
  'sha256:v1:1308aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'private://chat-turn-receive-authority/v1',
  'content-artifact-v1',
  'client-cap-v1',
  'sha256:v1:1308bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  'cue-v1',
  '{}'::jsonb,
  now()
);

insert into public.content_releases(
  id, release_key, content_bundle_id, status, is_default,
  rollout_policy_version, rollout_seed, activated_at, created_at
) values (
  '13083000-0000-0000-0000-000000000001',
  'chat-turn-receive-authority-release-v1',
  '13082000-0000-0000-0000-000000000001',
  'active', false, 'test-rollout-v1', 'test-seed', now(), now()
);

insert into public.conversation_threads(
  id, subject_id, thread_type, status, title,
  active_content_release_id, active_content_bundle_id,
  content_revision, next_sequence_no, created_at, updated_at
) values (
  '13084000-0000-0000-0000-000000000001',
  '13081000-0000-0000-0000-000000000001',
  'single_character', 'active', 'runtime-authority-test',
  '13083000-0000-0000-0000-000000000001',
  '13082000-0000-0000-0000-000000000001',
  0, 1, now(), now()
);
SQL

receive_result="$("${psql_base[@]}" -At -F '|' <<'SQL' | grep -v '^$' | tail -n1
begin;
set local role myeongha_api_executor;
select subject_id from public.begin_member_subject_context_v1(
  '13080000-0000-0000-0000-000000000001'::uuid
);
select turn_id,message_id,sequence_no,replayed
from public.cmd_receive_chat_turn_runtime_v1(
  '13081000-0000-0000-0000-000000000001'::uuid,
  '13084000-0000-0000-0000-000000000001'::uuid,
  'runtime-turn-1',
  'sha256:v1:runtime-request-1',
  'chat-request-v1',
  '{"threadId":"13084000-0000-0000-0000-000000000001","clientTurnId":"runtime-turn-1","text":"hello","clientCapability":"client-cap-v1"}'::jsonb,
  '13083000-0000-0000-0000-000000000001'::uuid,
  '13082000-0000-0000-0000-000000000001'::uuid,
  '13085000-0000-0000-0000-000000000001'::uuid,
  '13086000-0000-0000-0000-000000000001'::uuid,
  'hello',
  null,
  'sha256:v1:runtime-user-1'
);
commit;
SQL
)"
[[ "$receive_result" == '13085000-0000-0000-0000-000000000001|13086000-0000-0000-0000-000000000001|1|f' ]] || fail "receive runtime wrapper mismatch: $receive_result"
pass "subject-bound receive wrapper persists authoritative user turn"

replay_result="$("${psql_base[@]}" -At -F '|' <<'SQL' | grep -v '^$' | tail -n1
begin;
set local role myeongha_api_executor;
select subject_id from public.begin_member_subject_context_v1(
  '13080000-0000-0000-0000-000000000001'::uuid
);
select turn_id,message_id,sequence_no,replayed
from public.cmd_receive_chat_turn_runtime_v1(
  '13081000-0000-0000-0000-000000000001'::uuid,
  '13084000-0000-0000-0000-000000000001'::uuid,
  'runtime-turn-1',
  'sha256:v1:runtime-request-1',
  'chat-request-v1',
  '{"threadId":"13084000-0000-0000-0000-000000000001","clientTurnId":"runtime-turn-1","text":"hello","clientCapability":"client-cap-v1"}'::jsonb,
  '13083000-0000-0000-0000-000000000001'::uuid,
  '13082000-0000-0000-0000-000000000001'::uuid,
  '13085000-0000-0000-0000-000000000099'::uuid,
  '13086000-0000-0000-0000-000000000099'::uuid,
  'hello',
  null,
  'sha256:v1:runtime-user-1'
);
commit;
SQL
)"
[[ "$replay_result" == '13085000-0000-0000-0000-000000000001|13086000-0000-0000-0000-000000000001|1|t' ]] || fail "receive replay mismatch: $replay_result"
pass "receive wrapper preserves legacy idempotent replay authority"

attempt_result="$("${psql_base[@]}" -At -F '|' <<'SQL' | grep -v '^$' | tail -n1
begin;
set local role myeongha_api_executor;
select subject_id from public.begin_member_subject_context_v1(
  '13080000-0000-0000-0000-000000000001'::uuid
);
select attempt_id,attempt_no,replayed
from public.cmd_allocate_chat_turn_attempt_runtime_v1(
  '13081000-0000-0000-0000-000000000001'::uuid,
  '13085000-0000-0000-0000-000000000001'::uuid,
  '13087000-0000-0000-0000-000000000001'::uuid,
  'planner-v1'
);
select public.cmd_mark_chat_turn_context_ready_runtime_v1(
  '13081000-0000-0000-0000-000000000001'::uuid,
  '13085000-0000-0000-0000-000000000001'::uuid,
  '13087000-0000-0000-0000-000000000001'::uuid
);
commit;
SQL
)"
# Last output row is the context-ready replay marker, so verify state directly.
[[ "$(query "select state||'|'||next_attempt_no from public.chat_turns where id='13085000-0000-0000-0000-000000000001';")" == 'context_ready|2' ]] || fail "turn did not reach context_ready"
[[ "$(query "select state||'|'||attempt_no from public.chat_turn_attempts where id='13087000-0000-0000-0000-000000000001';")" == 'running|1' ]] || fail "attempt allocation shape mismatch"
pass "attempt allocation and context_ready run only through runtime wrappers"

"${psql_base[@]}" <<'SQL' >/dev/null
begin;
set local role myeongha_api_executor;
select subject_id from public.begin_member_subject_context_v1(
  '13080000-0000-0000-0000-000000000001'::uuid
);
select public.cmd_mark_chat_turn_failed_runtime_v1(
  '13081000-0000-0000-0000-000000000001'::uuid,
  '13085000-0000-0000-0000-000000000001'::uuid,
  '13087000-0000-0000-0000-000000000001'::uuid,
  'failed_retryable',
  'SYNTHETIC_TEST_FAILURE'
);
commit;
SQL

[[ "$(query "select state||'|'||error_code from public.chat_turns where id='13085000-0000-0000-0000-000000000001';")" == 'failed_retryable|SYNTHETIC_TEST_FAILURE' ]] || fail "turn failure finalization mismatch"
[[ "$(query "select state||'|'||error_code from public.chat_turn_attempts where id='13087000-0000-0000-0000-000000000001';")" == 'failed_retryable|SYNTHETIC_TEST_FAILURE' ]] || fail "attempt failure finalization mismatch"
pass "failure wrapper finalizes turn and attempt together"

expect_failure_stdin "subject execution context mismatch" <<'SQL'
begin;
set local role myeongha_api_executor;
select subject_id from public.begin_member_subject_context_v1(
  '13080000-0000-0000-0000-000000000002'::uuid
);
select *
from public.cmd_receive_chat_turn_runtime_v1(
  '13081000-0000-0000-0000-000000000001'::uuid,
  '13084000-0000-0000-0000-000000000001'::uuid,
  'cross-subject-turn',
  'sha256:v1:cross-subject',
  'chat-request-v1',
  '{}'::jsonb,
  '13083000-0000-0000-0000-000000000001'::uuid,
  '13082000-0000-0000-0000-000000000001'::uuid,
  '13085000-0000-0000-0000-000000000002'::uuid,
  '13086000-0000-0000-0000-000000000002'::uuid,
  'probe',
  null,
  'sha256:v1:probe'
);
commit;
SQL
pass "runtime wrapper rejects cross-subject execution"

expect_failure_stdin "permission denied" <<'SQL'
begin;
set local role myeongha_api_executor;
select subject_id from public.begin_member_subject_context_v1(
  '13080000-0000-0000-0000-000000000001'::uuid
);
update public.chat_turns
set state = 'committed'
where id = '13085000-0000-0000-0000-000000000001'::uuid;
commit;
SQL
pass "API executor cannot bypass lifecycle command with direct DML"

echo "Chat turn receive runtime authority tests passed"
