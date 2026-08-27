-- MyeongHa Target Person current projection reads.
--
-- API_CONTRACT §10 defines owner-scoped Target Person list/detail reads. Target Person
-- metadata is not a social graph authority; the linked Birth Profile remains a private,
-- immutable-revision record owned by the same subject.
--
-- Only non-deleted Target Person rows are part of the current projection. The queries do
-- not define the Target Person deletion workflow, do not erase linked Birth revisions,
-- and do not decide how historical compatibility Readings pinned to those revisions are
-- retained. SRC-06 therefore remains open.
--
-- Exact current Birth input is exposed for the owner-facing edit/reading flow; historical
-- Birth inputs and input_hash provenance are not projected.
--
-- P0-AUTH-01 remains unresolved. SECURITY INVOKER is retained and PUBLIC EXECUTE is
-- revoked until the API -> PostgreSQL execution identity is fixed.

create or replace function public.qry_target_persons_v1(
  p_subject_id uuid
)
returns table (
  target_person_id uuid,
  display_label text,
  relationship_label text,
  birth_profile_id uuid,
  current_birth_revision_id uuid,
  current_revision_no integer,
  current_calendar_type text,
  current_birth_date date,
  current_birth_time time,
  current_time_known boolean,
  current_is_leap_month boolean,
  current_sex text,
  target_created_at timestamptz
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
      constraint = 'qry_target_person_subject_required',
      message = 'target person subject is required';
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
      constraint = 'qry_target_person_subject_ineligible',
      message = 'target person read requires an active canonical subject';
  end if;

  return query
  select
    tp.id,
    tp.display_label,
    tp.relationship_label,
    tp.birth_profile_id,
    bp.current_revision_id,
    current_rev.revision_no,
    current_rev.calendar_type,
    current_rev.birth_date,
    current_rev.birth_time,
    current_rev.time_known,
    current_rev.is_leap_month,
    current_rev.sex,
    tp.created_at
  from public.target_person_profiles tp
  join public.birth_profiles bp
    on bp.id = tp.birth_profile_id
   and bp.subject_id = tp.subject_id
   and bp.profile_kind = 'target'
  left join public.birth_profile_revisions current_rev
    on current_rev.id = bp.current_revision_id
   and current_rev.birth_profile_id = bp.id
   and current_rev.subject_id = bp.subject_id
  where tp.subject_id = p_subject_id
    and tp.deleted_at is null
  order by tp.created_at desc, tp.id;
end;
$$;

create or replace function public.qry_target_person_v1(
  p_subject_id uuid,
  p_target_person_id uuid
)
returns table (
  target_person_id uuid,
  display_label text,
  relationship_label text,
  birth_profile_id uuid,
  current_birth_revision_id uuid,
  current_revision_no integer,
  current_calendar_type text,
  current_birth_date date,
  current_birth_time time,
  current_time_known boolean,
  current_is_leap_month boolean,
  current_sex text,
  target_created_at timestamptz
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
      constraint = 'qry_target_person_subject_required',
      message = 'target person subject is required';
  end if;

  if p_target_person_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_target_person_id_required',
      message = 'target person id is required';
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
      constraint = 'qry_target_person_subject_ineligible',
      message = 'target person read requires an active canonical subject';
  end if;

  if not exists (
    select 1
    from public.target_person_profiles tp
    where tp.id = p_target_person_id
      and tp.subject_id = p_subject_id
      and tp.deleted_at is null
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_target_person_unavailable',
      message = 'target person was not found for this subject';
  end if;

  return query
  select *
  from public.qry_target_persons_v1(p_subject_id) q
  where q.target_person_id = p_target_person_id;
end;
$$;

revoke execute on function public.qry_target_persons_v1(uuid) from public;
revoke execute on function public.qry_target_person_v1(uuid, uuid) from public;
