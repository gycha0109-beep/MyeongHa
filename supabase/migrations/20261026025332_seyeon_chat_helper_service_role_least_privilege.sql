-- #1887: restore least-privilege ACL for the internal Seyeon chat scope
-- helper. Production had an extra service_role EXECUTE edge not in the
-- repository contract. Every observed SQL caller is SECURITY DEFINER.
-- Watchtower-Track: db-authority-core
-- This migration does not repair/replay remote-only 20261008090417 and must
-- NOT be deployed until the governed Production migration lineage is admitted.
begin;

do $seyeon_helper_acl_preflight$
declare
  v_oid oid;
  v_owner text;
  v_is_definer boolean;
begin
  if current_user <> 'postgres' then
    raise exception 'HOLD_SEYEON_HELPER_ACL_UNEXPECTED_MIGRATION_PRINCIPAL';
  end if;

  v_oid := to_regprocedure(
    'public.assert_seyeon_chat_thread_runtime_v1(uuid,uuid)'
  )::oid;
  if v_oid is null then
    raise exception 'HOLD_SEYEON_HELPER_ACL_MISSING_FUNCTION';
  end if;

  select pg_get_userbyid(p.proowner), p.prosecdef
    into v_owner, v_is_definer
  from pg_catalog.pg_proc p where p.oid=v_oid;

  if v_owner is distinct from 'myeongha_seyeon_chat_runtime_owner'
     or v_is_definer is distinct from false
     or to_regrole('service_role') is null
     or to_regrole('myeongha_api_executor') is null
     or not pg_catalog.has_function_privilege(
       'myeongha_seyeon_chat_runtime_owner',v_oid,'EXECUTE'
     )
     or pg_catalog.has_function_privilege('anon',v_oid,'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated',v_oid,'EXECUTE')
     or pg_catalog.has_function_privilege(
       'myeongha_api_executor',v_oid,'EXECUTE'
     ) then
    raise exception 'HOLD_SEYEON_HELPER_ACL_PREEXISTING_SCOPE_DRIFT';
  end if;

  -- SECURITY INVOKER callers would run under their external principal.
  -- Do not revoke an edge on which a newly introduced invoker depends.
  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.oid<>v_oid
      and p.prosrc like '%assert_seyeon_chat_thread_runtime_v1%'
      and p.prosecdef is distinct from true
  ) then
    raise exception 'HOLD_SEYEON_HELPER_ACL_INVOKER_CALLER_PRESENT';
  end if;
end
$seyeon_helper_acl_preflight$;

-- Idempotent: if the extra direct grant is already absent, this is a no-op.
revoke execute on function public.assert_seyeon_chat_thread_runtime_v1(
  uuid,uuid
) from service_role;

do $seyeon_helper_acl_verify$
declare
  v_oid oid;
begin
  v_oid := to_regprocedure(
    'public.assert_seyeon_chat_thread_runtime_v1(uuid,uuid)'
  )::oid;
  if v_oid is null
     or pg_catalog.has_function_privilege(
       'service_role',v_oid,'EXECUTE'
     )
     or pg_catalog.has_function_privilege('anon',v_oid,'EXECUTE')
     or pg_catalog.has_function_privilege(
       'authenticated',v_oid,'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'myeongha_api_executor',v_oid,'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'myeongha_seyeon_chat_runtime_owner',v_oid,'EXECUTE'
     ) then
    raise exception 'HOLD_SEYEON_HELPER_ACL_POSTCONDITION_FAILURE';
  end if;
end
$seyeon_helper_acl_verify$;

commit;
