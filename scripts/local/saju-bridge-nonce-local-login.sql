-- Disposable Docker independent Nonce principal, never Production.
\set ON_ERROR_STOP on
DO $guard$
BEGIN
 IF current_database() <> 'myeongha_saju_nonce_local_verify' OR current_user <> 'postgres'
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='myeongha_saju_proof_nonce_runtime'
       AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls)
    OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname='myeongha_runtime')
 THEN RAISE EXCEPTION 'Refusing non-disposable or invalid isolated Nonce authority'; END IF;
END $guard$;
CREATE ROLE myeongha_docker_nonce_login
 LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
 NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD :'nonce_password';
GRANT myeongha_saju_proof_nonce_runtime TO myeongha_docker_nonce_login;
DO $guard$
BEGIN
 IF NOT pg_has_role('myeongha_docker_nonce_login','myeongha_saju_proof_nonce_runtime','MEMBER')
    OR pg_has_role('myeongha_docker_nonce_login','myeongha_api_executor','MEMBER')
 THEN RAISE EXCEPTION 'Nonce login improperly scoped'; END IF;
END $guard$;
