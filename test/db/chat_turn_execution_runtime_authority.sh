#!/usr/bin/env bash
set -euo pipefail

PSQL=(psql -X -q -v ON_ERROR_STOP=1)
fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }

query() { "${PSQL[@]}" -Atc "$1"; }

expect_failure_stdin() {
  local expected="$1"
  local tmp
  tmp="$(mktemp)"
  if "${PSQL[@]}" >"$tmp" 2>&1; then
    cat "$tmp" >&2
    rm -f "$tmp"
    fail "expected SQL failure containing: $expected"
  fi
  if ! grep -Fq "$expected" "$tmp"; then
    cat "$tmp" >&2
    rm -f "$tmp"
    fail "SQL failed unexpectedly; wanted: $expected"
  fi
  rm -f "$tmp"
}

for signature in \
  "public.cmd_allocate_chat_turn_attempt_runtime_v1(uuid,uuid,uuid,text)" \
  "public.cmd_mark_chat_turn_context_ready_runtime_v1(uuid,uuid,uuid)" \
  "public.cmd_mark_chat_turn_failed_runtime_v1(uuid,uuid,uuid,text,text)" \
  "public.cmd_record_chat_success_ai_execution_runtime_v1(uuid,uuid,uuid,uuid,text,text,text,text,text,jsonb,jsonb,uuid,jsonb)" \
  "public.cmd_mark_chat_turn_generated_runtime_v1(uuid,uuid,uuid,uuid,text,text,text,jsonb,text,text,jsonb)" \
  "public.cmd_validate_chat_turn_attempt_runtime_v1(uuid,uuid,uuid,uuid,text,jsonb)" \
  "public.cmd_commit_chat_turn_runtime_v1(uuid,uuid,uuid,uuid,uuid,uuid)" \
  "public.qry_committed_chat_turn_runtime_v1(uuid,uuid)"
do
  [[ "$(query "select has_function_privilege('myeongha_api_executor','${signature}','EXECUTE')::int;")" == '1' ]] \
    || fail "API executor lacks ${signature}"
done

for privilege in \
  "public.chat_turns|UPDATE" \
  "public.chat_turn_attempts|INSERT" \
  "public.chat_turn_attempts|UPDATE" \
  "public.ai_execution_logs|INSERT" \
  "public.ai_execution_groundings|INSERT" \
  "public.conversation_messages|INSERT" \
  "public.outbox_events|INSERT"
do
  table="${privilege%%|*}"
  action="${privilege##*|}"
  [[ "$(query "select has_table_privilege('myeongha_api_executor','${table}','${action}')::int;")" == '0' ]] \
    || fail "API executor unexpectedly has direct ${action} on ${table}"
done
pass "API executor is wrapper-only for Production Character turn writes"

"${PSQL[@]}" <<'SQL' >/dev/null
insert into auth.users(id)
values ('13080000-0000-0000-0000-000000000001')
on conflict do nothing;

insert into public.subjects(id, kind, auth_user_id, status, created_at, updated_at)
values (
  '13080000-0000-0000-0000-000000000011',
  'member',
  '13080000-0000-0000-0000-000000000001',
  'active', now(), now()
);

insert into public.subjects(id, kind, status, created_at, updated_at)
values (
  '13080000-0000-0000-0000-000000000012',
  'guest', 'active', now(), now()
);

insert into public.content_bundles(
  id, content_version, content_hash, artifact_ref, artifact_schema_version,
  min_client_capability, asset_manifest_hash, cue_schema_version,
  manifest_jsonb, published_at
) values (
  '13080000-0000-0000-0000-000000000021',
  'chat-production-runtime-v1',
  'sha256:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'test://chat-production-runtime-v1',
  'content-artifact-v1',
  '0.0.1-dev',
  'sha256:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  'cue-v1',
  '{}'::jsonb,
  now()
);

insert into public.content_releases(
  id, release_key, content_bundle_id, status, is_default,
  rollout_policy_version, rollout_seed, activated_at, created_at
) values (
  '13080000-0000-0000-0000-000000000022',
  'chat-production-runtime-release-v1',
  '13080000-0000-0000-0000-000000000021',
  'active', false, 'test-rollout-v1',
  'chat-production-runtime-seed', now(), now()
);

insert into public.characters(character_id, created_at)
values ('seyeon-runtime-test', now());

insert into public.character_runtime_catalog(
  character_id, content_bundle_id, availability, enabled, published_at
) values (
  'seyeon-runtime-test',
  '13080000-0000-0000-0000-000000000021',
  'available', true, now()
);

insert into public.conversation_threads(
  id, subject_id, thread_type, status, title,
  active_content_release_id, active_content_bundle_id,
  content_revision, next_sequence_no, created_at, updated_at
) values (
  '13080000-0000-0000-0000-000000000031',
  '13080000-0000-0000-0000-000000000011',
  'single_character', 'active', 'production-turn-runtime-test',
  '13080000-0000-0000-0000-000000000022',
  '13080000-0000-0000-0000-000000000021',
  0, 2, now(), now()
);

insert into public.conversation_thread_characters(
  id, thread_id, character_id, content_bundle_id, role, joined_at
) values (
  '13080000-0000-0000-0000-000000000032',
  '13080000-0000-0000-0000-000000000031',
  'seyeon-runtime-test',
  '13080000-0000-0000-0000-000000000021',
  'primary', now() - interval '1 minute'
);

insert into public.user_character_states(
  id, subject_id, character_id, closeness, trust, friction,
  relationship_stage, policy_version, revision, created_at, updated_at
) values (
  '13080000-0000-0000-0000-000000000033',
  '13080000-0000-0000-0000-000000000011',
  'seyeon-runtime-test',
  10, 20, 3, 'visitor', 'relationship-policy-v1', 0, now(), now()
);

insert into public.chat_turns(
  id, thread_id, subject_id, client_turn_id, request_hash,
  request_contract_version, request_snapshot_jsonb,
  resolved_content_release_id, resolved_content_bundle_id,
  state, revision, next_attempt_no, created_at, updated_at
) values (
  '13080000-0000-0000-0000-000000000041',
  '13080000-0000-0000-0000-000000000031',
  '13080000-0000-0000-0000-000000000011',
  'runtime-turn-1',
  'sha256:v1:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
  'chat-request-v1',
  '{"clientTurnId":"runtime-turn-1","text":"생일이 언제예요?","clientCapability":"test"}'::jsonb,
  '13080000-0000-0000-0000-000000000022',
  '13080000-0000-0000-0000-000000000021',
  'received', 0, 1, now(), now()
);

insert into public.conversation_messages(
  id, thread_id, subject_id, turn_id, sequence_no,
  sender_type, body_text, content_hash, created_at
) values (
  '13080000-0000-0000-0000-000000000042',
  '13080000-0000-0000-0000-000000000031',
  '13080000-0000-0000-0000-000000000011',
  '13080000-0000-0000-0000-000000000041',
  1, 'user', '생일이 언제예요?',
  'sha256:v1:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
  now()
);
SQL

expect_failure_stdin "subject execution context mismatch" <<'SQL'
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','13080000-0000-0000-0000-000000000012',true);
select * from public.cmd_allocate_chat_turn_attempt_runtime_v1(
  '13080000-0000-0000-0000-000000000011',
  '13080000-0000-0000-0000-000000000041',
  '13080000-0000-0000-0000-000000000051',
  'planner-v1'
);
commit;
SQL
pass "runtime wrapper rejects mismatched canonical Subject"

expect_failure_stdin "permission denied for table chat_turn_attempts" <<'SQL'
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','13080000-0000-0000-0000-000000000011',true);
insert into public.chat_turn_attempts(
  id, turn_id, subject_id, attempt_no, state, started_at
) values (
  '13080000-0000-0000-0000-000000000099',
  '13080000-0000-0000-0000-000000000041',
  '13080000-0000-0000-0000-000000000011',
  99, 'running', now()
);
commit;
SQL
pass "runtime executor cannot bypass wrapper with direct Chat DML"

envelope='{"schemaVersion":"v1","framingBefore":"제 생일은 3월 18일이에요.","protectedSajuSegments":[],"protectedSajuDisclosures":[],"calculationAmbiguity":[],"framingAfter":null,"emotion":"neutral","animationCue":"idle","memoryProposals":[],"relationshipEventProposals":[],"suggestedActions":[]}'
hash="$(printf '%s' "$envelope" | sha256sum | awk '{print $1}')"
content_hash="sha256:v1:${hash}"

"${PSQL[@]}" <<SQL >/tmp/chat-runtime-result.out
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','13080000-0000-0000-0000-000000000011',true);

select attempt_id::text, attempt_no, replayed
from public.cmd_allocate_chat_turn_attempt_runtime_v1(
  '13080000-0000-0000-0000-000000000011',
  '13080000-0000-0000-0000-000000000041',
  '13080000-0000-0000-0000-000000000051',
  'planner-v1'
);

select public.cmd_mark_chat_turn_context_ready_runtime_v1(
  '13080000-0000-0000-0000-000000000011',
  '13080000-0000-0000-0000-000000000041',
  '13080000-0000-0000-0000-000000000051'
);

select public.cmd_record_chat_success_ai_execution_runtime_v1(
  '13080000-0000-0000-0000-000000000011',
  '13080000-0000-0000-0000-000000000061',
  '13080000-0000-0000-0000-000000000041',
  '13080000-0000-0000-0000-000000000051',
  'renderer','provider-test','model-test','renderer-prompt-v1',
  'seyeon-runtime-test',
  '{"schemaVersion":"v1","source":"server-admitted-character-runtime"}'::jsonb,
  jsonb_build_object('generatedContentHash','${content_hash}'),
  '13080000-0000-0000-0000-000000000081'::uuid,
  '[]'::jsonb
);

select public.cmd_mark_chat_turn_generated_runtime_v1(
  '13080000-0000-0000-0000-000000000011',
  '13080000-0000-0000-0000-000000000041',
  '13080000-0000-0000-0000-000000000051',
  '13080000-0000-0000-0000-000000000061',
  'renderer-runtime-v1','seyeon-runtime-test',null,
  '${envelope}'::jsonb,
  'character-dialogue-v1',
  '${content_hash}',
  '[]'::jsonb
);

select public.cmd_record_chat_success_ai_execution_runtime_v1(
  '13080000-0000-0000-0000-000000000011',
  '13080000-0000-0000-0000-000000000062',
  '13080000-0000-0000-0000-000000000041',
  '13080000-0000-0000-0000-000000000051',
  'output_guard','myeongha-server','myeongha-character-output-guard-v1','output-guard-prompt-v1',
  'seyeon-runtime-test',
  jsonb_build_object('schemaVersion','v1','generatedContentHash','${content_hash}'),
  jsonb_build_object('generatedContentHash','${content_hash}'),
  '13080000-0000-0000-0000-000000000081'::uuid,
  '[]'::jsonb
);

select public.cmd_validate_chat_turn_attempt_runtime_v1(
  '13080000-0000-0000-0000-000000000011',
  '13080000-0000-0000-0000-000000000041',
  '13080000-0000-0000-0000-000000000051',
  '13080000-0000-0000-0000-000000000062',
  'myeongha-character-output-guard-v1',
  jsonb_build_object('schemaVersion','v1','passed',true,'generatedContentHash','${content_hash}')
);

select turn_id::text, attempt_id::text, message_id::text, sequence_no, replayed
from public.cmd_commit_chat_turn_runtime_v1(
  '13080000-0000-0000-0000-000000000011',
  '13080000-0000-0000-0000-000000000031',
  '13080000-0000-0000-0000-000000000041',
  '13080000-0000-0000-0000-000000000051',
  '13080000-0000-0000-0000-000000000071',
  '13080000-0000-0000-0000-000000000072'
);

select provider||'|'||model||'|'||coalesce(body_text,'NULL')||'|'||
       message_schema_version||'|'||(message_payload_jsonb = '${envelope}'::jsonb)::int
from public.qry_committed_chat_turn_runtime_v1(
  '13080000-0000-0000-0000-000000000011',
  '13080000-0000-0000-0000-000000000041'
);
commit;
SQL

runtime_result="$(grep 'provider-test|model-test' /tmp/chat-runtime-result.out | tail -n1 || true)"
rm -f /tmp/chat-runtime-result.out
[[ "$runtime_result" == 'provider-test|model-test|NULL|character-dialogue-v1|1' ]] \
  || fail "committed runtime payload mismatch: $runtime_result"

shape="$(query "
select
  (select state from public.chat_turns where id='13080000-0000-0000-0000-000000000041')||'|'||
  (select state from public.chat_turn_attempts where id='13080000-0000-0000-0000-000000000051')||'|'||
  (select count(*) from public.conversation_messages where turn_id='13080000-0000-0000-0000-000000000041' and sender_type='character')||'|'||
  (select count(*) from public.relationship_events where source_turn_id='13080000-0000-0000-0000-000000000041')||'|'||
  (select count(*) from public.world_events where source_turn_id='13080000-0000-0000-0000-000000000041')||'|'||
  (select count(*) from public.memory_items where source_turn_id='13080000-0000-0000-0000-000000000041')||'|'||
  (select count(*) from public.outbox_events where aggregate_type='chat_turn' and aggregate_id='13080000-0000-0000-0000-000000000041');
")"
[[ "$shape" == 'committed|committed|1|0|0|0|1' ]] \
  || fail "Production Chat runtime side-effect boundary mismatch: $shape"
pass "Production Chat runtime commits one guarded Character message and no unresolved side effects"

echo "Production Character turn runtime authority tests passed"
