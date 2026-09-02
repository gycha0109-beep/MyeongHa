-- P0-AUTH-01 production network login principal.
--
-- This role is deliberately provisioned WITHOUT a password. Repository migration
-- authority may establish its least-privilege shape and membership, but runtime
-- credential material must be assigned only together with the production secret
-- binding that consumes it.
--
-- Ordinary user requests connect as myeongha_runtime, then enter the NOLOGIN
-- myeongha_api_executor role inside the explicit subject-scoped transaction.

DO $$
DECLARE
  v_executor record;
BEGIN
  SELECT
    rolcanlogin,
    rolsuper,
    rolcreatedb,
    rolcreaterole,
    rolinherit,
    rolreplication,
    rolbypassrls
  INTO v_executor
  FROM pg_catalog.pg_roles
  WHERE rolname = 'myeongha_api_executor';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'myeongha_api_executor must exist before provisioning myeongha_runtime';
  END IF;

  IF v_executor.rolcanlogin
     OR v_executor.rolsuper
     OR v_executor.rolcreatedb
     OR v_executor.rolcreaterole
     OR v_executor.rolinherit
     OR v_executor.rolreplication
     OR v_executor.rolbypassrls THEN
    RAISE EXCEPTION 'myeongha_api_executor does not satisfy the P0-AUTH-01 execution-role contract';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = 'myeongha_runtime'
  ) THEN
    RAISE EXCEPTION 'myeongha_runtime already exists; refusing to adopt or rewrite an unmanaged production login principal';
  END IF;

  CREATE ROLE myeongha_runtime
    LOGIN
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    NOINHERIT
    NOREPLICATION
    NOBYPASSRLS
    PASSWORD NULL;

  GRANT myeongha_api_executor TO myeongha_runtime;
END
$$;
