-- CI-only restricted Permit V2 consumer login in disposable Admission TLS cluster.
-- Watchtower-Track: saju-bridge. Never apply to Production.
\set ON_ERROR_STOP on
DO $guard$
BEGIN
  IF current_database() <> 'myeongha_saju_admission_tls_verify'
    OR current_user <> 'postgres'
    OR NOT EXISTS (
      SELECT 1 FROM pg_roles
      WHERE rolname = 'myeongha_saju_staging_admission_runtime'
        AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb
        AND NOT rolcreaterole AND NOT rolinherit AND NOT rolbypassrls
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_class
      WHERE oid = 'public.saju_staging_operator_admission_permits_v2'::regclass
        AND relrowsecurity AND relforcerowsecurity
    )
  THEN
    RAISE EXCEPTION 'Refusing non-disposable or insufficient Admission authority';
  END IF;
END
$guard$;

CREATE ROLE myeongha_tls_admission_ci_login
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOINHERIT NOREPLICATION NOBYPASSRLS
  PASSWORD :'admission_password';

GRANT myeongha_saju_staging_admission_runtime TO myeongha_tls_admission_ci_login;

DO $verify$
BEGIN
  IF NOT pg_has_role('myeongha_tls_admission_ci_login',
      'myeongha_saju_staging_admission_runtime', 'MEMBER')
    OR pg_has_role('myeongha_tls_admission_ci_login',
      'myeongha_saju_staging_admission_issuer', 'MEMBER')
    OR pg_has_role('myeongha_tls_admission_ci_login',
      'myeongha_saju_staging_admission_revoker', 'MEMBER')
  THEN
    RAISE EXCEPTION 'Admission login role membership isolation failed';
  END IF;
END
$verify$;
