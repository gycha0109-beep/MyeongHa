\set ON_ERROR_STOP on

create or replace function pg_temp.assert_fails(
  label text,
  statement text,
  expected_fragment text
) returns void
language plpgsql
as $$
declare
  actual_message text;
begin
  begin
    execute statement;
  exception when others then
    actual_message := sqlerrm;
    if position(expected_fragment in actual_message) > 0 then
      raise notice 'PASS % -> %', label, expected_fragment;
      return;
    end if;
    raise exception 'FAIL %: wrong error: %', label, actual_message;
  end;
  raise exception 'FAIL %: statement unexpectedly succeeded', label;
end;
$$;

-- Supabase auth fixture users.
insert into auth.users(id) values
  ('00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000102');

-- Owner authority fixtures.
insert into public.subjects(id, kind, auth_user_id, status, created_at, updated_at)
values
  ('10000000-0000-0000-0000-000000000001', 'guest', null, 'active', now(), now()),
  ('10000000-0000-0000-0000-000000000002', 'member', '00000000-0000-0000-0000-000000000102', 'active', now(), now());

select pg_temp.assert_fails(
  'guest cannot carry auth identity',
  $$insert into public.subjects(id, kind, auth_user_id, status, created_at, updated_at)
    values ('10000000-0000-0000-0000-000000000003', 'guest', '00000000-0000-0000-0000-000000000101', 'active', now(), now())$$,
  'subjects_guest_has_no_auth_check'
);

select pg_temp.assert_fails(
  'active member requires auth identity',
  $$insert into public.subjects(id, kind, status, created_at, updated_at)
    values ('10000000-0000-0000-0000-000000000004', 'member', 'active', now(), now())$$,
  'subjects_active_member_has_auth_check'
);

select pg_temp.assert_fails(
  'subject cannot merge into itself',
  $$insert into public.subjects(id, kind, status, merged_into_subject_id, created_at, updated_at)
    values ('10000000-0000-0000-0000-000000000005', 'guest', 'merged', '10000000-0000-0000-0000-000000000005', now(), now())$$,
  'subjects_no_self_merge_check'
);

insert into public.guest_sessions(id, subject_id, token_hash, expires_at, created_at)
values (
  '11000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'hmac:v1:guest-token-1',
  now() + interval '1 day',
  now()
);

select pg_temp.assert_fails(
  'one guest session per guest subject',
  $$insert into public.guest_sessions(id, subject_id, token_hash, expires_at, created_at)
    values ('11000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'hmac:v1:guest-token-2', now() + interval '1 day', now())$$,
  'guest_sessions_subject_unique'
);

-- Immutable content/runtime fixtures.
insert into public.content_bundles(
  id, content_version, content_hash, artifact_ref, artifact_schema_version,
  min_client_capability, asset_manifest_hash, cue_schema_version,
  manifest_jsonb, published_at
) values
  ('20000000-0000-0000-0000-000000000001', '0.0.1-test', 'sha256:bundle-1', 'registry://bundle-1', 'bundle-v1', '0.0.1-test', 'sha256:assets-1', 'cue-v1', '{}'::jsonb, now()),
  ('20000000-0000-0000-0000-000000000002', '0.0.2-test', 'sha256:bundle-2', 'registry://bundle-2', 'bundle-v1', '0.0.1-test', 'sha256:assets-2', 'cue-v1', '{}'::jsonb, now());

insert into public.content_releases(
  id, release_key, content_bundle_id, status, is_default,
  rollout_policy_version, rollout_seed, activated_at, created_at
) values
  ('21000000-0000-0000-0000-000000000001', 'release-1', '20000000-0000-0000-0000-000000000001', 'active', true, 'rollout-v1', 'seed-1', now(), now()),
  ('21000000-0000-0000-0000-000000000002', 'release-2', '20000000-0000-0000-0000-000000000002', 'active', false, 'rollout-v1', 'seed-2', now(), now());

select pg_temp.assert_fails(
  'only one active default release',
  $$insert into public.content_releases(id, release_key, content_bundle_id, status, is_default, rollout_policy_version, rollout_seed, activated_at, created_at)
    values ('21000000-0000-0000-0000-000000000003', 'release-3', '20000000-0000-0000-0000-000000000002', 'active', true, 'rollout-v1', 'seed-3', now(), now())$$,
  'content_releases_one_active_default_idx'
);

insert into public.characters(character_id, created_at)
values ('john-doe-01', now()), ('john-doe-02', now());

insert into public.character_runtime_catalog(
  character_id, content_bundle_id, availability, enabled, published_at
) values
  ('john-doe-01', '20000000-0000-0000-0000-000000000001', 'available', true, now()),
  ('john-doe-02', '20000000-0000-0000-0000-000000000002', 'available', true, now());

select pg_temp.assert_fails(
  'runtime availability is bounded',
  $$insert into public.character_runtime_catalog(character_id, content_bundle_id, availability, enabled, published_at)
    values ('john-doe-01', '20000000-0000-0000-0000-000000000002', 'invented-state', true, now())$$,
  'character_runtime_availability_check'
);

insert into public.saju_domain_runtime(
  saju_domain, availability, capability_version, updated_at
) values ('general', 'available', 'test-v1', now());

insert into public.character_capabilities(
  id, content_bundle_id, character_id, saju_domain, role, can_initiate, capability_version
) values (
  '22000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'john-doe-01', 'general', 'primary', true, 'test-v1'
);

select pg_temp.assert_fails(
  'character capability cannot cross bundle membership',
  $$insert into public.character_capabilities(id, content_bundle_id, character_id, saju_domain, role, can_initiate, capability_version)
    values ('22000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'john-doe-02', 'general', 'primary', true, 'test-v1')$$,
  'character_capabilities_character_bundle_fk'
);

-- Conversation fixtures.
insert into public.conversation_threads(
  id, subject_id, thread_type, status, active_content_release_id,
  active_content_bundle_id, created_at, updated_at
) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'single_character', 'active', '21000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', now(), now()),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'system', 'active', null, null, now(), now());

select pg_temp.assert_fails(
  'thread release and bundle must be coherent',
  $$insert into public.conversation_threads(id, subject_id, thread_type, status, active_content_release_id, active_content_bundle_id, created_at, updated_at)
    values ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'single_character', 'active', '21000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', now(), now())$$,
  'conversation_threads_release_bundle_fk'
);

insert into public.conversation_thread_characters(
  id, thread_id, character_id, content_bundle_id, role, joined_at
) values (
  '31000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'john-doe-01',
  '20000000-0000-0000-0000-000000000001',
  'primary',
  now()
);

select pg_temp.assert_fails(
  'one active primary character per thread',
  $$insert into public.conversation_thread_characters(id, thread_id, character_id, content_bundle_id, role, joined_at)
    values ('31000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'john-doe-01', '20000000-0000-0000-0000-000000000001', 'primary', now())$$,
  'conversation_thread_characters_one_active_character_idx'
);

insert into public.chat_turns(
  id, thread_id, subject_id, client_turn_id, request_hash,
  request_contract_version, request_snapshot_jsonb,
  resolved_content_release_id, resolved_content_bundle_id,
  state, created_at, updated_at
) values (
  '32000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'client-turn-1', 'hmac:v1:request-1', 'chat-v1', '{}'::jsonb,
  '21000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'received', now(), now()
);

select pg_temp.assert_fails(
  'cross-subject thread injection is blocked',
  $$insert into public.chat_turns(id, thread_id, subject_id, client_turn_id, request_hash, request_contract_version, request_snapshot_jsonb, state, created_at, updated_at)
    values ('32000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'cross-owner', 'hmac:v1:cross-owner', 'chat-v1', '{}'::jsonb, 'failed_final', now(), now())$$,
  'chat_turns_thread_subject_fk'
);

select pg_temp.assert_fails(
  'one in-flight turn per thread',
  $$insert into public.chat_turns(id, thread_id, subject_id, client_turn_id, request_hash, request_contract_version, request_snapshot_jsonb, resolved_content_release_id, resolved_content_bundle_id, state, created_at, updated_at)
    values ('32000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'client-turn-2', 'hmac:v1:request-2', 'chat-v1', '{}'::jsonb, '21000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'received', now(), now())$$,
  'chat_turns_one_in_flight_per_thread_idx'
);

select pg_temp.assert_fails(
  'committed turn requires committed attempt provenance',
  $$insert into public.chat_turns(id, thread_id, subject_id, client_turn_id, request_hash, request_contract_version, request_snapshot_jsonb, state, committed_at, created_at, updated_at)
    values ('32000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'client-turn-committed', 'hmac:v1:committed', 'chat-v1', '{}'::jsonb, 'committed', now(), now(), now())$$,
  'chat_turns_commit_shape_check'
);

select pg_temp.assert_fails(
  'terminal attempt requires finished_at',
  $$insert into public.chat_turn_attempts(id, turn_id, subject_id, attempt_no, state, started_at)
    values ('33000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 1, 'failed_retryable', now())$$,
  'chat_turn_attempts_finished_check'
);

insert into public.conversation_messages(
  id, thread_id, subject_id, turn_id, sequence_no, sender_type,
  body_text, content_hash, created_at
) values (
  '34000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '32000000-0000-0000-0000-000000000001',
  1, 'user', 'hello', 'hmac:v1:message-1', now()
);

select pg_temp.assert_fails(
  'one authoritative user message per turn',
  $$insert into public.conversation_messages(id, thread_id, subject_id, turn_id, sequence_no, sender_type, body_text, content_hash, created_at)
    values ('34000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001', 2, 'user', 'duplicate user message', 'hmac:v1:message-2', now())$$,
  'conversation_messages_one_user_per_turn_idx'
);

select pg_temp.assert_fails(
  'message turn cannot cross thread or owner',
  $$insert into public.conversation_messages(id, thread_id, subject_id, turn_id, sequence_no, sender_type, body_text, content_hash, created_at)
    values ('34000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '32000000-0000-0000-0000-000000000001', 1, 'user', 'cross thread', 'hmac:v1:message-3', now())$$,
  'conversation_messages_turn_thread_subject_fk'
);

select pg_temp.assert_fails(
  'character message cannot inject a different bundle than its participation',
  $$insert into public.conversation_messages(id, thread_id, subject_id, turn_id, sequence_no, sender_type, thread_character_id, character_content_bundle_id, body_text, content_hash, created_at)
    values ('34000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001', 2, 'character', '31000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'wrong bundle', 'hmac:v1:message-4', now())$$,
  'conversation_messages_participation_bundle_fk'
);

select pg_temp.assert_fails(
  'duplicate thread sequence is blocked',
  $$insert into public.conversation_messages(id, thread_id, subject_id, sequence_no, sender_type, body_text, content_hash, created_at)
    values ('34000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 1, 'system', 'duplicate sequence', 'hmac:v1:message-5', now())$$,
  'conversation_messages_thread_sequence_unique'
);

-- Positive circular provenance path: attempt exists before committed pointer is set.
insert into public.chat_turn_attempts(
  id, turn_id, subject_id, attempt_no, state, started_at, finished_at
) values (
  '33000000-0000-0000-0000-000000000002',
  '32000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  1, 'committed', now(), now()
);

update public.chat_turns
set state = 'committed',
    committed_attempt_id = '33000000-0000-0000-0000-000000000002',
    committed_at = now(),
    updated_at = now()
where id = '32000000-0000-0000-0000-000000000001';

-- The DDL draft currently covers M01 + M02 core + M04 core only.
do $$
declare
  table_count integer;
begin
  select count(*) into table_count
  from information_schema.tables
  where table_schema = 'public'
    and table_name in (
      'subjects', 'profiles', 'guest_sessions',
      'content_bundles', 'content_releases', 'characters', 'saju_domains',
      'saju_domain_runtime', 'character_runtime_catalog', 'character_capabilities',
      'character_relations', 'conversation_threads', 'conversation_thread_characters',
      'conversation_thread_content_transitions', 'chat_turns', 'chat_turn_attempts',
      'conversation_messages'
    );
  if table_count <> 17 then
    raise exception 'FAIL expected 17 authority-core tables, found %', table_count;
  end if;
end;
$$;

select 'authority core negative tests passed' as result;
