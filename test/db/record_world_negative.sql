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
  ('00000000-0000-0000-0000-000000000201'),
  ('00000000-0000-0000-0000-000000000202')
on conflict do nothing;

insert into public.subjects(id, kind, auth_user_id, status, created_at, updated_at)
values
  ('40000000-0000-0000-0000-000000000001', 'guest', null, 'active', now(), now()),
  ('40000000-0000-0000-0000-000000000002', 'member', '00000000-0000-0000-0000-000000000201', 'active', now(), now()),
  ('40000000-0000-0000-0000-000000000003', 'member', '00000000-0000-0000-0000-000000000202', 'active', now(), now()),
  ('40000000-0000-0000-0000-000000000004', 'guest', null, 'active', now(), now());

insert into public.guest_sessions(id, subject_id, token_hash, expires_at, created_at)
values
  ('41000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'hmac-sha256:k2:record-guest-1', now() + interval '1 day', now()),
  ('41000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000004', 'hmac-sha256:k2:record-guest-4', now() + interval '1 day', now());

insert into public.subject_merge_jobs(id, guest_subject_id, member_subject_id, guest_session_id, policy_version, status, conflicts_jsonb, idempotency_key, created_at)
values ('42000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','41000000-0000-0000-0000-000000000001','merge-policy-v1','detected','[]'::jsonb,'merge-1',now());

select pg_temp.assert_fails('one guest session cannot race into another member merge job',
  $$insert into public.subject_merge_jobs(id,guest_subject_id,member_subject_id,guest_session_id,policy_version,status,conflicts_jsonb,idempotency_key,created_at) values ('42000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000003','41000000-0000-0000-0000-000000000001','merge-policy-v1','detected','[]'::jsonb,'merge-race',now())$$,
  'subject_merge_jobs_guest_session_unique');

select pg_temp.assert_fails('merge job cannot use a guest as canonical member target',
  $$insert into public.subject_merge_jobs(id,guest_subject_id,member_subject_id,guest_session_id,policy_version,status,conflicts_jsonb,idempotency_key,created_at) values ('42000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000004','40000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000004','merge-policy-v1','detected','[]'::jsonb,'bad-target',now())$$,
  'ct_subject_merge_job_parties_valid');

select pg_temp.assert_fails('direct merged subject cannot point to another guest',
  $$update public.subjects set status='merged', merged_into_subject_id='40000000-0000-0000-0000-000000000001', updated_at=now() where id='40000000-0000-0000-0000-000000000004'$$,
  'ct_subject_merge_target_valid');

select pg_temp.assert_fails('applied merge import must identify target resource',
  $$insert into public.subject_merge_actions(id,merge_job_id,action_dedupe_key,domain_key,resource_type,source_resource_id,action_type,status,created_at) values ('43000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000001','a1','birth','birth_profile','source-1','import_new','applied',now())$$,
  'subject_merge_actions_applied_target_check');

insert into public.content_bundles(id,content_version,content_hash,artifact_ref,artifact_schema_version,min_client_capability,asset_manifest_hash,cue_schema_version,manifest_jsonb,published_at) values
('44000000-0000-0000-0000-000000000001','record-test-v1','sha256:v1:record-bundle-1','registry://record-1','bundle-v1','0.0.1-test','sha256:v1:record-assets-1','cue-v1','{}'::jsonb,now()),
('44000000-0000-0000-0000-000000000002','record-test-v2','sha256:v1:record-bundle-2','registry://record-2','bundle-v1','0.0.1-test','sha256:v1:record-assets-2','cue-v1','{}'::jsonb,now());

insert into public.content_releases(id,release_key,content_bundle_id,status,is_default,rollout_policy_version,rollout_seed,activated_at,created_at)
values ('44100000-0000-0000-0000-000000000001','record-release-1','44000000-0000-0000-0000-000000000001','active',false,'rollout-v1','record-seed-1',now(),now());

insert into public.characters(character_id,created_at) values ('record-char-01',now()),('record-char-02',now());
insert into public.character_runtime_catalog(character_id,content_bundle_id,availability,enabled,published_at) values
('record-char-01','44000000-0000-0000-0000-000000000001','available',true,now()),
('record-char-02','44000000-0000-0000-0000-000000000001','available',true,now());

insert into public.birth_profiles(id,subject_id,profile_kind,label,created_at,updated_at) values
('45000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','self','self-a',now(),now()),
('45000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001','target','target-a',now(),now()),
('45000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000002','self','self-b',now(),now()),
('45000000-0000-0000-0000-000000000005','40000000-0000-0000-0000-000000000001','target','target-unused',now(),now());

select pg_temp.assert_fails('one active self birth profile per subject',
  $$insert into public.birth_profiles(id,subject_id,profile_kind,created_at,updated_at) values ('45000000-0000-0000-0000-000000000004','40000000-0000-0000-0000-000000000001','self',now(),now())$$,
  'birth_profiles_one_active_self_idx');

insert into public.birth_profile_revisions(id,birth_profile_id,subject_id,revision_no,calendar_type,birth_date,birth_time,time_known,is_leap_month,sex,input_hash,created_at) values
('45100000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',1,'solar','2000-01-01','12:30',true,false,'unspecified','hmac-sha256:k2:birth-a-r1',now()),
('45100000-0000-0000-0000-000000000002','45000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001',1,'lunar','2001-02-03',null,false,false,null,'hmac-sha256:k2:birth-target-r1',now()),
('45100000-0000-0000-0000-000000000003','45000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000002',1,'solar','1999-05-05',null,false,false,'female','hmac-sha256:k2:birth-b-r1',now());

update public.birth_profiles set current_revision_id='45100000-0000-0000-0000-000000000001',updated_at=now() where id='45000000-0000-0000-0000-000000000001';

select pg_temp.assert_fails('birth revision cannot inject another owner',
  $$insert into public.birth_profile_revisions(id,birth_profile_id,subject_id,revision_no,calendar_type,birth_date,birth_time,time_known,is_leap_month,input_hash,created_at) values ('45100000-0000-0000-0000-000000000004','45000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002',2,'solar','2000-01-01',null,false,false,'hmac-sha256:k2:cross-owner',now())$$,
  'birth_profile_revisions_profile_subject_fk');

select pg_temp.assert_fails('time_known true requires a birth time',
  $$insert into public.birth_profile_revisions(id,birth_profile_id,subject_id,revision_no,calendar_type,birth_date,birth_time,time_known,is_leap_month,input_hash,created_at) values ('45100000-0000-0000-0000-000000000005','45000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',2,'solar','2000-01-01',null,true,false,'hmac-sha256:k2:bad-time',now())$$,
  'birth_profile_revisions_time_shape_check');

select pg_temp.assert_fails('birth current pointer cannot point to another logical profile revision',
  $$update public.birth_profiles set current_revision_id='45100000-0000-0000-0000-000000000002',updated_at=now() where id='45000000-0000-0000-0000-000000000001'$$,
  'birth_profiles_current_revision_fk');

insert into public.target_person_profiles(id,subject_id,birth_profile_id,display_label,created_at)
values ('45200000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000002','A',now());

select pg_temp.assert_fails('target person cannot point at self profile',
  $$insert into public.target_person_profiles(id,subject_id,birth_profile_id,display_label,created_at) values ('45200000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000001','not-target',now())$$,
  'ct_target_profile_kind');

select pg_temp.assert_fails('target person cannot inject another owner birth profile',
  $$insert into public.target_person_profiles(id,subject_id,birth_profile_id,display_label,created_at) values ('45200000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000002','45000000-0000-0000-0000-000000000005','cross-owner',now())$$,
  'target_person_profiles_birth_subject_fk');

insert into public.conversation_threads(id,subject_id,thread_type,status,active_content_release_id,active_content_bundle_id,created_at,updated_at)
values ('46000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','single_character','active','44100000-0000-0000-0000-000000000001','44000000-0000-0000-0000-000000000001',now(),now());
insert into public.conversation_thread_characters(id,thread_id,character_id,content_bundle_id,role,joined_at) values
('46100000-0000-0000-0000-000000000001','46000000-0000-0000-0000-000000000001','record-char-01','44000000-0000-0000-0000-000000000001','primary',now()),
('46100000-0000-0000-0000-000000000002','46000000-0000-0000-0000-000000000001','record-char-02','44000000-0000-0000-0000-000000000001','participant',now());
insert into public.chat_turns(id,thread_id,subject_id,client_turn_id,request_hash,request_contract_version,request_snapshot_jsonb,resolved_content_release_id,resolved_content_bundle_id,state,created_at,updated_at)
values ('46200000-0000-0000-0000-000000000001','46000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','record-turn-1','hmac-sha256:k2:record-turn-1','chat-v1','{}'::jsonb,'44100000-0000-0000-0000-000000000001','44000000-0000-0000-0000-000000000001','failed_final',now(),now());
insert into public.conversation_messages(id,thread_id,subject_id,turn_id,sequence_no,sender_type,thread_character_id,character_content_bundle_id,body_text,content_hash,created_at)
values ('46300000-0000-0000-0000-000000000001','46000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','46200000-0000-0000-0000-000000000001',1,'character','46100000-0000-0000-0000-000000000001','44000000-0000-0000-0000-000000000001','remember this','hmac-sha256:k2:record-message-1',now());

insert into public.life_facts(id,subject_id,fact_type,schema_version,value_jsonb,source_kind,source_message_id,confirmed_at,created_at)
values ('47000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','employment_status','employment_status/v1','{"status":"employed"}'::jsonb,'user_explicit','46300000-0000-0000-0000-000000000001',now(),now());
select pg_temp.assert_fails('life fact supersession preserves fact type',
  $$insert into public.life_facts(id,subject_id,fact_type,schema_version,value_jsonb,source_kind,supersedes_fact_id,confirmed_at,created_at) values ('47000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001','relationship_status','relationship_status/v1','{}','profile_edit','47000000-0000-0000-0000-000000000001',now(),now())$$,
  'ct_life_fact_supersession_integrity');
insert into public.life_facts(id,subject_id,fact_type,schema_version,value_jsonb,source_kind,supersedes_fact_id,confirmed_at,created_at)
values ('47000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000001','employment_status','employment_status/v1','{"status":"self_employed"}'::jsonb,'profile_edit','47000000-0000-0000-0000-000000000001',now(),now());
select pg_temp.assert_fails('life fact lineage cannot branch',
  $$insert into public.life_facts(id,subject_id,fact_type,schema_version,value_jsonb,source_kind,supersedes_fact_id,confirmed_at,created_at) values ('47000000-0000-0000-0000-000000000004','40000000-0000-0000-0000-000000000001','employment_status','employment_status/v1','{}','profile_edit','47000000-0000-0000-0000-000000000001',now(),now())$$,
  'life_facts_single_successor_idx');
select pg_temp.assert_fails('life fact source message cannot cross owner',
  $$insert into public.life_facts(id,subject_id,fact_type,schema_version,value_jsonb,source_kind,source_message_id,confirmed_at,created_at) values ('47000000-0000-0000-0000-000000000005','40000000-0000-0000-0000-000000000002','employment_status','employment_status/v1','{}','user_explicit','46300000-0000-0000-0000-000000000001',now(),now())$$,
  'life_facts_source_message_subject_fk');

insert into public.memory_items(id,subject_id,memory_type,schema_version,content_jsonb,source_kind,source_turn_id,source_message_id,created_by_character_id,created_at)
values ('47100000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','conversation_memory','conversation_memory/v1','{"topic":"work"}'::jsonb,'user_approved','46200000-0000-0000-0000-000000000001','46300000-0000-0000-0000-000000000001','record-char-01',now());
select pg_temp.assert_fails('memory creator must match source character message',
  $$insert into public.memory_items(id,subject_id,memory_type,schema_version,content_jsonb,source_kind,source_turn_id,source_message_id,created_by_character_id,created_at) values ('47100000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001','conversation_memory','conversation_memory/v1','{}','user_approved','46200000-0000-0000-0000-000000000001','46300000-0000-0000-0000-000000000001','record-char-02',now())$$,
  'ct_memory_item_source_character');

insert into public.memory_proposals(id,subject_id,character_id,proposal_kind,record_type,schema_version,proposed_value_jsonb,source_turn_id,source_message_id,proposal_dedupe_key,status,created_at)
values ('47200000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','record-char-01','memory','conversation_memory','conversation_memory/v1','{}','46200000-0000-0000-0000-000000000001','46300000-0000-0000-0000-000000000001','proposal-1','pending',now());
select pg_temp.assert_fails('memory proposal retry is deduped',
  $$insert into public.memory_proposals(id,subject_id,character_id,proposal_kind,record_type,schema_version,proposed_value_jsonb,source_turn_id,source_message_id,proposal_dedupe_key,status,created_at) values ('47200000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001','record-char-01','memory','conversation_memory','conversation_memory/v1','{}','46200000-0000-0000-0000-000000000001','46300000-0000-0000-0000-000000000001','proposal-1','pending',now())$$,
  'memory_proposals_retry_unique');
select pg_temp.assert_fails('accepted memory proposal requires accepted memory row',
  $$insert into public.memory_proposals(id,subject_id,character_id,proposal_kind,record_type,schema_version,proposed_value_jsonb,source_turn_id,proposal_dedupe_key,status,created_at,resolved_at) values ('47200000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000001','record-char-01','memory','conversation_memory','conversation_memory/v1','{}','46200000-0000-0000-0000-000000000001','proposal-bad-shape','accepted',now(),now())$$,
  'memory_proposals_resolution_shape_check');
select pg_temp.assert_fails('memory proposal source character cannot be forged',
  $$insert into public.memory_proposals(id,subject_id,character_id,proposal_kind,record_type,schema_version,proposed_value_jsonb,source_turn_id,source_message_id,proposal_dedupe_key,status,created_at) values ('47200000-0000-0000-0000-000000000004','40000000-0000-0000-0000-000000000001','record-char-02','memory','conversation_memory','conversation_memory/v1','{}','46200000-0000-0000-0000-000000000001','46300000-0000-0000-0000-000000000001','proposal-forged-char','pending',now())$$,
  'ct_memory_proposal_source_character');

insert into public.record_access_grants(id,subject_id,life_fact_id,grantee_character_id,grant_reason,granted_at)
values ('47300000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','47000000-0000-0000-0000-000000000003','record-char-01','user_choice',now());
select pg_temp.assert_fails('active grant snapshot cannot duplicate same life fact and character',
  $$insert into public.record_access_grants(id,subject_id,life_fact_id,grantee_character_id,grant_reason,granted_at) values ('47300000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001','47000000-0000-0000-0000-000000000003','record-char-01','user_choice',now())$$,
  'record_access_grants_active_life_fact_idx');
select pg_temp.assert_fails('grant must reference exactly one record kind',
  $$insert into public.record_access_grants(id,subject_id,life_fact_id,memory_item_id,grantee_character_id,grant_reason,granted_at) values ('47300000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000001','47000000-0000-0000-0000-000000000003','47100000-0000-0000-0000-000000000001','record-char-01','user_choice',now())$$,
  'record_access_grants_exactly_one_record_check');
select pg_temp.assert_fails('grant owner must equal record owner',
  $$insert into public.record_access_grants(id,subject_id,life_fact_id,grantee_character_id,grant_reason,granted_at) values ('47300000-0000-0000-0000-000000000004','40000000-0000-0000-0000-000000000002','47000000-0000-0000-0000-000000000003','record-char-01','user_choice',now())$$,
  'record_access_grants_life_fact_subject_fk');

insert into public.user_character_states(id,subject_id,character_id,closeness,trust,friction,relationship_stage,policy_version,revision,created_at,updated_at)
values ('48000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','record-char-01',0,0,0,'first_meeting','relationship-policy-v1',0,now(),now());
select pg_temp.assert_fails('one current relationship projection per subject and character',
  $$insert into public.user_character_states(id,subject_id,character_id,closeness,trust,friction,relationship_stage,policy_version,revision,created_at,updated_at) values ('48000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001','record-char-01',0,0,0,'first_meeting','relationship-policy-v1',0,now(),now())$$,
  'user_character_states_subject_character_unique');

insert into public.world_events(id,subject_id,event_type,event_schema_version,event_dedupe_key,source_turn_id,content_bundle_id,payload_jsonb,occurred_at)
values ('48100000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','conversation_event','world-event/v1','world-1','46200000-0000-0000-0000-000000000001','44000000-0000-0000-0000-000000000001','{}'::jsonb,now());
select pg_temp.assert_fails('world event retry is deduped',
  $$insert into public.world_events(id,subject_id,event_type,event_schema_version,event_dedupe_key,payload_jsonb,occurred_at) values ('48100000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001','conversation_event','world-event/v1','world-1','{}',now())$$,
  'world_events_subject_dedupe_unique');
select pg_temp.assert_fails('world event source turn cannot claim a different canon bundle',
  $$insert into public.world_events(id,subject_id,event_type,event_schema_version,event_dedupe_key,source_turn_id,content_bundle_id,payload_jsonb,occurred_at) values ('48100000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000001','conversation_event','world-event/v1','world-bad-bundle','46200000-0000-0000-0000-000000000001','44000000-0000-0000-0000-000000000002','{}',now())$$,
  'world_events_source_turn_bundle_fk');

insert into public.relationship_events(id,subject_id,character_id,event_type,event_schema_version,event_dedupe_key,source_turn_id,source_world_event_id,delta_closeness,delta_trust,delta_friction,policy_version,state_revision_before,state_revision_after,payload_jsonb,applied_at)
values ('48200000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','record-char-01','conversation_committed','relationship-event/v1','rel-1','46200000-0000-0000-0000-000000000001','48100000-0000-0000-0000-000000000001',1,1,0,'relationship-policy-v1',0,1,'{}'::jsonb,now());
select pg_temp.assert_fails('relationship applied revision cannot be occupied twice',
  $$insert into public.relationship_events(id,subject_id,character_id,event_type,event_schema_version,event_dedupe_key,delta_closeness,delta_trust,delta_friction,policy_version,state_revision_before,state_revision_after,applied_at) values ('48200000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001','record-char-01','other','relationship-event/v1','rel-2',0,0,0,'relationship-policy-v1',0,1,now())$$,
  'relationship_events_applied_revision_unique');
select pg_temp.assert_fails('relationship event revision must advance exactly one',
  $$insert into public.relationship_events(id,subject_id,character_id,event_type,event_schema_version,event_dedupe_key,delta_closeness,delta_trust,delta_friction,policy_version,state_revision_before,state_revision_after,applied_at) values ('48200000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000001','record-char-01','other','relationship-event/v1','rel-jump',0,0,0,'relationship-policy-v1',1,3,now())$$,
  'relationship_events_revision_step_check');
select pg_temp.assert_fails('relationship event cannot inject another subject into a relationship projection',
  $$insert into public.relationship_events(id,subject_id,character_id,event_type,event_schema_version,event_dedupe_key,delta_closeness,delta_trust,delta_friction,policy_version,state_revision_before,state_revision_after,applied_at) values ('48200000-0000-0000-0000-000000000004','40000000-0000-0000-0000-000000000002','record-char-01','other','relationship-event/v1','rel-cross-owner',0,0,0,'relationship-policy-v1',0,1,now())$$,
  'relationship_events_state_fk');

do $$
declare table_count integer;
begin
  select count(*) into table_count from information_schema.tables
  where table_schema='public' and table_name in (
    'subjects','profiles','guest_sessions','subject_merge_jobs','subject_merge_actions',
    'content_bundles','content_releases','characters','saju_domains','saju_domain_runtime','character_runtime_catalog','character_capabilities','character_relations',
    'birth_profiles','birth_profile_revisions','target_person_profiles',
    'conversation_threads','conversation_thread_characters','conversation_thread_content_transitions','chat_turns','chat_turn_attempts','conversation_messages',
    'life_facts','memory_items','memory_proposals','record_access_grants','user_character_states','world_events','relationship_events');
  if table_count <> 29 then raise exception 'FAIL expected 29 implemented catalog tables, found %', table_count; end if;
end;
$$;

select 'record/world authority negative tests passed' as result;
