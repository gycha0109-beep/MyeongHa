-- MyeongHa Birth Profile current + revision-summary projection.
--
-- API_CONTRACT §10 defines GET /api/birth-profiles/:id as an owner-authorized
-- "current + revision summary" read. Exact birth input authority remains in immutable
-- birth_profile_revisions; this query exposes the exact current revision input while
-- historical rows are reduced to revision identity/sequence/timestamp summary.
--
-- input_hash is internal canonical provenance and is intentionally not projected.
-- archived_at is returned as stored state only. SRC-06 remains open: this read does not
-- define standalone archive/deletion/erasure semantics or rewrite historical Reading
-- provenance.
--
-- P0-AUTH-01 remains unresolved. SECURITY INVOKER is retained and PUBLIC EXECUTE is
-- revoked until the API -> PostgreSQL execution identity is fixed.

create or replace function public.qry_birth_profile_current_revision_v1(
  p_subject_id uuid,
  p_birth_profile_id uuid
)
returns table (
  birth_profile_id uuid,
  profile_kind text,
  label text,
  current_revision_id uuid,
  archived_at timestamptz,
  profile_created_at timestamptz,
  profile_updated_at timestamptz,
  current_revision_no integer,
  current_calendar_type text,
  current_birth_date date,
  current_birth_time time,
  current_time_known boolean,
  current_is_leap_month boolean,
  current_sex text,
  current_revision_created_at timestamptz,
  revision_id uuid,
  revision_no integer,
  is_current_revision boolean,
  revision_created_at timestamptz
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
      constraint = 'qry_birth_profile_subject_required',
      message = 'birth profile subject is required';
  end if;

  if p_birth_profile_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_birth_profile_id_required',
      message = 'birth profile id is required';
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
      constraint = 'qry_birth_profile_subject_ineligible',
      message = 'birth profile read requires an active canonical subject';
  end if;

  if not exists (
    select 1
    from public.birth_profiles bp
    where bp.id = p_birth_profile_id
      and bp.subject_id = p_subject_id
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_birth_profile_unavailable',
      message = 'birth profile was not found for this subject';
  end if;

  return query
  select
    bp.id,
    bp.profile_kind,
    bp.label,
    bp.current_revision_id,
    bp.archived_at,
    bp.created_at,
    bp.updated_at,
    current_rev.revision_no,
    current_rev.calendar_type,
    current_rev.birth_date,
    current_rev.birth_time,
    current_rev.time_known,
    current_rev.is_leap_month,
    current_rev.sex,
    current_rev.created_at,
    history_rev.id,
    history_rev.revision_no,
    case
      when history_rev.id is null then false
      else history_rev.id = bp.current_revision_id
    end,
    history_rev.created_at
  from public.birth_profiles bp
  left join public.birth_profile_revisions current_rev
    on current_rev.id = bp.current_revision_id
   and current_rev.birth_profile_id = bp.id
   and current_rev.subject_id = bp.subject_id
  left join public.birth_profile_revisions history_rev
    on history_rev.birth_profile_id = bp.id
   and history_rev.subject_id = bp.subject_id
  where bp.id = p_birth_profile_id
    and bp.subject_id = p_subject_id
  order by history_rev.revision_no desc nulls last;
end;
$$;

revoke execute on function public.qry_birth_profile_current_revision_v1(uuid, uuid) from public;
