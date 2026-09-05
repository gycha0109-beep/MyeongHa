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

  raise notice 'PASS ordinary API role has no direct entitlement Grant/Event/projection mutation authority';
  raise notice 'PASS ordinary API role cannot execute internal entitlement projection recompute';
end;
$$;

select 'commerce entitlement mutation surface negative gate passed' as result;
