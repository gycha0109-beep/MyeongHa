-- Portable Supabase dump restore: mirror Production's function creation default
-- ACL on the disposable target's *creating* principal, before schema.sql.
-- Applies to both function EXECUTE and table DML/default grants.
--
-- Production's postgres role has no global PUBLIC function EXECUTE and no
-- per-public-schema anon/authenticated default function EXECUTE. However the
-- isolated Supabase image creates the imported functions as supabase_admin,
-- whose default privileges can grant browser roles automatically. The SQL
-- dump may assume the source creation defaults and omit redundant REVOKEs.
--
-- This script must only be run on the loopback isolated PostgreSQL database.
-- The existing restored pg_proc exact-object privilege check is NOT relaxed.
-- Watchtower-Track: ops
\set ON_ERROR_STOP on

BEGIN;
SET LOCAL statement_timeout = '15s';

DO $seyeon_isolated_acl_preflight$
BEGIN
  IF NOT (
       (current_database() = 'postgres' AND current_user = 'supabase_admin')
       OR (current_database() ~ '^myeongha_ci_case_[0-9]+$'
           AND current_user = 'postgres')
     )
     OR current_setting('server_version_num')::integer < 170000
     OR current_setting('server_version_num')::integer >= 180000 THEN
    RAISE EXCEPTION 'HOLD_SEYEON_RESTORE: isolated default ACL principal/database/version mismatch';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles r
    WHERE r.rolname = 'anon' AND NOT r.rolsuper
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles r
    WHERE r.rolname = 'authenticated' AND NOT r.rolsuper
  ) THEN
    RAISE EXCEPTION 'HOLD_SEYEON_RESTORE: isolated browser roles missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname = 'service_role'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname = 'postgres'
  ) THEN
    RAISE EXCEPTION 'HOLD_SEYEON_RESTORE: isolated provider/application grantees missing';
  END IF;
END
$seyeon_isolated_acl_preflight$;

-- Global default PUBLIC grants cannot be removed by an IN SCHEMA REVOKE;
-- remove global PUBLIC first, then the explicit public-schema grants.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

-- Phase 8-A #6: first isolate a possible creator-default ACL drift.
-- The source dump was authored under postgres, but the disposable target
-- creates imported DDL under supabase_admin. The target creator can have
-- default service_role/postgres grants that the source schema-only dump
-- does not explicitly cancel. Remove only the *future* creator defaults
-- before replay. Explicit GRANTs from the source archive remain untouched.
-- This does NOT prove current source ACL equivalence, nor permit DR serving.
-- A creator must keep its own default ACL. In the disposable PG17 CI case,
-- current_user is postgres; removing postgres' own default function EXECUTE
-- can make built-in PUBLIC EXECUTE reappear. Only remove *other* grantees.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM service_role;

-- Production postgres has no default PUBLIC/anon/authenticated table grants
-- for app relationship tables. The isolated supabase_admin image grants
-- browser table DML when a new public table is created. Restrict only the
-- isolated creator's FUTURE table privileges before schema.sql replays.
-- Do not REVOKE from existing restored tables; an explicit unsafe GRANT must
-- still fail the downstream actual RLS/ACL assertion.
ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON TABLES FROM service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM service_role;

-- The restore workflow creates objects as supabase_admin, not postgres.
-- In that separate authorized isolated role, postgres is a noncreator
-- grantee and can safely be removed from future defaults as well.
DO $seyeon_isolated_noncreator_postgres_defaults$
BEGIN
  IF current_user = 'supabase_admin' THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM postgres';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM postgres';
    EXECUTE 'ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON TABLES FROM postgres';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM postgres';
  END IF;
END
$seyeon_isolated_noncreator_postgres_defaults$;

DO $seyeon_isolated_acl_assert$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_default_acl d
    JOIN pg_catalog.pg_roles r ON r.oid = d.defaclrole
    JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) a ON true
    WHERE r.rolname = current_user
      AND d.defaclobjtype = 'f'
      AND d.defaclnamespace IN (0, 'public'::regnamespace::oid)
      AND a.privilege_type = 'EXECUTE'
      AND (
        a.grantee = 0
        OR a.grantee IN ('anon'::regrole::oid, 'authenticated'::regrole::oid)
      )
  ) THEN
    RAISE EXCEPTION 'HOLD_SEYEON_RESTORE: creator retains PUBLIC/anon/authenticated default function EXECUTE';
  END IF;

  -- Fail closed on any table privilege in either the global creator
  -- default ACL or the public-schema delta. RLS is checked separately
  -- against the six real restored tables after the dump is replayed.
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_default_acl d
    JOIN pg_catalog.pg_roles r ON r.oid = d.defaclrole
    JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) a ON true
    WHERE r.rolname = current_user
      AND d.defaclobjtype = 'r'
      AND d.defaclnamespace IN (0, 'public'::regnamespace::oid)
      AND (
        a.grantee = 0
        OR a.grantee IN ('anon'::regrole::oid, 'authenticated'::regrole::oid)
      )
  ) THEN
    RAISE EXCEPTION 'HOLD_SEYEON_RESTORE: creator retains PUBLIC/anon/authenticated default table privileges';
  END IF;

  -- No silent grants from the isolated creator to provider service_role or
  -- the source principal postgres. Raw restored object grants are still
  -- checked downstream and are never replaced or inferred from this step.
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_default_acl d
    JOIN pg_catalog.pg_roles r ON r.oid = d.defaclrole
    JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) a ON true
    WHERE r.rolname = current_user
      AND d.defaclobjtype IN ('f', 'r')
      AND d.defaclnamespace IN (0, 'public'::regnamespace::oid)
      AND (
        a.grantee = 'service_role'::regrole::oid
        OR (current_user = 'supabase_admin' AND
            a.grantee = 'postgres'::regrole::oid)
      )
  ) THEN
    RAISE EXCEPTION 'HOLD_SEYEON_RESTORE: isolated creator retains unexpected noncreator service_role/postgres defaults';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_default_acl d
    JOIN pg_catalog.pg_roles r ON r.oid = d.defaclrole
    WHERE r.rolname = current_user
      AND d.defaclobjtype = 'f'
      AND d.defaclnamespace = 0
  ) THEN
    RAISE EXCEPTION 'HOLD_SEYEON_RESTORE: no restrictive global function default ACL materialized';
  END IF;
END
$seyeon_isolated_acl_assert$;

COMMIT;
SELECT 'PASS_SEYEON_ISOLATED_CREATOR_FUNCTION_DEFAULT_ACL' AS verdict;
