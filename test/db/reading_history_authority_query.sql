-- Reading History Records authority regression checks.

DO $$
DECLARE
  v_def text;
  v_policy_count integer;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.qry_reading_history_v1(uuid)'::pg_catalog.regprocedure
  ) INTO v_def;

  IF position('execution_status = ''succeeded''' in v_def) = 0 THEN
    RAISE EXCEPTION 'Reading History lost succeeded-only filtering';
  END IF;

  IF position('committed_execution_attempt_id is not null' in lower(v_def)) = 0 THEN
    RAISE EXCEPTION 'Reading History lost committed-attempt filtering';
  END IF;

  IF position('rr.execution_attempt_id = r.committed_execution_attempt_id' in v_def) = 0 THEN
    RAISE EXCEPTION 'Reading History lost committed Reading Ref binding';
  END IF;

  IF position('response_snapshot_jsonb' in v_def) <> 0 THEN
    RAISE EXCEPTION 'Reading History unexpectedly exposes ProductReadingResponse snapshot JSON';
  END IF;

  IF position('order by r.completed_at desc' in lower(v_def)) = 0 THEN
    RAISE EXCEPTION 'Reading History lost newest-first deterministic ordering';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.qry_reading_history_v1(uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'myeongha_api_executor cannot execute Reading History authority';
  END IF;

  IF pg_catalog.has_function_privilege(
    'anon',
    'public.qry_reading_history_v1(uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'authenticated',
    'public.qry_reading_history_v1(uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'service_role',
    'public.qry_reading_history_v1(uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Supabase client/service roles unexpectedly retain Reading History EXECUTE';
  END IF;

  IF pg_catalog.has_table_privilege(
    'myeongha_api_executor',
    'public.readings',
    'SELECT'
  ) OR pg_catalog.has_table_privilege(
    'myeongha_api_executor',
    'public.reading_refs',
    'SELECT'
  ) THEN
    RAISE EXCEPTION 'Reading History executor unexpectedly retains table-wide SELECT';
  END IF;

  IF NOT pg_catalog.has_column_privilege(
    'myeongha_api_executor',
    'public.readings',
    'id',
    'SELECT'
  ) OR NOT pg_catalog.has_column_privilege(
    'myeongha_api_executor',
    'public.reading_refs',
    'reading_contract_version',
    'SELECT'
  ) THEN
    RAISE EXCEPTION 'Reading History executor lost required projection column SELECT';
  END IF;

  IF pg_catalog.has_column_privilege(
    'myeongha_api_executor',
    'public.readings',
    'request_snapshot_jsonb',
    'SELECT'
  ) OR pg_catalog.has_column_privilege(
    'myeongha_api_executor',
    'public.reading_refs',
    'response_snapshot_jsonb',
    'SELECT'
  ) OR pg_catalog.has_column_privilege(
    'myeongha_api_executor',
    'public.reading_refs',
    'response_hash',
    'SELECT'
  ) THEN
    RAISE EXCEPTION 'Reading History executor unexpectedly gained sensitive Reading column SELECT';
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_policy_count
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'readings'
    AND policyname = 'readings_api_current_history_select_v1'
    AND roles @> ARRAY['myeongha_api_executor']::name[];
  IF v_policy_count <> 1 THEN
    RAISE EXCEPTION 'Reading History readings RLS policy is missing';
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_policy_count
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'reading_refs'
    AND policyname = 'reading_refs_api_current_history_select_v1'
    AND roles @> ARRAY['myeongha_api_executor']::name[];
  IF v_policy_count <> 1 THEN
    RAISE EXCEPTION 'Reading History reading_refs RLS policy is missing';
  END IF;
END
$$;