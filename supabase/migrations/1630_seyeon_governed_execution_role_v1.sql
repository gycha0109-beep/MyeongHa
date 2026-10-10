-- Se-yeon PR-04D3B2B-3B1: dormant, least-privilege governed DB execution ROLE.
-- Watchtower-Track: character-memory
-- NO LOGIN principal, no member/credential assignment, no Production switch.
-- Existing myeongha_api_executor and all OFF grants are left untouched.

do $governed_role$
begin
  if not exists (
    select 1 from pg_catalog.pg_roles
    where rolname='myeongha_seyeon_governed_executor'
  ) then
    create role myeongha_seyeon_governed_executor
      nologin nosuperuser nocreatedb nocreaterole
      noinherit noreplication nobypassrls;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_roles
    where rolname='myeongha_seyeon_governed_executor'
      and not rolcanlogin and not rolsuper and not rolcreatedb
      and not rolcreaterole and not rolinherit
      and not rolreplication and not rolbypassrls
  ) then
    raise exception 'Governed executor role privilege shape drifted';
  end if;
  if pg_catalog.pg_has_role('myeongha_seyeon_governed_executor',
      'myeongha_api_executor','MEMBER')
     or pg_catalog.pg_has_role('myeongha_api_executor',
      'myeongha_seyeon_governed_executor','MEMBER')
     or pg_catalog.pg_has_role('myeongha_seyeon_governed_executor',
      'myeongha_seyeon_cost_meter_owner','MEMBER') then
    raise exception 'Governed executor has unsafe inherited/common role membership';
  end if;
end $governed_role$;

-- The Subject-bound runner needs only narrow context resolution and the
-- two governed cost lifecycle RPCs. No direct ledger/table credentials.
grant usage on schema public to myeongha_seyeon_governed_executor;

grant execute on function public.current_myeongha_subject_id()
  to myeongha_seyeon_governed_executor;
grant execute on function public.assert_myeongha_subject_context_v1(uuid)
  to myeongha_seyeon_governed_executor;
grant execute on function public.begin_member_subject_context_v1(uuid)
  to myeongha_seyeon_governed_executor;
grant execute on function public.begin_guest_subject_context_v1(text)
  to myeongha_seyeon_governed_executor;

grant execute on function public.cmd_governed_start_seyeon_ai_call_v1(
  uuid,uuid,uuid,text,uuid,text,text,text,text,text,bigint,bigint,bigint
) to myeongha_seyeon_governed_executor;
grant execute on function public.cmd_governed_settle_seyeon_ai_call_v1(
  uuid,uuid,uuid,text,jsonb
) to myeongha_seyeon_governed_executor;

-- This does not grant a LOGIN identity. Future Postgres credential provisioning
-- MUST be a separate reviewed operation whose session_user cannot SET ROLE
-- to myeongha_api_executor or the cost_meter_owner, and cannot use an
-- elevated shared pool. No grant on legacy Start, Settle, Record.
