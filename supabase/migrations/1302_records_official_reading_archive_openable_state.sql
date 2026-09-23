-- Tighten persisted Official Reading archive detail to states that the product
-- explicitly permits users to reopen. Reading History remains broader and may
-- still list successful non-openable responses such as clarification-required
-- records; only the detail/reread authority is narrowed here.

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
    and r.completed_at is not null
    and rr.product_response_state in ('delivered', 'delivered_with_fallback');
end
$$;

comment on function public.qry_official_reading_record_runtime_v1(uuid, uuid) is
'Server-only owner-scoped Official Reading archive source for Records. Returns only stored archive-openable ProductReadingResponse states without Reader selection.';
