-- Production Birth Profile owner-read execution authority.
--
-- This is the first production API slice that opens birth_profiles and
-- birth_profile_revisions to myeongha_api_executor. Access remains read-only,
-- subject-scoped through the transaction-local canonical MyeongHa subject context,
-- and limited to the columns consumed by qry_birth_profile_current_revision_v1.
-- Canonical input_hash remains inaccessible to the ordinary execution role.

alter table public.birth_profiles enable row level security;
alter table public.birth_profile_revisions enable row level security;

drop policy if exists birth_profiles_api_current_select_v1 on public.birth_profiles;
create policy birth_profiles_api_current_select_v1
on public.birth_profiles
for select
to myeongha_api_executor
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists birth_profile_revisions_api_current_select_v1
on public.birth_profile_revisions;
create policy birth_profile_revisions_api_current_select_v1
on public.birth_profile_revisions
for select
to myeongha_api_executor
using (subject_id = public.current_myeongha_subject_id());

-- SECURITY INVOKER projection access is deliberately column-scoped. In particular,
-- input_hash is not granted because GET /api/birth-profiles/:id does not expose it.
grant select (
  id,
  subject_id,
  profile_kind,
  label,
  current_revision_id,
  archived_at,
  created_at,
  updated_at
)
on public.birth_profiles
to myeongha_api_executor;

grant select (
  id,
  birth_profile_id,
  subject_id,
  revision_no,
  calendar_type,
  birth_date,
  birth_time,
  time_known,
  is_leap_month,
  sex,
  created_at
)
on public.birth_profile_revisions
to myeongha_api_executor;

revoke all on function public.qry_birth_profile_current_revision_v1(uuid, uuid) from public;
grant execute on function public.qry_birth_profile_current_revision_v1(uuid, uuid)
to myeongha_api_executor;
