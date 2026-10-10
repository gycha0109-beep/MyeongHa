-- Ephemeral TLS-only independent Nonce PostgreSQL cluster fixture.
-- Watchtower-Track: saju-bridge. Never apply this file to Production.
\set ON_ERROR_STOP on
DO $$
BEGIN
  IF current_database() <> 'myeongha_saju_nonce_tls_verify'
    OR current_user <> 'postgres' THEN
    RAISE EXCEPTION 'TLS Nonce login fixture is restricted to disposable CI database';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles
    WHERE rolname='myeongha_saju_proof_nonce_runtime'
      AND NOT rolcanlogin AND NOT rolsuper AND NOT rolinherit AND NOT rolbypassrls) THEN
    RAISE EXCEPTION 'TLS Nonce runtime role missing or overly privileged';
  END IF;
END
$$;

CREATE ROLE myeongha_tls_nonce_ci_login
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD :'nonce_password';
GRANT myeongha_saju_proof_nonce_runtime TO myeongha_tls_nonce_ci_login;

DO $$
BEGIN
  IF NOT pg_has_role(
    'myeongha_tls_nonce_ci_login','myeongha_saju_proof_nonce_runtime','MEMBER'
  ) OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname='myeongha_runtime')
  THEN
    RAISE EXCEPTION 'TLS Nonce physical-cluster separation invalid';
  END IF;
END
$$;
