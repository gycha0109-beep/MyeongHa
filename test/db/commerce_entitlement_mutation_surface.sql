\set ON_ERROR_STOP on

-- CE-20 / authority negative gate:
-- the ordinary production API execution role may read through explicitly exposed
-- authorities, but it must never acquire direct table mutation authority over the
-- Grant/Event source ledgers or the Effective Entitlement projection.
--
-- This test intentionally does not constrain SELECT privileges: a future governed
-- entitlement read slice may grant narrow read authority without weakening CE-20.
do $$
declare
  v_table text;
  v_privilege text;
  v_role text;
begin
  foreach v_table in array array[
    'entitlement_grants',
    'entitlement_events',
    'entitlements'
  ]
  loop
    foreach v_privilege in array array[
      'INSERT',
      'UPDATE',
      'DELETE',
      'TRUNCATE'
    ]
    loop
      if pg_catalog.has_table_privilege(
        'myeongha_api_executor',
        pg_catalog.format('public.%I', v_table),
        v_privilege
      ) then
        raise exception
          'FAIL myeongha_api_executor unexpectedly has % on public.%',
          v_privilege,
          v_table;
      end if;
    end loop;
  end loop;

  if pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.internal_recompute_entitlement_projection_v1(uuid,text,text)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) then
    raise exception
      'FAIL myeongha_api_executor unexpectedly has EXECUTE on internal entitlement projection recompute';
  end if;

  for v_role in
    select r.rolname
    from pg_catalog.pg_roles r
    where r.rolname in ('anon', 'authenticated', 'service_role', 'myeongha_api_executor')
  loop
    if pg_catalog.has_function_privilege(
      v_role,
      'public.internal_apply_entitlement_effect_v1(text,uuid,uuid,text,bigint,text,text,timestamptz,text,timestamptz,timestamptz,text)'::pg_catalog.regprocedure,
      'EXECUTE'
    ) then
      raise exception
        'FAIL % unexpectedly has EXECUTE on internal EntitlementEffect apply',
        v_role;
    end if;
  end loop;

  raise notice 'PASS ordinary API role has no direct entitlement Grant/Event/projection mutation authority';
  raise notice 'PASS ordinary API role cannot execute internal entitlement projection recompute';
  raise notice 'PASS client/API roles cannot execute internal EntitlementEffect apply';
end;
$$;

select 'commerce entitlement mutation surface negative gate passed' as result;
