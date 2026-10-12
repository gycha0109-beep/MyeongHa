-- Watchtower-Track: character-memory
-- G1/G2 candidate only, *inside an isolated disposable PostgreSQL DB*.
-- NOT a migration, NOT a replacement for production zero-only Pin or Commit.
-- This proves positive Memory source provenance can be tied to a real
-- chat_turn_attempts row, locked/rechecked atomically, and held on regrant.
\set ON_ERROR_STOP on
begin;

do $guard$
begin
  if current_database() <> 'myeongha_seyeon_positive_pin_candidate_test' then
    raise exception 'refusing a non-disposable positive Pin candidate database';
  end if;
end $guard$;

insert into auth.users(id)
values ('d1000000-0000-4000-8000-000000000001') on conflict do nothing;
insert into public.subjects(id,kind,auth_user_id,status,created_at,updated_at)
values (
  'd2000000-0000-4000-8000-000000000001','member',
  'd1000000-0000-4000-8000-000000000001','active',
  clock_timestamp(),clock_timestamp()
);
insert into public.content_bundles(
  id,content_version,content_hash,artifact_ref,artifact_schema_version,
  min_client_capability,asset_manifest_hash,cue_schema_version,manifest_jsonb,published_at
) values (
  'd3000000-0000-4000-8000-000000000001','synthetic-v1',
  'sha256:v1:synthetic-bundle','test://seyeon-positive-pin','content-artifact-v1',
  '0.0.1-dev','sha256:v1:synthetic-assets','cue-v1','{}'::jsonb,clock_timestamp()
);
insert into public.content_releases(
  id,release_key,content_bundle_id,status,is_default,
  rollout_policy_version,rollout_seed,activated_at,created_at
) values (
  'd3100000-0000-4000-8000-000000000001','synthetic-positive-pin',
  'd3000000-0000-4000-8000-000000000001','active',false,
  'test-v1','synthetic',clock_timestamp(),clock_timestamp()
);
insert into public.characters(character_id,created_at)
values ('seyeon',clock_timestamp()) on conflict do nothing;
insert into public.character_runtime_catalog(
  character_id,content_bundle_id,availability,enabled,published_at
) values (
  'seyeon','d3000000-0000-4000-8000-000000000001',
  'available',true,clock_timestamp()
) on conflict do nothing;
insert into public.conversation_threads(
  id,subject_id,thread_type,status,title,active_content_release_id,
  active_content_bundle_id,content_revision,next_sequence_no,created_at,updated_at
) values (
  'd4000000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000001',
  'single_character','active','positive-pin-candidate',
  'd3100000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',
  0,1,clock_timestamp(),clock_timestamp()
);
insert into public.conversation_thread_characters(
  id,thread_id,character_id,content_bundle_id,role,joined_at
) values (
  'd4100000-0000-4000-8000-000000000001',
  'd4000000-0000-4000-8000-000000000001',
  'seyeon','d3000000-0000-4000-8000-000000000001',
  'primary',clock_timestamp()-interval '1 minute'
);
insert into public.memory_items(
  id,subject_id,memory_type,schema_version,content_jsonb,source_kind,
  created_by_character_id,revoked_at,created_at
) values
  ('d5000000-0000-4000-8000-000000000001',
   'd2000000-0000-4000-8000-000000000001',
   'shared_detail','memory-v1','{"v":"synthetic-consented-memory"}',
   'user_approved','seyeon',null,clock_timestamp()),
  ('d5000000-0000-4000-8000-000000000002',
   'd2000000-0000-4000-8000-000000000001',
   'shared_detail','memory-v1','{"v":"synthetic-other-memory"}',
   'user_approved','seyeon',null,clock_timestamp());
insert into public.record_access_grants(
  id,subject_id,life_fact_id,memory_item_id,grantee_character_id,
  grant_reason,granted_at,revoked_at
) values
  ('d6000000-0000-4000-8000-000000000001',
   'd2000000-0000-4000-8000-000000000001',null,
   'd5000000-0000-4000-8000-000000000001','seyeon',
   'user_choice',clock_timestamp(),null),
  ('d6000000-0000-4000-8000-000000000002',
   'd2000000-0000-4000-8000-000000000001',null,
   'd5000000-0000-4000-8000-000000000002','seyeon',
   'user_choice',clock_timestamp(),null);

select * from public.cmd_receive_chat_turn_v1(
  'd2000000-0000-4000-8000-000000000001',
  'd4000000-0000-4000-8000-000000000001',
  'synthetic-positive-memory-pin',
  'sha256:v1:synthetic-positive-request',
  'chat-request-v1',
  '{"clientTurnId":"synthetic-positive-memory-pin","text":"synthetic only","clientCapability":"0.0.1-dev"}'::jsonb,
  'd3100000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',
  'd7000000-0000-4000-8000-000000000001',
  'd7100000-0000-4000-8000-000000000001',
  'synthetic only',null,'sha256:v1:synthetic-user'
);
select * from public.cmd_allocate_chat_turn_attempt_v1(
  'd2000000-0000-4000-8000-000000000001',
  'd7000000-0000-4000-8000-000000000001',
  'd7200000-0000-4000-8000-000000000001',
  'seyeon-production-chat-planner-v1'
);

create schema seyeon_positive_candidate;
create table seyeon_positive_candidate.attempt_source_pins (
  attempt_id uuid primary key references public.chat_turn_attempts(id) on delete cascade,
  subject_id uuid not null references public.subjects(id),
  thread_id uuid not null references public.conversation_threads(id),
  turn_id uuid not null references public.chat_turns(id),
  original_record_kind text not null check(original_record_kind='memory'),
  original_memory_id uuid not null references public.memory_items(id),
  original_grant_id uuid not null references public.record_access_grants(id),
  original_record_type text not null,
  original_schema_version text not null,
  original_raw_digest text not null,
  pinned_at timestamptz not null default clock_timestamp(),
  state text not null default 'pinned' check (state in ('pinned','committed')),
  synthetic_assistant_text text null,
  constraint original_raw_digest_shape check (
    original_raw_digest ~ '^sha256:pg-jsonb:v1:[a-f0-9]{64}$'
  ),
  constraint candidate_commit_state check (
    (state='pinned' and synthetic_assistant_text is null)
    or (state='committed' and synthetic_assistant_text is not null)
  )
);

create function seyeon_positive_candidate.tr_immutable_pin_v1()
returns trigger language plpgsql as $$
begin
  if row(
      old.attempt_id,old.subject_id,old.thread_id,old.turn_id,
      old.original_record_kind,old.original_memory_id,old.original_grant_id,
      old.original_record_type,old.original_schema_version,
      old.original_raw_digest,old.pinned_at
    ) is distinct from row(
      new.attempt_id,new.subject_id,new.thread_id,new.turn_id,
      new.original_record_kind,new.original_memory_id,new.original_grant_id,
      new.original_record_type,new.original_schema_version,
      new.original_raw_digest,new.pinned_at
    ) then raise exception using errcode='23514',
      constraint='synthetic_positive_pin_immutable';
  end if;
  return new;
end $$;
create trigger seyeon_positive_candidate_immutable
before update on seyeon_positive_candidate.attempt_source_pins
for each row execute function seyeon_positive_candidate.tr_immutable_pin_v1();

-- The original Grant ID and Memory are looked up by DB. Incoming IDs are
-- locator claims only, NOT authorization or content proofs.
create function seyeon_positive_candidate.pin_before_model_v1(
  p_subject uuid,p_thread uuid,p_turn uuid,p_attempt uuid,
  p_memory uuid,p_grant uuid
) returns boolean language plpgsql security definer
set search_path=pg_catalog,public,seyeon_positive_candidate
as $pin$
declare v_record record; v_attempt record;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject);
  select a.id,a.state as attempt_state,t.state as turn_state
    into v_attempt
  from public.chat_turn_attempts a
  join public.chat_turns t on t.id=a.turn_id and t.subject_id=a.subject_id
  join public.conversation_threads th on th.id=t.thread_id and th.subject_id=t.subject_id
  where a.id=p_attempt and a.turn_id=p_turn and a.subject_id=p_subject
    and t.thread_id=p_thread
    and th.status='active'
  for share of a,t,th;
  if not found or v_attempt.attempt_state <> 'running'
    or v_attempt.turn_state <> 'planned' then return false; end if;
  perform 1 from public.subjects where id=p_subject
    and status='active' for share;
  if not found then return false; end if;
  select m.memory_type,m.schema_version,m.content_jsonb
    into v_record
  from public.record_access_grants g
  join public.memory_items m on m.id=g.memory_item_id and m.subject_id=g.subject_id
  where g.id=p_grant and g.subject_id=p_subject and g.memory_item_id=p_memory
    and g.grantee_character_id='seyeon' and g.revoked_at is null
    and m.revoked_at is null and m.source_kind='user_approved'
    and m.memory_type='shared_detail' and m.schema_version='memory-v1'
  for share of g,m;
  if not found then return false; end if;
  insert into seyeon_positive_candidate.attempt_source_pins(
    attempt_id,subject_id,thread_id,turn_id,
    original_record_kind,original_memory_id,original_grant_id,
    original_record_type,original_schema_version,original_raw_digest
  ) values (
    p_attempt,p_subject,p_thread,p_turn,'memory',p_memory,p_grant,
    v_record.memory_type,v_record.schema_version,
    'sha256:pg-jsonb:v1:'||
       encode(sha256(convert_to(v_record.content_jsonb::text,'UTF8')),'hex')
  );
  return true;
end $pin$;

-- DB Commit *candidate*: the authorization fence and synthetic receipt
-- mutation share one transaction. DOES NOT call Production Chat Commit.
create function seyeon_positive_candidate.commit_test_v1(
  p_subject uuid,p_attempt uuid,p_text text
) returns boolean language plpgsql security definer
set search_path=pg_catalog,public,seyeon_positive_candidate
as $commit$
declare v_pin record; v_current record;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject);
  select * into v_pin
  from seyeon_positive_candidate.attempt_source_pins
  where attempt_id=p_attempt and subject_id=p_subject and state='pinned'
  for update;
  if not found or p_text is null or p_text='' then return false; end if;
  perform 1 from public.subjects where id=p_subject
    and status='active' for share;
  if not found then return false; end if;
  select m.memory_type,m.schema_version,m.content_jsonb into v_current
  from public.record_access_grants g
  join public.memory_items m on m.id=g.memory_item_id and m.subject_id=g.subject_id
  where g.id=v_pin.original_grant_id and g.subject_id=p_subject
    and g.memory_item_id=v_pin.original_memory_id
    and g.grantee_character_id='seyeon' and g.revoked_at is null
    and m.revoked_at is null and m.source_kind='user_approved'
  for share of g,m;
  if not found
    or v_current.memory_type is distinct from v_pin.original_record_type
    or v_current.schema_version is distinct from v_pin.original_schema_version
    or 'sha256:pg-jsonb:v1:'||
       encode(sha256(convert_to(v_current.content_jsonb::text,'UTF8')),'hex')
       is distinct from v_pin.original_raw_digest then return false; end if;
  update seyeon_positive_candidate.attempt_source_pins
  set state='committed',synthetic_assistant_text=p_text
  where attempt_id=p_attempt and subject_id=p_subject;
  return true;
end $commit$;

create function seyeon_positive_candidate.reveal_test_v1(
  p_subject uuid,p_attempt uuid
) returns text language plpgsql security definer
set search_path=pg_catalog,public,seyeon_positive_candidate
as $reveal$
declare v_pin record; v_current record;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject);
  select * into v_pin
  from seyeon_positive_candidate.attempt_source_pins
  where attempt_id=p_attempt and subject_id=p_subject and state='committed'
  for share;
  if not found then return null; end if;
  perform 1 from public.subjects where id=p_subject
    and status='active' for share;
  if not found then return null; end if;
  select m.memory_type,m.schema_version,m.content_jsonb into v_current
  from public.record_access_grants g
  join public.memory_items m on m.id=g.memory_item_id and m.subject_id=g.subject_id
  where g.id=v_pin.original_grant_id and g.subject_id=p_subject
    and g.memory_item_id=v_pin.original_memory_id
    and g.grantee_character_id='seyeon' and g.revoked_at is null
    and m.revoked_at is null and m.source_kind='user_approved'
  for share of g,m;
  if not found
    or v_current.memory_type is distinct from v_pin.original_record_type
    or v_current.schema_version is distinct from v_pin.original_schema_version
    or 'sha256:pg-jsonb:v1:'||
       encode(sha256(convert_to(v_current.content_jsonb::text,'UTF8')),'hex')
       is distinct from v_pin.original_raw_digest then return null; end if;
  return v_pin.synthetic_assistant_text;
end $reveal$;

-- Test-only database role fence. No PUBLIC/anon/authenticated/service_role access.
revoke all on schema seyeon_positive_candidate from public,anon,authenticated,service_role;
revoke all on all tables in schema seyeon_positive_candidate
  from public,anon,authenticated,service_role,myeongha_api_executor;
revoke all on all functions in schema seyeon_positive_candidate from
  public,anon,authenticated,service_role;
grant usage on schema seyeon_positive_candidate to myeongha_api_executor;
grant execute on function seyeon_positive_candidate.pin_before_model_v1(
  uuid,uuid,uuid,uuid,uuid,uuid
) to myeongha_api_executor;
grant execute on function seyeon_positive_candidate.commit_test_v1(
  uuid,uuid,text
) to myeongha_api_executor;
grant execute on function seyeon_positive_candidate.reveal_test_v1(
  uuid,uuid
) to myeongha_api_executor;

do $acl$
begin
  if has_table_privilege('myeongha_api_executor',
    'seyeon_positive_candidate.attempt_source_pins','UPDATE')
    or has_function_privilege('public',
      'seyeon_positive_candidate.pin_before_model_v1(uuid,uuid,uuid,uuid,uuid,uuid)',
      'EXECUTE') then raise exception 'candidate ACL granted forbidden authority'; end if;
end $acl$;

set local role myeongha_api_executor;
set local myeongha.subject_id='d2000000-0000-4000-8000-000000000001';

do $test$
declare
  s uuid := 'd2000000-0000-4000-8000-000000000001';
  t uuid := 'd4000000-0000-4000-8000-000000000001';
  turn_id uuid := 'd7000000-0000-4000-8000-000000000001';
  v_attempt_id uuid := 'd7200000-0000-4000-8000-000000000001';
  m uuid := 'd5000000-0000-4000-8000-000000000001';
  g uuid := 'd6000000-0000-4000-8000-000000000001';
  v_bool boolean;
begin
  v_bool:=seyeon_positive_candidate.pin_before_model_v1(
    s,t,turn_id,v_attempt_id,m,g);
  if v_bool is distinct from true then
    raise exception 'positive exact Grant failed to pin on REAL running Attempt'; end if;
  begin
    update seyeon_positive_candidate.attempt_source_pins
    set original_grant_id='d6000000-0000-4000-8000-000000000002'
    where attempt_id=v_attempt_id;
    raise exception 'API executor directly changed immutable Pin';
  exception when insufficient_privilege then null;
  end;

  v_bool:=seyeon_positive_candidate.pin_before_model_v1(
    s,t,turn_id,v_attempt_id,m,
    'd6000000-0000-4000-8000-000000000002');
  if v_bool then
    raise exception 'wrong original Grant matched different Memory'; end if;
  begin
    perform seyeon_positive_candidate.pin_before_model_v1(
      s,t,turn_id,v_attempt_id,m,g);
    raise exception 'candidate admitted a duplicate Pin on same Attempt';
  exception when unique_violation then null;
  end;
  if seyeon_positive_candidate.commit_test_v1(
    s,'d7200000-0000-4000-8000-000000000099','bad-attempt'
  ) then raise exception 'other Attempt Commit admitted'; end if;

  -- A synthetic-only Commit and Reveal succeed with the original Grant.
  if not seyeon_positive_candidate.commit_test_v1(
    s,v_attempt_id,'SYNTHETIC_APPROVED_REPLY') then
    raise exception 'original Grant Commit was denied'; end if;
  if seyeon_positive_candidate.reveal_test_v1(s,v_attempt_id)
       is distinct from 'SYNTHETIC_APPROVED_REPLY' then
    raise exception 'authorized candidate Reveal failed'; end if;
end $test$;
reset role;

do $pin_receipt$
begin
  if not exists (
    select 1 from seyeon_positive_candidate.attempt_source_pins
    where attempt_id='d7200000-0000-4000-8000-000000000001'
      and original_grant_id='d6000000-0000-4000-8000-000000000001'
      and original_record_kind='memory'
      and original_raw_digest ~ '^sha256:pg-jsonb:v1:[a-f0-9]{64}$'
  ) then raise exception 'DB exact original source was not durably pinned'; end if;
end $pin_receipt$;

-- An independently minted replacement Grant never retroactively authorizes
-- the pinned Attempt. Revoke happens in the same disposable transaction here;
-- independent PostgreSQL session races are covered by the separate race test.
update public.record_access_grants
set revoked_at=clock_timestamp()
where id='d6000000-0000-4000-8000-000000000001';
insert into public.record_access_grants(
  id,subject_id,life_fact_id,memory_item_id,grantee_character_id,
  grant_reason,granted_at,revoked_at
) values (
  'd6000000-0000-4000-8000-000000000003',
  'd2000000-0000-4000-8000-000000000001',null,
  'd5000000-0000-4000-8000-000000000001','seyeon',
  'user_choice',clock_timestamp(),null
);
set local role myeongha_api_executor;
set local myeongha.subject_id='d2000000-0000-4000-8000-000000000001';
do $revoke$
begin
  if seyeon_positive_candidate.reveal_test_v1(
    'd2000000-0000-4000-8000-000000000001',
    'd7200000-0000-4000-8000-000000000001') is not null then
    raise exception 'replacement Grant revived original disclosure'; end if;
end $revoke$;
reset role;
-- A changed Memory payload (or schema) is also not retroactive authority.
update public.record_access_grants set revoked_at=clock_timestamp()
where id='d6000000-0000-4000-8000-000000000003';
update public.record_access_grants set revoked_at=null
where id='d6000000-0000-4000-8000-000000000001';
update public.memory_items set content_jsonb='{"v":"changed"}'::jsonb
where id='d5000000-0000-4000-8000-000000000001';
set local role myeongha_api_executor;
set local myeongha.subject_id='d2000000-0000-4000-8000-000000000001';
do $changed$
begin
  if seyeon_positive_candidate.reveal_test_v1(
    'd2000000-0000-4000-8000-000000000001',
    'd7200000-0000-4000-8000-000000000001') is not null then
    raise exception 'changed original Memory revived disclosure'; end if;
end $changed$;
reset role;
rollback;
\echo 'PASS offline-positive exact original Grant provenance Pin tied to REAL Chat Attempt; Commit/Reveal owner candidate, immutable ACL and regrant/content-change HOLD (all rolled back)'

  ) then raise exception 'DB exact original source was not durably pinned'; end if;
end $pin_receipt$;

-- An independently minted replacement Grant never retroactively authorizes
-- the pinned Attempt. Revoke happens in the same disposable transaction here;
-- independent PostgreSQL session races are covered by the separate race test.
update public.record_access_grants
set revoked_at=clock_timestamp()
where id='d6000000-0000-4000-8000-000000000001';
insert into public.record_access_grants(
  id,subject_id,life_fact_id,memory_item_id,grantee_character_id,
  grant_reason,granted_at,revoked_at
) values (
  'd6000000-0000-4000-8000-000000000003',
  'd2000000-0000-4000-8000-000000000001',null,
  'd5000000-0000-4000-8000-000000000001','seyeon',
  'user_choice',clock_timestamp(),null
);
set local role myeongha_api_executor;
set local myeongha.subject_id='d2000000-0000-4000-8000-000000000001';
do $revoke$
begin
  if seyeon_positive_candidate.reveal_test_v1(
    'd2000000-0000-4000-8000-000000000001',
    'd7200000-0000-4000-8000-000000000001') is not null then
    raise exception 'replacement Grant revived original disclosure'; end if;
end $revoke$;
reset role;
-- A changed Memory payload (or schema) is also not retroactive authority.
update public.record_access_grants set revoked_at=clock_timestamp()
where id='d6000000-0000-4000-8000-000000000003';
update public.record_access_grants set revoked_at=null
where id='d6000000-0000-4000-8000-000000000001';
update public.memory_items set content_jsonb='{"v":"changed"}'::jsonb
where id='d5000000-0000-4000-8000-000000000001';
set local role myeongha_api_executor;
set local myeongha.subject_id='d2000000-0000-4000-8000-000000000001';
do $changed$
begin
  if seyeon_positive_candidate.reveal_test_v1(
    'd2000000-0000-4000-8000-000000000001',
    'd7200000-0000-4000-8000-000000000001') is not null then
    raise exception 'changed original Memory revived disclosure'; end if;
end $changed$;
reset role;
rollback;
\echo 'PASS offline-positive exact original Grant provenance Pin tied to REAL Chat Attempt; Commit/Reveal owner candidate, immutable ACL and regrant/content-change HOLD (all rolled back)'
