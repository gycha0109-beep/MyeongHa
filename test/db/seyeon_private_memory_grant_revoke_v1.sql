-- Watchtower-Track: security
-- R17 restricted-role rehearsal on disposable CI PostgreSQL only.
-- Entire synthetic fixture is rolled back; never query Production personal data.
\set ON_ERROR_STOP on
begin;
do $preconditions$
begin
  if current_user <> 'postgres'
     or pg_catalog.to_regprocedure('seyeon_private.cmd_revoke_seyeon_memory_grant_v1(uuid,uuid)') is null
     or not exists (select 1 from pg_catalog.pg_proc
       where oid='seyeon_private.cmd_revoke_seyeon_memory_grant_v1(uuid,uuid)'::regprocedure
         and prosecdef and proowner='postgres'::regrole)
     or pg_catalog.has_function_privilege(
       'myeongha_api_executor',
       'public.cmd_revoke_memory_character_grant_v1(uuid,uuid,text)','EXECUTE')
     or pg_catalog.has_table_privilege('myeongha_api_executor','public.record_access_grants','UPDATE')
  then raise exception 'R17 candidate migration/ACL not installed safely'; end if;
end $preconditions$;

insert into auth.users(id) values
  ('a1710000-0000-4000-8000-000000000001'),
  ('a1710000-0000-4000-8000-000000000002')
on conflict do nothing;
insert into public.subjects(
  id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at
) values
  ('a1720000-0000-4000-8000-000000000001','member','a1710000-0000-4000-8000-000000000001','active',null,clock_timestamp(),clock_timestamp()),
  ('a1720000-0000-4000-8000-000000000002','member','a1710000-0000-4000-8000-000000000002','active',null,clock_timestamp(),clock_timestamp())
on conflict do nothing;
insert into public.characters(character_id,created_at,retired_at) values
 ('seyeon',clock_timestamp(),null),('r17-other',clock_timestamp(),null)
on conflict do nothing;
insert into public.memory_items(
  id,subject_id,memory_type,schema_version,content_jsonb,source_kind,
  source_turn_id,source_message_id,source_merge_action_id,
  created_by_character_id,revoked_at,created_at
) values
 ('a1730000-0000-4000-8000-000000000001',
  'a1720000-0000-4000-8000-000000000001',
  'shared_detail','memory-v1','{"value":"synthetic member one"}',
  'user_approved',null,null,null,'seyeon',null,clock_timestamp()),
 ('a1730000-0000-4000-8000-000000000002',
  'a1720000-0000-4000-8000-000000000002',
  'shared_detail','memory-v1','{"value":"synthetic member two"}',
  'user_approved',null,null,null,'seyeon',null,clock_timestamp());
insert into public.record_access_grants(
  id,subject_id,life_fact_id,memory_item_id,
  grantee_character_id,grant_reason,granted_at,revoked_at
) values
 ('a1740000-0000-4000-8000-000000000001','a1720000-0000-4000-8000-000000000001',
  null,'a1730000-0000-4000-8000-000000000001','seyeon','user_choice',clock_timestamp(),null),
 ('a1740000-0000-4000-8000-000000000002','a1720000-0000-4000-8000-000000000001',
  null,'a1730000-0000-4000-8000-000000000001','r17-other','user_choice',clock_timestamp(),null),
 ('a1740000-0000-4000-8000-000000000003','a1720000-0000-4000-8000-000000000002',
  null,'a1730000-0000-4000-8000-000000000002','seyeon','user_choice',clock_timestamp(),null);

set local role myeongha_api_executor;
select subject_id from public.begin_member_subject_context_v1(
  'a1710000-0000-4000-8000-000000000001'::uuid
);

do $revoke_tests$
declare v record;
begin
  -- Fixed Se-yeon only, same owned Memory, replay idempotent.
  select * into v from seyeon_private.cmd_revoke_seyeon_memory_grant_v1(
    'a1720000-0000-4000-8000-000000000001'::uuid,
    'a1730000-0000-4000-8000-000000000001'::uuid
  );
  if v.revoked_grant_count<>1 or v.replayed or v.character_id<>'seyeon' then
    raise exception 'R17 first revoke result mismatch';
  end if;
  select * into v from seyeon_private.cmd_revoke_seyeon_memory_grant_v1(
    'a1720000-0000-4000-8000-000000000001'::uuid,
    'a1730000-0000-4000-8000-000000000001'::uuid
  );
  if v.revoked_grant_count<>0 or not v.replayed then
    raise exception 'R17 second revoke must be replay/no-op';
  end if;

  -- A Member may neither forge a different canonical subject nor locate
  -- another Member's Memory under the Member's own context.
  begin
    perform * from seyeon_private.cmd_revoke_seyeon_memory_grant_v1(
      'a1720000-0000-4000-8000-000000000002'::uuid,
      'a1730000-0000-4000-8000-000000000002'::uuid
    );
    raise exception 'R17 forged subject unexpectedly admitted';
  exception when others then
    if sqlerrm='R17 forged subject unexpectedly admitted' then raise; end if;
  end;
  begin
    perform * from seyeon_private.cmd_revoke_seyeon_memory_grant_v1(
      'a1720000-0000-4000-8000-000000000001'::uuid,
      'a1730000-0000-4000-8000-000000000002'::uuid
    );
    raise exception 'R17 cross-owner Memory unexpectedly admitted';
  exception when others then
    if sqlerrm='R17 cross-owner Memory unexpectedly admitted' then raise; end if;
  end;
end $revoke_tests$;

reset role;
do $preserve$
begin
  if (select count(*) from public.record_access_grants
      where id='a1740000-0000-4000-8000-000000000001'
        and revoked_at is not null)<>1
     or (select count(*) from public.record_access_grants
      where id in ('a1740000-0000-4000-8000-000000000002',
                   'a1740000-0000-4000-8000-000000000003')
        and revoked_at is null)<>2
     or (select count(*) from public.memory_items
      where id in ('a1730000-0000-4000-8000-000000000001',
                   'a1730000-0000-4000-8000-000000000002')
        and revoked_at is null)<>2
  then raise exception 'R17 changed unrelated grant, owner or Memory'; end if;
end $preserve$;
rollback;
\echo 'PASS R17: private owner command restricted Member revoke/replay/cross-owner/other-character in disposable DB'
