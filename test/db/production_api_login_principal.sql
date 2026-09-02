\set ON_ERROR_STOP on

DO $$
DECLARE
  v_runtime record;
  v_password text;
BEGIN
  SELECT
    rolcanlogin,
    rolsuper,
    rolcreatedb,
    rolcreaterole,
    rolinherit,
    rolreplication,
    rolbypassrls
  INTO STRICT v_runtime
  FROM pg_catalog.pg_roles
  WHERE rolname = 'myeongha_runtime';

  IF NOT v_runtime.rolcanlogin THEN
    RAISE EXCEPTION 'myeongha_runtime must be LOGIN';
  END IF;
  IF v_runtime.rolsuper
     OR v_runtime.rolcreatedb
     OR v_runtime.rolcreaterole
     OR v_runtime.rolinherit
     OR v_runtime.rolreplication
     OR v_runtime.rolbypassrls THEN
    RAISE EXCEPTION 'myeongha_runtime has privileged or inherited capabilities';
  END IF;

  SELECT rolpassword
  INTO v_password
  FROM pg_catalog.pg_authid
  WHERE rolname = 'myeongha_runtime';

  IF v_password IS NOT NULL THEN
    RAISE EXCEPTION 'myeongha_runtime must remain passwordless until runtime secret binding';
  END IF;

  IF NOT pg_catalog.pg_has_role(
    'myeongha_runtime',
    'myeongha_api_executor',
    'MEMBER'
  ) THEN
    RAISE EXCEPTION 'myeongha_runtime must be a member of myeongha_api_executor';
  END IF;
END
$$;

SET SESSION AUTHORIZATION myeongha_runtime;

DO $$
BEGIN
  IF current_user <> 'myeongha_runtime' THEN
    RAISE EXCEPTION 'session authorization did not enter myeongha_runtime';
  END IF;

  IF NOT pg_catalog.pg_has_role(
    current_user,
    'myeongha_api_executor',
    'MEMBER'
  ) THEN
    RAISE EXCEPTION 'runtime login cannot enter myeongha_api_executor';
  END IF;
END
$$;

SET ROLE myeongha_api_executor;

DO $$
BEGIN
  IF current_user <> 'myeongha_api_executor' THEN
    RAISE EXCEPTION 'SET ROLE did not enter myeongha_api_executor';
  END IF;
END
$$;

RESET ROLE;
RESET SESSION AUTHORIZATION;
