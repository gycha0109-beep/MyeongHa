-- Require the exact verified original Purchase Intent for Reader Knowledge and Records reread.
-- Preserve SECURITY INVOKER, signatures, existing roles, and Production HOLD.
begin;

create or replace function public.internal_qry_character_standard_reading_access_v1(
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
      constraint = 'internal_character_standard_reading_access_input_required',
      message = 'Character Standard Reading access requires subject, Reader, and evaluation time';
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
    o.reading_id,
    o.reading_session_id,
    o.product_id,
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
  join source_subjects src on src.subject_id = o.subject_id
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
  where exists (
    select 1
    from public.standard_reading_reader_access_grants a
    join public.purchase_intents pi
      on pi.id = a.purchase_intent_id
     and pi.subject_id = a.subject_id
     and pi.status = 'verified'
    join public.entitlement_grants g
      on g.id = a.entitlement_grant_id
     and g.subject_id = a.subject_id
     and g.grant_source_type = 'purchase'
    where a.official_reading_id = o.reading_id
      and a.subject_id = o.subject_id
      and a.reader_character_id = p_reader_character_id
      and g.status = 'active'
      and g.valid_from <= p_effective_at
      and (g.valid_until is null or g.valid_until > p_effective_at)
  );
end;
$$;

create or replace function public.internal_qry_standard_reading_artifact_source_v2(
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
security invoker
set search_path = pg_catalog, public
as $$
begin
  if p_subject_id is null
     or p_reading_id is null
     or p_reader_character_id is null
     or btrim(p_reader_character_id) = ''
     or p_effective_at is null then
    raise exception using
      errcode = '23514',
      constraint = 'internal_standard_reading_artifact_source_v2_input_required',
      message = 'Standard Reading v2 artifact source requires subject, Reading, Reader, and evaluation time';
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
  select
    o.reading_id,
    o.product_id,
    p_reader_character_id,
    rr.reading_contract_version,
    rr.product_response_state,
    rr.response_snapshot_jsonb,
    rr.response_hash,
    r.completed_at
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
  where o.reading_id = p_reading_id
    and rr.response_snapshot_jsonb is not null
    and btrim(rr.reading_contract_version) <> ''
    and btrim(rr.product_response_state) <> ''
    and btrim(rr.response_hash) <> ''
    and exists (
      select 1
      from public.standard_reading_reader_access_grants a
      join public.purchase_intents pi
        on pi.id = a.purchase_intent_id
       and pi.subject_id = a.subject_id
       and pi.status = 'verified'
      join public.entitlement_grants g
        on g.id = a.entitlement_grant_id
       and g.subject_id = a.subject_id
       and g.grant_source_type = 'purchase'
      where a.official_reading_id = o.reading_id
        and a.subject_id = o.subject_id
        and a.reader_character_id = p_reader_character_id
        and g.status = 'active'
        and g.valid_from <= p_effective_at
        and (g.valid_until is null or g.valid_until > p_effective_at)
    );
end;
$$;

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
  join public.purchase_intents pi
    on pi.id = a.purchase_intent_id
   and pi.subject_id = a.subject_id
   and pi.status = 'verified'
  join public.entitlement_grants g
    on g.id = a.entitlement_grant_id
   and g.subject_id = a.subject_id
   and g.grant_source_type = 'purchase'
   and g.status = 'active'
   and g.valid_from <= p_effective_at
   and (g.valid_until is null or g.valid_until > p_effective_at);
end;
$$;

do $acl$
declare
  v_signature text;
  v_role text;
begin
  foreach v_signature in array array[
    'public.internal_qry_character_standard_reading_access_v1(uuid,text,timestamptz)',
    'public.internal_qry_standard_reading_artifact_source_v2(uuid,uuid,text,timestamptz)',
    'public.internal_qry_character_standard_reading_access_v2(uuid,text,timestamptz)'
  ] loop
    if (select p.prosecdef from pg_catalog.pg_proc p where p.oid = v_signature::pg_catalog.regprocedure) is distinct from false then
      raise exception 'Official Reader raw source must stay SECURITY INVOKER: %', v_signature;
    end if;
    foreach v_role in array array['anon','authenticated','service_role','myeongha_api_executor'] loop
      if pg_catalog.has_function_privilege(v_role, v_signature, 'EXECUTE') then
        raise exception 'Official Reader raw source execute ACL widened: %, %', v_signature, v_role;
      end if;
    end loop;
  end loop;
end
$acl$;

commit;
