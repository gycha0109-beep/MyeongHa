-- CI-only REAL PostgreSQL LOGIN principals for the disposable Saju bridge DB.
-- Watchtower-Track: saju-bridge
-- This file must never become a Supabase migration or execute on Production.
-- Run with psql -v subject_password=... -v nonce_password=... after migrations.

\set ON_ERROR_STOP on
DO $local_only$
BEGIN
  IF current_database() <> 'myeongha_saju_local_verify'
    OR current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Refusing live restricted-login fixture outside disposable test DB';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'myeongha_runtime'
      AND rolcanlogin AND NOT rolsuper AND NOT rolcreatedb
      AND NOT rolcreaterole AND NOT rolinherit AND NOT rolreplication AND NOT rolbypassrls
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'myeongha_saju_proof_nonce_runtime'
      AND NOT rolcanlogin AND NOT rolsuper AND NOT rolinherit AND NOT rolbypassrls
  ) THEN
    RAISE EXCEPTION 'Managed Subject/Nonce execution role authority missing';
  END IF;
END
$local_only$;

-- The ordinary runtime login is installed by migration 0800 without a
-- password. Only this disposable CI fixture supplies ephemeral credentials.
ALTER ROLE myeongha_runtime PASSWORD :'subject_password';

CREATE ROLE myeongha_saju_nonce_ci_login
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOINHERIT NOREPLICATION NOBYPASSRLS
  PASSWORD :'nonce_password';

GRANT myeongha_saju_proof_nonce_runtime TO myeongha_saju_nonce_ci_login;

DO $verify_roles$
BEGIN
  IF NOT pg_has_role('myeongha_runtime','myeongha_api_executor','MEMBER')
    OR pg_has_role('myeongha_runtime','myeongha_saju_proof_nonce_runtime','MEMBER')
    OR NOT pg_has_role('myeongha_saju_nonce_ci_login','myeongha_saju_proof_nonce_runtime','MEMBER')
    OR pg_has_role('myeongha_saju_nonce_ci_login','myeongha_api_executor','MEMBER')
  THEN
    RAISE EXCEPTION 'Subject and Nonce network logins are not independently scoped';
  END IF;
END
$verify_roles$;
