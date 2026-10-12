-- Portable Supabase dump restore: mirror Production's function creation default
-- ACL on the disposable target's *creating* principal, before schema.sql.
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
     OR (pg_catalog.inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
         AND pg_catalog.inet_server_addr() IS DISTINCT FROM '::1'::inet)
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
END
$seyeon_isolated_acl_preflight$;

-- Global default PUBLIC grants cannot be removed by an IN SCHEMA REVOKE;
-- remove global PUBLIC first, then the explicit public-schema grants.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

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
