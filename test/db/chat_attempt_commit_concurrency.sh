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
  local request_hash="$4"
  local message_hash="$5"
  local body="$6"

  "${PSQL[@]}" -q -c "select * from public.cmd_receive_chat_turn_v1(
    'a0000000-0000-0000-0000-000000000001',
    'a3000000-0000-0000-0000-000000000001',
    '${client_turn_id}',
    '${request_hash}',
    'chat-request-v1',
    jsonb_build_object('clientTurnId','${client_turn_id}','text','${body}','clientCapability','0.0.1-dev'),
    'a2000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    '${turn_id}',
    '${user_message_id}',
    '${body}',
    null,
    '${message_hash}'
  );" >/dev/null
}

prepare_generated_turn() {
  local turn_id="$1"
  local user_message_id="$2"
  local attempt_id="$3"
  local renderer_log_id="$4"
  local client_turn_id="$5"
  local answer_hash="$6"
  local answer_body="$7"

  receive_turn "${turn_id}" "${user_message_id}" "${client_turn_id}" \
    "sha256:v1:${client_turn_id}-request" "sha256:v1:${client_turn_id}-user" "question-${client_turn_id}"

  "${PSQL[@]}" -q <<SQL >/dev/null
select * from public.cmd_allocate_chat_turn_attempt_v1(
  'a0000000-0000-0000-0000-000000000001',
  '${turn_id}',
  '${attempt_id}',
  'planner-v1'
);
select public.cmd_mark_chat_turn_context_ready_v1(
  'a0000000-0000-0000-0000-000000000001',
  '${turn_id}',
  '${attempt_id}'
);
insert into public.ai_execution_logs(
  id, subject_id, turn_id, turn_attempt_id, stage, provider, model,
  prompt_version, content_release_id, content_bundle_id, character_id,
  input_ref_jsonb, output_ref_jsonb, status, created_at
) values (
  '${renderer_log_id}',
  'a0000000-0000-0000-0000-000000000001',
  '${turn_id}',
  '${attempt_id}',
  'renderer', 'test-provider', 'test-model', 'renderer-prompt-v1',
  'a2000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'chat-commit-char',
  jsonb_build_object('turnId','${turn_id}'),
  jsonb_build_object('generatedContentHash','${answer_hash}'),
  'success', now()
);
select public.cmd_mark_chat_turn_generated_v1(
  'a0000000-0000-0000-0000-000000000001',
  '${turn_id}',
  '${attempt_id}',
  '${renderer_log_id}',
  'renderer-v1',
  'a3100000-0000-0000-0000-000000000001',
  '${answer_body}',
  jsonb_build_object('emotion','neutral'),
  'character-dialogue-v1',
  '${answer_hash}',
  '[]'::jsonb
);
SQL
}

validate_turn() {
  local turn_id="$1"
  local attempt_id="$2"
  local guard_log_id="$3"
  local answer_hash="$4"
  local guard_status="$5"
  local passed="$6"
  local failure_state="$7"

  "${PSQL[@]}" -q <<SQL >/dev/null
insert into public.ai_execution_logs(
  id, subject_id, turn_id, turn_attempt_id, stage, provider, model,
  prompt_version, content_release_id, content_bundle_id, character_id,
  input_ref_jsonb, output_ref_jsonb, status, created_at
) values (
  '${guard_log_id}',
  'a0000000-0000-0000-0000-000000000001',
  '${turn_id}',
  '${attempt_id}',
  'output_guard', 'test-provider', 'test-guard', 'guard-prompt-v1',
  'a2000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'chat-commit-char',
  jsonb_build_object('turnId','${turn_id}'),
  jsonb_build_object('generatedContentHash','${answer_hash}'),
  '${guard_status}', now()
);
select public.cmd_validate_chat_turn_attempt_v1(
  'a0000000-0000-0000-0000-000000000001',
  '${turn_id}',
  '${attempt_id}',
  '${guard_log_id}',
  'output-guard-v1',
  jsonb_build_object('passed',${passed},'errorCode',case when ${passed} then null else 'GUARD_BLOCKED' end),
  ${passed},
  '${failure_state}'
);
SQL
}

"${PSQL[@]}" <<'SQL'
insert into auth.users(id)
values ('00000000-0000-0000-0000-00000000a001')
on conflict do nothing;

insert into public.subjects(id, kind, auth_user_id, status, created_at, updated_at)
values (
  'a0000000-0000-0000-0000-000000000001',
  'member',
  '00000000-0000-0000-0000-00000000a001',
  'active', now(), now()
);

insert into public.content_bundles(
  id, content_version, content_hash, artifact_ref, artifact_schema_version,
  min_client_capability, asset_manifest_hash, cue_schema_version,
  manifest_jsonb, published_at
) values (
  'a1000000-0000-0000-0000-000000000001',
  'chat-attempt-commit-v1',
  'sha256:v1:chat-attempt-commit-bundle',
  'test://chat-attempt-commit-v1',
  'content-artifact-v1',
  '0.0.1-dev',
  'sha256:v1:chat-attempt-commit-assets',
  'cue-v1',
  '{}'::jsonb,
  now()
);

insert into public.content_releases(
  id, release_key, content_bundle_id, status, is_default,
  rollout_policy_version, rollout_seed, activated_at, created_at
) values (
  'a2000000-0000-0000-0000-000000000001',
  'chat-attempt-commit-release',
  'a1000000-0000-0000-0000-000000000001',
  'active', false, 'test-rollout-v1', 'attempt-commit-seed', now(), now()
);

insert into public.characters(character_id, created_at)
values ('chat-commit-char', now());

insert into public.character_runtime_catalog(
  character_id, content_bundle_id, availability, enabled, published_at
) values (
  'chat-commit-char',
  'a1000000-0000-0000-0000-000000000001',
  'available', true, now()
);

insert into public.conversation_threads(
  id, subject_id, thread_type, status, title,
  active_content_release_id, active_content_bundle_id,
  content_revision, next_sequence_no, created_at, updated_at
) values (
  'a3000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'single_character', 'active', 'attempt-commit-test',
  'a2000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  0, 1, now(), now()
);

insert into public.conversation_thread_characters(
  id, thread_id, character_id, content_bundle_id, role, joined_at
) values (
  'a3100000-0000-0000-0000-000000000001',
  'a3000000-0000-0000-0000-000000000001',
  'chat-commit-char',
  'a1000000-0000-0000-0000-000000000001',
  'primary', now() - interval '1 minute'
);

insert into public.user_character_states(
  id, subject_id, character_id, closeness, trust, friction,
  relationship_stage, policy_version, revision, created_at, updated_at
) values (
  'a3200000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'chat-commit-char',
  10, 20, 3, 'visitor', 'relationship-policy-v1', 0, now(), now()
);
SQL

# Happy path: RECEIVED -> attempt -> CONTEXT_READY -> GENERATED -> VALIDATED.
prepare_generated_turn \
  'a4000000-0000-0000-0000-000000000001' \
  'a5000000-0000-0000-0000-000000000001' \
  'a6000000-0000-0000-0000-000000000001' \
  'a7000000-0000-0000-0000-000000000001' \
  'happy-turn' \
  'sha256:v1:happy-answer' \
  'validated answer'

pre_validation_shape="$("${PSQL[@]}" -At -F '|' -c "select
  (select state from public.chat_turns where id='a4000000-0000-0000-0000-000000000001'),
  (select state from public.chat_turn_attempts where id='a6000000-0000-0000-0000-000000000001'),
  (select count(*) from public.conversation_messages where turn_id='a4000000-0000-0000-0000-000000000001' and sender_type='character'),
  (select count(*) from public.relationship_events where source_turn_id='a4000000-0000-0000-0000-000000000001'),
  (select count(*) from public.world_events where source_turn_id='a4000000-0000-0000-0000-000000000001'),
  (select count(*) from public.memory_items where source_turn_id='a4000000-0000-0000-0000-000000000001'),
  (select count(*) from public.outbox_events where aggregate_type='chat_turn' and aggregate_id='a4000000-0000-0000-0000-000000000001');")"
if [[ "${pre_validation_shape}" != 'generated|generated|0|0|0|0|0' ]]; then
  echo "FAIL generated staging leaked public/durable side effects: ${pre_validation_shape}" >&2
  exit 20
fi
echo "PASS GENERATED output is staged only; no public assistant/relationship/world/memory/outbox side effect"

validate_turn \
  'a4000000-0000-0000-0000-000000000001' \
  'a6000000-0000-0000-0000-000000000001' \
  'a7000000-0000-0000-0000-000000000002' \
  'sha256:v1:happy-answer' \
  'success' \
  'true' \
  'failed_final'

pre_commit_shape="$("${PSQL[@]}" -At -F '|' -c "select
  (select state from public.chat_turns where id='a4000000-0000-0000-0000-000000000001'),
  (select state from public.chat_turn_attempts where id='a6000000-0000-0000-0000-000000000001'),
  (select count(*) from public.conversation_messages where turn_id='a4000000-0000-0000-0000-000000000001' and sender_type='character'),
  (select count(*) from public.relationship_events where source_turn_id='a4000000-0000-0000-0000-000000000001'),
  (select count(*) from public.memory_items where source_turn_id='a4000000-0000-0000-0000-000000000001');")"
if [[ "${pre_commit_shape}" != 'validated|validated|0|0|0' ]]; then
  echo "FAIL VALIDATED state leaked pre-commit durable effects: ${pre_commit_shape}" >&2
  exit 21
fi
echo "PASS VALIDATED attempt still has no public assistant/relationship/memory side effect"

# Simulate an already-staged, user-resolvable memory proposal. The actual durable
# memory must still be absent until the current validated turn commits.
"${PSQL[@]}" <<'SQL'
insert into public.memory_proposals(
  id, subject_id, character_id, proposal_kind, record_type, schema_version,
  proposed_value_jsonb, source_turn_id, source_message_id,
  proposal_dedupe_key, status, created_at
) values (
  'aa000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'chat-commit-char',
  'memory', 'conversation_memory', 'v1',
  jsonb_build_object('summary','user approved memory'),
  'a4000000-0000-0000-0000-000000000001',
  null,
  'happy-memory-proposal', 'pending', now()
);
SQL

commit_result="$("${PSQL[@]}" -At -F '|' -c "select turn_id,attempt_id,message_id,sequence_no,replayed from public.cmd_commit_chat_turn_v1(
  'a0000000-0000-0000-0000-000000000001',
  'a3000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000001',
  'a6000000-0000-0000-0000-000000000001',
  'a8000000-0000-0000-0000-000000000001',
  'a9000000-0000-0000-0000-000000000001',
  jsonb_build_object(
    'id','ab000000-0000-0000-0000-000000000001',
    'characterId','chat-commit-char',
    'eventType','RETURN_VISIT',
    'eventSchemaVersion','v1',
    'eventDedupeKey','happy-relationship',
    'expectedRevision',0,
    'deltaCloseness',1,
    'deltaTrust',2,
    'deltaFriction',0,
    'relationshipStage','familiar',
    'policyVersion','relationship-policy-v1',
    'payload',jsonb_build_object('source','test-policy')
  ),
  jsonb_build_object(
    'id','ac000000-0000-0000-0000-000000000001',
    'eventType','CHAT_SCENE_COMPLETED',
    'eventSchemaVersion','v1',
    'eventDedupeKey','happy-world',
    'payload',jsonb_build_object('scene','test')
  ),
  jsonb_build_object(
    'proposalId','aa000000-0000-0000-0000-000000000001',
    'recordId','ad000000-0000-0000-0000-000000000001',
    'grants',jsonb_build_array(jsonb_build_object(
      'id','ae000000-0000-0000-0000-000000000001',
      'characterId','chat-commit-char'
    ))
  )
);")"
expected_commit='a4000000-0000-0000-0000-000000000001|a6000000-0000-0000-0000-000000000001|a8000000-0000-0000-0000-000000000001|2|f'
if [[ "${commit_result}" != "${expected_commit}" ]]; then
  echo "FAIL atomic happy commit result: ${commit_result}" >&2
  exit 22
fi

happy_shape="$("${PSQL[@]}" -At -F '|' -c "select
  (select state from public.chat_turns where id='a4000000-0000-0000-0000-000000000001'),
  (select state from public.chat_turn_attempts where id='a6000000-0000-0000-0000-000000000001'),
  (select committed_message_id from public.chat_turn_attempts where id='a6000000-0000-0000-0000-000000000001'),
  (select count(*) from public.conversation_messages where turn_id='a4000000-0000-0000-0000-000000000001' and sender_type='character'),
  (select revision from public.user_character_states where subject_id='a0000000-0000-0000-0000-000000000001' and character_id='chat-commit-char'),
  (select closeness from public.user_character_states where subject_id='a0000000-0000-0000-0000-000000000001' and character_id='chat-commit-char'),
  (select trust from public.user_character_states where subject_id='a0000000-0000-0000-0000-000000000001' and character_id='chat-commit-char'),
  (select count(*) from public.relationship_events where source_turn_id='a4000000-0000-0000-0000-000000000001'),
  (select count(*) from public.world_events where source_turn_id='a4000000-0000-0000-0000-000000000001'),
  (select count(*) from public.memory_items where id='ad000000-0000-0000-0000-000000000001'),
  (select count(*) from public.record_access_grants where memory_item_id='ad000000-0000-0000-0000-000000000001' and revoked_at is null),
  (select status from public.memory_proposals where id='aa000000-0000-0000-0000-000000000001'),
  (select count(*) from public.outbox_events where id='a9000000-0000-0000-0000-000000000001');")"
expected_happy='committed|committed|a8000000-0000-0000-0000-000000000001|1|1|11|22|1|1|1|1|accepted|1'
if [[ "${happy_shape}" != "${expected_happy}" ]]; then
  echo "FAIL happy atomic side-effect shape: ${happy_shape}" >&2
  exit 23
fi
echo "PASS assistant message + relationship + world + accepted memory + explicit grant + outbox committed atomically"

replay_result="$("${PSQL[@]}" -At -F '|' -c "select turn_id,attempt_id,message_id,sequence_no,replayed from public.cmd_commit_chat_turn_v1(
  'a0000000-0000-0000-0000-000000000001',
  'a3000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000001',
  'a6000000-0000-0000-0000-000000000001',
  'a8000000-0000-0000-0000-000000000099',
  'a9000000-0000-0000-0000-000000000099',
  null, null, null
);")"
expected_replay='a4000000-0000-0000-0000-000000000001|a6000000-0000-0000-0000-000000000001|a8000000-0000-0000-0000-000000000001|2|t'
if [[ "${replay_result}" != "${expected_replay}" ]]; then
  echo "FAIL committed reconnect replay: ${replay_result}" >&2
  exit 24
fi
replay_counts="$("${PSQL[@]}" -At -F '|' -c "select
  (select count(*) from public.conversation_messages where turn_id='a4000000-0000-0000-0000-000000000001' and sender_type='character'),
  (select count(*) from public.relationship_events where source_turn_id='a4000000-0000-0000-0000-000000000001'),
  (select count(*) from public.world_events where source_turn_id='a4000000-0000-0000-0000-000000000001'),
  (select count(*) from public.memory_items where id='ad000000-0000-0000-0000-000000000001'),
  (select count(*) from public.outbox_events where aggregate_type='chat_turn' and aggregate_id='a4000000-0000-0000-0000-000000000001');")"
if [[ "${replay_counts}" != '1|1|1|1|1' ]]; then
  echo "FAIL committed replay duplicated side effects: ${replay_counts}" >&2
  exit 25
fi
echo "PASS reconnect/retry returns committed authoritative message without regeneration or duplicate side effects"

# Validation failure: staged output never becomes public and the same logical turn can retry.
prepare_generated_turn \
  'a4000000-0000-0000-0000-000000000002' \
  'a5000000-0000-0000-0000-000000000002' \
  'a6000000-0000-0000-0000-000000000002' \
  'a7000000-0000-0000-0000-000000000003' \
  'guard-fail-turn' \
  'sha256:v1:guard-fail-answer' \
  'must never publish'

validate_turn \
  'a4000000-0000-0000-0000-000000000002' \
  'a6000000-0000-0000-0000-000000000002' \
  'a7000000-0000-0000-0000-000000000004' \
  'sha256:v1:guard-fail-answer' \
  'blocked' \
  'false' \
  'failed_retryable'

failed_validation_shape="$("${PSQL[@]}" -At -F '|' -c "select
  (select state from public.chat_turns where id='a4000000-0000-0000-0000-000000000002'),
  (select state from public.chat_turn_attempts where id='a6000000-0000-0000-0000-000000000002'),
  (select count(*) from public.conversation_messages where turn_id='a4000000-0000-0000-0000-000000000002' and sender_type='character'),
  (select count(*) from public.outbox_events where aggregate_type='chat_turn' and aggregate_id='a4000000-0000-0000-0000-000000000002');")"
if [[ "${failed_validation_shape}" != 'failed_retryable|failed_retryable|0|0' ]]; then
  echo "FAIL validation failure leaked commit: ${failed_validation_shape}" >&2
  exit 26
fi
echo "PASS Output Guard failure leaves no public assistant message/outbox"

# Two concurrent retry allocators serialize on the turn. The second call must replay
# the already-allocated active attempt rather than allocate attempt_no 3.
(
  "${PSQL[@]}" <<'SQL'
begin;
select * from public.cmd_allocate_chat_turn_attempt_v1(
  'a0000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000002',
  'a6000000-0000-0000-0000-000000000020',
  'planner-v1'
);
select pg_sleep(1.5);
commit;
SQL
) >/tmp/myeongha-chat-attempt-a.log 2>&1 &
retry_first_pid=$!

sleep 0.25
retry_second="$("${PSQL[@]}" -At -F '|' -c "select attempt_id,attempt_no,replayed from public.cmd_allocate_chat_turn_attempt_v1(
  'a0000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000002',
  'a6000000-0000-0000-0000-000000000021',
  'planner-v1'
);")"
wait "${retry_first_pid}"
if [[ "${retry_second}" != 'a6000000-0000-0000-0000-000000000020|2|t' ]]; then
  echo "FAIL concurrent attempt retry dedupe: ${retry_second}" >&2
  exit 27
fi
retry_attempt_shape="$("${PSQL[@]}" -At -F '|' -c "select
  (select count(*) from public.chat_turn_attempts where turn_id='a4000000-0000-0000-0000-000000000002'),
  (select next_attempt_no from public.chat_turns where id='a4000000-0000-0000-0000-000000000002');")"
if [[ "${retry_attempt_shape}" != '2|3' ]]; then
  echo "FAIL retry allocator shape: ${retry_attempt_shape}" >&2
  exit 28
fi
echo "PASS concurrent retry allocation -> one new attempt_no=2, second caller replays it"

"${PSQL[@]}" -q -c "select public.cmd_mark_chat_turn_failed_v1(
  'a0000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000002',
  'a6000000-0000-0000-0000-000000000020',
  'failed_final','test-stop-retry');" >/dev/null

# Commit before validation is rejected.
prepare_generated_turn \
  'a4000000-0000-0000-0000-000000000003' \
  'a5000000-0000-0000-0000-000000000003' \
  'a6000000-0000-0000-0000-000000000003' \
  'a7000000-0000-0000-0000-000000000005' \
  'prevalidate-commit' \
  'sha256:v1:prevalidate-answer' \
  'not validated yet'

expect_failure \
  'commit before validation is denied' \
  'cmd_chat_commit_not_validated' \
  "select * from public.cmd_commit_chat_turn_v1(
    'a0000000-0000-0000-0000-000000000001',
    'a3000000-0000-0000-0000-000000000001',
    'a4000000-0000-0000-0000-000000000003',
    'a6000000-0000-0000-0000-000000000003',
    'a8000000-0000-0000-0000-000000000003',
    'a9000000-0000-0000-0000-000000000003',
    null,null,null);"
prevalidate_message_count="$("${PSQL[@]}" -Atqc "select count(*) from public.conversation_messages where turn_id='a4000000-0000-0000-0000-000000000003' and sender_type='character'")"
if [[ "${prevalidate_message_count}" != '0' ]]; then
  echo "FAIL pre-validation commit created assistant message" >&2
  exit 29
fi
"${PSQL[@]}" -q -c "select public.cmd_mark_chat_turn_failed_v1(
  'a0000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000003',
  'a6000000-0000-0000-0000-000000000003',
  'failed_final','test-stop-generated');" >/dev/null

# Exact renderer provenance and grounding refs: another turn's AI log and a dangling
# grounding ref are both denied before GENERATED persistence.
receive_turn \
  'a4000000-0000-0000-0000-000000000004' \
  'a5000000-0000-0000-0000-000000000004' \
  'provenance-turn' \
  'sha256:v1:provenance-request' \
  'sha256:v1:provenance-user' \
  'provenance-question'
"${PSQL[@]}" -q <<'SQL' >/dev/null
select * from public.cmd_allocate_chat_turn_attempt_v1(
  'a0000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000004',
  'a6000000-0000-0000-0000-000000000004',
  'planner-v1'
);
select public.cmd_mark_chat_turn_context_ready_v1(
  'a0000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000004',
  'a6000000-0000-0000-0000-000000000004'
);
insert into public.ai_execution_logs(
  id, subject_id, turn_id, turn_attempt_id, stage, provider, model,
  prompt_version, content_release_id, content_bundle_id, character_id,
  output_ref_jsonb, status, created_at
) values (
  'a7000000-0000-0000-0000-000000000006',
  'a0000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000004',
  'a6000000-0000-0000-0000-000000000004',
  'renderer', 'test-provider', 'test-model', 'renderer-prompt-v1',
  'a2000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'chat-commit-char',
  jsonb_build_object('generatedContentHash','sha256:v1:provenance-answer'),
  'success', now()
);
SQL

expect_failure \
  'renderer execution from another turn/attempt is denied' \
  'cmd_chat_generate_ai_provenance_conflict' \
  "select public.cmd_mark_chat_turn_generated_v1(
    'a0000000-0000-0000-0000-000000000001',
    'a4000000-0000-0000-0000-000000000004',
    'a6000000-0000-0000-0000-000000000004',
    'a7000000-0000-0000-0000-000000000005',
    'renderer-v1','a3100000-0000-0000-0000-000000000001',
    'answer',null,'character-dialogue-v1','sha256:v1:provenance-answer','[]'::jsonb);"

expect_failure \
  'dangling grounding ref is denied' \
  'cmd_chat_generate_grounding_provenance_conflict' \
  "select public.cmd_mark_chat_turn_generated_v1(
    'a0000000-0000-0000-0000-000000000001',
    'a4000000-0000-0000-0000-000000000004',
    'a6000000-0000-0000-0000-000000000004',
    'a7000000-0000-0000-0000-000000000006',
    'renderer-v1','a3100000-0000-0000-0000-000000000001',
    'answer',null,'character-dialogue-v1','sha256:v1:provenance-answer',
    '[\"af000000-0000-0000-0000-000000000001\"]'::jsonb);"
"${PSQL[@]}" -q -c "select public.cmd_mark_chat_turn_failed_v1(
  'a0000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000004',
  'a6000000-0000-0000-0000-000000000004',
  'failed_final','test-stop-provenance');" >/dev/null

echo "PASS exact attempt/renderer/grounding provenance is fail-closed"

# Half-commit rollback: force the outbox insert to fail after assistant-message
# insertion. All prior mutations in cmd_commit_chat_turn_v1 must roll back.
prepare_generated_turn \
  'a4000000-0000-0000-0000-000000000005' \
  'a5000000-0000-0000-0000-000000000005' \
  'a6000000-0000-0000-0000-000000000005' \
  'a7000000-0000-0000-0000-000000000007' \
  'half-commit-turn' \
  'sha256:v1:half-commit-answer' \
  'rollback me'
validate_turn \
  'a4000000-0000-0000-0000-000000000005' \
  'a6000000-0000-0000-0000-000000000005' \
  'a7000000-0000-0000-0000-000000000008' \
  'sha256:v1:half-commit-answer' \
  'success' \
  'true' \
  'failed_final'

"${PSQL[@]}" <<'SQL'
insert into public.outbox_events(
  id, aggregate_type, aggregate_id, event_type, event_schema_version,
  dedupe_key, payload_jsonb, status, attempt_count, available_at, created_at
) values (
  'a9000000-0000-0000-0000-000000000005',
  'test', 'collision', 'TEST', 'v1', 'collision', '{}'::jsonb,
  'pending', 0, now(), now()
);
SQL

before_half_seq="$("${PSQL[@]}" -Atqc "select next_sequence_no from public.conversation_threads where id='a3000000-0000-0000-0000-000000000001'")"
expect_failure \
  'outbox failure rolls back assistant message and turn commit' \
  'duplicate key value violates unique constraint' \
  "select * from public.cmd_commit_chat_turn_v1(
    'a0000000-0000-0000-0000-000000000001',
    'a3000000-0000-0000-0000-000000000001',
    'a4000000-0000-0000-0000-000000000005',
    'a6000000-0000-0000-0000-000000000005',
    'a8000000-0000-0000-0000-000000000005',
    'a9000000-0000-0000-0000-000000000005',
    null,
    jsonb_build_object(
      'id','ac000000-0000-0000-0000-000000000005',
      'eventType','ROLLBACK_TEST','eventSchemaVersion','v1',
      'eventDedupeKey','rollback-world','payload',jsonb_build_object('x',1)
    ),
    null);"
after_half_seq="$("${PSQL[@]}" -Atqc "select next_sequence_no from public.conversation_threads where id='a3000000-0000-0000-0000-000000000001'")"
half_shape="$("${PSQL[@]}" -At -F '|' -c "select
  (select state from public.chat_turns where id='a4000000-0000-0000-0000-000000000005'),
  (select state from public.chat_turn_attempts where id='a6000000-0000-0000-0000-000000000005'),
  (select count(*) from public.conversation_messages where turn_id='a4000000-0000-0000-0000-000000000005' and sender_type='character'),
  (select count(*) from public.world_events where id='ac000000-0000-0000-0000-000000000005');")"
if [[ "${before_half_seq}" != "${after_half_seq}" || "${half_shape}" != 'validated|validated|0|0' ]]; then
  echo "FAIL half-commit rollback: before=${before_half_seq} after=${after_half_seq} shape=${half_shape}" >&2
  exit 30
fi
echo "PASS outbox/domain failure leaves no half-commit (message/turn/world/sequence all rolled back)"
"${PSQL[@]}" -q -c "select public.cmd_mark_chat_turn_failed_v1(
  'a0000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000005',
  'a6000000-0000-0000-0000-000000000005',
  'failed_final','test-stop-half');" >/dev/null

# Two commit workers race on the same validated turn. Session B must block on the
# thread/turn locks, then replay Session A's authoritative committed message.
prepare_generated_turn \
  'a4000000-0000-0000-0000-000000000006' \
  'a5000000-0000-0000-0000-000000000006' \
  'a6000000-0000-0000-0000-000000000006' \
  'a7000000-0000-0000-0000-000000000009' \
  'commit-race-turn' \
  'sha256:v1:commit-race-answer' \
  'one authoritative answer'
validate_turn \
  'a4000000-0000-0000-0000-000000000006' \
  'a6000000-0000-0000-0000-000000000006' \
  'a7000000-0000-0000-0000-000000000010' \
  'sha256:v1:commit-race-answer' \
  'success' \
  'true' \
  'failed_final'

before_race_seq="$("${PSQL[@]}" -Atqc "select next_sequence_no from public.conversation_threads where id='a3000000-0000-0000-0000-000000000001'")"
(
  "${PSQL[@]}" <<'SQL'
begin;
select * from public.cmd_commit_chat_turn_v1(
  'a0000000-0000-0000-0000-000000000001',
  'a3000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000006',
  'a6000000-0000-0000-0000-000000000006',
  'a8000000-0000-0000-0000-000000000006',
  'a9000000-0000-0000-0000-000000000006',
  null, null, null
);
select pg_sleep(1.5);
commit;
SQL
) >/tmp/myeongha-chat-commit-a.log 2>&1 &
commit_first_pid=$!

sleep 0.25
commit_second="$("${PSQL[@]}" -At -F '|' -c "select turn_id,attempt_id,message_id,sequence_no,replayed from public.cmd_commit_chat_turn_v1(
  'a0000000-0000-0000-0000-000000000001',
  'a3000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000006',
  'a6000000-0000-0000-0000-000000000006',
  'a8000000-0000-0000-0000-000000000060',
  'a9000000-0000-0000-0000-000000000060',
  null,null,null
);")"
wait "${commit_first_pid}"

if [[ "${commit_second}" != *'|a8000000-0000-0000-0000-000000000006|'*'|t' ]]; then
  echo "FAIL concurrent commit replay: ${commit_second}" >&2
  cat /tmp/myeongha-chat-commit-a.log >&2 || true
  exit 31
fi

after_race_seq="$("${PSQL[@]}" -Atqc "select next_sequence_no from public.conversation_threads where id='a3000000-0000-0000-0000-000000000001'")"
race_char_count="$("${PSQL[@]}" -Atqc "select count(*) from public.conversation_messages where turn_id='a4000000-0000-0000-0000-000000000006' and sender_type='character'")"
race_outbox_count="$("${PSQL[@]}" -Atqc "select count(*) from public.outbox_events where aggregate_type='chat_turn' and aggregate_id='a4000000-0000-0000-0000-000000000006'")"
if [[ "${after_race_seq}" -ne $((before_race_seq + 1)) || "${race_char_count}" != '1' || "${race_outbox_count}" != '1' ]]; then
  echo "FAIL concurrent commit atomicity: before=${before_race_seq} after=${after_race_seq} messages=${race_char_count} outbox=${race_outbox_count}" >&2
  exit 32
fi
echo "PASS two commit workers -> one commit, one assistant sequence, one outbox; loser replays authoritative message"

expect_failure \
  'committed turn cannot allocate a regeneration attempt' \
  'cmd_chat_attempt_turn_terminal' \
  "select * from public.cmd_allocate_chat_turn_attempt_v1(
    'a0000000-0000-0000-0000-000000000001',
    'a4000000-0000-0000-0000-000000000006',
    'a6000000-0000-0000-0000-000000000060',
    'planner-v1');"

echo "PASS COMMITTED turn regeneration is denied"
echo "chat attempt/generate/validate/commit persistence tests passed"
