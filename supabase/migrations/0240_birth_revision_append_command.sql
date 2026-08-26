-- MyeongHa birth profile revision append authority.
--
-- PATCH semantics are append-only: lock the logical birth profile, verify the exact
-- current revision precondition, allocate revision_no from that current revision,
-- insert one immutable revision, then advance current_revision_id in the same tx.
--
-- SRC-06 remains open. This command does not define standalone Birth/Target privacy
-- deletion semantics. P0-AUTH-01 also remains open; SECURITY INVOKER is retained and
-- PUBLIC EXECUTE is revoked until the API -> PostgreSQL execution identity is fixed.

create or replace function public.cmd_append_birth_profile_revision_v1(
  p_subject_id uuid,
  p_birth_profile_id uuid,
  p_expected_current_revision_id uuid,
  p_revision_id uuid,
  p_calendar_type text,
  p_birth_date date,
  p_birth_time time,
  p_time_known boolean,
  p_is_leap_month boolean,
  p_sex text,
  p_input_hash text
)
returns table (
  birth_profile_id uuid,
  revision_id uuid,
  revision_no integer,
  replayed boolean
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_current_revision_id uuid;
  v_expected_revision_no integer;
  v_existing_revision_no integer;
  v_existing_calendar_type text;
  v_existing_birth_date date;
  v_existing_birth_time time;
  v_existing_time_known boolean;
  v_existing_is_leap_month boolean;
  v_existing_sex text;
  v_existing_input_hash text;
  v_previous_revision_id uuid;
  v_new_revision_no integer;
  v_now timestamptz := clock_timestamp();
begin
  if p_expected_current_revision_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_birth_revision_expected_required',
      message = 'expected current birth revision id is required';
  end if;

  if p_revision_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_birth_revision_id_required',
      message = 'new birth revision id is required';
  end if;

  if p_input_hash is null or btrim(p_input_hash) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_birth_revision_input_hash_required',
      message = 'canonical birth input hash is required';
  end if;

  select bp.current_revision_id
    into v_current_revision_id
  from public.birth_profiles bp
  where bp.id = p_birth_profile_id
    and bp.subject_id = p_subject_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_birth_revision_profile_not_found',
      message = 'birth profile was not found for this subject';
  end if;

  -- Response-loss retry after a successful append: the caller supplies the same
  -- deterministic revision id and canonical input. Return the authoritative row
  -- instead of treating the now-stale expected pointer as a second mutation.
  if v_current_revision_id = p_revision_id then
    select br.revision_no,
           br.calendar_type,
           br.birth_date,
           br.birth_time,
           br.time_known,
           br.is_leap_month,
           br.sex,
           br.input_hash
      into v_existing_revision_no,
           v_existing_calendar_type,
           v_existing_birth_date,
           v_existing_birth_time,
           v_existing_time_known,
           v_existing_is_leap_month,
           v_existing_sex,
           v_existing_input_hash
    from public.birth_profile_revisions br
    where br.id = p_revision_id
      and br.birth_profile_id = p_birth_profile_id
      and br.subject_id = p_subject_id;

    if not found then
      raise exception using
        errcode = '23514',
        constraint = 'cmd_birth_revision_current_pointer_inconsistent',
        message = 'birth profile current revision pointer is inconsistent';
    end if;

    select prev.id
      into v_previous_revision_id
    from public.birth_profile_revisions prev
    where prev.birth_profile_id = p_birth_profile_id
      and prev.subject_id = p_subject_id
      and prev.revision_no = v_existing_revision_no - 1;

    if v_existing_revision_no <= 1
       or v_previous_revision_id is distinct from p_expected_current_revision_id
       or row(
            v_existing_calendar_type,
            v_existing_birth_date,
            v_existing_birth_time,
            v_existing_time_known,
            v_existing_is_leap_month,
            v_existing_sex,
            v_existing_input_hash
          ) is distinct from row(
            p_calendar_type,
            p_birth_date,
            p_birth_time,
            p_time_known,
            p_is_leap_month,
            p_sex,
            p_input_hash
          ) then
      raise exception using
        errcode = '23505',
        constraint = 'cmd_birth_revision_replay_conflict',
        message = 'birth revision id already represents a different append request';
    end if;

    return query
      select p_birth_profile_id, p_revision_id, v_existing_revision_no, true;
    return;
  end if;

  select br.revision_no
    into v_expected_revision_no
  from public.birth_profile_revisions br
  where br.id = p_expected_current_revision_id
    and br.birth_profile_id = p_birth_profile_id
    and br.subject_id = p_subject_id;

  if not found
     or v_current_revision_id is distinct from p_expected_current_revision_id then
    raise exception using
      errcode = '40001',
      constraint = 'cmd_birth_revision_revision_conflict',
      message = 'birth profile current revision does not match expected revision';
  end if;

  v_new_revision_no := v_expected_revision_no + 1;

  insert into public.birth_profile_revisions(
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
    input_hash,
    created_at
  ) values (
    p_revision_id,
    p_birth_profile_id,
    p_subject_id,
    v_new_revision_no,
    p_calendar_type,
    p_birth_date,
    p_birth_time,
    p_time_known,
    p_is_leap_month,
    p_sex,
    p_input_hash,
    v_now
  );

  update public.birth_profiles bp
  set current_revision_id = p_revision_id,
      updated_at = v_now
  where bp.id = p_birth_profile_id
    and bp.subject_id = p_subject_id;

  return query
    select p_birth_profile_id, p_revision_id, v_new_revision_no, false;
end;
$$;

revoke all on function public.cmd_append_birth_profile_revision_v1(
  uuid, uuid, uuid, uuid, text, date, time, boolean, boolean, text, text
) from public;
