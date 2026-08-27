-- MyeongHa Reading Session provenance + stale projection.
--
-- API_CONTRACT §11 exposes GET /api/reading-sessions/:id together with provenance
-- summary and requires stale=true when session-pinned Birth revisions no longer match
-- the corresponding profile current revisions. SAJU_INTEGRATION_SPEC §13 defines stale
-- as source mismatch OR target mismatch.
--
-- The stored reading_sessions.state is returned exactly. This query does not infer a
-- semantic terminal session state from Reading/ProductReadingResponse/grounding state;
-- that mapping remains intentionally unresolved. Raw request/response snapshots,
-- protected blocks, semantic payloads, transport refs, hashes, and internal provider
-- material are not exposed. SRC-08/SRC-09 therefore remain open and untouched.
--
-- P0-AUTH-01 remains unresolved. SECURITY INVOKER is retained and PUBLIC EXECUTE is
-- revoked until the API -> PostgreSQL execution identity is fixed.

create or replace function public.qry_reading_session_provenance_stale_v1(
  p_subject_id uuid,
  p_reading_session_id uuid
)
returns table (
  reading_session_id uuid,
  saju_domain text,
  domain_capability_version text,
  stored_state text,
  next_attempt_no integer,
  current_reading_id uuid,
  current_reading_attempt_no integer,
  current_reading_parent_id uuid,
  current_reading_execution_status text,
  current_reading_request_contract_version text,
  source_birth_profile_id uuid,
  source_birth_revision_id uuid,
  current_source_birth_revision_id uuid,
  target_birth_profile_id uuid,
  target_birth_revision_id uuid,
  current_target_birth_revision_id uuid,
  stale boolean,
  created_at timestamptz,
  updated_at timestamptz
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
      constraint = 'qry_reading_session_provenance_subject_required',
      message = 'reading session provenance subject is required';
  end if;

  if p_reading_session_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_reading_session_provenance_session_required',
      message = 'reading session id is required';
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
      constraint = 'qry_reading_session_provenance_subject_ineligible',
      message = 'reading session provenance read requires an active canonical subject';
  end if;

  if not exists (
    select 1
    from public.reading_sessions rs
    where rs.id = p_reading_session_id
      and rs.subject_id = p_subject_id
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_reading_session_provenance_session_unavailable',
      message = 'reading session was not found for this subject';
  end if;

  return query
  select
    rs.id,
    rs.saju_domain,
    rs.domain_capability_version,
    rs.state,
    rs.next_attempt_no,
    rs.current_reading_id,
    current_reading.attempt_no,
    current_reading.parent_reading_id,
    current_reading.execution_status,
    current_reading.request_contract_version,
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
    rs.created_at,
    rs.updated_at
  from public.reading_sessions rs
  join public.birth_profile_revisions source_rev
    on source_rev.id = rs.source_birth_revision_id
   and source_rev.subject_id = rs.subject_id
  join public.birth_profiles source_profile
    on source_profile.id = source_rev.birth_profile_id
   and source_profile.subject_id = rs.subject_id
  left join public.birth_profile_revisions target_rev
    on target_rev.id = rs.target_birth_revision_id
   and target_rev.subject_id = rs.subject_id
  left join public.birth_profiles target_profile
    on target_profile.id = target_rev.birth_profile_id
   and target_profile.subject_id = rs.subject_id
  left join public.readings current_reading
    on current_reading.id = rs.current_reading_id
   and current_reading.reading_session_id = rs.id
   and current_reading.subject_id = rs.subject_id
  where rs.id = p_reading_session_id
    and rs.subject_id = p_subject_id;
end;
$$;

revoke execute on function public.qry_reading_session_provenance_stale_v1(uuid, uuid) from public;
