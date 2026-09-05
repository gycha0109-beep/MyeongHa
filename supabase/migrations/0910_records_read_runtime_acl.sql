-- Production owner Records read runtime ACL.
--
-- GET /api/life-record and GET /api/memories execute only after the server has
-- verified request identity, resolved the canonical subject inside a PostgreSQL
-- transaction, and SET LOCAL ROLE'd to the dedicated NOBYPASSRLS
-- myeongha_api_executor role. The underlying SECURITY INVOKER query functions
-- therefore need explicit EXECUTE only for that narrow runtime role.

revoke all on function public.qry_life_record_ledger_v1(uuid) from public;
revoke all on function public.qry_memory_items_v1(uuid) from public;

DO $$
DECLARE
  v_role text;
BEGIN
  FOR v_role IN
    SELECT r.rolname
    FROM pg_catalog.pg_roles r
    WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
  LOOP
    EXECUTE pg_catalog.format(
      'revoke all on function public.qry_life_record_ledger_v1(uuid) from %I',
      v_role
    );
    EXECUTE pg_catalog.format(
      'revoke all on function public.qry_memory_items_v1(uuid) from %I',
      v_role
    );
  END LOOP;
END
$$;

grant execute on function public.qry_life_record_ledger_v1(uuid)
to myeongha_api_executor;
grant execute on function public.qry_memory_items_v1(uuid)
to myeongha_api_executor;

DO $$
BEGIN
  IF NOT pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.qry_life_record_ledger_v1(uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'myeongha_api_executor lost qry_life_record_ledger_v1 EXECUTE';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.qry_memory_items_v1(uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'myeongha_api_executor lost qry_memory_items_v1 EXECUTE';
  END IF;

  IF pg_catalog.has_function_privilege(
    'anon',
    'public.qry_life_record_ledger_v1(uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'authenticated',
    'public.qry_life_record_ledger_v1(uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Supabase API roles unexpectedly retain Life Record read EXECUTE';
  END IF;

  IF pg_catalog.has_function_privilege(
    'anon',
    'public.qry_memory_items_v1(uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'authenticated',
    'public.qry_memory_items_v1(uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Supabase API roles unexpectedly retain Memory Items read EXECUTE';
  END IF;
END
$$;
