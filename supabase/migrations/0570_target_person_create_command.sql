-- MyeongHa Target Person create authority.
--
-- API_CONTRACT §10 and UC-16 define one owner-scoped Target Person as metadata plus a
-- distinct target Birth Profile and its first immutable Birth revision. Target metadata
-- remains authoritative in target_person_profiles; birth_profiles.label is intentionally
-- left null to avoid a second mutable label authority.
--
-- The subject row is held FOR SHARE so lifecycle changes cannot race this command while
-- independent Target Person creates for the same subject remain concurrent. No target
-- cardinality, reverse lookup, invite, social-graph, or standalone deletion semantics are
-- introduced here. SRC-06 and P0-AUTH-01 remain open.

create or replace function public.cmd_create_target_person_v1(
  p_subject_id uuid,
  p_target_person_id uuid,
  p_birth_profile_id uuid,
  p_revision_id uuid,
  p_display_label text,
  p_relationship_label text,
  p_calendar_type text,
  p_birth_date date,
  p_birth_time time,
  p_time_known boolean,
  p_is_leap_month boolean,
  p_sex text,
  p_input_hash text
)
returns table (
  target_person_id uuid,
  birth_profile_id uuid,
  revision_id uuid,
  revision_no integer
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_subject_status text;
  v_merged_into_subject_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if p_subject_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_target_person_create_subject_required',
      message = 'subject id is required';
  end if;

  if p_target_person_id is null or p_birth_profile_id is null or p_revision_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_target_person_create_ids_required',
      message = 'target person, birth profile, and revision ids are required';
  end if;

  if p_input_hash is null or btrim(p_input_hash) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_target_person_create_input_hash_required',
      message = 'canonical birth input hash is required';
  end if;

  select s.status, s.merged_into_subject_id
    into v_subject_status, v_merged_into_subject_id
  from public.subjects s
  where s.id = p_subject_id
  for share;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_target_person_create_subject_not_found',
      message = 'subject was not found';
  end if;

  if v_subject_status <> 'active' or v_merged_into_subject_id is not null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_target_person_create_subject_not_canonical',
      message = 'target person create requires an active canonical subject';
  end if;

  insert into public.birth_profiles(
    id, subject_id, profile_kind, label, current_revision_id, archived_at, created_at, updated_at
  ) values (
    p_birth_profile_id, p_subject_id, 'target', null, null, null, v_now, v_now
  );

  insert into public.birth_profile_revisions(
    id, birth_profile_id, subject_id, revision_no, calendar_type, birth_date, birth_time,
    time_known, is_leap_month, sex, input_hash, created_at
  ) values (
    p_revision_id, p_birth_profile_id, p_subject_id, 1, p_calendar_type, p_birth_date, p_birth_time,
    p_time_known, p_is_leap_month, p_sex, p_input_hash, v_now
  );

  update public.birth_profiles bp
  set current_revision_id = p_revision_id,
      updated_at = v_now
  where bp.id = p_birth_profile_id
    and bp.subject_id = p_subject_id;

  insert into public.target_person_profiles(
    id, subject_id, birth_profile_id, display_label, relationship_label, created_at, deleted_at
  ) values (
    p_target_person_id, p_subject_id, p_birth_profile_id,
    p_display_label, p_relationship_label, v_now, null
  );

  return query
    select p_target_person_id, p_birth_profile_id, p_revision_id, 1;
end;
$$;

revoke all on function public.cmd_create_target_person_v1(
  uuid, uuid, uuid, uuid, text, text, text, date, time, boolean, boolean, text, text
) from public;
