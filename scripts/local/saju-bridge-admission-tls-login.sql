-- Disposable independent Admission TLS login only. No Permit V2 authority.
-- Never execute outside specifically named synthetic Docker database.
\set ON_ERROR_STOP on
DO $guard$
BEGIN
 IF current_database() <> 'myeongha_saju_admission_local_verify'
    OR current_user <> 'postgres'
    OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN
       ('myeongha_api_executor','myeongha_saju_proof_nonce_runtime'))
 THEN RAISE EXCEPTION 'Refusing non-isolated Admission test role creation'; END IF;
END $guard$;
CREATE ROLE myeongha_docker_admission_tls_probe LOGIN
 NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION
 NOBYPASSRLS PASSWORD :'admission_password';
GRANT CONNECT ON DATABASE myeongha_saju_admission_local_verify
 TO myeongha_docker_admission_tls_probe;
