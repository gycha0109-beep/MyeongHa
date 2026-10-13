-- Disposable Docker-only synthetic Permit V2 consumer. Not a deployment migration.
\set ON_ERROR_STOP on
DO $guard$
BEGIN
 IF current_database() <> 'myeongha_saju_admission_local_verify'
   OR current_user <> 'postgres'
   OR NOT EXISTS (
      SELECT 1 FROM pg_roles WHERE rolname='myeongha_docker_admission_tls_probe'
        AND rolcanlogin AND NOT rolsuper AND NOT rolinherit AND NOT rolbypassrls
   )
   OR NOT EXISTS (
      SELECT 1 FROM pg_roles WHERE rolname='myeongha_saju_staging_admission_runtime'
        AND NOT rolcanlogin AND NOT rolsuper AND NOT rolinherit AND NOT rolbypassrls
   )
   OR NOT EXISTS (
      SELECT 1 FROM pg_class
      WHERE oid='public.saju_staging_operator_admission_permits_v2'::regclass
        AND relrowsecurity AND relforcerowsecurity
   )
   OR EXISTS (SELECT 1 FROM pg_roles
     WHERE rolname IN ('myeongha_api_executor','myeongha_saju_proof_nonce_runtime'))
 THEN RAISE EXCEPTION 'Refusing non-disposable or non-isolated Permit V2 fixture'; END IF;
END $guard$;
GRANT myeongha_saju_staging_admission_runtime TO myeongha_docker_admission_tls_probe;
DO $verify$
BEGIN
 IF NOT pg_has_role('myeongha_docker_admission_tls_probe',
    'myeongha_saju_staging_admission_runtime','MEMBER')
 OR pg_has_role('myeongha_docker_admission_tls_probe',
    'myeongha_saju_staging_admission_issuer','MEMBER')
 OR pg_has_role('myeongha_docker_admission_tls_probe',
    'myeongha_saju_staging_admission_revoker','MEMBER')
 THEN RAISE EXCEPTION 'Synthetic Permit consumer role isolation failed'; END IF;
END $verify$;
