-- Production server authority for Reader Knowledge consumption.
--
-- Migration 1220 deliberately kept the raw INTERNAL Reader Knowledge functions
-- ungranted. The application path is now source-bounded through:
--   owned canonical Subject -> exact Reader access -> exact Official Reading
--   artifact -> protected Character Saju projection -> thread-bound runtime.
--
-- This migration exposes only two narrow SECURITY DEFINER wrappers to the
-- NOBYPASSRLS API executor. Raw tables and migration-1220 INTERNAL functions remain
-- ungranted. The caller must already have the transaction-local canonical subject
-- bound by the P0-AUTH-01 execution context.
--
-- This does NOT activate:
-- - public Chat send;
-- - Character generation/provider execution;
-- - Chat receive/attempt/commit commands;
-- - Product saleability or additional Reader purchase execution.

create or replace function public.qry_character_standard_reading_access_runtime_v1(
  p_subject_id uuid,
  p_reader_character_id text,
  p_effective_at timestamptz
)
returns table (
  reading_id uuid,
  reading_session_id uuid,
  product_id uuid,
  topic_key text,
  saju_domain text,
  reading_period text,
  reading_variant text,
  source_birth_revision_id uuid,
  product_spec_version text,
  domain_capability_version text,
  reading_contract_version text,
  saju_engine_version text,
  response_hash text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  return query
  select *
  from public.internal_qry_character_standard_reading_access_v1(
    p_subject_id,
    p_reader_character_id,
    p_effective_at
  );
end;
$$;

comment on function public.qry_character_standard_reading_access_runtime_v1(
  uuid, text, timestamptz
) is
'Production server-only Reader Knowledge metadata authority. Requires the transaction-local canonical subject and delegates to the migration-1220 exact Reader access source without exposing raw authority tables.';

create or replace function public.qry_standard_reading_artifact_source_runtime_v1(
  p_subject_id uuid,
  p_reading_id uuid,
  p_reader_character_id text,
  p_effective_at timestamptz
)
returns table (
  reading_id uuid,
  product_id uuid,
  reader_character_id text,
  reading_contract_version text,
  product_response_state text,
  response_snapshot_jsonb jsonb,
  response_hash text,
  completed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  return query
  select *
  from public.internal_qry_standard_reading_artifact_source_v2(
    p_subject_id,
    p_reading_id,
    p_reader_character_id,
    p_effective_at
  );
end;
$$;

comment on function public.qry_standard_reading_artifact_source_runtime_v1(
  uuid, uuid, text, timestamptz
) is
'Production server-only exact Reader-scoped Official Reading artifact source. Requires the transaction-local canonical subject; raw ProductReadingResponse is returned only to the server executor for protected projection.';

revoke all on function public.qry_character_standard_reading_access_runtime_v1(
  uuid, text, timestamptz
) from public;
revoke all on function public.qry_standard_reading_artifact_source_runtime_v1(
  uuid, uuid, text, timestamptz
) from public;

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
      'revoke all on function public.qry_character_standard_reading_access_runtime_v1(uuid,text,timestamptz) from %I',
      v_role
    );
    EXECUTE pg_catalog.format(
      'revoke all on function public.qry_standard_reading_artifact_source_runtime_v1(uuid,uuid,text,timestamptz) from %I',
      v_role
    );
  END LOOP;
END
$$;

grant execute on function public.qry_character_standard_reading_access_runtime_v1(
  uuid, text, timestamptz
) to myeongha_api_executor;
grant execute on function public.qry_standard_reading_artifact_source_runtime_v1(
  uuid, uuid, text, timestamptz
) to myeongha_api_executor;

-- Defense in depth: do not widen the raw migration-1220 authority.
revoke all on function public.internal_qry_character_standard_reading_access_v1(
  uuid, text, timestamptz
) from myeongha_api_executor;
revoke all on function public.internal_qry_standard_reading_artifact_source_v2(
  uuid, uuid, text, timestamptz
) from myeongha_api_executor;
