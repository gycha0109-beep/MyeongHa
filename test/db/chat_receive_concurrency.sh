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

"${PSQL[@]}" <<'SQL'
insert into auth.users(id) values
  ('00000000-0000-0000-0000-000000000901'),
  ('00000000-0000-0000-0000-000000000902')
on conflict do nothing;

insert into public.subjects(id, kind, auth_user_id, status, created_at, updated_at)
values
  ('90000000-0000-0000-0000-000000000001', 'member', '00000000-0000-0000-0000-000000000901', 'active', now(), now()),
  ('90000000-0000-0000-0000-000000000002', 'member', '00000000-0000-0000-0000-000000000902', 'active', now(), now());

insert into public.content_bundles(
  id, content_version, content_hash, artifact_ref, artifact_schema_version,
  min_client_capability, asset_manifest_hash, cue_schema_version,
  manifest_jsonb, published_at
) values (
  '91000000-0000-0000-0000-000000000001',
  'chat-receive-concurrency-v1',
  'sha256:v1:chat-receive-concurrency-bundle',
  'test://chat-receive-concurrency-v1',
  'content-artifact-v1',
  '0.0.1-dev',
  'sha256:v1:chat-receive-concurrency-assets',
  'cue-v1',
  '{}'::jsonb,
  now()
);

insert into public.content_releases(
  id, release_key, content_bundle_id, status, is_default,
  rollout_policy_version, rollout_seed, activated_at, created_at
) values (
  '92000000-0000-0000-0000-000000000001',
  'chat-receive-concurrency-release',
  '91000000-0000-0000-0000-000000000001',
  'active', false, 'test-rollout-v1', 'test-seed', now(), now()
);

insert into public.conversation_threads(
  id, subject_id, thread_type, status, title,
  active_content_release_id, active_content_bundle_id,
  content_revision, next_sequence_no, created_at, updated_at
) values (
  '93000000-0000-0000-0000-000000000001',
  '90000000-0000-0000-0000-000000000001',
  'single_character', 'active', 'concurrency-test',
  '92000000-0000-0000-0000-000000000001',
  '91000000-0000-0000-0000-000000000001',
  0, 1, now(), now()
);
SQL

# Session A holds the thread row lock after RECEIVE. Session B must serialize behind
# that lock and fail as TURN_IN_FLIGHT rather than creating a second turn.
(
  "${PSQL[@]}" <<'SQL'
begin;
select * from public.cmd_receive_chat_turn_v1(
  '90000000-0000-0000-0000-000000000001',
  '93000000-0000-0000-0000-000000000001',
  'race-turn-a',
  'sha256:v1:race-request-a',
  'chat-request-v1',
  '{"clientTurnId":"race-turn-a","text":"hello","clientCapability":"0.0.1-dev"}'::jsonb,
  '92000000-0000-0000-0000-000000000001',
  '91000000-0000-0000-0000-000000000001',
  '94000000-0000-0000-0000-000000000001',
  '95000000-0000-0000-0000-000000000001',
  'hello', null,
  'sha256:v1:race-message-a'
);
select pg_sleep(1.5);
commit;
SQL
) >/tmp/myeongha-chat-receive-a.log 2>&1 &
first_pid=$!

sleep 0.25

set +e
second_output="$("${PSQL[@]}" -c "select * from public.cmd_receive_chat_turn_v1(
  '90000000-0000-0000-0000-000000000001',
  '93000000-0000-0000-0000-000000000001',
  'race-turn-b',
  'sha256:v1:race-request-b',
  'chat-request-v1',
  '{\"clientTurnId\":\"race-turn-b\",\"text\":\"second\",\"clientCapability\":\"0.0.1-dev\"}'::jsonb,
  '92000000-0000-0000-0000-000000000001',
  '91000000-0000-0000-0000-000000000001',
  '94000000-0000-0000-0000-000000000002',
  '95000000-0000-0000-0000-000000000002',
  'second', null,
  'sha256:v1:race-message-b'
);" 2>&1)"
second_status=$?
set -e

wait "${first_pid}"

if [[ ${second_status} -eq 0 ]]; then
  echo "FAIL concurrent distinct receive: second turn unexpectedly succeeded" >&2
  exit 20
fi
if [[ "${second_output}" != *"cmd_chat_receive_turn_in_flight"* ]]; then
  echo "FAIL concurrent distinct receive: wrong error" >&2
  echo "${second_output}" >&2
  exit 21
fi
echo "PASS concurrent distinct receive -> cmd_chat_receive_turn_in_flight"

replay="$("${PSQL[@]}" -At -F '|' -c "select turn_id,message_id,sequence_no,replayed from public.cmd_receive_chat_turn_v1(
  '90000000-0000-0000-0000-000000000001',
  '93000000-0000-0000-0000-000000000001',
  'race-turn-a',
  'sha256:v1:race-request-a',
  'chat-request-v1',
  '{\"clientTurnId\":\"race-turn-a\",\"text\":\"hello\",\"clientCapability\":\"0.0.1-dev\"}'::jsonb,
  '92000000-0000-0000-0000-000000000001',
  '91000000-0000-0000-0000-000000000001',
  '94000000-0000-0000-0000-000000000099',
  '95000000-0000-0000-0000-000000000099',
  'hello', null,
  'sha256:v1:race-message-a'
);")"

expected_replay='94000000-0000-0000-0000-000000000001|95000000-0000-0000-0000-000000000001|1|t'
if [[ "${replay}" != "${expected_replay}" ]]; then
  echo "FAIL same-key same-hash replay: ${replay}" >&2
  exit 22
fi
echo "PASS same clientTurnId + same request hash returns authoritative prior result"

expect_failure \
  'same clientTurnId with different request hash conflicts' \
  'cmd_chat_receive_idempotency_conflict' \
  "select * from public.cmd_receive_chat_turn_v1(
    '90000000-0000-0000-0000-000000000001',
    '93000000-0000-0000-0000-000000000001',
    'race-turn-a', 'sha256:v1:DIFFERENT', 'chat-request-v1', '{}'::jsonb,
    '92000000-0000-0000-0000-000000000001',
    '91000000-0000-0000-0000-000000000001',
    '94000000-0000-0000-0000-000000000090',
    '95000000-0000-0000-0000-000000000090',
    'hello', null, 'sha256:v1:race-message-a');"

expect_failure \
  'cross-subject thread probe is denied' \
  'cmd_chat_receive_thread_not_found' \
  "select * from public.cmd_receive_chat_turn_v1(
    '90000000-0000-0000-0000-000000000002',
    '93000000-0000-0000-0000-000000000001',
    'cross-owner', 'sha256:v1:cross-owner', 'chat-request-v1', '{}'::jsonb,
    '92000000-0000-0000-0000-000000000001',
    '91000000-0000-0000-0000-000000000001',
    '94000000-0000-0000-0000-000000000091',
    '95000000-0000-0000-0000-000000000091',
    'probe', null, 'sha256:v1:probe');"

expect_failure \
  'thread content authority cannot be silently switched during receive' \
  'cmd_chat_receive_content_binding_conflict' \
  "select * from public.cmd_receive_chat_turn_v1(
    '90000000-0000-0000-0000-000000000001',
    '93000000-0000-0000-0000-000000000001',
    'wrong-content', 'sha256:v1:wrong-content', 'chat-request-v1', '{}'::jsonb,
    '92000000-0000-0000-0000-000000000099',
    '91000000-0000-0000-0000-000000000099',
    '94000000-0000-0000-0000-000000000092',
    '95000000-0000-0000-0000-000000000092',
    'wrong content', null, 'sha256:v1:wrong-content-message');"

"${PSQL[@]}" -c "update public.chat_turns set state='failed_final', error_code='test-terminal', updated_at=now() where id='94000000-0000-0000-0000-000000000001';"

before_atomic="$("${PSQL[@]}" -Atqc "select next_sequence_no from public.conversation_threads where id='93000000-0000-0000-0000-000000000001'")"
expect_failure \
  'failed user-message insert rolls back sequence allocation and turn insert' \
  'null value in column' \
  "select * from public.cmd_receive_chat_turn_v1(
    '90000000-0000-0000-0000-000000000001',
    '93000000-0000-0000-0000-000000000001',
    'atomic-fail', 'sha256:v1:atomic-fail', 'chat-request-v1', '{}'::jsonb,
    '92000000-0000-0000-0000-000000000001',
    '91000000-0000-0000-0000-000000000001',
    '94000000-0000-0000-0000-000000000093',
    '95000000-0000-0000-0000-000000000093',
    'atomic', null, null);"
after_atomic="$("${PSQL[@]}" -Atqc "select next_sequence_no from public.conversation_threads where id='93000000-0000-0000-0000-000000000001'")"
bad_turn_count="$("${PSQL[@]}" -Atqc "select count(*) from public.chat_turns where id='94000000-0000-0000-0000-000000000093'")"
if [[ "${before_atomic}" != "${after_atomic}" || "${bad_turn_count}" != '0' ]]; then
  echo "FAIL atomic receive rollback: before=${before_atomic} after=${after_atomic} bad_turns=${bad_turn_count}" >&2
  exit 23
fi
echo "PASS failed receive statement leaves no half-applied sequence/turn state"

second_success="$("${PSQL[@]}" -At -F '|' -c "select turn_id,message_id,sequence_no,replayed from public.cmd_receive_chat_turn_v1(
  '90000000-0000-0000-0000-000000000001',
  '93000000-0000-0000-0000-000000000001',
  'after-terminal',
  'sha256:v1:after-terminal',
  'chat-request-v1',
  '{\"clientTurnId\":\"after-terminal\",\"text\":\"next\",\"clientCapability\":\"0.0.1-dev\"}'::jsonb,
  '92000000-0000-0000-0000-000000000001',
  '91000000-0000-0000-0000-000000000001',
  '94000000-0000-0000-0000-000000000003',
  '95000000-0000-0000-0000-000000000003',
  'next', null,
  'sha256:v1:after-terminal-message'
);")"
expected_second='94000000-0000-0000-0000-000000000003|95000000-0000-0000-0000-000000000003|2|f'
if [[ "${second_success}" != "${expected_second}" ]]; then
  echo "FAIL receive after terminal turn: ${second_success}" >&2
  exit 24
fi

final_shape="$("${PSQL[@]}" -At -F '|' -c "select
  (select next_sequence_no from public.conversation_threads where id='93000000-0000-0000-0000-000000000001'),
  (select count(*) from public.chat_turns where thread_id='93000000-0000-0000-0000-000000000001'),
  (select count(*) from public.conversation_messages where thread_id='93000000-0000-0000-0000-000000000001' and sender_type='user');")"
if [[ "${final_shape}" != '3|2|2' ]]; then
  echo "FAIL final chat receive shape: ${final_shape}" >&2
  exit 25
fi

echo "PASS authoritative sequence allocator advanced 1 -> 2 without MAX(sequence_no)+1"
echo "chat receive persistence/concurrency tests passed"
