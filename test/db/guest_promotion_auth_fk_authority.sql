-- Reproduce the hosted auth-schema permission boundary. Everything, including
-- the fixture-only REVOKE and injected CHECK, is rolled back after assertions.
begin;
revoke usage on schema auth from myeongha_guest_promotion_owner;

insert into auth.users(id) values
  ('e1000000-0000-0000-0000-000000000001'),
  ('e1000000-0000-0000-0000-000000000002');
insert into public.subjects(id,kind,status,created_at,updated_at) values
  ('e2000000-0000-0000-0000-000000000001','guest','active',now(),now()),
  ('e2000000-0000-0000-0000-000000000002','guest','active',now(),now()),
  ('e2000000-0000-0000-0000-000000000003','guest','active',now(),now());
insert into public.guest_sessions(id,subject_id,token_hash,expires_at,created_at) values
  ('e3000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001','fk-fixture-1',now()+interval '1 day',now()),
  ('e3000000-0000-0000-0000-000000000002','e2000000-0000-0000-0000-000000000002','fk-fixture-2',now()+interval '1 day',now()),
  ('e3000000-0000-0000-0000-000000000003','e2000000-0000-0000-0000-000000000003','fk-fixture-3',now()+interval '1 day',now());

set local role myeongha_api_executor;
select set_config('myeongha.subject_id','e2000000-0000-0000-0000-000000000001',true);
do $$
declare v_result record;
begin
  select * into strict v_result from public.cmd_promote_guest_runtime_v1(
    'e2000000-0000-0000-0000-000000000001',
    'e3000000-0000-0000-0000-000000000001',
    'e1000000-0000-0000-0000-000000000001');
  if v_result.subject_id <> 'e2000000-0000-0000-0000-000000000001'::uuid
     or v_result.subject_kind <> 'member' or v_result.subject_status <> 'active'
     or v_result.replayed then
    raise exception 'Promotion failed to preserve exact canonical owner';
  end if;
  select * into strict v_result from public.cmd_promote_guest_runtime_v1(
    'e2000000-0000-0000-0000-000000000001',
    'e3000000-0000-0000-0000-000000000001',
    'e1000000-0000-0000-0000-000000000001');
  if not v_result.replayed then raise exception 'Exact response-loss replay failed'; end if;
end;
$$;

select set_config('myeongha.subject_id','e2000000-0000-0000-0000-000000000002',true);
do $$
declare v_constraint text;
begin
  begin
    perform public.cmd_promote_guest_runtime_v1(
      'e2000000-0000-0000-0000-000000000002',
      'e3000000-0000-0000-0000-000000000002',
      'e1000000-0000-0000-0000-000000000099');
    raise exception 'Unknown identity unexpectedly promoted';
  exception when foreign_key_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'cmd_guest_promote_auth_identity_not_found' then raise; end if;
  end;
  begin
    perform public.cmd_promote_guest_runtime_v1(
      'e2000000-0000-0000-0000-000000000002',
      'e3000000-0000-0000-0000-000000000002',
      'e1000000-0000-0000-0000-000000000001');
    raise exception 'Existing Member identity unexpectedly rebound';
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'cmd_guest_promote_existing_member_requires_merge' then raise; end if;
  end;
  begin
    perform public.cmd_promote_guest_runtime_v1(
      'e2000000-0000-0000-0000-000000000003',
      'e3000000-0000-0000-0000-000000000003',
      'e1000000-0000-0000-0000-000000000002');
    raise exception 'Cross-subject context unexpectedly accepted';
  exception when insufficient_privilege then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'myeongha_subject_context_mismatch' then raise; end if;
  end;
end;
$$;

reset role;
alter table public.guest_sessions add constraint fixture_session_write_rejected
  check (subject_id <> 'e2000000-0000-0000-0000-000000000003'::uuid or consumed_at is null);
set local role myeongha_api_executor;
select set_config('myeongha.subject_id','e2000000-0000-0000-0000-000000000003',true);
do $$
declare v_constraint text;
begin
  begin
    perform public.cmd_promote_guest_runtime_v1(
      'e2000000-0000-0000-0000-000000000003',
      'e3000000-0000-0000-0000-000000000003',
      'e1000000-0000-0000-0000-000000000002');
    raise exception 'Injected session-write failure unexpectedly accepted';
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'fixture_session_write_rejected' then raise; end if;
  end;
  begin
    perform public.cmd_promote_guest_v1(null,null,null);
    raise exception 'API unexpectedly executed core promotion directly';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.subjects set kind='member';
    raise exception 'API unexpectedly updated subjects directly';
  exception when insufficient_privilege then null;
  end;
end;
$$;
set local role myeongha_guest_promotion_owner;
do $$
begin
  begin
    perform id from auth.users;
    raise exception 'Owner unexpectedly read auth.users without schema USAGE';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
do $$
begin
  if exists (
    select 1 from public.subjects s join public.guest_sessions gs on gs.subject_id=s.id
    where s.id in ('e2000000-0000-0000-0000-000000000002','e2000000-0000-0000-0000-000000000003')
      and (s.kind <> 'guest' or s.auth_user_id is not null or gs.consumed_at is not null)
  ) then raise exception 'Rejected promotion left partial subject/session writes'; end if;
  if not exists (
    select 1 from public.guest_sessions where id='e3000000-0000-0000-0000-000000000001'
      and consumed_at is not null and claimed_by_subject_id=subject_id
  ) then raise exception 'Successful promotion did not consume exact Guest session'; end if;
  if has_schema_privilege('myeongha_guest_promotion_owner','auth','USAGE')
     or has_table_privilege('myeongha_guest_promotion_owner','auth.users','SELECT')
     or has_schema_privilege('myeongha_api_executor','auth','USAGE')
     or has_table_privilege('myeongha_api_executor','auth.users','SELECT') then
    raise exception 'Promotion unexpectedly expanded auth authority';
  end if;
  if (select prosecdef from pg_proc where oid='public.cmd_promote_guest_v1(uuid,uuid,uuid)'::regprocedure) then
    raise exception 'Core promotion unexpectedly became SECURITY DEFINER';
  end if;
end;
$$;
rollback;
\echo guest promotion auth FK authority PASS
