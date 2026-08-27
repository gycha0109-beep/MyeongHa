-- MyeongHa Reading provenance + stale projection.
--
-- API_CONTRACT §11 exposes GET /api/readings/:id as a versioned Reading DTO plus
-- provenance summary and requires stale=true when the session-pinned Birth revision
-- no longer matches the profile's current revision. SAJU_INTEGRATION_SPEC §13 defines
-- stale exactly as source mismatch OR target mismatch.
--
-- This database read intentionally exposes only Reading/session/version provenance and
-- the stale calculation. It does NOT serialize reading_refs.response_snapshot_jsonb,
-- request_snapshot_jsonb, protected narrative blocks, semantic claims, or any invented
-- ProductReadingResponse DTO. SRC-08/SRC-09 therefore remain open and untouched.
--
-- P0-AUTH-01 remains unresolved. SECURITY INVOKER is retained and PUBLIC EXECUTE is
-- revoked until the API -> PostgreSQL execution identity is fixed.

create or replace function public.qry_reading_provenance_stale_v1(
  p_subject_id uuid,
  p_reading_id uuid
)
returns table (
  reading_id uuid,
  reading_session_id uuid,
  saju_domain text,
  domain_capability_version text,
  attempt_no integer,
  parent_reading_id uuid,
  execution_status text,
  request_contract_version text,
  source_birth_profile_id uuid,
  source_birth_revision_id uuid,
  current_source_birth_revision_id uuid,
  target_birth_profile_id uuid,
  target_birth_revision_id uuid,
  current_target_birth_revision_id uuid,
  stale boolean,
  saju_engine_key text,
  saju_engine_version text,
  reading_contract_version text,
  product_response_state text,
  created_at timestamptz,
  completed_at timestamptz,
  provenance_created_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_subject_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_reading_provenance_subject_required',
      message = 'reading provenance subject is required';
  end if;

  if p_reading_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_reading_provenance_reading_required',
      message = 'reading id is required';
  end if;

  if not exists (
    select 1
    from public.subjects s
    where s.id = p_subject_id
      and s.status = 'active'
      and s.merged_into_subject_id is null
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_reading_provenance_subject_ineligible',
      message = 'reading provenance read requires an active canonical subject';
  end if;

  if not exists (
    select 1
    from public.readings r
    where r.id = p_reading_id
      and r.subject_id = p_subject_id
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_reading_provenance_reading_unavailable',
      message = 'reading was not found for this subject';
  end if;

  return query
  select
    r.id,
    r.reading_session_id,
    r.saju_domain,
    rs.domain_capability_version,
    r.attempt_no,
    r.parent_reading_id,
    r.execution_status,
    r.request_contract_version,
    source_rev.birth_profile_id,
    rs.source_birth_revision_id,
    source_profile.current_revision_id,
    target_rev.birth_profile_id,
    rs.target_birth_revision_id,
    target_profile.current_revision_id,
    (
      source_profile.current_revision_id is distinct from rs.source_birth_revision_id
      or (
        rs.target_birth_revision_id is not null
        and target_profile.current_revision_id is distinct from rs.target_birth_revision_id
      )
    ) as stale,
    rr.saju_engine_key,
    rr.saju_engine_version,
    rr.reading_contract_version,
    rr.product_response_state,
    r.created_at,
    r.completed_at,
    rr.created_at
  from public.readings r
  join public.reading_sessions rs
    on rs.id = r.reading_session_id
   and rs.subject_id = r.subject_id
  join public.birth_profile_revisions source_rev
    on source_rev.id = rs.source_birth_revision_id
   and source_rev.subject_id = r.subject_id
  join public.birth_profiles source_profile
    on source_profile.id = source_rev.birth_profile_id
   and source_profile.subject_id = r.subject_id
  left join public.birth_profile_revisions target_rev
    on target_rev.id = rs.target_birth_revision_id
   and target_rev.subject_id = r.subject_id
  left join public.birth_profiles target_profile
    on target_profile.id = target_rev.birth_profile_id
   and target_profile.subject_id = r.subject_id
  left join public.reading_refs rr
    on rr.reading_id = r.id
   and rr.subject_id = r.subject_id
  where r.id = p_reading_id
    and r.subject_id = p_subject_id;
end;
$$;

revoke execute on function public.qry_reading_provenance_stale_v1(uuid, uuid) from public;
