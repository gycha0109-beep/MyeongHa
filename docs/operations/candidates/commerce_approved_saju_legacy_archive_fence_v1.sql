-- Candidate based on migration 1735. Only the approved-Saju route fence is new.
-- Retain it when disabling sandbox routes or revoking their runtime grants.
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
    -- Approved Saju uses its separate current exact Grant authority.
    and r.request_contract_version is distinct from 'approved-saju-reading-component-v1'
    and r.execution_status = 'succeeded'
    and r.committed_execution_attempt_id is not null
    and r.completed_at is not null
    and rr.product_response_state in ('delivered', 'delivered_with_fallback')
    and (
      -- Existing non-Commerce-bound history retains its legacy owner-scoped
      -- reread policy. A paid source binding must NEVER fall through here.
      (
        not exists (
          select 1 from public.standard_reading_official_bindings o
          where o.reading_id = r.id
        )
        and not exists (
          select 1 from public.standard_reading_unit_bindings b
          where b.reading_id = r.id
        )
      )
      -- Current Reader-independent official Reading: any one exact active
      -- Reader purchase grants the same immutable source. Revoking A does
      -- not remove B; revoking all closes the full-body reread.
      or exists (
        select 1
        from public.standard_reading_official_bindings o
        join public.standard_reading_reader_access_grants a
          on a.official_reading_id = o.reading_id
         and a.subject_id = o.subject_id
        cross join lateral public.internal_qry_standard_reading_artifact_source_v2(
          p_subject_id, r.id, a.reader_character_id, pg_catalog.transaction_timestamp()
        ) paid
        where o.reading_id = r.id
          and o.subject_id = p_subject_id
          and o.reading_session_id = r.reading_session_id
          and paid.reading_id = r.id
          and paid.product_id = o.product_id
          and paid.reading_contract_version = rr.reading_contract_version
          and paid.product_response_state = rr.product_response_state
          and paid.response_hash = rr.response_hash
      )
      -- Legacy reader-bound purchase lineage stays independently gated by
      -- its exact consumed Grant, never by an aggregate current entitlement.
      or (
        -- Once a Reading has a Reader-independent official binding, a legacy
        -- unit binding must never bypass its v2 exact-Grant revocation.
        not exists (
          select 1 from public.standard_reading_official_bindings official
          where official.reading_id = r.id
        )
        and exists (
        select 1
        from public.standard_reading_unit_bindings b
        cross join lateral public.internal_qry_standard_reading_artifact_source_v1(
          p_subject_id, r.id, pg_catalog.transaction_timestamp()
        ) paid
        where b.reading_id = r.id
          and b.subject_id = p_subject_id
          and b.reading_session_id = r.reading_session_id
          and paid.reading_id = r.id
          and paid.reading_session_id = r.reading_session_id
          and paid.product_id = b.product_id
          and paid.reading_contract_version = rr.reading_contract_version
          and paid.product_response_state = rr.product_response_state
          and paid.response_hash = rr.response_hash
        )
      )
    );
end
$$;

-- The original history endpoint omits approved rows until the archive is
-- enabled. The opt-in uses the same cursor order and exact current Grant as
-- detail. Only metadata is returned, so the detail still rechecks authority.
create function commerce_saju_private.read_approved_aware_history_v1(
  p_subject_id uuid,p_after_completed_at timestamptz,p_after_created_at timestamptz,
  p_after_id uuid,p_page_size integer,p_include_approved boolean
)
returns table (
  reading_id uuid,reading_session_id uuid,saju_domain text,reading_contract_version text,
  product_response_state text,reader_character_ids text[],created_at timestamptz,completed_at timestamptz,
  approved_component text
)
language plpgsql stable security invoker
set search_path=pg_catalog
as $function$
begin
  if p_subject_id is null then
    raise exception using errcode='23514',constraint='qry_reading_history_v3_subject_required',
      message='Reading History subject is required.';
  end if;
  if p_page_size is null or p_page_size<1 or p_page_size>50 then
    raise exception using errcode='23514',constraint='qry_reading_history_v3_page_size_valid',
      message='Reading History page size must be between 1 and 50.';
  end if;
  if num_nulls(p_after_completed_at,p_after_created_at,p_after_id) not in (0,3) then
    raise exception using errcode='23514',constraint='qry_reading_history_v3_cursor_valid',
      message='Reading History cursor must be fully specified or absent.';
  end if;
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  return query
  select r.id,r.reading_session_id,r.saju_domain,rr.reading_contract_version,rr.product_response_state,
    case when approved.reading_id is not null then array[approved.reader_character_id]
    else coalesce(
      (select array_agg(distinct sri.reader_character_id order by sri.reader_character_id)
       from public.standard_reading_reader_interpretations sri
       where sri.official_reading_id=r.id and sri.subject_id=p_subject_id),array[]::text[]) end,
    r.created_at,r.completed_at,approved.component
  from public.readings r
  join public.reading_refs rr on rr.reading_id=r.id and rr.subject_id=r.subject_id
    and rr.execution_attempt_id=r.committed_execution_attempt_id
  left join lateral public.qry_approved_saju_component_record_v1(
    p_subject_id,case when p_include_approved and r.request_contract_version='approved-saju-reading-component-v1'
      then r.id end,null,false
  ) approved on true
  where r.subject_id=p_subject_id and r.execution_status='succeeded'
    and r.committed_execution_attempt_id is not null and r.completed_at is not null
    and (r.request_contract_version is distinct from 'approved-saju-reading-component-v1'
      or approved.reading_id is not null)
    and (p_after_completed_at is null or (r.completed_at,r.created_at,r.id) <
      (p_after_completed_at,p_after_created_at,p_after_id))
  order by r.completed_at desc,r.created_at desc,r.id desc
  limit (p_page_size+1);
end
$function$;
revoke all on function commerce_saju_private.read_approved_aware_history_v1(uuid,timestamptz,timestamptz,uuid,integer,boolean)
  from public,anon,authenticated,service_role,myeongha_api_executor;

create or replace function public.qry_reading_history_v3(
  p_subject_id uuid,p_after_completed_at timestamptz,p_after_created_at timestamptz,p_after_id uuid,p_page_size integer
)
returns table (
  reading_id uuid,reading_session_id uuid,saju_domain text,reading_contract_version text,
  product_response_state text,reader_character_ids text[],created_at timestamptz,completed_at timestamptz
)
language sql stable security definer set search_path=pg_catalog
as $function$
  select h.reading_id,h.reading_session_id,h.saju_domain,h.reading_contract_version,
    h.product_response_state,h.reader_character_ids,h.created_at,h.completed_at
  from commerce_saju_private.read_approved_aware_history_v1($1,$2,$3,$4,$5,false) h
$function$;

create function public.qry_approved_saju_reading_history_v1(uuid,timestamptz,timestamptz,uuid,integer)
returns table (
  reading_id uuid,reading_session_id uuid,saju_domain text,reading_contract_version text,
  product_response_state text,reader_character_ids text[],created_at timestamptz,completed_at timestamptz,
  approved_component text
)
language sql stable security definer set search_path=pg_catalog
as $function$
  select * from commerce_saju_private.read_approved_aware_history_v1($1,$2,$3,$4,$5,true)
$function$;
revoke all on function public.qry_approved_saju_reading_history_v1(uuid,timestamptz,timestamptz,uuid,integer)
  from public,anon,authenticated,service_role,myeongha_api_executor;
