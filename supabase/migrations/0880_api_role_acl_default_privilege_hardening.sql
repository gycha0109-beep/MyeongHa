-- Permanently close direct Supabase API-role authority over the MyeongHa public schema.
--
-- Production Data API exposure is separately contained with PostgREST db_schema="".
-- This migration removes the underlying latent database authority for anon/authenticated
-- and prevents postgres-owned future public objects from re-acquiring it through
-- Supabase/PostgreSQL default privileges.
--
-- service_role is intentionally NOT targeted here. supabase_admin default privileges
-- are intentionally NOT altered: both require separate platform-authority review.
--
-- Some runtime functions are deliberately transferred to narrow myeongha_* owners.
-- The migration principal must not mutate those functions: their ACLs were hardened by
-- the owner-transfer migrations that created them. This migration only mutates public
-- functions owned by current_user and verifies all MyeongHa-owned application functions
-- are already fail-closed to anon/authenticated.

DO $$
DECLARE
  v_role text;
  v_function record;
BEGIN
  FOR v_role IN
    SELECT r.rolname
    FROM pg_catalog.pg_roles r
    WHERE r.rolname IN ('anon', 'authenticated')
  LOOP
    -- Existing application objects: fail closed across every public table/sequence.
    EXECUTE pg_catalog.format(
      'revoke all privileges on all tables in schema public from %I',
      v_role
    );
    EXECUTE pg_catalog.format(
      'revoke all privileges on all sequences in schema public from %I',
      v_role
    );

    -- Revoke explicit API-role function grants only where the migration principal owns
    -- the function. Narrow myeongha_* owners remain untouched and are verified below.
    FOR v_function IN
      SELECT n.nspname,
             p.proname,
             pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_args
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.prokind = 'f'
        AND p.proowner = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user)
      ORDER BY p.oid
    LOOP
      EXECUTE pg_catalog.format(
        'revoke all privileges on function %I.%I(%s) from %I',
        v_function.nspname,
        v_function.proname,
        v_function.identity_args,
        v_role
      );
    END LOOP;

    -- API roles may retain schema USAGE for platform compatibility, but they may not
    -- create new objects in the application schema.
    EXECUTE pg_catalog.format(
      'revoke create on schema public from %I',
      v_role
    );

    -- Future postgres-owned application objects must not automatically regain API-role
    -- privileges. This intentionally leaves service_role default ACLs unchanged.
    EXECUTE pg_catalog.format(
      'alter default privileges for role postgres in schema public revoke all privileges on tables from %I',
      v_role
    );
    EXECUTE pg_catalog.format(
      'alter default privileges for role postgres in schema public revoke all privileges on sequences from %I',
      v_role
    );
    EXECUTE pg_catalog.format(
      'alter default privileges for role postgres in schema public revoke all privileges on functions from %I',
      v_role
    );
  END LOOP;
END
$$;

-- Remove PUBLIC EXECUTE from existing public functions owned by the migration principal.
-- Narrow myeongha_* owner functions were already explicitly revoked from PUBLIC when
-- ownership was transferred and are verified below rather than mutated here.
DO $$
DECLARE
  v_function record;
BEGIN
  FOR v_function IN
    SELECT n.nspname,
           p.proname,
           pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_args
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proowner = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user)
    ORDER BY p.oid
  LOOP
    EXECUTE pg_catalog.format(
      'revoke all privileges on function %I.%I(%s) from public',
      v_function.nspname,
      v_function.proname,
      v_function.identity_args
    );
  END LOOP;
END
$$;

-- PostgreSQL grants EXECUTE on newly-created functions to PUBLIC through the global
-- function default. Per-schema default privileges are additive and cannot subtract that
-- global grant, so this PUBLIC revoke must intentionally be global for postgres-created
-- functions. Explicit function grants remain the runtime authority mechanism.
alter default privileges for role postgres
  revoke execute on functions from public;

-- Production-safety assertions. A failed assertion aborts the migration instead of
-- accepting a partially hardened ACL surface.
DO $$
DECLARE
  v_role text;
  v_count integer;
BEGIN
  FOR v_role IN
    SELECT r.rolname
    FROM pg_catalog.pg_roles r
    WHERE r.rolname IN ('anon', 'authenticated')
  LOOP
    SELECT count(*)
      INTO v_count
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND (
        pg_catalog.has_table_privilege(v_role, c.oid, 'SELECT')
        OR pg_catalog.has_table_privilege(v_role, c.oid, 'INSERT')
        OR pg_catalog.has_table_privilege(v_role, c.oid, 'UPDATE')
        OR pg_catalog.has_table_privilege(v_role, c.oid, 'DELETE')
        OR pg_catalog.has_table_privilege(v_role, c.oid, 'TRUNCATE')
        OR pg_catalog.has_table_privilege(v_role, c.oid, 'REFERENCES')
        OR pg_catalog.has_table_privilege(v_role, c.oid, 'TRIGGER')
      );

    IF v_count <> 0 THEN
      RAISE EXCEPTION '% still has effective privileges on % public table-like objects',
        v_role, v_count;
    END IF;

    SELECT count(*)
      INTO v_count
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'S'
      AND (
        pg_catalog.has_sequence_privilege(v_role, c.oid, 'USAGE')
        OR pg_catalog.has_sequence_privilege(v_role, c.oid, 'SELECT')
        OR pg_catalog.has_sequence_privilege(v_role, c.oid, 'UPDATE')
      );

    IF v_count <> 0 THEN
      RAISE EXCEPTION '% still has effective privileges on % public sequences',
        v_role, v_count;
    END IF;

    -- Application-function closure is asserted across postgres-owned functions plus
    -- deliberately narrow myeongha_* owners. Supabase/platform-owned public helpers are
    -- outside this migration's authority and are not reclassified here.
    SELECT count(*)
      INTO v_count
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_catalog.pg_roles owner_role ON owner_role.oid = p.proowner
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND (
        owner_role.rolname = current_user
        OR owner_role.rolname LIKE 'myeongha\_%' ESCAPE '\'
      )
      AND pg_catalog.has_function_privilege(v_role, p.oid, 'EXECUTE');

    IF v_count <> 0 THEN
      RAISE EXCEPTION '% still has effective EXECUTE on % MyeongHa application functions',
        v_role, v_count;
    END IF;

    IF pg_catalog.has_schema_privilege(v_role, 'public', 'CREATE') THEN
      RAISE EXCEPTION '% unexpectedly retains CREATE on public schema', v_role;
    END IF;
  END LOOP;

  -- Preserve the narrow production runtime authority established by 0840/0850/0870.
  IF NOT pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.qry_guest_bootstrap_current_v1(uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'myeongha_api_executor lost qry_guest_bootstrap_current_v1 EXECUTE';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.cmd_promote_guest_runtime_v1(uuid,uuid,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'myeongha_api_executor lost cmd_promote_guest_runtime_v1 EXECUTE';
  END IF;
END
$$;