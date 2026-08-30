#!/usr/bin/env bash
set -euo pipefail

PSQL=(psql -X -v ON_ERROR_STOP=1 --set=VERBOSITY=verbose)

expect_failure() {
  local label="$1"
  local expected="$2"
  local sql="$3"
  local output
  local status

  set +e
  output="$("${PSQL[@]}" -c "${sql}" 2>&1)"
  status=$?
  set -e

  if [[ ${status} -eq 0 ]]; then
    echo "FAIL ${label}: statement unexpectedly succeeded" >&2
    exit 10
  fi
  if [[ "${output}" != *"${expected}"* ]]; then
    echo "FAIL ${label}: expected ${expected}" >&2
    echo "${output}" >&2
    exit 11
  fi
  echo "PASS ${label} -> ${expected}"
}

receive_turn() {
  local turn_id="$1"
  local user_message_id="$2"
  local client_turn_id="$3"

  "${PSQL[@]}" -q -c "select * from public.cmd_receive_chat_turn_v1(
    'b0000000-0000-0000-0000-000000000001',
    'b3000000-0000-0000-0000-000000000001',
    '${client_turn_id}',
    'sha256:v1:${client_turn_id}-request',
    'chat-request-v1',
    jsonb_build_object('clientTurnId','${client_turn_id}','text','question-${client_turn_id}','clientCapability','0.0.1-dev'),
    'b2000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000001',
    '${turn_id}',
    '${user_message_id}',
    'question-${client_turn_id}',
    null,
    'sha256:v1:${client_turn_id}-user'
  );" >/dev/null
}

make_failed_retryable() {
  local turn_id="$1"
  local user_message_id="$2"
  local attempt_id="$3"
  local client_turn_id="$4"

  receive_turn "${turn_id}" "${user_message_id}" "${client_turn_id}"

  "${PSQL[@]}" -q <<SQL >/dev/null
select * from public.cmd_allocate_chat_turn_attempt_v1(
  'b0000000-0000-0000-0000-000000000001',
  '${turn_id}',
  '${attempt_id}',
  'planner-v1'
);
select public.cmd_mark_chat_turn_failed_v1(
  'b0000000-0000-0000-0000-000000000001',
  '${turn_id}',
  '${attempt_id}',
  'failed_retryable',
  'TRANSIENT_TEST'
);
SQL
}

make_committed_turn() {
  local turn_id="$1"
  local user_message_id="$2"
  local attempt_id="$3"
  local renderer_log_id="$4"
  local guard_log_id="$5"
  local assistant_message_id="$6"
  local outbox_id="$7"
  local client_turn_id="$8"

  receive_turn "${turn_id}" "${user_message_id}" "${client_turn_id}"

  "${PSQL[@]}" -q <<SQL >/dev/null
select * from public.cmd_allocate_chat_turn_attempt_v1(
  'b0000000-0000-0000-0000-000000000001',
  '${turn_id}',
  '${attempt_id}',
  'planner-v1'
);
select public.cmd_mark_chat_turn_context_ready_v1(
  'b0000000-0000-0000-0000-000000000001',
  '${turn_id}',
  '${attempt_id}'
);
insert into public.ai_execution_logs(
  id, subject_id, turn_id, turn_attempt_id, stage, provider, model,
  prompt_version, content_release_id, content_bundle_id, character_id,
  input_ref_jsonb, output_ref_jsonb, status, created_at
) values (
  '${renderer_log_id}',
  'b0000000-0000-0000-0000-000000000001',
  '${turn_id}',
  '${attempt_id}',
  'renderer', 'test-provider', 'test-model', 'renderer-prompt-v1',
  'b2000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000001',
  'chat-retry-char',
  jsonb_build_object('turnId','${turn_id}'),
  jsonb_build_object('generatedContentHash','sha256:v1:${client_turn_id}-answer'),
  'success', now()
);
select public.cmd_mark_chat_turn_generated_v1(
  'b0000000-0000-0000-0000-000000000001',
  '${turn_id}',
  '${attempt_id}',
  '${renderer_log_id}',
  'renderer-v1',
  'b3100000-0000-0000-0000-000000000001',
  'answer-${client_turn_id}',
  null,
  'character-dialogue-v1',
  'sha256:v1:${client_turn_id}-answer',
  '[]'::jsonb
);
insert into public.ai_execution_logs(
  id, subject_id, turn_id, turn_attempt_id, stage, provider, model,
  prompt_version, content_release_id, content_bundle_id, character_id,
  input_ref_jsonb, output_ref_jsonb, status, created_at
) values (
  '${guard_log_id}',
  'b0000000-0000-0000-0000-000000000001',
  '${turn_id}',
  '${attempt_id}',
  'output_guard', 'test-provider', 'test-guard', 'guard-prompt-v1',
  'b2000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000001',
  'chat-retry-char',
  jsonb_build_object('turnId','${turn_id}'),
  jsonb_build_object('generatedContentHash','sha256:v1:${client_turn_id}-answer'),
  'success', now()
);
select public.cmd_validate_chat_turn_attempt_v1(
  'b0000000-0000-0000-0000-000000000001',
  '${turn_id}',
  '${attempt_id}',
  '${guard_log_id}',
  'output-guard-v1',
  jsonb_build_object('passed',true,'errorCode',null),
  true,
  'failed_final'
);
select * from public.cmd_commit_chat_turn_v1(
  'b0000000-0000-0000-0000-000000000001',
  'b3000000-0000-0000-0000-000000000001',
  '${turn_id}',
  '${attempt_id}',
  '${assistant_message_id}',
  '${outbox_id}',
  null,
  null,
  null
);
SQL
}

"${PSQL[@]}" <<'SQL'
insert into auth.users(id)
values ('00000000-0000-0000-0000-00000000b001')
on conflict do nothing;

insert into public.subjects(id, kind, auth_user_id, status, created_at, updated_at)
values (
  'b0000000-0000-0000-0000-000000000001',
  'member',
  '00000000-0000-0000-0000-00000000b001',
  'active', now(), now()
);

insert into public.content_bundles(
  id, content_version, content_hash, artifact_ref, artifact_schema_version,
  min_client_capability, asset_manifest_hash, cue_schema_version,
  manifest_jsonb, published_at
) values (
  'b1000000-0000-0000-0000-000000000001',
  'chat-retry-abandon-v1',
  'sha256:v1:chat-retry-abandon-bundle',
  'test://chat-retry-abandon-v1',
  'content-artifact-v1',
  '0.0.1-dev',
  'sha256:v1:chat-retry-abandon-assets',
  'cue-v1',
  '{}'::jsonb,
  now()
);

insert into public.content_releases(
  id, release_key, content_bundle_id, status, is_default,
  rollout_policy_version, rollout_seed, activated_at, created_at
) values (
  'b2000000-0000-0000-0000-000000000001',
  'chat-retry-abandon-release',
  'b1000000-0000-0000-0000-000000000001',
  'active', false, 'test-rollout-v1', 'retry-abandon-seed', now(), now()
);

insert into public.characters(character_id, created_at)
values ('chat-retry-char', now());

insert into public.character_runtime_catalog(
  character_id, content_bundle_id, availability, enabled, published_at
) values (
  'chat-retry-char',
  'b1000000-0000-0000-0000-000000000001',
  'available', true, now()
);

insert into public.conversation_threads(
  id, subject_id, thread_type, status, title,
  active_content_release_id, active_content_bundle_id,
  content_revision, next_sequence_no, created_at, updated_at
) values (
  'b3000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'single_character', 'active', 'retry-abandon-test',
  'b2000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000001',
  0, 1, now(), now()
);

insert into public.conversation_thread_characters(
  id, thread_id, character_id, content_bundle_id, role, joined_at
) values (
  'b3100000-0000-0000-0000-000000000001',
  'b3000000-0000-0000-0000-000000000001',
  'chat-retry-char',
  'b1000000-0000-0000-0000-000000000001',
  'primary', now() - interval '1 minute'
);
SQL

# 1. A never-started RECEIVED turn can be abandoned atomically.
receive_turn \
  'b4000000-0000-0000-0000-000000000001' \
  'b5000000-0000-0000-0000-000000000001' \
  'abandon-received'

abandon_first="$("${PSQL[@]}" -At -c "select public.cmd_abandon_chat_turn_v1(
  'b0000000-0000-0000-0000-000000000001',
  'b4000000-0000-0000-0000-000000000001');")"
if [[ "${abandon_first}" != 'f' ]]; then
  echo "FAIL first abandon must report replayed=false: ${abandon_first}" >&2
  exit 20
fi
shape="$("${PSQL[@]}" -At -F '|' -c "select state,revision,next_attempt_no,
  (select count(*) from public.chat_turn_attempts a where a.turn_id=t.id),
  (select count(*) from public.conversation_messages m where m.turn_id=t.id and m.sender_type='user')
from public.chat_turns t where id='b4000000-0000-0000-0000-000000000001';")"
if [[ "${shape}" != 'abandoned|1|1|0|1' ]]; then
  echo "FAIL received abandon shape: ${shape}" >&2
  exit 21
fi
echo "PASS RECEIVED turn abandons without fabricating attempt/message side effects"

abandon_replay="$("${PSQL[@]}" -At -c "select public.cmd_abandon_chat_turn_v1(
  'b0000000-0000-0000-0000-000000000001',
  'b4000000-0000-0000-0000-000000000001');")"
revision_after_replay="$("${PSQL[@]}" -At -c "select revision from public.chat_turns where id='b4000000-0000-0000-0000-000000000001';")"
if [[ "${abandon_replay}|${revision_after_replay}" != 't|1' ]]; then
  echo "FAIL abandon network replay mutated state: ${abandon_replay}|${revision_after_replay}" >&2
  exit 22
fi
echo "PASS abandon retry replays authoritative ABANDONED state without revision drift"

# 2. FAILED_RETRYABLE can be abandoned while terminal attempt provenance remains intact.
make_failed_retryable \
  'b4000000-0000-0000-0000-000000000002' \
  'b5000000-0000-0000-0000-000000000002' \
  'b6000000-0000-0000-0000-000000000002' \
  'abandon-retryable'

"${PSQL[@]}" -q -c "select public.cmd_abandon_chat_turn_v1(
  'b0000000-0000-0000-0000-000000000001',
  'b4000000-0000-0000-0000-000000000002');" >/dev/null
shape="$("${PSQL[@]}" -At -F '|' -c "select
  (select state from public.chat_turns where id='b4000000-0000-0000-0000-000000000002'),
  (select state from public.chat_turn_attempts where id='b6000000-0000-0000-0000-000000000002'),
  (select error_code from public.chat_turn_attempts where id='b6000000-0000-0000-0000-000000000002'),
  (select next_attempt_no from public.chat_turns where id='b4000000-0000-0000-0000-000000000002');")"
if [[ "${shape}" != 'abandoned|failed_retryable|TRANSIENT_TEST|2' ]]; then
  echo "FAIL retryable abandon mutated attempt provenance: ${shape}" >&2
  exit 23
fi
echo "PASS FAILED_RETRYABLE abandon preserves terminal attempt provenance"

# 3. A RUNNING attempt must not be orphaned by abandon.
receive_turn \
  'b4000000-0000-0000-0000-000000000003' \
  'b5000000-0000-0000-0000-000000000003' \
  'abandon-running-denied'
"${PSQL[@]}" -q -c "select * from public.cmd_allocate_chat_turn_attempt_v1(
  'b0000000-0000-0000-0000-000000000001',
  'b4000000-0000-0000-0000-000000000003',
  'b6000000-0000-0000-0000-000000000003',
  'planner-v1');" >/dev/null
expect_failure \
  'nonterminal attempt cannot be abandoned' \
  'cmd_chat_abandon_attempt_in_flight' \
  "select public.cmd_abandon_chat_turn_v1('b0000000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000003');"
"${PSQL[@]}" -q -c "select public.cmd_mark_chat_turn_failed_v1(
  'b0000000-0000-0000-0000-000000000001',
  'b4000000-0000-0000-0000-000000000003',
  'b6000000-0000-0000-0000-000000000003',
  'failed_final','TEST_CLEANUP');" >/dev/null

# 4. COMMITTED is terminal for abandon.
make_committed_turn \
  'b4000000-0000-0000-0000-000000000004' \
  'b5000000-0000-0000-0000-000000000004' \
  'b6000000-0000-0000-0000-000000000004' \
  'b7000000-0000-0000-0000-000000000041' \
  'b7000000-0000-0000-0000-000000000042' \
  'b8000000-0000-0000-0000-000000000004' \
  'b9000000-0000-0000-0000-000000000004' \
  'abandon-committed-denied'
expect_failure \
  'committed turn cannot be abandoned' \
  'cmd_chat_abandon_turn_terminal' \
  "select public.cmd_abandon_chat_turn_v1('b0000000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000004');"

# 5. Retry is the existing attempt allocator: FAILED_RETRYABLE -> exactly next attempt.
make_failed_retryable \
  'b4000000-0000-0000-0000-000000000005' \
  'b5000000-0000-0000-0000-000000000005' \
  'b6000000-0000-0000-0000-000000000051' \
  'retry-explicit'
retry_result="$("${PSQL[@]}" -At -F '|' -c "select attempt_no,replayed from public.cmd_allocate_chat_turn_attempt_v1(
  'b0000000-0000-0000-0000-000000000001',
  'b4000000-0000-0000-0000-000000000005',
  'b6000000-0000-0000-0000-000000000052',
  'planner-v1');")"
retry_shape="$("${PSQL[@]}" -At -F '|' -c "select state,next_attempt_no,error_code,
  (select count(*) from public.chat_turn_attempts a where a.turn_id=t.id),
  (select count(*) from public.chat_turn_attempts a where a.turn_id=t.id and a.state='running')
from public.chat_turns t where id='b4000000-0000-0000-0000-000000000005';")"
if [[ "${retry_result}|${retry_shape}" != '2|f|planned|3||2|1' ]]; then
  echo "FAIL retry allocation state: ${retry_result}|${retry_shape}" >&2
  exit 24
fi
echo "PASS FAILED_RETRYABLE retry allocates attempt_no=2 and clears logical turn error"
"${PSQL[@]}" -q -c "select public.cmd_mark_chat_turn_failed_v1(
  'b0000000-0000-0000-0000-000000000001',
  'b4000000-0000-0000-0000-000000000005',
  'b6000000-0000-0000-0000-000000000052',
  'failed_final','TEST_CLEANUP');" >/dev/null

# 6. Retry and abandon racing on the same FAILED_RETRYABLE turn are serialized by turn lock.
make_failed_retryable \
  'b4000000-0000-0000-0000-000000000006' \
  'b5000000-0000-0000-0000-000000000006' \
  'b6000000-0000-0000-0000-000000000061' \
  'retry-abandon-race'

race_dir="$(mktemp -d)"
set +e
"${PSQL[@]}" -q -c "begin; select * from public.cmd_allocate_chat_turn_attempt_v1(
  'b0000000-0000-0000-0000-000000000001',
  'b4000000-0000-0000-0000-000000000006',
  'b6000000-0000-0000-0000-000000000062',
  'planner-v1'); select pg_sleep(0.4); commit;" >"${race_dir}/retry.out" 2>&1 &
retry_pid=$!
"${PSQL[@]}" -q -c "begin; select public.cmd_abandon_chat_turn_v1(
  'b0000000-0000-0000-0000-000000000001',
  'b4000000-0000-0000-0000-000000000006'); select pg_sleep(0.4); commit;" >"${race_dir}/abandon.out" 2>&1 &
abandon_pid=$!
wait "${retry_pid}"; retry_status=$?
wait "${abandon_pid}"; abandon_status=$?
set -e

if [[ ${retry_status} -eq ${abandon_status} ]]; then
  echo "FAIL retry/abandon race expected exactly one winner: retry=${retry_status} abandon=${abandon_status}" >&2
  cat "${race_dir}/retry.out" >&2
  cat "${race_dir}/abandon.out" >&2
  exit 25
fi

race_state="$("${PSQL[@]}" -At -c "select state from public.chat_turns where id='b4000000-0000-0000-0000-000000000006';")"
if [[ "${race_state}" == 'planned' ]]; then
  race_shape="$("${PSQL[@]}" -At -F '|' -c "select next_attempt_no,
    (select count(*) from public.chat_turn_attempts a where a.turn_id=t.id),
    (select count(*) from public.chat_turn_attempts a where a.turn_id=t.id and a.state='running')
  from public.chat_turns t where id='b4000000-0000-0000-0000-000000000006';")"
  if [[ "${race_shape}" != '3|2|1' ]]; then
    echo "FAIL retry-won race shape: ${race_shape}" >&2
    exit 26
  fi
  if [[ "$(cat "${race_dir}/abandon.out")" != *'cmd_chat_abandon_attempt_in_flight'* ]]; then
    echo "FAIL retry-won race loser was not abandon in-flight denial" >&2
    cat "${race_dir}/abandon.out" >&2
    exit 27
  fi
  "${PSQL[@]}" -q -c "select public.cmd_mark_chat_turn_failed_v1(
    'b0000000-0000-0000-0000-000000000001',
    'b4000000-0000-0000-0000-000000000006',
    'b6000000-0000-0000-0000-000000000062',
    'failed_final','TEST_CLEANUP');" >/dev/null
elif [[ "${race_state}" == 'abandoned' ]]; then
  race_shape="$("${PSQL[@]}" -At -F '|' -c "select next_attempt_no,
    (select count(*) from public.chat_turn_attempts a where a.turn_id=t.id),
    (select count(*) from public.chat_turn_attempts a where a.turn_id=t.id and a.state='running')
  from public.chat_turns t where id='b4000000-0000-0000-0000-000000000006';")"
  if [[ "${race_shape}" != '2|1|0' ]]; then
    echo "FAIL abandon-won race shape: ${race_shape}" >&2
    exit 28
  fi
  if [[ "$(cat "${race_dir}/retry.out")" != *'cmd_chat_attempt_turn_terminal'* ]]; then
    echo "FAIL abandon-won race loser was not retry terminal denial" >&2
    cat "${race_dir}/retry.out" >&2
    exit 29
  fi
else
  echo "FAIL retry/abandon race ended in unexpected state: ${race_state}" >&2
  exit 30
fi
echo "PASS retry vs abandon race -> exactly one authoritative transition"
rm -rf "${race_dir}"

# 7. Concurrent duplicate abandon is idempotent: both calls succeed, one revision only.
receive_turn \
  'b4000000-0000-0000-0000-000000000007' \
  'b5000000-0000-0000-0000-000000000007' \
  'abandon-duplicate-race'

dup_dir="$(mktemp -d)"
set +e
"${PSQL[@]}" -q -At -c "begin; select public.cmd_abandon_chat_turn_v1(
  'b0000000-0000-0000-0000-000000000001',
  'b4000000-0000-0000-0000-000000000007'); select pg_sleep(0.3); commit;" >"${dup_dir}/a.out" 2>&1 &
a_pid=$!
"${PSQL[@]}" -q -At -c "begin; select public.cmd_abandon_chat_turn_v1(
  'b0000000-0000-0000-0000-000000000001',
  'b4000000-0000-0000-0000-000000000007'); select pg_sleep(0.3); commit;" >"${dup_dir}/b.out" 2>&1 &
b_pid=$!
wait "${a_pid}"; a_status=$?
wait "${b_pid}"; b_status=$?
set -e
if [[ ${a_status} -ne 0 || ${b_status} -ne 0 ]]; then
  echo "FAIL duplicate abandon race should replay, not conflict" >&2
  cat "${dup_dir}/a.out" >&2
  cat "${dup_dir}/b.out" >&2
  exit 31
fi
dup_shape="$("${PSQL[@]}" -At -F '|' -c "select state,revision,next_attempt_no from public.chat_turns where id='b4000000-0000-0000-0000-000000000007';")"
if [[ "${dup_shape}" != 'abandoned|1|1' ]]; then
  echo "FAIL duplicate abandon revision drift: ${dup_shape}" >&2
  exit 32
fi
echo "PASS concurrent duplicate abandon -> one mutation plus one replay"
rm -rf "${dup_dir}"

# 8. Cross-owner probes remain not-found and PUBLIC execute remains revoked.
expect_failure \
  'cross-subject abandon probe is denied' \
  'cmd_chat_abandon_turn_not_found' \
  "select public.cmd_abandon_chat_turn_v1('b0000000-0000-0000-0000-000000000099','b4000000-0000-0000-0000-000000000007');"

public_grant_count="$("${PSQL[@]}" -At -c "select count(*) from information_schema.routine_privileges
where routine_schema='public'
  and routine_name='cmd_abandon_chat_turn_v1'
  and grantee='PUBLIC'
  and privilege_type='EXECUTE';")"
if [[ "${public_grant_count}" != '0' ]]; then
  echo "FAIL cmd_abandon_chat_turn_v1 unexpectedly has PUBLIC EXECUTE" >&2
  exit 33
fi
echo "PASS abandon command PUBLIC EXECUTE remains revoked while P0-AUTH-01 is open"

echo "chat retry/abandon persistence tests passed"
