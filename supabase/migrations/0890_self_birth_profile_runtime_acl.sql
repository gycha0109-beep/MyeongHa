-- Restore the production runtime ACL for the current self Birth Profile locator.
--
-- 0780 created qry_self_birth_profile_current_v1(uuid) while P0-AUTH-01 was still
-- unresolved and intentionally revoked PUBLIC EXECUTE. 0840 later established the
-- explicit myeongha_api_executor runtime allowlist, but this locator was omitted from
-- that allowlist. Production therefore reaches the function under SET LOCAL ROLE
-- myeongha_api_executor and fails with permission denied before it can return the
-- legitimate "no current self Birth Profile" empty result.
--
-- Keep the surface fail-closed to direct Supabase API roles and grant only the exact
-- SECURITY INVOKER function needed by GET /api/me/birth-profile.

revoke all on function public.qry_self_birth_profile_current_v1(uuid) from public;

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
      'revoke all on function public.qry_self_birth_profile_current_v1(uuid) from %I',
      v_role
    );
  END LOOP;
END
$$;

grant execute on function public.qry_self_birth_profile_current_v1(uuid)
to myeongha_api_executor;

DO $$
DECLARE
  v_role text;
BEGIN
  IF NOT pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.qry_self_birth_profile_current_v1(uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'myeongha_api_executor lacks qry_self_birth_profile_current_v1 EXECUTE';
  END IF;

  FOR v_role IN
    SELECT r.rolname
    FROM pg_catalog.pg_roles r
    WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
  LOOP
    IF pg_catalog.has_function_privilege(
      v_role,
      'public.qry_self_birth_profile_current_v1(uuid)'::pg_catalog.regprocedure,
      'EXECUTE'
    ) THEN
      RAISE EXCEPTION '% unexpectedly retains qry_self_birth_profile_current_v1 EXECUTE', v_role;
    END IF;
  END LOOP;
END
$$;
