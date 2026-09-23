-- Records authority for persisted Official Reading archive and reread.
--
-- Product rule:
-- - Records owns rereading the stored Official Reading result.
-- - Reader-held knowledge/context is a separate runtime concern.
-- - Reader ids here are display provenance only; they never select a Reader Scene
--   and never derive Chat thread authority.

create or replace function public.qry_reading_history_v2(p_subject_id uuid)
returns table (
  reading_id uuid,
  reading_session_id uuid,
  saju_domain text,
  reading_contract_version text,
  product_response_state text,
  reader_character_ids text[],
  created_at timestamptz,
  completed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_subject_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_reading_history_subject_required',
      message = 'Reading History subject is required.';
  end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  return query
  select
    r.id,
    r.reading_session_id,
    r.saju_domain,
    rr.reading_contract_version,
    rr.product_response_state,
    coalesce(
      (
        select pg_catalog.array_agg(provenance.reader_character_id order by provenance.reader_character_id)
        from (
          select distinct sri.reader_character_id
          from public.standard_reading_reader_interpretations sri
          where sri.official_reading_id = r.id
            and sri.subject_id = p_subject_id
        ) provenance
      ),
      array[]::text[]
    ),
    r.created_at,
    r.completed_at
  from public.readings r
  join public.reading_refs rr
    on rr.reading_id = r.id
   and rr.subject_id = r.subject_id
   and rr.execution_attempt_id = r.committed_execution_attempt_id
  where r.subject_id = p_subject_id
    and r.execution_status = 'succeeded'
    and r.committed_execution_attempt_id is not null
    and r.completed_at is not null
  order by r.completed_at desc, r.created_at desc, r.id desc;
end
$$;

comment on function public.qry_reading_history_v2(uuid) is
'Server-only Records history authority. reader_character_ids are historical display provenance only and cannot authorize Reader re-entry or Chat.';

create or replace function public.qry_official_reading_record_runtime_v1(
  p_subject_id uuid,
  p_reading_id uuid
)
returns table (
  reading_id uuid,
  reading_session_id uuid,
  saju_domain text,
  reading_contract_version text,
  product_response_state text,
  response_snapshot_jsonb jsonb,
  response_hash text,
  reader_character_ids text[],
  completed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_reading_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_official_reading_record_reading_required',
      message = 'Official Reading record identity is required.';
  end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  return query
  select
    r.id,
    r.reading_session_id,
    r.saju_domain,
    rr.reading_contract_version,
    rr.product_response_state,
    rr.response_snapshot_jsonb,
    rr.response_hash,
    coalesce(
      (
        select pg_catalog.array_agg(provenance.reader_character_id order by provenance.reader_character_id)
        from (
          select distinct sri.reader_character_id
          from public.standard_reading_reader_interpretations sri
          where sri.official_reading_id = r.id
            and sri.subject_id = p_subject_id
        ) provenance
      ),
      array[]::text[]
    ),
    r.completed_at
  from public.readings r
  join public.reading_refs rr
    on rr.reading_id = r.id
   and rr.subject_id = r.subject_id
   and rr.execution_attempt_id = r.committed_execution_attempt_id
  where r.id = p_reading_id
    and r.subject_id = p_subject_id
    and r.execution_status = 'succeeded'
    and r.committed_execution_attempt_id is not null
    and r.completed_at is not null;
end
$$;

comment on function public.qry_official_reading_record_runtime_v1(uuid, uuid) is
'Server-only owner-scoped Official Reading archive source for Records. Returns the stored admitted ProductReadingResponse without Reader selection.';

revoke all on function public.qry_reading_history_v2(uuid) from public;
revoke all on function public.qry_official_reading_record_runtime_v1(uuid, uuid) from public;

DO $$
DECLARE
  v_role text;
BEGIN
  FOR v_role IN
    SELECT r.rolname
    FROM pg_catalog.pg_roles r
    WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
  LOOP
    EXECUTE pg_catalog.format(
      'revoke all on function public.qry_reading_history_v2(uuid) from %I',
      v_role
    );
    EXECUTE pg_catalog.format(
      'revoke all on function public.qry_official_reading_record_runtime_v1(uuid,uuid) from %I',
      v_role
    );
  END LOOP;
END
$$;

grant execute on function public.qry_reading_history_v2(uuid)
to myeongha_api_executor;
grant execute on function public.qry_official_reading_record_runtime_v1(uuid, uuid)
to myeongha_api_executor;

DO $$
BEGIN
  IF NOT pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.qry_reading_history_v2(uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) OR NOT pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.qry_official_reading_record_runtime_v1(uuid,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'myeongha_api_executor lost Records Official Reading archive EXECUTE';
  END IF;

  IF pg_catalog.has_function_privilege(
    'anon',
    'public.qry_official_reading_record_runtime_v1(uuid,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'authenticated',
    'public.qry_official_reading_record_runtime_v1(uuid,uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Supabase API roles unexpectedly retain Official Reading archive EXECUTE';
  END IF;
END
$$;
