-- MyeongHa current active self Birth Profile locator projection.
--
-- The source model permits at most one active `profile_kind='self'` Birth Profile per
-- subject. UC-30 requires subsequent Readings to use the current Birth revision after a
-- correction. This projection exposes only the owner-scoped profile/revision identity
-- needed to locate that current self record; it does not expose Birth input fields.
--
-- No HTTP route is selected here. P0-AUTH-01 remains unresolved, so SECURITY INVOKER is
-- retained and PUBLIC EXECUTE is revoked until the API -> PostgreSQL execution identity
-- is fixed.

create or replace function public.qry_self_birth_profile_current_v1(
  p_subject_id uuid
)
returns table (
  subject_id uuid,
  birth_profile_id uuid,
  current_revision_id uuid,
  current_revision_no integer,
  profile_updated_at timestamptz
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
      constraint = 'qry_self_birth_profile_subject_required',
      message = 'current subject id is required';
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
      constraint = 'qry_self_birth_profile_subject_ineligible',
      message = 'current self Birth Profile read requires an active canonical subject';
  end if;

  return query
  select
    bp.subject_id,
    bp.id,
    bp.current_revision_id,
    current_rev.revision_no,
    bp.updated_at
  from public.birth_profiles bp
  left join public.birth_profile_revisions current_rev
    on current_rev.id = bp.current_revision_id
   and current_rev.birth_profile_id = bp.id
   and current_rev.subject_id = bp.subject_id
  where bp.subject_id = p_subject_id
    and bp.profile_kind = 'self'
    and bp.archived_at is null;
end;
$$;

revoke execute on function public.qry_self_birth_profile_current_v1(uuid) from public;
