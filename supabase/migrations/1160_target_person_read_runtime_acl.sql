-- Production owner-scoped Target Person read authority.
--
-- Compatibility Reading needs a trusted Target Person selector, but this migration grants
-- read-only execution only. It does not activate compatibility Product Reading transport,
-- mutate Target Person metadata, create/deactivate target Birth data, or weaken the
-- Production Interpretation Authority hold.
--
-- The SECURITY INVOKER queries remain subject-bound by the ordinary
-- myeongha_api_executor transaction model. Browser-facing Supabase roles retain no direct
-- EXECUTE privilege.

revoke all on function public.qry_target_persons_v1(uuid) from public;
revoke all on function public.qry_target_person_v1(uuid, uuid) from public;

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
      'revoke all on function public.qry_target_persons_v1(uuid) from %I',
      v_role
    );
    EXECUTE pg_catalog.format(
      'revoke all on function public.qry_target_person_v1(uuid,uuid) from %I',
      v_role
    );
  END LOOP;
END
$$;

grant execute on function public.qry_target_persons_v1(uuid)
to myeongha_api_executor;

grant execute on function public.qry_target_person_v1(uuid, uuid)
to myeongha_api_executor;

DO $$
DECLARE
  v_role text;
BEGIN
  IF NOT pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.qry_target_persons_v1(uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'myeongha_api_executor must execute owner-scoped Target Person list query';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.qry_target_person_v1(uuid,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'myeongha_api_executor must execute owner-scoped Target Person detail query';
  END IF;

  FOR v_role IN
    SELECT r.rolname
    FROM pg_catalog.pg_roles r
    WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
  LOOP
    IF pg_catalog.has_function_privilege(
      v_role,
      'public.qry_target_persons_v1(uuid)'::pg_catalog.regprocedure,
      'EXECUTE'
    ) OR pg_catalog.has_function_privilege(
      v_role,
      'public.qry_target_person_v1(uuid,uuid)'::pg_catalog.regprocedure,
      'EXECUTE'
    ) THEN
      RAISE EXCEPTION '% must not execute owner-scoped Target Person read queries', v_role;
    END IF;
  END LOOP;
END
$$;
