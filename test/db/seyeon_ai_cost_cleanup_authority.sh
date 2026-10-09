#!/usr/bin/env bash
set -euo pipefail

psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
do $cost_ledger_cleanup_guard$
declare
  v_oid oid;
  v_owner text;
  v_security_definer boolean;
begin
  select p.oid, pg_catalog.pg_get_userbyid(p.proowner), p.prosecdef
    into v_oid, v_owner, v_security_definer
  from pg_catalog.pg_proc p
  where p.oid='public.cleanup_seyeon_ai_cost_on_attempt_delete_v1()'::pg_catalog.regprocedure;

  if v_owner is distinct from 'myeongha_seyeon_cost_meter_owner'
     or v_security_definer is distinct from false then
    raise exception 'Se-yeon cost ledger cleanup must remain SECURITY INVOKER with a narrow owner';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_roles r
    where r.rolname = v_owner
      and not r.rolcanlogin and not r.rolsuper
      and not r.rolcreatedb and not r.rolcreaterole
      and not r.rolinherit and not r.rolreplication
      and not r.rolbypassrls
  ) then
    raise exception 'Se-yeon cost meter cleanup owner role is too privileged';
  end if;

  if pg_catalog.has_function_privilege(
      'myeongha_api_executor',
      'public.cleanup_seyeon_ai_cost_on_attempt_delete_v1()',
      'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon',
       'public.cleanup_seyeon_ai_cost_on_attempt_delete_v1()',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       'public.cleanup_seyeon_ai_cost_on_attempt_delete_v1()',
       'EXECUTE'
     )
  then
    raise exception 'Cost ledger cleanup trigger leaked direct execute privilege';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_class c
    where c.oid='public.seyeon_ai_call_cost_events'::pg_catalog.regclass
      and c.relrowsecurity and c.relforcerowsecurity
  ) then
    raise exception 'Se-yeon cost ledger must have forced RLS';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_trigger tg
    where tg.tgrelid='public.chat_turn_attempts'::pg_catalog.regclass
      and tg.tgfoid=v_oid and not tg.tgisinternal
      and (tg.tgtype & 8) = 8
  ) then
    raise exception 'Attempt delete must execute Se-yeon cost cleanup trigger';
  end if;
end
$cost_ledger_cleanup_guard$;
SQL
echo "Se-yeon AI Cost Ledger cleanup authority PASS"
