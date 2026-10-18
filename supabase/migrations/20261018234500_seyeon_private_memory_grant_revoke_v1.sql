-- Watchtower-Track: security
-- R17 REVIEW CANDIDATE ONLY. Not authorized for Production migration/ACL apply.
-- A narrow, non-Data-API schema boundary; public original SECURITY INVOKER
-- remains unchanged and ordinary executor receives NO table DML/SELECT grants.
begin;

do $preflight$
declare v_core oid;
begin
  v_core:=pg_catalog.to_regprocedure('public.cmd_revoke_memory_character_grant_v1(uuid,uuid,text)');
  if current_user <> 'postgres'
     or v_core is null
     or pg_catalog.to_regprocedure('public.assert_myeongha_subject_context_v1(uuid)') is null
     or exists (select 1 from pg_catalog.pg_namespace where nspname='seyeon_private')
     or not exists (
       select 1 from pg_catalog.pg_proc
       where oid=v_core and not prosecdef and
         proowner=(select oid from pg_catalog.pg_roles where rolname='postgres')
     )
     or not exists (
       select 1 from pg_catalog.pg_roles
       where rolname='myeongha_api_executor'
         and not rolcanlogin and not rolsuper and not rolbypassrls
         and not rolinherit and not rolcreatedb and not rolcreaterole
     ) then
    raise exception 'Se-yeon private revoke needs the pinned postgres-owned original, safe API executor, and new private schema';
  end if;
end $preflight$;

create schema seyeon_private authorization postgres;
revoke all on schema seyeon_private from public;

-- Keep the existing audited Subject FOR UPDATE -> owned Memory -> original
-- active SeYeon grants ordering and state-derived replay inside the invoker
-- command. This wrapper executes it as its narrow DB owner, not the caller.
create function seyeon_private.cmd_revoke_seyeon_memory_grant_v1(
  p_subject_id uuid, p_memory_item_id uuid
) returns table (
  memory_item_id uuid,
  character_id text,
  revoked_grant_count integer,
  replayed boolean
)
language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
set row_security=off
as $revoke$
begin
  if p_subject_id is null or p_memory_item_id is null then
    raise exception using errcode='23514',
      constraint='seyeon_private_revoke_required_ids',
      message='Se-yeon revoke requires canonical subject and memory locator';
  end if;

  -- Transaction-scoped, server-verified canonical Subject is mandatory.
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  -- The original command checks active canonical ownership, but not
  -- specifically Member kind. The wrapper must never authorize Guest.
  -- Same Subject lock namespace as R15 and the Node send-first candidate.
  perform 1 from public.subjects s
    where s.id=p_subject_id and s.kind='member' and s.status='active'
      and s.merged_into_subject_id is null
    for update;
  if not found then
    raise exception using errcode='42501',
      constraint='seyeon_private_revoke_member_required',
      message='Se-yeon revoke requires active canonical Member';
  end if;

  return query
  select core.memory_item_id,core.character_id,
         core.revoked_grant_count,core.replayed
  from public.cmd_revoke_memory_character_grant_v1(
    p_subject_id,p_memory_item_id,'seyeon'
  ) core;
end $revoke$;

-- Explicitly close Supabase default function grants and keep this schema out
-- of the exposed public API surface. The executor gets only USAGE + EXECUTE.
revoke all on function seyeon_private.cmd_revoke_seyeon_memory_grant_v1(uuid,uuid) from public;
do $direct_roles$
declare v_role text;
begin
  for v_role in select rolname from pg_catalog.pg_roles
      where rolname in ('anon','authenticated','service_role') loop
    execute format('revoke all on schema seyeon_private from %I',v_role);
    execute format(
      'revoke all on function seyeon_private.cmd_revoke_seyeon_memory_grant_v1(uuid,uuid) from %I',v_role
    );
  end loop;
end $direct_roles$;
grant usage on schema seyeon_private to myeongha_api_executor;
grant execute on function seyeon_private.cmd_revoke_seyeon_memory_grant_v1(uuid,uuid)
  to myeongha_api_executor;

do $verify$
declare v_role text;
begin
  if not pg_catalog.has_schema_privilege('myeongha_api_executor','seyeon_private','USAGE')
     or not pg_catalog.has_function_privilege(
        'myeongha_api_executor','seyeon_private.cmd_revoke_seyeon_memory_grant_v1(uuid,uuid)','EXECUTE')
     or pg_catalog.has_function_privilege(
        'myeongha_api_executor','public.cmd_revoke_memory_character_grant_v1(uuid,uuid,text)','EXECUTE')
     or pg_catalog.has_table_privilege('myeongha_api_executor','public.record_access_grants','UPDATE')
     or pg_catalog.has_table_privilege('myeongha_api_executor','public.subjects','UPDATE')
     or pg_catalog.has_table_privilege('myeongha_api_executor','public.record_access_grants','SELECT')
     or pg_catalog.has_table_privilege('myeongha_api_executor','public.memory_items','SELECT')
     or pg_catalog.has_function_privilege(
        'public','seyeon_private.cmd_revoke_seyeon_memory_grant_v1(uuid,uuid)','EXECUTE')
  then
    raise exception 'Se-yeon private revoke least-privilege ACL failed';
  end if;
  for v_role in select rolname from pg_catalog.pg_roles
      where rolname in ('anon','authenticated','service_role') loop
    if pg_catalog.has_schema_privilege(v_role,'seyeon_private','USAGE')
       or pg_catalog.has_function_privilege(
          v_role,'seyeon_private.cmd_revoke_seyeon_memory_grant_v1(uuid,uuid)','EXECUTE')
    then raise exception 'Se-yeon private revoke exposed to %',v_role;
    end if;
  end loop;
end $verify$;

comment on function seyeon_private.cmd_revoke_seyeon_memory_grant_v1(uuid,uuid)
  is 'R17 unmounted Member-only original SeYeon Grant revoke. Production DDL/ACL approval and runtime write admission HOLD.';
commit;
