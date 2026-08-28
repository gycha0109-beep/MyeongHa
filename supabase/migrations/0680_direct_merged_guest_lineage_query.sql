-- Direct merged-guest history lineage projection.
--
-- Source authority:
-- - ERD v0.6 §16: historical immutable rows remain owned by the merged guest subject.
-- - History reads may combine the canonical member subject with direct merged guest subjects.
-- - Generic writes to merged guest lineage remain forbidden; this function is read-only and
--   returns only direct merged guest subject ids.
--
-- This does not execute merge policy, expose guest-session proof, or authorize current writes.
-- P0-AUTH-01 remains unresolved: SECURITY INVOKER + PUBLIC EXECUTE revoked.

create or replace function public.qry_direct_merged_guest_subjects_v1(
  p_member_subject_id uuid
)
returns table (
  guest_subject_id uuid
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_member_subject_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_direct_merged_guest_subject_required',
      message = 'canonical member subject id is required';
  end if;

  if not exists (
    select 1
    from public.subjects s
    where s.id = p_member_subject_id
      and s.kind = 'member'
      and s.status in ('active', 'deletion_pending')
      and s.merged_into_subject_id is null
      and s.auth_user_id is not null
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_direct_merged_guest_subject_ineligible',
      message = 'merged guest history read requires a current canonical member subject';
  end if;

  return query
  select s.id
  from public.subjects s
  where s.kind = 'guest'
    and s.status = 'merged'
    and s.merged_into_subject_id = p_member_subject_id
  order by s.id;
end;
$$;

revoke execute on function public.qry_direct_merged_guest_subjects_v1(uuid) from public;
