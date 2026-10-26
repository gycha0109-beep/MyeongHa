-- #1887: exact internal Se-yeon helper EXECUTE revoke.
-- Production grants service_role EXECUTE from the function owner.
-- The Production migration principal postgres has ADMIN membership in that
-- owner but NO SET/INHERIT privilege. A plain REVOKE from postgres is a no-op.
-- Watchtower-Track: db-authority-core
-- Never replay the remote-only 20261008090417 history.
BEGIN;

DO $seyeon_helper_acl_preflight$
DECLARE
  v_oid oid;
  v_owner text;
  v_is_definer boolean;
  v_service_grants bigint;
  v_owner_memberships bigint;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'HOLD_SEYEON_HELPER_ACL_UNEXPECTED_MIGRATION_PRINCIPAL';
  END IF;

  v_oid := to_regprocedure(
    'public.assert_seyeon_chat_thread_runtime_v1(uuid,uuid)'
  )::oid;
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'HOLD_SEYEON_HELPER_ACL_MISSING_FUNCTION';
  END IF;

  SELECT pg_get_userbyid(p.proowner),p.prosecdef
  INTO v_owner,v_is_definer
  FROM pg_catalog.pg_proc p WHERE p.oid=v_oid;

  IF v_owner IS DISTINCT FROM 'myeongha_seyeon_chat_runtime_owner'
     OR v_is_definer IS DISTINCT FROM FALSE
     OR to_regrole('service_role') IS NULL
     OR to_regrole('myeongha_api_executor') IS NULL
     OR NOT pg_catalog.has_function_privilege(
       'myeongha_seyeon_chat_runtime_owner',v_oid,'EXECUTE')
     OR pg_catalog.has_function_privilege('anon',v_oid,'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated',v_oid,'EXECUTE')
     OR pg_catalog.has_function_privilege(
       'myeongha_api_executor',v_oid,'EXECUTE')
  THEN
    RAISE EXCEPTION 'HOLD_SEYEON_HELPER_ACL_PREEXISTING_SCOPE_DRIFT';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.oid<>v_oid
      AND p.prosrc LIKE '%assert_seyeon_chat_thread_runtime_v1%'
      AND p.prosecdef IS DISTINCT FROM TRUE
  ) THEN
    RAISE EXCEPTION 'HOLD_SEYEON_HELPER_ACL_INVOKER_CALLER_PRESENT';
  END IF;

  -- No PUBLIC/inherited EXECUTE can be mistaken for the one reviewed owner
  -- grant. A scoped revoke may remove only the owner's direct edge.
  SELECT count(*) INTO v_service_grants
  FROM pg_catalog.pg_proc p,
       LATERAL aclexplode(p.proacl) a
  WHERE p.oid=v_oid
    AND a.grantee='service_role'::regrole
    AND a.privilege_type='EXECUTE'
    AND a.grantor='myeongha_seyeon_chat_runtime_owner'::regrole
    AND NOT a.is_grantable;
  IF pg_catalog.has_function_privilege('service_role',v_oid,'EXECUTE')
     AND v_service_grants<>1 THEN
    RAISE EXCEPTION 'HOLD_SEYEON_HELPER_ACL_UNEXPECTED_GRANTOR';
  END IF;

  -- Supabase Production: postgres may ADMIN the owner membership, but
  -- currently cannot SET/INHERIT it. Verify the exact preexisting edge
  -- before issuing an additional transaction-local SET-only membership.
  IF NOT pg_catalog.pg_has_role(
      'postgres','myeongha_seyeon_chat_runtime_owner','SET') THEN
    SELECT count(*) INTO v_owner_memberships
    FROM pg_catalog.pg_auth_members m
    WHERE m.roleid='myeongha_seyeon_chat_runtime_owner'::regrole
      AND m.member='postgres'::regrole
      AND m.admin_option
      AND NOT m.inherit_option
      AND NOT m.set_option
      AND m.grantor<>'postgres'::regrole;
    IF v_owner_memberships<>1 OR
       (SELECT count(*) FROM pg_catalog.pg_auth_members m
        WHERE m.roleid='myeongha_seyeon_chat_runtime_owner'::regrole
          AND m.member='postgres'::regrole)<>1
    THEN
      RAISE EXCEPTION 'HOLD_SEYEON_HELPER_ACL_OWNER_MEMBERSHIP_DRIFT';
    END IF;
  END IF;
END
$seyeon_helper_acl_preflight$;

DO $seyeon_helper_acl_temporary_owner_access$
BEGIN
  IF NOT pg_catalog.pg_has_role(
      'postgres','myeongha_seyeon_chat_runtime_owner','SET') THEN
    -- Adds a second grantor=postgres row; the preexisting provider-owned
    -- membership is never changed. Both rows are transaction-scoped here.
    EXECUTE 'GRANT myeongha_seyeon_chat_runtime_owner TO postgres
             WITH ADMIN FALSE, INHERIT FALSE, SET TRUE';
  END IF;
  IF NOT pg_catalog.pg_has_role(
      'postgres','myeongha_seyeon_chat_runtime_owner','SET') THEN
    RAISE EXCEPTION 'HOLD_SEYEON_HELPER_ACL_OWNER_SET_UNAVAILABLE';
  END IF;
END
$seyeon_helper_acl_temporary_owner_access$;

SET LOCAL ROLE myeongha_seyeon_chat_runtime_owner;
REVOKE EXECUTE ON FUNCTION
  public.assert_seyeon_chat_thread_runtime_v1(uuid,uuid)
  FROM service_role;
RESET ROLE;

DO $seyeon_helper_acl_restore_membership$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_auth_members m
    WHERE m.roleid='myeongha_seyeon_chat_runtime_owner'::regrole
      AND m.member='postgres'::regrole
      AND m.grantor='postgres'::regrole
  ) THEN
    IF (
      SELECT count(*) FROM pg_catalog.pg_auth_members m
      WHERE m.roleid='myeongha_seyeon_chat_runtime_owner'::regrole
        AND m.member='postgres'::regrole
        AND m.grantor='postgres'::regrole
        AND m.set_option AND NOT m.inherit_option AND NOT m.admin_option
    )<>1 THEN
      RAISE EXCEPTION 'HOLD_SEYEON_HELPER_ACL_TRANSIENT_MEMBERSHIP_DRIFT';
    END IF;
    EXECUTE 'REVOKE myeongha_seyeon_chat_runtime_owner
             FROM postgres GRANTED BY postgres';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_auth_members m
    WHERE m.roleid='myeongha_seyeon_chat_runtime_owner'::regrole
      AND m.member='postgres'::regrole
      AND m.grantor='postgres'::regrole
  ) THEN
    RAISE EXCEPTION 'HOLD_SEYEON_HELPER_ACL_TRANSIENT_MEMBERSHIP_REMAINS';
  END IF;
END
$seyeon_helper_acl_restore_membership$;

DO $seyeon_helper_acl_verify$
DECLARE
  v_oid oid;
BEGIN
  v_oid := to_regprocedure(
    'public.assert_seyeon_chat_thread_runtime_v1(uuid,uuid)'
  )::oid;
  IF current_user<>'postgres'
     OR v_oid IS NULL
     OR pg_catalog.has_function_privilege('service_role',v_oid,'EXECUTE')
     OR pg_catalog.has_function_privilege('anon',v_oid,'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated',v_oid,'EXECUTE')
     OR pg_catalog.has_function_privilege(
       'myeongha_api_executor',v_oid,'EXECUTE')
     OR NOT pg_catalog.has_function_privilege(
       'myeongha_seyeon_chat_runtime_owner',v_oid,'EXECUTE')
  THEN
    RAISE EXCEPTION 'HOLD_SEYEON_HELPER_ACL_POSTCONDITION_FAILURE';
  END IF;
END
$seyeon_helper_acl_verify$;

COMMIT;
