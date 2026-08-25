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
  actual_constraint text;
begin
  begin
    execute statement;
  exception when others then
    get stacked diagnostics
      actual_message = message_text,
      actual_constraint = constraint_name;
    if position(expected_fragment in coalesce(actual_message, '')) > 0
       or position(expected_fragment in coalesce(actual_constraint, '')) > 0 then
      raise notice 'PASS % -> %', label, expected_fragment;
      return;
    end if;
    raise exception 'FAIL %: wrong error: % / constraint=%', label, actual_message, actual_constraint;
  end;
  raise exception 'FAIL %: statement unexpectedly succeeded', label;
end;
$$;

set constraints all immediate;

insert into auth.users(id) values
  ('00000000-0000-0000-0000-000000000301'),
  ('00000000-0000-0000-0000-000000000302')
on conflict do nothing;

insert into public.subjects(id, kind, auth_user_id, status, created_at, updated_at)
values
  ('50000000-0000-0000-0000-000000000001', 'member', '00000000-0000-0000-0000-000000000301', 'active', now(), now()),
  ('50000000-0000-0000-0000-000000000002', 'member', '00000000-0000-0000-0000-000000000302', 'active', now(), now());

insert into public.content_bundles(
  id, content_version, content_hash, artifact_ref, artifact_schema_version,
  min_client_capability, asset_manifest_hash, cue_schema_version,
  manifest_jsonb, published_at
) values
  ('51000000-0000-0000-0000-000000000001', 'reading-test-v1', 'sha256:v1:reading-bundle-1', 'registry://reading-1', 'bundle-v1', '0.0.1-test', 'sha256:v1:reading-assets-1', 'cue-v1', '{}'::jsonb, now()),
  ('51000000-0000-0000-0000-000000000002', 'reading-test-v2', 'sha256:v1:reading-bundle-2', 'registry://reading-2', 'bundle-v1', '0.0.1-test', 'sha256:v1:reading-assets-2', 'cue-v1', '{}'::jsonb, now());

insert into public.content_releases(
  id, release_key, content_bundle_id, status, is_default,
  rollout_policy_version, rollout_seed, activated_at, created_at
) values
  ('51100000-0000-0000-0000-000000000001', 'reading-release-1', '51000000-0000-0000-0000-000000000001', 'active', false, 'rollout-v1', 'reading-seed-1', now(), now()),
  ('51100000-0000-0000-0000-000000000002', 'reading-release-2', '51000000-0000-0000-0000-000000000002', 'active', false, 'rollout-v1', 'reading-seed-2', now(), now());

insert into public.characters(character_id, created_at)
values ('reading-char-01', now()), ('reading-char-02', now());

insert into public.character_runtime_catalog(character_id, content_bundle_id, availability, enabled, published_at)
values
  ('reading-char-01', '51000000-0000-0000-0000-000000000001', 'available', true, now()),
  ('reading-char-01', '51000000-0000-0000-0000-000000000002', 'available', true, now()),
  ('reading-char-02', '51000000-0000-0000-0000-000000000001', 'available', true, now());

insert into public.saju_domain_runtime(saju_domain, availability, capability_version, required_engine_version, updated_at)
values
  ('career', 'available', 'career-cap-v1', 'saju-engine-v1', now()),
  ('compatibility', 'partial', 'compat-cap-v1', 'saju-engine-v1', now()),
  ('family', 'unavailable', 'family-cap-v1', null, now())
on conflict (saju_domain) do update set
  availability = excluded.availability,
  capability_version = excluded.capability_version,
  required_engine_version = excluded.required_engine_version,
  updated_at = excluded.updated_at;

insert into public.character_capabilities(
  id, content_bundle_id, character_id, saju_domain, role, can_initiate, capability_version
) values
  ('51200000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'reading-char-01', 'career', 'primary', true, 'career-cap-v1'),
  ('51200000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000001', 'reading-char-02', 'career', 'secondary', false, 'career-cap-v1'),
  ('51200000-0000-0000-0000-000000000003', '51000000-0000-0000-0000-000000000002', 'reading-char-01', 'career', 'primary', true, 'career-cap-v1');

insert into public.birth_profiles(id, subject_id, profile_kind, label, created_at, updated_at)
values
  ('52000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'self', 'self-a', now(), now()),
  ('52000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', 'target', 'target-a', now(), now()),
  ('52000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000002', 'self', 'self-b', now(), now());

insert into public.birth_profile_revisions(
  id, birth_profile_id, subject_id, revision_no, calendar_type,
  birth_date, birth_time, time_known, is_leap_month, sex, input_hash, created_at
) values
  ('52100000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 1, 'solar', '2000-01-01', '12:30', true, false, 'unspecified', 'hmac-sha256:k2:reading-birth-self-a', now()),
  ('52100000-0000-0000-0000-000000000002', '52000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', 1, 'solar', '2001-02-03', null, false, false, 'unspecified', 'hmac-sha256:k2:reading-birth-target-a', now()),
  ('52100000-0000-0000-0000-000000000003', '52000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000002', 1, 'solar', '1999-05-05', null, false, false, 'female', 'hmac-sha256:k2:reading-birth-self-b', now());

update public.birth_profiles set current_revision_id='52100000-0000-0000-0000-000000000001', updated_at=now()
where id='52000000-0000-0000-0000-000000000001';
update public.birth_profiles set current_revision_id='52100000-0000-0000-0000-000000000002', updated_at=now()
where id='52000000-0000-0000-0000-000000000002';
update public.birth_profiles set current_revision_id='52100000-0000-0000-0000-000000000003', updated_at=now()
where id='52000000-0000-0000-0000-000000000003';

insert into public.conversation_threads(
  id, subject_id, thread_type, status, active_content_release_id,
  active_content_bundle_id, created_at, updated_at
) values
  ('53000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'single_character', 'active', '51100000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', now(), now()),
  ('53000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000002', 'single_character', 'active', '51100000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', now(), now());

insert into public.conversation_thread_characters(id, thread_id, character_id, content_bundle_id, role, joined_at)
values
  ('53100000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000001', 'reading-char-01', '51000000-0000-0000-0000-000000000001', 'primary', now() - interval '1 minute'),
  ('53100000-0000-0000-0000-000000000002', '53000000-0000-0000-0000-000000000001', 'reading-char-02', '51000000-0000-0000-0000-000000000001', 'participant', now() - interval '1 minute'),
  ('53100000-0000-0000-0000-000000000003', '53000000-0000-0000-0000-000000000002', 'reading-char-01', '51000000-0000-0000-0000-000000000001', 'primary', now() - interval '1 minute');

insert into public.chat_turns(
  id, thread_id, subject_id, client_turn_id, request_hash, request_contract_version,
  request_snapshot_jsonb, resolved_content_release_id, resolved_content_bundle_id,
  state, created_at, updated_at
) values
  ('53200000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'reading-turn-1', 'hmac-sha256:k2:reading-turn-1', 'chat-v1', '{}'::jsonb, '51100000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'failed_final', now(), now()),
  ('53200000-0000-0000-0000-000000000002', '53000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000002', 'reading-turn-2', 'hmac-sha256:k2:reading-turn-2', 'chat-v1', '{}'::jsonb, '51100000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'failed_final', now(), now());

-- Reading session authority.
insert into public.reading_sessions(
  id, subject_id, saju_domain, domain_capability_version,
  source_birth_revision_id, state, created_at, updated_at
) values (
  '54000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001',
  'career', 'career-cap-v1', '52100000-0000-0000-0000-000000000001', 'active', now(), now()
);

select pg_temp.assert_fails(
  'reading session cannot use unavailable domain',
  $$insert into public.reading_sessions(id,subject_id,saju_domain,domain_capability_version,source_birth_revision_id,state,created_at,updated_at)
    values ('54000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001','family','family-cap-v1','52100000-0000-0000-0000-000000000001','active',now(),now())$$,
  'ct_reading_session_domain_available'
);

select pg_temp.assert_fails(
  'reading session capability version must match runtime authority',
  $$insert into public.reading_sessions(id,subject_id,saju_domain,domain_capability_version,source_birth_revision_id,state,created_at,updated_at)
    values ('54000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000001','career','career-cap-stale','52100000-0000-0000-0000-000000000001','active',now(),now())$$,
  'ct_reading_session_domain_capability_pin'
);

select pg_temp.assert_fails(
  'compatibility reading requires target profile revision',
  $$insert into public.reading_sessions(id,subject_id,saju_domain,domain_capability_version,source_birth_revision_id,state,created_at,updated_at)
    values ('54000000-0000-0000-0000-000000000004','50000000-0000-0000-0000-000000000001','compatibility','compat-cap-v1','52100000-0000-0000-0000-000000000001','active',now(),now())$$,
  'ct_reading_session_profile_cardinality'
);

select pg_temp.assert_fails(
  'non compatibility reading cannot pin a target revision',
  $$insert into public.reading_sessions(id,subject_id,saju_domain,domain_capability_version,source_birth_revision_id,target_birth_revision_id,state,created_at,updated_at)
    values ('54000000-0000-0000-0000-000000000005','50000000-0000-0000-0000-000000000001','career','career-cap-v1','52100000-0000-0000-0000-000000000001','52100000-0000-0000-0000-000000000002','active',now(),now())$$,
  'ct_reading_session_profile_cardinality'
);

select pg_temp.assert_fails(
  'reading session cannot pin another owner birth revision',
  $$insert into public.reading_sessions(id,subject_id,saju_domain,domain_capability_version,source_birth_revision_id,state,created_at,updated_at)
    values ('54000000-0000-0000-0000-000000000006','50000000-0000-0000-0000-000000000001','career','career-cap-v1','52100000-0000-0000-0000-000000000003','active',now(),now())$$,
  'reading_sessions_source_birth_subject_fk'
);

select pg_temp.assert_fails(
  'reading session pinned identity is immutable',
  $$update public.reading_sessions set saju_domain='family' where id='54000000-0000-0000-0000-000000000001'$$,
  'tr_reading_session_identity_immutable'
);

-- Logical reading / character authority.
insert into public.readings(
  id, reading_session_id, subject_id, saju_domain, attempt_no,
  source_turn_id, requested_thread_character_id, requested_character_id,
  requested_character_content_bundle_id, execution_status,
  request_idempotency_key, request_hash, request_contract_version,
  request_snapshot_jsonb, created_at
) values (
  '54100000-0000-0000-0000-000000000001', '54000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001', 'career', 1,
  '53200000-0000-0000-0000-000000000001', '53100000-0000-0000-0000-000000000001',
  'reading-char-01', '51000000-0000-0000-0000-000000000001', 'pending',
  'reading-idem-1', 'hmac-sha256:k2:reading-request-1', 'reading-request-v1', '{}'::jsonb, now()
);

update public.reading_sessions
set current_reading_id='54100000-0000-0000-0000-000000000001', next_attempt_no=2, updated_at=now()
where id='54000000-0000-0000-0000-000000000001';

select pg_temp.assert_fails(
  'character with can_initiate false cannot start reading',
  $$insert into public.readings(id,reading_session_id,subject_id,saju_domain,attempt_no,source_turn_id,requested_thread_character_id,requested_character_id,requested_character_content_bundle_id,execution_status,request_idempotency_key,request_hash,request_contract_version,request_snapshot_jsonb,created_at)
    values ('54100000-0000-0000-0000-000000000002','54000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','career',2,'53200000-0000-0000-0000-000000000001','53100000-0000-0000-0000-000000000002','reading-char-02','51000000-0000-0000-0000-000000000001','pending','reading-idem-disabled-char','hmac-sha256:k2:reading-disabled-char','reading-request-v1','{}',now())$$,
  'ct_reading_character_capability'
);

select pg_temp.assert_fails(
  'character triggered chat reading requires exact thread participation',
  $$insert into public.readings(id,reading_session_id,subject_id,saju_domain,attempt_no,source_turn_id,requested_character_id,requested_character_content_bundle_id,execution_status,request_idempotency_key,request_hash,request_contract_version,request_snapshot_jsonb,created_at)
    values ('54100000-0000-0000-0000-000000000003','54000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','career',2,'53200000-0000-0000-0000-000000000001','reading-char-01','51000000-0000-0000-0000-000000000001','pending','reading-idem-no-participant','hmac-sha256:k2:reading-no-participant','reading-request-v1','{}',now())$$,
  'ct_reading_character_participation'
);

select pg_temp.assert_fails(
  'reading participant must belong to the source turn thread',
  $$insert into public.readings(id,reading_session_id,subject_id,saju_domain,attempt_no,source_turn_id,requested_thread_character_id,requested_character_id,requested_character_content_bundle_id,execution_status,request_idempotency_key,request_hash,request_contract_version,request_snapshot_jsonb,created_at)
    values ('54100000-0000-0000-0000-000000000004','54000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','career',2,'53200000-0000-0000-0000-000000000001','53100000-0000-0000-0000-000000000003','reading-char-01','51000000-0000-0000-0000-000000000001','pending','reading-idem-wrong-participant','hmac-sha256:k2:reading-wrong-participant','reading-request-v1','{}',now())$$,
  'ct_reading_character_participation'
);

select pg_temp.assert_fails(
  'reading request cannot mutate immutable request snapshot',
  $$update public.readings set request_snapshot_jsonb='{"changed":true}'::jsonb where id='54100000-0000-0000-0000-000000000001'$$,
  'tr_reading_request_identity_immutable'
);

select pg_temp.assert_fails(
  'same subject reading idempotency key cannot duplicate logical request',
  $$insert into public.readings(id,reading_session_id,subject_id,saju_domain,attempt_no,parent_reading_id,execution_status,request_idempotency_key,request_hash,request_contract_version,request_snapshot_jsonb,created_at)
    values ('54100000-0000-0000-0000-000000000008','54000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','career',2,'54100000-0000-0000-0000-000000000001','pending','reading-idem-1','hmac-sha256:k2:different','reading-request-v1','{}',now())$$,
  'readings_subject_idempotency_unique'
);

-- Clarification chain stays linear and attached to current reading.
insert into public.readings(
  id, reading_session_id, subject_id, saju_domain, attempt_no, parent_reading_id,
  execution_status, request_idempotency_key, request_hash,
  request_contract_version, request_snapshot_jsonb, created_at
) values (
  '54100000-0000-0000-0000-000000000005', '54000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001', 'career', 2,
  '54100000-0000-0000-0000-000000000001', 'pending', 'reading-idem-2',
  'hmac-sha256:k2:reading-request-2', 'reading-request-v1', '{"clarification":"A"}'::jsonb, now()
);

update public.reading_sessions
set current_reading_id='54100000-0000-0000-0000-000000000005', next_attempt_no=3, updated_at=now()
where id='54000000-0000-0000-0000-000000000001';

select pg_temp.assert_fails(
  'clarification parent cannot branch',
  $$insert into public.readings(id,reading_session_id,subject_id,saju_domain,attempt_no,parent_reading_id,execution_status,request_idempotency_key,request_hash,request_contract_version,request_snapshot_jsonb,created_at)
    values ('54100000-0000-0000-0000-000000000006','54000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','career',3,'54100000-0000-0000-0000-000000000001','pending','reading-idem-branch','hmac-sha256:k2:reading-branch','reading-request-v1','{}',now())$$,
  'readings_parent_linear_idx'
);

update public.reading_sessions
set current_reading_id='54100000-0000-0000-0000-000000000001', updated_at=now()
where id='54000000-0000-0000-0000-000000000001';

select pg_temp.assert_fails(
  'clarification must extend the current prior reading',
  $$insert into public.readings(id,reading_session_id,subject_id,saju_domain,attempt_no,parent_reading_id,execution_status,request_idempotency_key,request_hash,request_contract_version,request_snapshot_jsonb,created_at)
    values ('54100000-0000-0000-0000-000000000007','54000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','career',3,'54100000-0000-0000-0000-000000000005','pending','reading-idem-old-current','hmac-sha256:k2:reading-old-current','reading-request-v1','{}',now())$$,
  'ct_reading_clarification_chain'
);

update public.reading_sessions
set current_reading_id='54100000-0000-0000-0000-000000000005', updated_at=now()
where id='54000000-0000-0000-0000-000000000001';

-- Separate finalization session keeps transport tests independent from clarification history.
insert into public.reading_sessions(
  id, subject_id, saju_domain, domain_capability_version,
  source_birth_revision_id, state, created_at, updated_at
) values (
  '54000000-0000-0000-0000-000000000010', '50000000-0000-0000-0000-000000000001',
  'career', 'career-cap-v1', '52100000-0000-0000-0000-000000000001', 'active', now(), now()
);

insert into public.readings(
  id, reading_session_id, subject_id, saju_domain, attempt_no,
  execution_status, request_idempotency_key, request_hash,
  request_contract_version, request_snapshot_jsonb, created_at
) values (
  '54100000-0000-0000-0000-000000000010', '54000000-0000-0000-0000-000000000010',
  '50000000-0000-0000-0000-000000000001', 'career', 1, 'pending',
  'reading-idem-final', 'hmac-sha256:k2:reading-request-final', 'reading-request-v1', '{}'::jsonb, now()
);

update public.reading_sessions
set current_reading_id='54100000-0000-0000-0000-000000000010', next_attempt_no=2, updated_at=now()
where id='54000000-0000-0000-0000-000000000010';

-- Transient transport retry stays under one logical reading.
insert into public.reading_execution_attempts(
  id, reading_id, subject_id, execution_attempt_no, state,
  transport_key, saju_engine_key, requested_engine_version, started_at
) values (
  '54200000-0000-0000-0000-000000000001', '54100000-0000-0000-0000-000000000010',
  '50000000-0000-0000-0000-000000000001', 1, 'running',
  'package', 'saju-primary', 'saju-engine-v1', now()
);

select pg_temp.assert_fails(
  'transport retry attempt number is unique inside logical reading',
  $$insert into public.reading_execution_attempts(id,reading_id,subject_id,execution_attempt_no,state,transport_key,saju_engine_key,started_at)
    values ('54200000-0000-0000-0000-000000000002','54100000-0000-0000-0000-000000000010','50000000-0000-0000-0000-000000000001',1,'running','package','saju-primary',now())$$,
  'reading_execution_attempts_reading_no_unique'
);

update public.reading_execution_attempts
set state='failed_retryable', finished_at=now(), error_code='TIMEOUT'
where id='54200000-0000-0000-0000-000000000001';

select pg_temp.assert_fails(
  'terminal reading execution attempt is immutable',
  $$update public.reading_execution_attempts set error_code='MUTATED' where id='54200000-0000-0000-0000-000000000001'$$,
  'tr_terminal_reading_execution_immutable'
);

insert into public.reading_execution_attempts(
  id, reading_id, subject_id, execution_attempt_no, state,
  transport_key, saju_engine_key, requested_engine_version,
  resolved_engine_version, external_request_ref, started_at, finished_at
) values (
  '54200000-0000-0000-0000-000000000003', '54100000-0000-0000-0000-000000000010',
  '50000000-0000-0000-0000-000000000001', 2, 'succeeded',
  'package', 'saju-primary', 'saju-engine-v1', 'saju-engine-v1', 'exec-ref-2', now(), now()
);

select pg_temp.assert_fails(
  'succeeded logical reading without response ref is denied',
  $$update public.readings set execution_status='succeeded', committed_execution_attempt_id='54200000-0000-0000-0000-000000000003', completed_at=now() where id='54100000-0000-0000-0000-000000000010'$$,
  'ct_reading_finalize'
);

-- Valid finalize is checked as one deferred transaction state.
set constraints all deferred;
insert into public.reading_refs(
  reading_id, subject_id, execution_attempt_id, saju_engine_key,
  external_reading_ref, source_birth_input_hash, saju_engine_version,
  reading_contract_version, product_response_state,
  response_snapshot_jsonb, response_hash, created_at
) values (
  '54100000-0000-0000-0000-000000000010', '50000000-0000-0000-0000-000000000001',
  '54200000-0000-0000-0000-000000000003', 'saju-primary', 'reading-ref-1',
  'hmac-sha256:k2:reading-birth-self-a', 'saju-engine-v1', 'product-reading-v1',
  'complete', '{"state":"complete"}'::jsonb, 'hmac-sha256:k2:reading-response-1', now()
);
update public.readings
set execution_status='succeeded', committed_execution_attempt_id='54200000-0000-0000-0000-000000000003', completed_at=now()
where id='54100000-0000-0000-0000-000000000010';
set constraints all immediate;

select pg_temp.assert_fails(
  'reading ref is immutable after finalize',
  $$update public.reading_refs set response_hash='hmac-sha256:k2:mutated' where reading_id='54100000-0000-0000-0000-000000000010'$$,
  'tr_reading_ref_immutable'
);

select pg_temp.assert_fails(
  'grounding cannot attach to unsuccessful logical reading',
  $$insert into public.reading_groundings(id,reading_id,subject_id,grounding_adapter_key,grounding_version,coverage_state,qualifiers_jsonb,prohibited_inferences_jsonb,grounding_hash,created_at)
    values ('54300000-0000-0000-0000-000000000001','54100000-0000-0000-0000-000000000005','50000000-0000-0000-0000-000000000001','product-response','grounding-v1','insufficient','[]','[]','hmac-sha256:k2:grounding-pending',now())$$,
  'ct_reading_grounding_source_valid'
);

select pg_temp.assert_fails(
  'complete grounding requires approved semantic payload',
  $$insert into public.reading_groundings(id,reading_id,subject_id,grounding_adapter_key,grounding_version,coverage_state,qualifiers_jsonb,prohibited_inferences_jsonb,grounding_hash,created_at)
    values ('54300000-0000-0000-0000-000000000002','54100000-0000-0000-0000-000000000010','50000000-0000-0000-0000-000000000001','product-response','grounding-v1','complete','[]','[]','hmac-sha256:k2:grounding-empty',now())$$,
  'reading_groundings_complete_payload_check'
);

insert into public.reading_groundings(
  id, reading_id, subject_id, grounding_adapter_key, grounding_version,
  coverage_state, approved_blocks_jsonb, qualifiers_jsonb,
  prohibited_inferences_jsonb, grounding_hash, created_at
) values (
  '54300000-0000-0000-0000-000000000003', '54100000-0000-0000-0000-000000000010',
  '50000000-0000-0000-0000-000000000001', 'product-response', 'grounding-v1',
  'complete', '[{"block":"career-summary"}]'::jsonb, '[]'::jsonb,
  '[]'::jsonb, 'hmac-sha256:k2:grounding-valid', now()
);

select pg_temp.assert_fails(
  'grounding projection is immutable',
  $$update public.reading_groundings set grounding_hash='hmac-sha256:k2:mutated' where id='54300000-0000-0000-0000-000000000003'$$,
  'tr_reading_grounding_immutable'
);

-- Operations provenance.
insert into public.ai_execution_logs(
  id, subject_id, turn_id, stage, provider, model, prompt_version,
  content_release_id, content_bundle_id, character_id,
  grounding_version, input_tokens, output_tokens, latency_ms,
  status, created_at
) values (
  '55000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001',
  '53200000-0000-0000-0000-000000000001', 'renderer', 'test-provider', 'test-model', 'prompt-v1',
  '51100000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'reading-char-01',
  'grounding-v1', 10, 20, 50, 'success', now()
);

select pg_temp.assert_fails(
  'AI execution cannot claim another owners turn',
  $$insert into public.ai_execution_logs(id,subject_id,turn_id,stage,provider,model,prompt_version,content_release_id,content_bundle_id,character_id,status,created_at)
    values ('55000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000002','53200000-0000-0000-0000-000000000001','renderer','test-provider','test-model','prompt-v1','51100000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000001','reading-char-01','success',now())$$,
  'ai_execution_logs_turn_subject_fk'
);

select pg_temp.assert_fails(
  'AI execution turn bundle must equal exact resolved canon bundle',
  $$insert into public.ai_execution_logs(id,subject_id,turn_id,stage,provider,model,prompt_version,content_release_id,content_bundle_id,character_id,status,created_at)
    values ('55000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000001','53200000-0000-0000-0000-000000000001','renderer','test-provider','test-model','prompt-v1','51100000-0000-0000-0000-000000000002','51000000-0000-0000-0000-000000000002','reading-char-01','success',now())$$,
  'ai_execution_logs_turn_bundle_fk'
);

select pg_temp.assert_fails(
  'AI token counts cannot be negative',
  $$insert into public.ai_execution_logs(id,stage,provider,model,prompt_version,input_tokens,status,created_at)
    values ('55000000-0000-0000-0000-000000000004','planner','test-provider','test-model','prompt-v1',-1,'success',now())$$,
  'ai_execution_logs_input_tokens_check'
);

insert into public.ai_execution_groundings(
  ai_execution_log_id, grounding_id, subject_id, role, created_at
) values (
  '55000000-0000-0000-0000-000000000001', '54300000-0000-0000-0000-000000000003',
  '50000000-0000-0000-0000-000000000001', 'primary', now()
);

insert into public.ai_execution_logs(
  id, subject_id, turn_id, stage, provider, model, prompt_version,
  content_release_id, content_bundle_id, character_id, status, created_at
) values (
  '55000000-0000-0000-0000-000000000005', '50000000-0000-0000-0000-000000000002',
  '53200000-0000-0000-0000-000000000002', 'renderer', 'test-provider', 'test-model', 'prompt-v1',
  '51100000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'reading-char-01', 'success', now()
);

select pg_temp.assert_fails(
  'AI execution grounding cannot cross subject ownership',
  $$insert into public.ai_execution_groundings(ai_execution_log_id,grounding_id,subject_id,role,created_at)
    values ('55000000-0000-0000-0000-000000000005','54300000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000002','primary',now())$$,
  'ai_execution_groundings_grounding_subject_fk'
);

-- Transactional outbox shape and crash-recovery lease invariants.
insert into public.outbox_events(
  id, aggregate_type, aggregate_id, event_type, event_schema_version,
  dedupe_key, payload_jsonb, status, available_at, created_at
) values (
  '56000000-0000-0000-0000-000000000001', 'reading', '54100000-0000-0000-0000-000000000010',
  'reading.finalized', 'outbox-v1', 'finalize-1', '{}'::jsonb, 'pending', now(), now()
);

select pg_temp.assert_fails(
  'outbox aggregate event dedupe is unique',
  $$insert into public.outbox_events(id,aggregate_type,aggregate_id,event_type,event_schema_version,dedupe_key,payload_jsonb,status,available_at,created_at)
    values ('56000000-0000-0000-0000-000000000002','reading','54100000-0000-0000-0000-000000000010','reading.finalized','outbox-v1','finalize-1','{}','pending',now(),now())$$,
  'outbox_events_dedupe_unique'
);

select pg_temp.assert_fails(
  'processing outbox row requires recoverable lease ownership',
  $$insert into public.outbox_events(id,aggregate_type,aggregate_id,event_type,event_schema_version,dedupe_key,payload_jsonb,status,available_at,created_at)
    values ('56000000-0000-0000-0000-000000000003','reading','x','reading.test','outbox-v1','processing-no-lease','{}','processing',now(),now())$$,
  'outbox_events_processing_lease_check'
);

select pg_temp.assert_fails(
  'processed outbox row requires processed timestamp',
  $$insert into public.outbox_events(id,aggregate_type,aggregate_id,event_type,event_schema_version,dedupe_key,payload_jsonb,status,available_at,created_at)
    values ('56000000-0000-0000-0000-000000000004','reading','x','reading.test','outbox-v1','processed-no-time','{}','processed',now(),now())$$,
  'outbox_events_processed_timestamp_check'
);

select pg_temp.assert_fails(
  'dead lettered outbox row requires dead letter timestamp',
  $$insert into public.outbox_events(id,aggregate_type,aggregate_id,event_type,event_schema_version,dedupe_key,payload_jsonb,status,available_at,created_at)
    values ('56000000-0000-0000-0000-000000000005','reading','x','reading.test','outbox-v1','dead-no-time','{}','dead_lettered',now(),now())$$,
  'outbox_events_dead_letter_timestamp_check'
);

insert into public.outbox_events(
  id, aggregate_type, aggregate_id, event_type, event_schema_version,
  dedupe_key, payload_jsonb, status, locked_at, lock_owner,
  lease_expires_at, attempt_count, available_at, created_at
) values (
  '56000000-0000-0000-0000-000000000006', 'reading', 'x', 'reading.test', 'outbox-v1',
  'processing-valid', '{}'::jsonb, 'processing', now(), 'worker-1',
  now() + interval '1 minute', 1, now(), now()
);

-- Current executable DDL coverage: 37/59 catalog tables.
do $$
declare
  table_count integer;
begin
  select count(*) into table_count
  from information_schema.tables
  where table_schema = 'public'
    and table_name in (
      'subjects', 'profiles', 'guest_sessions', 'subject_merge_jobs', 'subject_merge_actions',
      'content_bundles', 'content_releases', 'characters', 'saju_domains', 'saju_domain_runtime',
      'character_runtime_catalog', 'character_capabilities', 'character_relations',
      'birth_profiles', 'birth_profile_revisions', 'target_person_profiles',
      'conversation_threads', 'conversation_thread_characters', 'conversation_thread_content_transitions',
      'chat_turns', 'chat_turn_attempts', 'conversation_messages',
      'life_facts', 'memory_items', 'memory_proposals', 'record_access_grants',
      'user_character_states', 'world_events', 'relationship_events',
      'reading_sessions', 'readings', 'reading_execution_attempts', 'reading_refs', 'reading_groundings',
      'ai_execution_logs', 'ai_execution_groundings', 'outbox_events'
    );
  if table_count <> 37 then
    raise exception 'FAIL expected 37 implemented catalog tables, found %', table_count;
  end if;
end;
$$;

select 'reading/operations authority negative tests passed' as result;
