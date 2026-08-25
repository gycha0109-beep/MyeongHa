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
  ('00000000-0000-0000-0000-000000000501'),
  ('00000000-0000-0000-0000-000000000502')
on conflict do nothing;

insert into public.subjects(id, kind, auth_user_id, status, created_at, updated_at)
values
  ('70000000-0000-0000-0000-000000000001', 'member', '00000000-0000-0000-0000-000000000501', 'active', now(), now()),
  ('70000000-0000-0000-0000-000000000002', 'member', '00000000-0000-0000-0000-000000000502', 'active', now(), now());

-- Installation authority: one active install identity globally, one active token fingerprint globally.
insert into public.device_installations(
  id, subject_id, platform, installation_key,
  push_token_encrypted, push_token_key_id, token_fingerprint,
  app_version, client_capability, last_seen_at, created_at
) values (
  '71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001',
  'android', 'install-shared', 'enc:token-a', 'push-k1', 'hmac-sha256:k2:push-token-a',
  '1.0.0', 'mobile-v1', now(), now()
);

select pg_temp.assert_fails(
  'same active installation identity cannot bind to another subject',
  $$insert into public.device_installations(id,subject_id,platform,installation_key,client_capability,last_seen_at,created_at)
    values ('71000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000002','android','install-shared','mobile-v1',now(),now())$$,
  'device_installations_active_identity_idx'
);

select pg_temp.assert_fails(
  'same active push token cannot bind to another installation',
  $$insert into public.device_installations(id,subject_id,platform,installation_key,push_token_encrypted,push_token_key_id,token_fingerprint,client_capability,last_seen_at,created_at)
    values ('71000000-0000-0000-0000-000000000003','70000000-0000-0000-0000-000000000002','android','install-other','enc:token-a','push-k1','hmac-sha256:k2:push-token-a','mobile-v1',now(),now())$$,
  'device_installations_active_token_idx'
);

select pg_temp.assert_fails(
  'push token encryption metadata must be complete',
  $$insert into public.device_installations(id,subject_id,platform,installation_key,push_token_encrypted,client_capability,last_seen_at,created_at)
    values ('71000000-0000-0000-0000-000000000004','70000000-0000-0000-0000-000000000001','web','bad-token-shape','enc:orphan','web-v1',now(),now())$$,
  'device_installations_token_key_shape_check'
);

update public.device_installations
set revoked_at=now(), last_seen_at=now()
where id='71000000-0000-0000-0000-000000000001';

-- After revoke, the same install/token can bind to a new subject as a new row.
insert into public.device_installations(
  id, subject_id, platform, installation_key,
  push_token_encrypted, push_token_key_id, token_fingerprint,
  app_version, client_capability, last_seen_at, created_at
) values (
  '71000000-0000-0000-0000-000000000005', '70000000-0000-0000-0000-000000000002',
  'android', 'install-shared', 'enc:token-a-rebound', 'push-k1', 'hmac-sha256:k2:push-token-a',
  '1.0.0', 'mobile-v1', now(), now()
);

select pg_temp.assert_fails(
  'device installation owner cannot be reparented in place',
  $$update public.device_installations set subject_id='70000000-0000-0000-0000-000000000001' where id='71000000-0000-0000-0000-000000000005'$$,
  'tr_device_installation_identity_immutable'
);

-- Additional active devices for delivery ownership tests.
insert into public.device_installations(
  id, subject_id, platform, installation_key,
  push_token_encrypted, push_token_key_id, token_fingerprint,
  client_capability, last_seen_at, created_at
) values
  ('71000000-0000-0000-0000-000000000010', '70000000-0000-0000-0000-000000000001', 'web', 'install-a', 'enc:token-web-a', 'push-k1', 'hmac-sha256:k2:push-web-a', 'web-v1', now(), now()),
  ('71000000-0000-0000-0000-000000000011', '70000000-0000-0000-0000-000000000002', 'web', 'install-b', 'enc:token-web-b', 'push-k1', 'hmac-sha256:k2:push-web-b', 'web-v1', now(), now());

-- Notification settings / preference policy.
insert into public.notification_settings(
  subject_id, timezone_override, preview_mode, global_enabled, updated_at
) values (
  '70000000-0000-0000-0000-000000000001', 'Asia/Seoul', 'discreet', true, now()
);

select pg_temp.assert_fails(
  'quiet hours must be configured as a pair',
  $$insert into public.notification_settings(subject_id,quiet_start,preview_mode,global_enabled,updated_at)
    values ('70000000-0000-0000-0000-000000000002','22:00','discreet',true,now())$$,
  'notification_settings_quiet_pair_check'
);

insert into public.notification_preferences(subject_id, category, enabled, updated_at)
values ('70000000-0000-0000-0000-000000000001', 'episode_unlock', true, now());

select pg_temp.assert_fails(
  'notification preference category is bounded',
  $$insert into public.notification_preferences(subject_id,category,enabled,updated_at)
    values ('70000000-0000-0000-0000-000000000001','private_worry_preview',true,now())$$,
  'notification_preferences_category_check'
);

-- Canon/world fixture used by logical notification provenance.
insert into public.content_bundles(
  id, content_version, content_hash, artifact_ref, artifact_schema_version,
  min_client_capability, asset_manifest_hash, cue_schema_version,
  manifest_jsonb, published_at
) values
  ('72000000-0000-0000-0000-000000000001','notification-test-v1','sha256:v1:notification-bundle-1','registry://notification-1','bundle-v1','0.0.1-test','sha256:v1:notification-assets-1','cue-v1','{}'::jsonb,now()),
  ('72000000-0000-0000-0000-000000000002','notification-test-v2','sha256:v1:notification-bundle-2','registry://notification-2','bundle-v1','0.0.1-test','sha256:v1:notification-assets-2','cue-v1','{}'::jsonb,now());

insert into public.characters(character_id, created_at)
values ('notification-char-01', now());
insert into public.character_runtime_catalog(character_id, content_bundle_id, availability, enabled, published_at)
values ('notification-char-01','72000000-0000-0000-0000-000000000001','available',true,now());

insert into public.world_events(
  id,subject_id,event_type,event_schema_version,event_dedupe_key,content_bundle_id,payload_jsonb,occurred_at
) values (
  '72100000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001',
  'notification_source','world-event/v1','notification-world-a','72000000-0000-0000-0000-000000000001','{}'::jsonb,now()
);

insert into public.notifications(
  id,subject_id,category,character_id,content_bundle_id,source_world_event_id,
  template_key,payload_jsonb,dedupe_key,status,scheduled_at,created_at
) values (
  '73000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001',
  'episode_unlock','notification-char-01','72000000-0000-0000-0000-000000000001','72100000-0000-0000-0000-000000000001',
  'episode_unlock.v1','{}'::jsonb,'notification-1','ready',now(),now()
);

select pg_temp.assert_fails(
  'character notification must pin a content bundle',
  $$insert into public.notifications(id,subject_id,category,character_id,template_key,payload_jsonb,dedupe_key,status,scheduled_at,created_at)
    values ('73000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000001','episode_unlock','notification-char-01','x','{}','notification-no-bundle','ready',now(),now())$$,
  'notifications_character_bundle_shape_check'
);

select pg_temp.assert_fails(
  'character notification must use bundle where character exists',
  $$insert into public.notifications(id,subject_id,category,character_id,content_bundle_id,template_key,payload_jsonb,dedupe_key,status,scheduled_at,created_at)
    values ('73000000-0000-0000-0000-000000000003','70000000-0000-0000-0000-000000000001','episode_unlock','notification-char-01','72000000-0000-0000-0000-000000000002','x','{}','notification-wrong-bundle','ready',now(),now())$$,
  'notifications_character_bundle_fk'
);

select pg_temp.assert_fails(
  'notification source world event cannot cross owner',
  $$insert into public.notifications(id,subject_id,category,content_bundle_id,source_world_event_id,template_key,payload_jsonb,dedupe_key,status,scheduled_at,created_at)
    values ('73000000-0000-0000-0000-000000000004','70000000-0000-0000-0000-000000000002','service_notice','72000000-0000-0000-0000-000000000001','72100000-0000-0000-0000-000000000001','x','{}','notification-cross-owner','ready',now(),now())$$,
  'notifications_source_world_subject_fk'
);

select pg_temp.assert_fails(
  'notification retry dedupe is owner scoped',
  $$insert into public.notifications(id,subject_id,category,template_key,payload_jsonb,dedupe_key,status,scheduled_at,created_at)
    values ('73000000-0000-0000-0000-000000000005','70000000-0000-0000-0000-000000000001','service_notice','x','{}','notification-1','ready',now(),now())$$,
  'notifications_subject_dedupe_unique'
);

select pg_temp.assert_fails(
  'read notification requires read timestamp',
  $$insert into public.notifications(id,subject_id,category,template_key,payload_jsonb,dedupe_key,status,scheduled_at,created_at)
    values ('73000000-0000-0000-0000-000000000006','70000000-0000-0000-0000-000000000001','service_notice','x','{}','notification-read-no-time','read',now(),now())$$,
  'notifications_read_timestamp_check'
);

-- Delivery ownership and retry authority.
insert into public.notification_deliveries(
  id,subject_id,notification_id,installation_id,status,next_attempt_no,created_at,updated_at
) values (
  '74000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001',
  '73000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000010','pending',1,now(),now()
);

select pg_temp.assert_fails(
  'notification cannot target another subjects installation',
  $$insert into public.notification_deliveries(id,subject_id,notification_id,installation_id,status,created_at,updated_at)
    values ('74000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000011','pending',now(),now())$$,
  'notification_deliveries_installation_subject_fk'
);

select pg_temp.assert_fails(
  'logical notification delivery cannot duplicate same installation',
  $$insert into public.notification_deliveries(id,subject_id,notification_id,installation_id,status,created_at,updated_at)
    values ('74000000-0000-0000-0000-000000000003','70000000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000010','pending',now(),now())$$,
  'notification_deliveries_notification_installation_unique'
);

select pg_temp.assert_fails(
  'sent delivery requires sent timestamp',
  $$update public.notification_deliveries set status='sent',updated_at=now() where id='74000000-0000-0000-0000-000000000001'$$,
  'notification_deliveries_sent_timestamp_check'
);

select pg_temp.assert_fails(
  'delivery target identity cannot be changed in place',
  $$update public.notification_deliveries set installation_id='71000000-0000-0000-0000-000000000011' where id='74000000-0000-0000-0000-000000000001'$$,
  'tr_notification_delivery_identity_immutable'
);

insert into public.notification_delivery_attempts(
  id,delivery_id,subject_id,attempt_no,provider,status,started_at
) values (
  '74100000-0000-0000-0000-000000000001','74000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000001',1,'web_push','running',now()
);

select pg_temp.assert_fails(
  'provider attempt number cannot duplicate within delivery',
  $$insert into public.notification_delivery_attempts(id,delivery_id,subject_id,attempt_no,provider,status,started_at)
    values ('74100000-0000-0000-0000-000000000002','74000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001',1,'web_push','running',now())$$,
  'notification_delivery_attempts_delivery_no_unique'
);

select pg_temp.assert_fails(
  'terminal attempt requires finished timestamp',
  $$update public.notification_delivery_attempts set status='sent' where id='74100000-0000-0000-0000-000000000001'$$,
  'notification_delivery_attempts_terminal_timestamp_check'
);

update public.notification_delivery_attempts
set status='sent',provider_message_ref='provider-msg-1',finished_at=now()
where id='74100000-0000-0000-0000-000000000001';

select pg_temp.assert_fails(
  'terminal provider attempt is immutable',
  $$update public.notification_delivery_attempts set error_code='rewritten' where id='74100000-0000-0000-0000-000000000001'$$,
  'tr_notification_delivery_attempt_terminal_immutable'
);

-- Deletion request authority.
insert into public.data_deletion_jobs(
  id,subject_id,scope,request_dedupe_key,status,retention_exceptions_jsonb,requested_at
) values (
  '75000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001',
  'account','delete-account-1','requested','[]'::jsonb,now()
);

select pg_temp.assert_fails(
  'deletion request retry is deduped',
  $$insert into public.data_deletion_jobs(id,subject_id,scope,request_dedupe_key,status,requested_at)
    values ('75000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000001','account','delete-account-1','requested',now())$$,
  'data_deletion_jobs_subject_dedupe_unique'
);

select pg_temp.assert_fails(
  'account deletion cannot carry resource target id',
  $$insert into public.data_deletion_jobs(id,subject_id,scope,target_resource_id,request_dedupe_key,status,requested_at)
    values ('75000000-0000-0000-0000-000000000003','70000000-0000-0000-0000-000000000001','account','resource-x','bad-account-target','requested',now())$$,
  'data_deletion_jobs_target_shape_check'
);

select pg_temp.assert_fails(
  'resource deletion requires target type and id',
  $$insert into public.data_deletion_jobs(id,subject_id,scope,request_dedupe_key,status,requested_at)
    values ('75000000-0000-0000-0000-000000000004','70000000-0000-0000-0000-000000000001','conversation','missing-target','requested',now())$$,
  'data_deletion_jobs_target_shape_check'
);

select pg_temp.assert_fails(
  'deletion scope is bounded',
  $$insert into public.data_deletion_jobs(id,subject_id,scope,target_resource_type,target_resource_id,request_dedupe_key,status,requested_at)
    values ('75000000-0000-0000-0000-000000000005','70000000-0000-0000-0000-000000000001','everything','x','y','bad-scope','requested',now())$$,
  'data_deletion_jobs_scope_check'
);

select pg_temp.assert_fails(
  'deletion request identity cannot mutate after creation',
  $$update public.data_deletion_jobs set scope='memory',target_resource_type='memory',target_resource_id='x' where id='75000000-0000-0000-0000-000000000001'$$,
  'tr_data_deletion_job_request_immutable'
);

-- Current executable DDL coverage: 50/59 catalog tables.
do $$
declare
  table_count integer;
begin
  select count(*) into table_count
  from information_schema.tables
  where table_schema='public'
    and table_name in (
      'subjects','profiles','guest_sessions','subject_merge_jobs','subject_merge_actions',
      'content_bundles','content_releases','characters','saju_domains','saju_domain_runtime','character_runtime_catalog','character_capabilities','character_relations','episode_runtime_catalog','episode_participants',
      'birth_profiles','birth_profile_revisions','target_person_profiles','life_facts','memory_items','memory_proposals','record_access_grants',
      'conversation_threads','conversation_thread_characters','conversation_thread_content_transitions','chat_turns','chat_turn_attempts','conversation_messages',
      'reading_sessions','readings','reading_execution_attempts','reading_refs','reading_groundings','share_artifacts',
      'user_character_states','world_events','relationship_events','character_unlocks','user_episode_progress','episode_progress_events',
      'device_installations','notification_settings','notification_preferences','notifications','notification_deliveries','notification_delivery_attempts',
      'ai_execution_logs','ai_execution_groundings','outbox_events','data_deletion_jobs'
    );
  if table_count <> 50 then
    raise exception 'FAIL expected 50 implemented catalog tables, found %', table_count;
  end if;
end;
$$;

select 'notification/deletion authority negative tests passed' as result;
