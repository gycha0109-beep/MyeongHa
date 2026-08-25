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
  ('00000000-0000-0000-0000-000000000401'),
  ('00000000-0000-0000-0000-000000000402')
on conflict do nothing;

insert into public.subjects(id, kind, auth_user_id, status, created_at, updated_at)
values
  ('60000000-0000-0000-0000-000000000001', 'member', '00000000-0000-0000-0000-000000000401', 'active', now(), now()),
  ('60000000-0000-0000-0000-000000000002', 'member', '00000000-0000-0000-0000-000000000402', 'active', now(), now());

insert into public.content_bundles(
  id, content_version, content_hash, artifact_ref, artifact_schema_version,
  min_client_capability, asset_manifest_hash, cue_schema_version,
  manifest_jsonb, published_at
) values
  ('61000000-0000-0000-0000-000000000001', 'story-test-v1', 'sha256:v1:story-bundle-1', 'registry://story-1', 'bundle-v1', '0.0.1-test', 'sha256:v1:story-assets-1', 'cue-v1', '{}'::jsonb, now()),
  ('61000000-0000-0000-0000-000000000002', 'story-test-v2', 'sha256:v1:story-bundle-2', 'registry://story-2', 'bundle-v1', '0.0.1-test', 'sha256:v1:story-assets-2', 'cue-v1', '{}'::jsonb, now());

insert into public.content_releases(
  id, release_key, content_bundle_id, status, is_default,
  rollout_policy_version, rollout_seed, activated_at, created_at
) values
  ('61100000-0000-0000-0000-000000000001', 'story-release-1', '61000000-0000-0000-0000-000000000001', 'active', false, 'rollout-v1', 'story-seed-1', now(), now()),
  ('61100000-0000-0000-0000-000000000002', 'story-release-2', '61000000-0000-0000-0000-000000000002', 'active', false, 'rollout-v1', 'story-seed-2', now(), now());

insert into public.characters(character_id, created_at)
values ('story-char-01', now()), ('story-char-02', now());

insert into public.character_runtime_catalog(character_id, content_bundle_id, availability, enabled, published_at)
values
  ('story-char-01', '61000000-0000-0000-0000-000000000001', 'available', true, now()),
  ('story-char-01', '61000000-0000-0000-0000-000000000002', 'available', true, now()),
  ('story-char-02', '61000000-0000-0000-0000-000000000002', 'available', true, now());

-- Episode canon projection.
insert into public.episode_runtime_catalog(
  episode_id, content_bundle_id, enabled, release_at, min_client_capability
) values (
  'episode-story-01', '61000000-0000-0000-0000-000000000001', true, now(), '0.0.1-test'
);

insert into public.episode_participants(episode_id, content_bundle_id, character_id, role)
values ('episode-story-01', '61000000-0000-0000-0000-000000000001', 'story-char-01', 'lead');

select pg_temp.assert_fails(
  'episode participant must exist in the exact episode bundle',
  $$insert into public.episode_participants(episode_id,content_bundle_id,character_id,role)
    values ('episode-story-01','61000000-0000-0000-0000-000000000001','story-char-02','guest')$$,
  'episode_participants_character_bundle_fk'
);

select pg_temp.assert_fails(
  'published episode runtime projection is immutable',
  $$update public.episode_runtime_catalog set enabled=false where episode_id='episode-story-01' and content_bundle_id='61000000-0000-0000-0000-000000000001'$$,
  'tr_episode_runtime_catalog_immutable'
);

select pg_temp.assert_fails(
  'published episode participant projection is immutable',
  $$update public.episode_participants set role='changed' where episode_id='episode-story-01' and content_bundle_id='61000000-0000-0000-0000-000000000001' and character_id='story-char-01'$$,
  'tr_episode_participants_immutable'
);

-- World source fixture for unlock ownership.
insert into public.world_events(
  id, subject_id, event_type, event_schema_version, event_dedupe_key,
  content_bundle_id, payload_jsonb, occurred_at
) values (
  '62000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001',
  'story_unlock', 'world-event/v1', 'story-world-1', '61000000-0000-0000-0000-000000000001', '{}'::jsonb, now()
);

insert into public.character_unlocks(
  id, subject_id, character_id, status, revision,
  source_world_event_id, unlocked_at, created_at, updated_at
) values (
  '62100000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001',
  'story-char-01', 'unlocked', 1, '62000000-0000-0000-0000-000000000001', now(), now(), now()
);

select pg_temp.assert_fails(
  'unlock source world event cannot cross owner',
  $$insert into public.character_unlocks(id,subject_id,character_id,status,revision,source_world_event_id,unlocked_at,created_at,updated_at)
    values ('62100000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000002','story-char-01','unlocked',1,'62000000-0000-0000-0000-000000000001',now(),now(),now())$$,
  'character_unlocks_source_world_subject_fk'
);

select pg_temp.assert_fails(
  'unlocked projection requires unlocked timestamp',
  $$insert into public.character_unlocks(id,subject_id,character_id,status,revision,created_at,updated_at)
    values ('62100000-0000-0000-0000-000000000003','60000000-0000-0000-0000-000000000002','story-char-02','unlocked',1,now(),now())$$,
  'character_unlocks_timestamp_shape_check'
);

select pg_temp.assert_fails(
  'character unlock owner identity cannot be reparented',
  $$update public.character_unlocks set subject_id='60000000-0000-0000-0000-000000000002' where id='62100000-0000-0000-0000-000000000001'$$,
  'tr_character_unlock_identity_immutable'
);

-- Episode progress projection and provenance turns.
insert into public.conversation_threads(
  id, subject_id, thread_type, status, active_content_release_id,
  active_content_bundle_id, created_at, updated_at
) values
  ('63000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'system', 'active', '61100000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001', now(), now()),
  ('63000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', 'system', 'active', '61100000-0000-0000-0000-000000000002', '61000000-0000-0000-0000-000000000002', now(), now()),
  ('63000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000002', 'system', 'active', '61100000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001', now(), now());

insert into public.chat_turns(
  id, thread_id, subject_id, client_turn_id, request_hash, request_contract_version,
  request_snapshot_jsonb, resolved_content_release_id, resolved_content_bundle_id,
  state, created_at, updated_at
) values
  ('63100000-0000-0000-0000-000000000001', '63000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'story-turn-1', 'hmac-sha256:k2:story-turn-1', 'chat-v1', '{}'::jsonb, '61100000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001', 'failed_final', now(), now()),
  ('63100000-0000-0000-0000-000000000002', '63000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', 'story-turn-2', 'hmac-sha256:k2:story-turn-2', 'chat-v1', '{}'::jsonb, '61100000-0000-0000-0000-000000000002', '61000000-0000-0000-0000-000000000002', 'failed_final', now(), now()),
  ('63100000-0000-0000-0000-000000000003', '63000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000002', 'story-turn-3', 'hmac-sha256:k2:story-turn-3', 'chat-v1', '{}'::jsonb, '61100000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001', 'failed_final', now(), now());

insert into public.user_episode_progress(
  id, subject_id, episode_id, content_bundle_id, state, revision, updated_at
) values (
  '64000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001',
  'episode-story-01', '61000000-0000-0000-0000-000000000001', 'not_started', 0, now()
);

select pg_temp.assert_fails(
  'one progress projection per subject and episode version',
  $$insert into public.user_episode_progress(id,subject_id,episode_id,content_bundle_id,state,revision,updated_at)
    values ('64000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000001','episode-story-01','61000000-0000-0000-0000-000000000001','not_started',0,now())$$,
  'user_episode_progress_subject_episode_bundle_unique'
);

select pg_temp.assert_fails(
  'completed progress requires completed timestamp',
  $$insert into public.user_episode_progress(id,subject_id,episode_id,content_bundle_id,state,revision,updated_at)
    values ('64000000-0000-0000-0000-000000000003','60000000-0000-0000-0000-000000000002','episode-story-01','61000000-0000-0000-0000-000000000001','completed',1,now())$$,
  'user_episode_progress_completed_timestamp_check'
);

select pg_temp.assert_fails(
  'episode progress version identity cannot mutate',
  $$update public.user_episode_progress set content_bundle_id='61000000-0000-0000-0000-000000000002' where id='64000000-0000-0000-0000-000000000001'$$,
  'tr_episode_progress_identity_immutable'
);

insert into public.episode_progress_events(
  id, progress_id, subject_id, episode_id, content_bundle_id,
  event_dedupe_key, event_type, to_node_key, source_turn_id,
  revision_before, revision_after, payload_jsonb, created_at
) values (
  '64100000-0000-0000-0000-000000000001', '64000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001', 'episode-story-01', '61000000-0000-0000-0000-000000000001',
  'episode-event-1', 'started', 'node-1', '63100000-0000-0000-0000-000000000001',
  0, 1, '{}'::jsonb, now()
);

update public.user_episode_progress
set state='active', current_node_key='node-1', revision=1, started_at=now(), updated_at=now()
where id='64000000-0000-0000-0000-000000000001';

select pg_temp.assert_fails(
  'episode progress retry is deduped',
  $$insert into public.episode_progress_events(id,progress_id,subject_id,episode_id,content_bundle_id,event_dedupe_key,event_type,source_turn_id,revision_before,revision_after,created_at)
    values ('64100000-0000-0000-0000-000000000002','64000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','episode-story-01','61000000-0000-0000-0000-000000000001','episode-event-1','advanced','63100000-0000-0000-0000-000000000001',1,2,now())$$,
  'episode_progress_events_dedupe_unique'
);

select pg_temp.assert_fails(
  'one episode event owns one applied progress revision',
  $$insert into public.episode_progress_events(id,progress_id,subject_id,episode_id,content_bundle_id,event_dedupe_key,event_type,source_turn_id,revision_before,revision_after,created_at)
    values ('64100000-0000-0000-0000-000000000003','64000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','episode-story-01','61000000-0000-0000-0000-000000000001','episode-event-same-revision','advanced','63100000-0000-0000-0000-000000000001',0,1,now())$$,
  'episode_progress_events_applied_revision_unique'
);

select pg_temp.assert_fails(
  'episode event revision cannot jump',
  $$insert into public.episode_progress_events(id,progress_id,subject_id,episode_id,content_bundle_id,event_dedupe_key,event_type,revision_before,revision_after,created_at)
    values ('64100000-0000-0000-0000-000000000004','64000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','episode-story-01','61000000-0000-0000-0000-000000000001','episode-event-jump','advanced',1,3,now())$$,
  'episode_progress_events_revision_step_check'
);

select pg_temp.assert_fails(
  'episode event source turn cannot cross owner',
  $$insert into public.episode_progress_events(id,progress_id,subject_id,episode_id,content_bundle_id,event_dedupe_key,event_type,source_turn_id,revision_before,revision_after,created_at)
    values ('64100000-0000-0000-0000-000000000005','64000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','episode-story-01','61000000-0000-0000-0000-000000000001','episode-event-cross-owner','advanced','63100000-0000-0000-0000-000000000003',1,2,now())$$,
  'episode_progress_events_source_turn_subject_fk'
);

select pg_temp.assert_fails(
  'episode event source turn cannot use another canon bundle',
  $$insert into public.episode_progress_events(id,progress_id,subject_id,episode_id,content_bundle_id,event_dedupe_key,event_type,source_turn_id,revision_before,revision_after,created_at)
    values ('64100000-0000-0000-0000-000000000006','64000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','episode-story-01','61000000-0000-0000-0000-000000000001','episode-event-bad-bundle','advanced','63100000-0000-0000-0000-000000000002',1,2,now())$$,
  'episode_progress_events_source_turn_bundle_fk'
);

select pg_temp.assert_fails(
  'episode progress event ledger is append only',
  $$update public.episode_progress_events set to_node_key='rewritten' where id='64100000-0000-0000-0000-000000000001'$$,
  'tr_episode_progress_events_append_only'
);

-- Minimal successful reading used as share provenance.
insert into public.saju_domain_runtime(saju_domain, availability, capability_version, required_engine_version, updated_at)
values ('career', 'available', 'share-career-cap-v1', 'saju-engine-v1', now())
on conflict (saju_domain) do update set
  availability=excluded.availability,
  capability_version=excluded.capability_version,
  required_engine_version=excluded.required_engine_version,
  updated_at=excluded.updated_at;

insert into public.birth_profiles(id, subject_id, profile_kind, label, created_at, updated_at)
values ('65000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','self','share-self',now(),now());
insert into public.birth_profile_revisions(
  id,birth_profile_id,subject_id,revision_no,calendar_type,birth_date,birth_time,time_known,is_leap_month,sex,input_hash,created_at
) values (
  '65100000-0000-0000-0000-000000000001','65000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001',1,
  'solar','2000-01-01',null,false,false,'unspecified','hmac-sha256:k2:share-birth-1',now()
);
update public.birth_profiles set current_revision_id='65100000-0000-0000-0000-000000000001',updated_at=now()
where id='65000000-0000-0000-0000-000000000001';

insert into public.reading_sessions(
  id,subject_id,saju_domain,domain_capability_version,source_birth_revision_id,state,created_at,updated_at
) values (
  '65200000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','career','share-career-cap-v1',
  '65100000-0000-0000-0000-000000000001','active',now(),now()
);
insert into public.readings(
  id,reading_session_id,subject_id,saju_domain,attempt_no,execution_status,request_idempotency_key,request_hash,
  request_contract_version,request_snapshot_jsonb,created_at
) values (
  '65300000-0000-0000-0000-000000000001','65200000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','career',1,
  'pending','share-reading-idem-1','hmac-sha256:k2:share-reading-request','reading-request-v1','{}'::jsonb,now()
);
update public.reading_sessions set current_reading_id='65300000-0000-0000-0000-000000000001',next_attempt_no=2,updated_at=now()
where id='65200000-0000-0000-0000-000000000001';
insert into public.reading_execution_attempts(
  id,reading_id,subject_id,execution_attempt_no,state,transport_key,saju_engine_key,requested_engine_version,resolved_engine_version,started_at,finished_at
) values (
  '65400000-0000-0000-0000-000000000001','65300000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001',1,
  'succeeded','package','saju-primary','saju-engine-v1','saju-engine-v1',now(),now()
);
set constraints all deferred;
insert into public.reading_refs(
  reading_id,subject_id,execution_attempt_id,saju_engine_key,source_birth_input_hash,saju_engine_version,
  reading_contract_version,product_response_state,response_snapshot_jsonb,response_hash,created_at
) values (
  '65300000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','65400000-0000-0000-0000-000000000001','saju-primary',
  'hmac-sha256:k2:share-birth-1','saju-engine-v1','product-reading-v1','complete','{}'::jsonb,'hmac-sha256:k2:share-response-1',now()
);
update public.readings set execution_status='succeeded',committed_execution_attempt_id='65400000-0000-0000-0000-000000000001',completed_at=now()
where id='65300000-0000-0000-0000-000000000001';
set constraints all immediate;

insert into public.share_artifacts(
  id,subject_id,reading_id,public_token_hash,artifact_version,snapshot_jsonb,snapshot_hash,status,expires_at,created_at
) values (
  '66000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','65300000-0000-0000-0000-000000000001',
  'hmac-sha256:k2:share-token-1','share-v1','{"title":"public"}'::jsonb,'sha256:v1:share-snapshot-1','active',now()+interval '1 day',now()
);

select pg_temp.assert_fails(
  'share artifact reading cannot cross owner',
  $$insert into public.share_artifacts(id,subject_id,reading_id,public_token_hash,artifact_version,snapshot_jsonb,snapshot_hash,status,created_at)
    values ('66000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000002','65300000-0000-0000-0000-000000000001','hmac-sha256:k2:share-token-cross','share-v1','{}','sha256:v1:cross','active',now())$$,
  'share_artifacts_reading_subject_fk'
);

select pg_temp.assert_fails(
  'public share token fingerprint is unique',
  $$insert into public.share_artifacts(id,subject_id,reading_id,public_token_hash,artifact_version,snapshot_jsonb,snapshot_hash,status,created_at)
    values ('66000000-0000-0000-0000-000000000003','60000000-0000-0000-0000-000000000001','65300000-0000-0000-0000-000000000001','hmac-sha256:k2:share-token-1','share-v1','{}','sha256:v1:duplicate-token','active',now())$$,
  'share_artifacts_public_token_hash_unique'
);

select pg_temp.assert_fails(
  'revoked share requires revocation timestamp',
  $$update public.share_artifacts set status='revoked',revoked_at=null where id='66000000-0000-0000-0000-000000000001'$$,
  'share_artifacts_revoked_timestamp_check'
);

select pg_temp.assert_fails(
  'share public snapshot cannot be rewritten in place',
  $$update public.share_artifacts set snapshot_jsonb='{"title":"rewritten"}'::jsonb where id='66000000-0000-0000-0000-000000000001'$$,
  'tr_share_artifact_snapshot_immutable'
);

update public.share_artifacts set status='revoked',revoked_at=now()
where id='66000000-0000-0000-0000-000000000001';

select pg_temp.assert_fails(
  'revoked share cannot be reactivated',
  $$update public.share_artifacts set status='active' where id='66000000-0000-0000-0000-000000000001'$$,
  'tr_share_artifact_terminal_status'
);

-- Current executable DDL coverage: 43/59 catalog tables.
do $$
declare
  table_count integer;
begin
  select count(*) into table_count
  from information_schema.tables
  where table_schema='public'
    and table_name in (
      'subjects','profiles','guest_sessions','subject_merge_jobs','subject_merge_actions',
      'content_bundles','content_releases','characters','saju_domains','saju_domain_runtime','character_runtime_catalog','character_capabilities','character_relations',
      'episode_runtime_catalog','episode_participants',
      'birth_profiles','birth_profile_revisions','target_person_profiles',
      'conversation_threads','conversation_thread_characters','conversation_thread_content_transitions','chat_turns','chat_turn_attempts','conversation_messages',
      'life_facts','memory_items','memory_proposals','record_access_grants',
      'user_character_states','world_events','relationship_events','character_unlocks','user_episode_progress','episode_progress_events',
      'reading_sessions','readings','reading_execution_attempts','reading_refs','reading_groundings','share_artifacts',
      'ai_execution_logs','ai_execution_groundings','outbox_events'
    );
  if table_count <> 43 then
    raise exception 'FAIL expected 43 implemented catalog tables, found %', table_count;
  end if;
end;
$$;

select 'story/share authority negative tests passed' as result;
