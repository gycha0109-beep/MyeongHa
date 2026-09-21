-- Reader Interpretation Preview V1: exact Reader content-bundle Production authority.
--
-- Migration 1240 opened narrow Production Reader Knowledge wrappers around the
-- migration-1220 authorities. Reader Interpretation additionally needs the exact
-- server-owned Reader content-bundle id so Character content cannot be swapped
-- after entitlement/access admission.
--
-- This migration therefore:
--   1. adds an INTERNAL bundle-aware metadata projection;
--   2. exposes only a transaction-subject-bound SECURITY DEFINER runtime v2 wrapper
--      to myeongha_api_executor;
--   3. keeps the INTERNAL function ungranted to ordinary runtime roles.
--
-- It does NOT activate a public Reader Interpretation HTTP route, Product saleability,
-- Production Saju semantic generation, or any browser authority.

create or replace function public.internal_qry_character_standard_reading_access_v2(
  p_subject_id uuid,
  p_reader_character_id text,
  p_effective_at timestamptz
)
returns table (
  subject_id uuid,
  reading_id uuid,
  reading_session_id uuid,
  product_id uuid,
  reader_character_id text,
  reader_content_bundle_id uuid,
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
security invoker
set search_path = pg_catalog, public
as $$
begin
  if p_subject_id is null
     or p_reader_character_id is null
     or btrim(p_reader_character_id) = ''
     or p_effective_at is null then
    raise exception using
      errcode = '23514',
      constraint = 'internal_character_standard_reading_access_v2_input_required',
      message = 'Character Standard Reading v2 access requires subject, Reader, and evaluation time';
  end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  return query
  with source_subjects(subject_id) as (
    select p_subject_id
    union all
    select s.id
    from public.subjects s
    join public.subjects canonical
      on canonical.id = p_subject_id
     and canonical.kind = 'member'
     and canonical.status = 'active'
     and canonical.merged_into_subject_id is null
    where s.kind = 'guest'
      and s.status = 'merged'
      and s.merged_into_subject_id = p_subject_id
  )
  select distinct
    p_subject_id,
    o.reading_id,
    o.reading_session_id,
    o.product_id,
    a.reader_character_id,
    a.reader_content_bundle_id,
    o.topic_key,
    o.saju_domain,
    o.reading_period,
    o.reading_variant,
    o.source_birth_revision_id,
    o.product_spec_version,
    o.domain_capability_version,
    rr.reading_contract_version,
    rr.saju_engine_version,
    rr.response_hash
  from public.standard_reading_official_bindings o
  join source_subjects src
    on src.subject_id = o.subject_id
  join public.readings r
    on r.id = o.reading_id
   and r.reading_session_id = o.reading_session_id
   and r.subject_id = o.subject_id
   and r.execution_status = 'succeeded'
   and r.committed_execution_attempt_id is not null
   and r.completed_at is not null
  join public.reading_refs rr
    on rr.reading_id = r.id
   and rr.subject_id = r.subject_id
   and rr.execution_attempt_id = r.committed_execution_attempt_id
  join public.standard_reading_reader_access_grants a
    on a.official_reading_id = o.reading_id
   and a.subject_id = o.subject_id
   and a.reader_character_id = p_reader_character_id
  join public.entitlement_grants g
    on g.id = a.entitlement_grant_id
   and g.subject_id = a.subject_id
   and g.grant_source_type = 'purchase'
   and g.status = 'active'
   and g.valid_from <= p_effective_at
   and (g.valid_until is null or g.valid_until > p_effective_at);
end;
$$;

comment on function public.internal_qry_character_standard_reading_access_v2(
  uuid, text, timestamptz
) is
'INTERNAL Reader Knowledge metadata authority with exact server-owned Reader content-bundle provenance. Multiple distinct active bundles remain visible so the application boundary fails closed on ambiguity.';

revoke all on function public.internal_qry_character_standard_reading_access_v2(
  uuid, text, timestamptz
) from public;

DO $$
DECLARE
  v_role text;
BEGIN
  FOR v_role IN
    SELECT r.rolname
    FROM pg_catalog.pg_roles r
    WHERE r.rolname IN ('anon', 'authenticated', 'service_role', 'myeongha_api_executor')
  LOOP
    EXECUTE pg_catalog.format(
      'revoke all on function public.internal_qry_character_standard_reading_access_v2(uuid,text,timestamptz) from %I',
      v_role
    );
  END LOOP;
END
$$;

create or replace function public.qry_character_standard_reading_access_runtime_v2(
  p_subject_id uuid,
  p_reader_character_id text,
  p_effective_at timestamptz
)
returns table (
  subject_id uuid,
  reading_id uuid,
  reading_session_id uuid,
  product_id uuid,
  reader_character_id text,
  reader_content_bundle_id uuid,
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
  from public.internal_qry_character_standard_reading_access_v2(
    p_subject_id,
    p_reader_character_id,
    p_effective_at
  );
end;
$$;

comment on function public.qry_character_standard_reading_access_runtime_v2(
  uuid, text, timestamptz
) is
'Production server-only bundle-aware Reader Knowledge metadata authority. Requires the transaction-local canonical subject and preserves exact Reader content-bundle provenance.';

revoke all on function public.qry_character_standard_reading_access_runtime_v2(
  uuid, text, timestamptz
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
      'revoke all on function public.qry_character_standard_reading_access_runtime_v2(uuid,text,timestamptz) from %I',
      v_role
    );
  END LOOP;
END
$$;

grant execute on function public.qry_character_standard_reading_access_runtime_v2(
  uuid, text, timestamptz
) to myeongha_api_executor;

-- Defense in depth: Production code may execute only the wrapper.
revoke all on function public.internal_qry_character_standard_reading_access_v2(
  uuid, text, timestamptz
) from myeongha_api_executor;
