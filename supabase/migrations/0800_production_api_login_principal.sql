-- P0-AUTH-01 production network login principal.
--
-- This role is deliberately provisioned WITHOUT a password. Repository migration
-- authority may establish its least-privilege shape and membership, but runtime
-- credential material must be assigned only together with the production secret
-- binding that consumes it.
--
-- PostgreSQL roles are cluster-wide while CI reapplies migrations to multiple
-- isolated databases in one cluster. A pre-existing role is therefore accepted
-- only when it carries this migration's management marker and still satisfies the
-- exact least-privilege shape. An unmarked role is never silently adopted.

DO $$
DECLARE
  v_executor record;
  v_runtime record;
  v_runtime_oid oid;
  v_runtime_marker text;
  v_expected_marker constant text :=
    'myeongha:production-api-login-principal:v1';
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

  SELECT
    oid,
    rolcanlogin,
    rolsuper,
    rolcreatedb,
    rolcreaterole,
    rolinherit,
    rolreplication,
    rolbypassrls
  INTO v_runtime
  FROM pg_catalog.pg_roles
  WHERE rolname = 'myeongha_runtime';

  IF NOT FOUND THEN
    CREATE ROLE myeongha_runtime
      LOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS
      PASSWORD NULL;

    COMMENT ON ROLE myeongha_runtime IS
      'myeongha:production-api-login-principal:v1';
  ELSE
    v_runtime_oid := v_runtime.oid;
    v_runtime_marker := pg_catalog.shobj_description(
      v_runtime_oid,
      'pg_authid'
    );

    IF v_runtime_marker IS DISTINCT FROM v_expected_marker THEN
      RAISE EXCEPTION 'myeongha_runtime already exists without the managed production principal marker';
    END IF;

    IF NOT v_runtime.rolcanlogin
       OR v_runtime.rolsuper
       OR v_runtime.rolcreatedb
       OR v_runtime.rolcreaterole
       OR v_runtime.rolinherit
       OR v_runtime.rolreplication
       OR v_runtime.rolbypassrls THEN
      RAISE EXCEPTION 'managed myeongha_runtime no longer satisfies the production login-principal contract';
    END IF;
  END IF;

  GRANT myeongha_api_executor TO myeongha_runtime;

  IF NOT pg_catalog.pg_has_role(
    'myeongha_runtime',
    'myeongha_api_executor',
    'MEMBER'
  ) THEN
    RAISE EXCEPTION 'myeongha_runtime cannot enter myeongha_api_executor';
  END IF;
END
$$;
