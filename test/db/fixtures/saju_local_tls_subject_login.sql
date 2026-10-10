-- CI-only restricted login for the physically isolated Subject TLS cluster.
-- Watchtower-Track: saju-bridge. Never run as a Production migration.
\set ON_ERROR_STOP on
DO $guard$
BEGIN
  IF current_database() <> 'myeongha_saju_subject_tls_verify'
    OR current_user <> 'postgres'
    OR NOT EXISTS (
      SELECT 1 FROM pg_roles
      WHERE rolname='myeongha_runtime' AND rolcanlogin AND NOT rolsuper
        AND NOT rolinherit AND NOT rolbypassrls AND NOT rolcreaterole
    )
    OR NOT pg_has_role('myeongha_runtime','myeongha_api_executor','MEMBER')
    OR pg_has_role('myeongha_runtime','myeongha_saju_proof_nonce_runtime','MEMBER')
  THEN
    RAISE EXCEPTION 'Refusing invalid disposable Subject TLS role authority';
  END IF;
END
$guard$;
ALTER ROLE myeongha_runtime PASSWORD :'subject_password';
