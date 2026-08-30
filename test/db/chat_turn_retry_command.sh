#!/usr/bin/env bash
set -euo pipefail

PSQL=(psql -X -v ON_ERROR_STOP=1 --set=VERBOSITY=verbose)
SUBJECT_ID='c0000000-0000-0000-0000-000000000101'
THREAD_ID='c3000000-0000-0000-0000-000000000101'
BUNDLE_ID='c1000000-0000-0000-0000-000000000101'
RELEASE_ID='c2000000-0000-0000-0000-000000000101'
PARTICIPANT_ID='c3100000-0000-0000-0000-000000000101'

expect_failure() {
  local label="$1"
  local expected="$2"
  local sql="$3"
  local output status
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
    '${SUBJECT_ID}', '${THREAD_ID}', '${client_turn_id}',
    'sha256:v1:${client_turn_id}-request', 'chat-request-v1',
    jsonb_build_object('clientTurnId','${client_turn_id}','text','question-${client_turn_id}','clientCapability','0.0.1-dev'),
    '${RELEASE_ID}', '${BUNDLE_ID}', '${turn_id}', '${user_message_id}',
    'question-${client_turn_id}', null, 'sha256:v1:${client_turn_id}-user'
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
  '${SUBJECT_ID}', '${turn_id}', '${attempt_id}', 'planner-v1'
);
select public.cmd_mark_chat_turn_failed_v1(
  '${SUBJECT_ID}', '${turn_id}', '${attempt_id}', 'failed_retryable', 'TRANSIENT_TEST'
);
SQL
}

cleanup_running_attempt() {
  local turn_id="$1"
  local attempt_id
  attempt_id="$("${PSQL[@]}" -At -c "select id from public.chat_turn_attempts where subject_id='${SUBJECT_ID}' and turn_id='${turn_id}' and state='running' order by attempt_no desc limit 1;")"
  if [[ -z "${attempt_id}" ]]; then
    echo "FAIL cleanup: running attempt missing for ${turn_id}" >&2
    exit 12
  fi
  "${PSQL[@]}" -q -c "select public.cmd_mark_chat_turn_failed_v1(
    '${SUBJECT_ID}', '${turn_id}', '${attempt_id}', 'failed_final', 'TEST_CLEANUP'
  );" >/dev/null
}

"${PSQL[@]}" <<SQL
insert into auth.users(id)
values ('00000000-0000-0000-0000-00000000c101')
on conflict do nothing;

insert into public.subjects(id, kind, auth_user_id, status, created_at, updated_at)
values (
  '${SUBJECT_ID}', 'member', '00000000-0000-0000-0000-00000000c101',
  'active', now(), now()
);

insert into public.content_bundles(
  id, content_version, content_hash, artifact_ref, artifact_schema_version,
  min_client_capability, asset_manifest_hash, cue_schema_version,
  manifest_jsonb, published_at
) values (
  '${BUNDLE_ID}', 'chat-retry-only-v2', 'sha256:v1:chat-retry-only-bundle-v2',
  'test://chat-retry-only-v2', 'content-artifact-v1', '0.0.1-dev',
  'sha256:v1:chat-retry-only-assets-v2', 'cue-v1', '{}'::jsonb, now()
);

insert into public.content_releases(
  id, release_key, content_bundle_id, status, is_default,
  rollout_policy_version, rollout_seed, activated_at, created_at
) values (
  '${RELEASE_ID}', 'chat-retry-only-release-v2', '${BUNDLE_ID}',
  'active', false, 'test-rollout-v1', 'retry-only-seed-v2', now(), now()
);

insert into public.characters(character_id, created_at)
values ('chat-retry-only-char-v2', now());

insert into public.character_runtime_catalog(
  character_id, content_bundle_id, availability, enabled, published_at
) values (
  'chat-retry-only-char-v2', '${BUNDLE_ID}', 'available', true, now()
);

insert into public.conversation_threads(
  id, subject_id, thread_type, status, title,
  active_content_release_id, active_content_bundle_id,
  content_revision, next_sequence_no, created_at, updated_at
) values (
  '${THREAD_ID}', '${SUBJECT_ID}', 'single_character', 'active', 'retry-only-test-v2',
  '${RELEASE_ID}', '${BUNDLE_ID}', 0, 1, now(), now()
);

insert into public.conversation_thread_characters(
  id, thread_id, character_id, content_bundle_id, role, joined_at
) values (
  '${PARTICIPANT_ID}', '${THREAD_ID}', 'chat-retry-only-char-v2',
  '${BUNDLE_ID}', 'primary', now() - interval '1 minute'
);
SQL

# Authority shape: invoker, fixed search path, PUBLIC EXECUTE revoked.
function_shape="$("${PSQL[@]}" -At -F '|' -c "select p.prosecdef, array_to_string(p.proconfig, ',') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='cmd_retry_chat_turn_attempt_v1' and pg_get_function_identity_arguments(p.oid)='p_subject_id uuid, p_turn_id uuid, p_attempt_id uuid, p_planner_version text';")"
if [[ "${function_shape}" != 'f|search_path=public, pg_temp' ]]; then
  echo "FAIL retry function security/search_path shape: ${function_shape}" >&2
  exit 20
fi
"${PSQL[@]}" -q -c "create role chat_retry_public_probe_v2" >/dev/null
public_execute="$("${PSQL[@]}" -At -c "select has_function_privilege('chat_retry_public_probe_v2','public.cmd_retry_chat_turn_attempt_v1(uuid,uuid,uuid,text)','EXECUTE');")"
"${PSQL[@]}" -q -c "drop role chat_retry_public_probe_v2" >/dev/null
if [[ "${public_execute}" != 'f' ]]; then
  echo "FAIL retry function PUBLIC execute must be revoked: ${public_execute}" >&2
  exit 21
fi
echo "PASS retry authority is SECURITY INVOKER with fixed search_path and PUBLIC EXECUTE revoked"

# FAILED_RETRYABLE appends a new attempt; previous attempt remains immutable provenance.
make_failed_retryable \
  'c4000000-0000-0000-0000-000000000101' \
  'c5000000-0000-0000-0000-000000000101' \
  'c6000000-0000-0000-0000-000000000111' \
  'retry-only-success-v2'
retry_result="$("${PSQL[@]}" -At -F '|' -c "select attempt_id,attempt_no,replayed from public.cmd_retry_chat_turn_attempt_v1(
  '${SUBJECT_ID}', 'c4000000-0000-0000-0000-000000000101',
  'c6000000-0000-0000-0000-000000000112', 'planner-v2');")"
retry_shape="$("${PSQL[@]}" -At -F '|' -c "select t.state,t.next_attempt_no,coalesce(t.error_code,''),t.revision,
  (select count(*) from public.chat_turn_attempts a where a.turn_id=t.id),
  (select state from public.chat_turn_attempts a where a.id='c6000000-0000-0000-0000-000000000111'),
  (select planner_version from public.chat_turn_attempts a where a.id='c6000000-0000-0000-0000-000000000112')
from public.chat_turns t where t.id='c4000000-0000-0000-0000-000000000101';")"
if [[ "${retry_result}" != 'c6000000-0000-0000-0000-000000000112|2|f' ]]; then
  echo "FAIL retry authority result: ${retry_result}" >&2
  exit 22
fi
if [[ "${retry_shape}" != 'planned|3||3|2|failed_retryable|planner-v2' ]]; then
  echo "FAIL retry authority persistence shape: ${retry_shape}" >&2
  exit 23
fi
echo "PASS FAILED_RETRYABLE appends attempt_no=2 without rewriting attempt_no=1 provenance"
cleanup_running_attempt 'c4000000-0000-0000-0000-000000000101'

# RECEIVED belongs to first-attempt allocation, not public retry.
receive_turn \
  'c4000000-0000-0000-0000-000000000102' \
  'c5000000-0000-0000-0000-000000000102' \
  'retry-received-denied-v2'
expect_failure \
  'RECEIVED cannot use public retry' \
  'cmd_chat_retry_turn_not_retryable' \
  "select * from public.cmd_retry_chat_turn_attempt_v1('${SUBJECT_ID}','c4000000-0000-0000-0000-000000000102','c6000000-0000-0000-0000-000000000121','planner-v2');"
"${PSQL[@]}" -q -c "select public.cmd_abandon_chat_turn_v1('${SUBJECT_ID}','c4000000-0000-0000-0000-000000000102');" >/dev/null

# A nonterminal execution attempt blocks a second public retry.
receive_turn \
  'c4000000-0000-0000-0000-000000000103' \
  'c5000000-0000-0000-0000-000000000103' \
  'retry-in-flight-denied-v2'
"${PSQL[@]}" -q -c "select * from public.cmd_allocate_chat_turn_attempt_v1(
  '${SUBJECT_ID}', 'c4000000-0000-0000-0000-000000000103',
  'c6000000-0000-0000-0000-000000000131', 'planner-v1');" >/dev/null
expect_failure \
  'active attempt blocks public retry' \
  'cmd_chat_retry_turn_in_flight' \
  "select * from public.cmd_retry_chat_turn_attempt_v1('${SUBJECT_ID}','c4000000-0000-0000-0000-000000000103','c6000000-0000-0000-0000-000000000132','planner-v2');"
cleanup_running_attempt 'c4000000-0000-0000-0000-000000000103'

# Terminal turns stay terminal.
receive_turn \
  'c4000000-0000-0000-0000-000000000104' \
  'c5000000-0000-0000-0000-000000000104' \
  'retry-final-denied-v2'
"${PSQL[@]}" -q <<SQL >/dev/null
select * from public.cmd_allocate_chat_turn_attempt_v1(
  '${SUBJECT_ID}', 'c4000000-0000-0000-0000-000000000104',
  'c6000000-0000-0000-0000-000000000141', 'planner-v1');
select public.cmd_mark_chat_turn_failed_v1(
  '${SUBJECT_ID}', 'c4000000-0000-0000-0000-000000000104',
  'c6000000-0000-0000-0000-000000000141', 'failed_final', 'FINAL_TEST'
);
SQL
expect_failure \
  'FAILED_FINAL cannot retry' \
  'cmd_chat_retry_turn_terminal' \
  "select * from public.cmd_retry_chat_turn_attempt_v1('${SUBJECT_ID}','c4000000-0000-0000-0000-000000000104','c6000000-0000-0000-0000-000000000142','planner-v2');"

receive_turn \
  'c4000000-0000-0000-0000-000000000105' \
  'c5000000-0000-0000-0000-000000000105' \
  'retry-abandoned-denied-v2'
"${PSQL[@]}" -q -c "select public.cmd_abandon_chat_turn_v1('${SUBJECT_ID}','c4000000-0000-0000-0000-000000000105');" >/dev/null
expect_failure \
  'ABANDONED cannot retry' \
  'cmd_chat_retry_turn_terminal' \
  "select * from public.cmd_retry_chat_turn_attempt_v1('${SUBJECT_ID}','c4000000-0000-0000-0000-000000000105','c6000000-0000-0000-0000-000000000152','planner-v2');"

# Concurrent duplicate retries serialize: exactly one appends attempt_no=2.
make_failed_retryable \
  'c4000000-0000-0000-0000-000000000106' \
  'c5000000-0000-0000-0000-000000000106' \
  'c6000000-0000-0000-0000-000000000161' \
  'retry-race-v2'
tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT
set +e
("${PSQL[@]}" -At -c "select attempt_id from public.cmd_retry_chat_turn_attempt_v1('${SUBJECT_ID}','c4000000-0000-0000-0000-000000000106','c6000000-0000-0000-0000-000000000162','planner-race-a');" >"${tmpdir}/retry-a.out" 2>"${tmpdir}/retry-a.err") &
pid_a=$!
("${PSQL[@]}" -At -c "select attempt_id from public.cmd_retry_chat_turn_attempt_v1('${SUBJECT_ID}','c4000000-0000-0000-0000-000000000106','c6000000-0000-0000-0000-000000000163','planner-race-b');" >"${tmpdir}/retry-b.out" 2>"${tmpdir}/retry-b.err") &
pid_b=$!
wait "${pid_a}"; status_a=$?
wait "${pid_b}"; status_b=$?
set -e
if [[ $((status_a == 0 ? 1 : 0)) -eq $((status_b == 0 ? 1 : 0)) ]]; then
  echo "FAIL concurrent retry must have exactly one success: a=${status_a} b=${status_b}" >&2
  exit 24
fi
loser_err="${tmpdir}/retry-a.err"
if [[ ${status_a} -eq 0 ]]; then loser_err="${tmpdir}/retry-b.err"; fi
if ! grep -q 'cmd_chat_retry_turn_in_flight' "${loser_err}"; then
  echo "FAIL concurrent retry loser did not fail as in-flight" >&2
  cat "${loser_err}" >&2
  exit 25
fi
race_shape="$("${PSQL[@]}" -At -F '|' -c "select state,next_attempt_no,
  (select count(*) from public.chat_turn_attempts a where a.turn_id=t.id),
  (select count(*) from public.chat_turn_attempts a where a.turn_id=t.id and a.state='running')
from public.chat_turns t where t.id='c4000000-0000-0000-0000-000000000106';")"
if [[ "${race_shape}" != 'planned|3|2|1' ]]; then
  echo "FAIL concurrent retry persistence shape: ${race_shape}" >&2
  exit 26
fi
echo "PASS concurrent public retry serializes to exactly one appended attempt"
cleanup_running_attempt 'c4000000-0000-0000-0000-000000000106'

# Retry and abandon serialize on the same row; exactly one lifecycle action wins.
make_failed_retryable \
  'c4000000-0000-0000-0000-000000000107' \
  'c5000000-0000-0000-0000-000000000107' \
  'c6000000-0000-0000-0000-000000000171' \
  'retry-abandon-race-v2'
set +e
("${PSQL[@]}" -At -c "select attempt_id from public.cmd_retry_chat_turn_attempt_v1('${SUBJECT_ID}','c4000000-0000-0000-0000-000000000107','c6000000-0000-0000-0000-000000000172','planner-race');" >"${tmpdir}/ra-retry.out" 2>"${tmpdir}/ra-retry.err") &
pid_retry=$!
("${PSQL[@]}" -At -c "select public.cmd_abandon_chat_turn_v1('${SUBJECT_ID}','c4000000-0000-0000-0000-000000000107');" >"${tmpdir}/ra-abandon.out" 2>"${tmpdir}/ra-abandon.err") &
pid_abandon=$!
wait "${pid_retry}"; status_retry=$?
wait "${pid_abandon}"; status_abandon=$?
set -e
if [[ $((status_retry == 0 ? 1 : 0)) -eq $((status_abandon == 0 ? 1 : 0)) ]]; then
  echo "FAIL retry-vs-abandon must have exactly one success: retry=${status_retry} abandon=${status_abandon}" >&2
  exit 27
fi
final_shape="$("${PSQL[@]}" -At -F '|' -c "select state,next_attempt_no,
  (select count(*) from public.chat_turn_attempts a where a.turn_id=t.id),
  (select count(*) from public.chat_turn_attempts a where a.turn_id=t.id and a.state='running')
from public.chat_turns t where t.id='c4000000-0000-0000-0000-000000000107';")"
if [[ "${final_shape}" != 'planned|3|2|1' && "${final_shape}" != 'abandoned|2|1|0' ]]; then
  echo "FAIL retry-vs-abandon final authority shape: ${final_shape}" >&2
  exit 28
fi
if [[ ${status_retry} -eq 0 ]]; then
  if ! grep -q 'cmd_chat_abandon_attempt_in_flight' "${tmpdir}/ra-abandon.err"; then
    echo "FAIL abandon loser did not observe in-flight retry" >&2
    cat "${tmpdir}/ra-abandon.err" >&2
    exit 29
  fi
  cleanup_running_attempt 'c4000000-0000-0000-0000-000000000107'
else
  if ! grep -q 'cmd_chat_retry_turn_terminal' "${tmpdir}/ra-retry.err"; then
    echo "FAIL retry loser did not observe terminal abandon" >&2
    cat "${tmpdir}/ra-retry.err" >&2
    exit 30
  fi
fi
echo "PASS retry-vs-abandon race serializes to one authoritative lifecycle outcome"

echo "CHAT_TURN_RETRY_COMMAND_PASS"
