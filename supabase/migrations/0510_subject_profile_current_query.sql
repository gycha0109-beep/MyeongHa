-- MyeongHa current Subject/Profile read authority for GET /api/me.
--
-- The API resolves trusted guest/member identity before DB invocation. This projection
-- exposes only the current MyeongHa owner identity and product-profile fields needed by
-- the current-user endpoint. Authentication mapping material is deliberately omitted.
--
-- Current authenticated member resolution permits active/deletion_pending subjects;
-- verified guest resolution permits only active guests. Generic merged/deleted history
-- is not opened by this query.
--
-- P0-AUTH-01 remains unresolved. SECURITY INVOKER is retained and PUBLIC EXECUTE is
-- revoked until the API -> PostgreSQL execution identity is fixed.

create or replace function public.qry_subject_profile_current_v1(
  p_subject_id uuid
)
returns table (
  subject_id uuid,
  subject_kind text,
  subject_status text,
  display_name text,
  locale text,
  timezone text,
  onboarding_state text,
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
      constraint = 'qry_subject_profile_subject_required',
      message = 'current subject id is required';
  end if;

  if not exists (
    select 1
    from public.subjects s
    where s.id = p_subject_id
      and s.merged_into_subject_id is null
      and (
        (s.kind = 'guest' and s.status = 'active')
        or (s.kind = 'member' and s.status in ('active', 'deletion_pending'))
      )
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_subject_profile_subject_ineligible',
      message = 'current profile read requires a current canonical guest or member subject';
  end if;

  return query
  select
    s.id,
    s.kind,
    s.status,
    p.display_name,
    p.locale,
    p.timezone,
    p.onboarding_state,
    p.updated_at
  from public.subjects s
  left join public.profiles p on p.subject_id = s.id
  where s.id = p_subject_id;
end;
$$;

revoke execute on function public.qry_subject_profile_current_v1(uuid) from public;
