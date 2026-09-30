#!/usr/bin/env bash
set -euo pipefail

PSQL=(psql -X -q -v ON_ERROR_STOP=1 --set=VERBOSITY=verbose)

fail() {
  echo "FAIL $*" >&2
  exit 1
}

expect_failure() {
  local expected="$1"
  local sql="$2"
  local output
  local status

  set +e
  output="$("${PSQL[@]}" -c "$sql" 2>&1)"
  status=$?
  set -e

  if [[ $status -eq 0 ]]; then
    fail "statement unexpectedly succeeded; expected: $expected"
  fi
  [[ "$output" == *"$expected"* ]] || {
    echo "$output" >&2
    fail "failure did not contain expected marker: $expected"
  }
}

"${PSQL[@]}" <<'SQL'
insert into auth.users(id)
values ('00000000-0000-0000-0000-00000000b801')
on conflict do nothing;

insert into public.subjects(id, kind, auth_user_id, status, created_at, updated_at)
values (
  'b8000000-0000-0000-0000-000000000001',
  'member',
  '00000000-0000-0000-0000-00000000b801',
  'active',
  now(),
  now()
);

insert into public.content_bundles(
  id, content_version, content_hash, artifact_ref, artifact_schema_version,
  min_client_capability, asset_manifest_hash, cue_schema_version,
  manifest_jsonb, published_at
) values (
  'b8100000-0000-0000-0000-000000000001',
  'standard-reading-chat-execution-hold-v1',
  'sha256:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab801',
  'test://standard-reading-chat-execution-hold-v1',
  'content-artifact-v1',
  '0.0.1-dev',
  'sha256:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb01',
  'cue-v1',
  '{}'::jsonb,
  now()
);

insert into public.content_releases(
  id, release_key, content_bundle_id, status, is_default,
  rollout_policy_version, rollout_seed, activated_at, created_at
) values (
  'b8200000-0000-0000-0000-000000000001',
  'standard-reading-chat-execution-hold-release',
  'b8100000-0000-0000-0000-000000000001',
  'active',
  false,
  'test-rollout-v1',
  'hold-execution-seed',
  now(),
  now()
);

insert into public.characters(character_id, created_at)
values ('hold-reader', now());

insert into public.character_runtime_catalog(
  character_id, content_bundle_id, availability, enabled, published_at
) values (
  'hold-reader',
  'b8100000-0000-0000-0000-000000000001',
  'available',
  true,
  now()
);

insert into public.conversation_threads(
  id, subject_id, thread_type, status, title,
  active_content_release_id, active_content_bundle_id,
  content_revision, next_sequence_no, created_at, updated_at
) values (
  'b8300000-0000-0000-0000-000000000001',
  'b8000000-0000-0000-0000-000000000001',
  'single_character',
  'active',
  'hold execution test',
  'b8200000-0000-0000-0000-000000000001',
  'b8100000-0000-0000-0000-000000000001',
  0,
  1,
  now(),
  now()
);

insert into public.conversation_thread_characters(
  id, thread_id, character_id, content_bundle_id, role, joined_at
) values (
  'b8310000-0000-0000-0000-000000000001',
  'b8300000-0000-0000-0000-000000000001',
  'hold-reader',
  'b8100000-0000-0000-0000-000000000001',
  'primary',
  now() - interval '1 minute'
);

select * from public.cmd_receive_chat_turn_v1(
  'b8000000-0000-0000-0000-000000000001',
  'b8300000-0000-0000-0000-000000000001',
  'hold-turn-1',
  'sha256:v1:hold-turn-1-request',
  'chat-request-v1',
  '{"clientTurnId":"hold-turn-1","text":"hello","clientCapability":"0.0.1-dev"}'::jsonb,
  'b8200000-0000-0000-0000-000000000001',
  'b8100000-0000-0000-0000-000000000001',
  'b8400000-0000-0000-0000-000000000001',
  'b8500000-0000-0000-0000-000000000001',
  'hello',
  null,
  'sha256:v1:hold-turn-1-user'
);

select * from public.cmd_receive_chat_turn_v1(
  'b8000000-0000-0000-0000-000000000001',
  'b8300000-0000-0000-0000-000000000001',
  'hold-turn-2',
  'sha256:v1:hold-turn-2-request',
  'chat-request-v1',
  '{"clientTurnId":"hold-turn-2","text":"hello again","clientCapability":"0.0.1-dev"}'::jsonb,
  'b8200000-0000-0000-0000-000000000001',
  'b8100000-0000-0000-0000-000000000001',
  'b8400000-0000-0000-0000-000000000002',
  'b8500000-0000-0000-0000-000000000002',
  'hello again',
  null,
  'sha256:v1:hold-turn-2-user'
);

select * from public.cmd_receive_chat_turn_v1(
  'b8000000-0000-0000-0000-000000000001',
  'b8300000-0000-0000-0000-000000000001',
  'hold-turn-3',
  'sha256:v1:hold-turn-3-request',
  'chat-request-v1',
  '{"clientTurnId":"hold-turn-3","text":"third","clientCapability":"0.0.1-dev"}'::jsonb,
  'b8200000-0000-0000-0000-000000000001',
  'b8100000-0000-0000-0000-000000000001',
  'b8400000-0000-0000-0000-000000000003',
  'b8500000-0000-0000-0000-000000000003',
  'third',
  null,
  'sha256:v1:hold-turn-3-user'
);
SQL

api_acquire="$( "${PSQL[@]}" -Atc "select has_function_privilege(
  'myeongha_api_executor',
  'public.cmd_acquire_standard_reading_chat_execution_hold_v1(uuid,uuid,text,uuid,text,uuid,uuid)',
  'EXECUTE'
)::int;" )"
api_context="$( "${PSQL[@]}" -Atc "select has_function_privilege(
  'myeongha_api_executor',
  'public.cmd_mark_standard_reading_chat_context_ready_hold_v1(uuid,uuid,uuid)',
  'EXECUTE'
)::int;" )"
api_failed="$( "${PSQL[@]}" -Atc "select has_function_privilege(
  'myeongha_api_executor',
  'public.cmd_mark_standard_reading_chat_failed_hold_v1(uuid,uuid,uuid,text,text)',
  'EXECUTE'
)::int;" )"

[[ "$api_acquire|$api_context|$api_failed" == '0|0|0' ]] ||
  fail "myeongha_api_executor unexpectedly has HOLD execution authority"
echo "PASS HOLD wrappers are not executable by myeongha_api_executor"

acquire_one="$("${PSQL[@]}" -At -F '|' <<'SQL' | grep '^b840' | tail -n1
begin;
select pg_catalog.set_config(
  'myeongha.subject_id',
  'b8000000-0000-0000-0000-000000000001',
  true
);
set role myeongha_character_chat_execution_owner;
select turn_id, attempt_id, attempt_no, execution_mode
from public.cmd_acquire_standard_reading_chat_execution_hold_v1(
  'b8000000-0000-0000-0000-000000000001',
  'b8300000-0000-0000-0000-000000000001',
  'hold-turn-1',
  'b8600000-0000-0000-0000-000000000001',
  'planner-v1',
  'b8200000-0000-0000-0000-000000000001',
  'b8100000-0000-0000-0000-000000000001'
);
reset role;
commit;
SQL
)"
[[ "$acquire_one" == 'b8400000-0000-0000-0000-000000000001|b8600000-0000-0000-0000-000000000001|1|execute' ]] ||
  fail "unexpected first acquire result: $acquire_one"

"${PSQL[@]}" -At <<'SQL' >/dev/null
begin;
select pg_catalog.set_config(
  'myeongha.subject_id',
  'b8000000-0000-0000-0000-000000000001',
  true
);
set role myeongha_character_chat_execution_owner;
select public.cmd_mark_standard_reading_chat_context_ready_hold_v1(
  'b8000000-0000-0000-0000-000000000001',
  'b8400000-0000-0000-0000-000000000001',
  'b8600000-0000-0000-0000-000000000001'
);
select public.cmd_mark_standard_reading_chat_failed_hold_v1(
  'b8000000-0000-0000-0000-000000000001',
  'b8400000-0000-0000-0000-000000000001',
  'b8600000-0000-0000-0000-000000000001',
  'failed_retryable',
  'TEST_RETRYABLE'
);
reset role;
commit;
SQL

retry_shape="$("${PSQL[@]}" -At -F '|' -c "select
  (select state from public.chat_turns where id='b8400000-0000-0000-0000-000000000001'),
  (select state from public.chat_turn_attempts where id='b8600000-0000-0000-0000-000000000001'),
  (select next_attempt_no from public.chat_turns where id='b8400000-0000-0000-0000-000000000001');")"
[[ "$retry_shape" == 'failed_retryable|failed_retryable|2' ]] ||
  fail "unexpected retryable failure shape: $retry_shape"
echo "PASS acquire -> context-ready -> retryable failure uses authoritative lifecycle"

acquire_retry="$("${PSQL[@]}" -At -F '|' <<'SQL' | grep '^b840' | tail -n1
begin;
select pg_catalog.set_config(
  'myeongha.subject_id',
  'b8000000-0000-0000-0000-000000000001',
  true
);
set role myeongha_character_chat_execution_owner;
select turn_id, attempt_id, attempt_no, execution_mode
from public.cmd_acquire_standard_reading_chat_execution_hold_v1(
  'b8000000-0000-0000-0000-000000000001',
  'b8300000-0000-0000-0000-000000000001',
  'hold-turn-1',
  'b8600000-0000-0000-0000-000000000002',
  'planner-v1',
  'b8200000-0000-0000-0000-000000000001',
  'b8100000-0000-0000-0000-000000000001'
);
reset role;
commit;
SQL
)"
[[ "$acquire_retry" == 'b8400000-0000-0000-0000-000000000001|b8600000-0000-0000-0000-000000000002|2|execute' ]] ||
  fail "unexpected retry acquire result: $acquire_retry"
echo "PASS retryable turn allocates exactly the next authoritative attempt"

expect_failure   'standard_reading_chat_execution_attempt_in_flight'   "begin;
   select pg_catalog.set_config(
     'myeongha.subject_id',
     'b8000000-0000-0000-0000-000000000001',
     true
   );
   set role myeongha_character_chat_execution_owner;
   select * from public.cmd_acquire_standard_reading_chat_execution_hold_v1(
     'b8000000-0000-0000-0000-000000000001',
     'b8300000-0000-0000-0000-000000000001',
     'hold-turn-1',
     'b8600000-0000-0000-0000-000000000099',
     'planner-v1',
     'b8200000-0000-0000-0000-000000000001',
     'b8100000-0000-0000-0000-000000000001'
   );"
echo "PASS in-flight attempt cannot trigger duplicate provider execution"

expect_failure   'standard_reading_chat_execution_content_provenance'   "begin;
   select pg_catalog.set_config(
     'myeongha.subject_id',
     'b8000000-0000-0000-0000-000000000001',
     true
   );
   set role myeongha_character_chat_execution_owner;
   select * from public.cmd_acquire_standard_reading_chat_execution_hold_v1(
     'b8000000-0000-0000-0000-000000000001',
     'b8300000-0000-0000-0000-000000000001',
     'hold-turn-2',
     'b8600000-0000-0000-0000-000000000003',
     'planner-v1',
     'b8200000-0000-0000-0000-000000000001',
     '00000000-0000-0000-0000-000000000999'
   );"
echo "PASS release/bundle mismatch is rejected before attempt allocation"

wrong_subject_status=0
set +e
wrong_subject_output="$("${PSQL[@]}" -c "
  begin;
  select pg_catalog.set_config(
    'myeongha.subject_id',
    'b8000000-0000-0000-0000-000000000001',
    true
  );
  set role myeongha_character_chat_execution_owner;
  select * from public.cmd_acquire_standard_reading_chat_execution_hold_v1(
    '00000000-0000-0000-0000-000000000999',
    'b8300000-0000-0000-0000-000000000001',
    'hold-turn-3',
    'b8600000-0000-0000-0000-000000000004',
    'planner-v1',
    'b8200000-0000-0000-0000-000000000001',
    'b8100000-0000-0000-0000-000000000001'
  );" 2>&1)"
wrong_subject_status=$?
set -e
[[ $wrong_subject_status -ne 0 && "$wrong_subject_output" == *"subject context"* ]] ||
  fail "wrapper accepted a subject different from transaction-local authority"
echo "PASS transaction-local subject context is mandatory"

echo "Standard Reading Character Chat HOLD lifecycle authority tests passed"
