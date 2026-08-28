-- MyeongHa current product-profile patch authority.
--
-- API_CONTRACT §7 permits PATCH /api/me/profile to use an updatedAt precondition.
-- GET /api/me already exposes profileUpdatedAt, so this command uses that timestamp as
-- the optimistic concurrency token. A missing profile is materialized only when the
-- expected timestamp is null; an existing profile requires an exact timestamp match.
--
-- V1 exposes only user-editable displayName/locale/timezone. onboarding_state remains
-- server-owned product workflow state and is deliberately preserved. JSON Patch input is
-- bounded to these three keys so omitted and explicit-null fields remain distinguishable.
--
-- Current identity eligibility matches GET /api/me: active guests plus active or
-- deletion-pending canonical members. P0-AUTH-01 remains open; SECURITY INVOKER and
-- PUBLIC EXECUTE revocation keep trusted subject resolution at the API boundary.

create or replace function public.cmd_patch_profile_v1(
  p_subject_id uuid,
  p_expected_updated_at timestamptz,
  p_patch_jsonb jsonb
)
returns table (
  subject_id uuid,
  display_name text,
  locale text,
  timezone text,
  onboarding_state text,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_subject_kind text;
  v_subject_status text;
  v_merged_into_subject_id uuid;
  v_current public.profiles%rowtype;
  v_now timestamptz;
begin
  if p_subject_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_profile_patch_subject_required',
      message = 'profile patch subject is required';
  end if;

  if p_patch_jsonb is null or jsonb_typeof(p_patch_jsonb) is distinct from 'object' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_profile_patch_object_required',
      message = 'profile patch must be a JSON object';
  end if;

  if p_patch_jsonb = '{}'::jsonb then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_profile_patch_nonempty_required',
      message = 'profile patch must contain at least one supported field';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_patch_jsonb) as k(key)
    where k.key not in ('displayName', 'locale', 'timezone')
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_profile_patch_unknown_field',
      message = 'profile patch contains an unsupported field';
  end if;

  if (p_patch_jsonb ? 'displayName'
      and p_patch_jsonb -> 'displayName' <> 'null'::jsonb
      and jsonb_typeof(p_patch_jsonb -> 'displayName') <> 'string')
     or (p_patch_jsonb ? 'locale'
      and p_patch_jsonb -> 'locale' <> 'null'::jsonb
      and jsonb_typeof(p_patch_jsonb -> 'locale') <> 'string')
     or (p_patch_jsonb ? 'timezone'
      and p_patch_jsonb -> 'timezone' <> 'null'::jsonb
      and jsonb_typeof(p_patch_jsonb -> 'timezone') <> 'string') then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_profile_patch_field_type',
      message = 'profile patch fields must be strings or null';
  end if;

  select s.kind, s.status, s.merged_into_subject_id
    into v_subject_kind, v_subject_status, v_merged_into_subject_id
  from public.subjects s
  where s.id = p_subject_id
  for share;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_profile_patch_subject_not_found',
      message = 'profile patch subject was not found';
  end if;

  if v_merged_into_subject_id is not null
     or not (
       (v_subject_kind = 'guest' and v_subject_status = 'active')
       or (v_subject_kind = 'member' and v_subject_status in ('active', 'deletion_pending'))
     ) then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_profile_patch_subject_ineligible',
      message = 'profile patch requires a current canonical guest or member subject';
  end if;

  select p.*
    into v_current
  from public.profiles p
  where p.subject_id = p_subject_id
  for update;

  if found then
    if p_expected_updated_at is null
       or v_current.updated_at is distinct from p_expected_updated_at then
      raise exception using
        errcode = '40001',
        constraint = 'cmd_profile_patch_revision_conflict',
        message = 'profile updatedAt does not match expected value';
    end if;

    v_now := greatest(clock_timestamp(), v_current.updated_at + interval '1 microsecond');

    update public.profiles p
    set display_name = case
          when p_patch_jsonb ? 'displayName' then p_patch_jsonb ->> 'displayName'
          else p.display_name
        end,
        locale = case
          when p_patch_jsonb ? 'locale' then p_patch_jsonb ->> 'locale'
          else p.locale
        end,
        timezone = case
          when p_patch_jsonb ? 'timezone' then p_patch_jsonb ->> 'timezone'
          else p.timezone
        end,
        updated_at = v_now
    where p.subject_id = p_subject_id
    returning p.subject_id, p.display_name, p.locale, p.timezone, p.onboarding_state, p.updated_at
      into subject_id, display_name, locale, timezone, onboarding_state, updated_at;

    return next;
    return;
  end if;

  if p_expected_updated_at is not null then
    raise exception using
      errcode = '40001',
      constraint = 'cmd_profile_patch_revision_conflict',
      message = 'profile updatedAt does not match expected value';
  end if;

  v_now := clock_timestamp();

  begin
    insert into public.profiles(
      subject_id,
      display_name,
      locale,
      timezone,
      onboarding_state,
      created_at,
      updated_at
    ) values (
      p_subject_id,
      case when p_patch_jsonb ? 'displayName' then p_patch_jsonb ->> 'displayName' else null end,
      case when p_patch_jsonb ? 'locale' then p_patch_jsonb ->> 'locale' else null end,
      case when p_patch_jsonb ? 'timezone' then p_patch_jsonb ->> 'timezone' else null end,
      null,
      v_now,
      v_now
    )
    returning profiles.subject_id,
              profiles.display_name,
              profiles.locale,
              profiles.timezone,
              profiles.onboarding_state,
              profiles.updated_at
      into subject_id, display_name, locale, timezone, onboarding_state, updated_at;
  exception
    when unique_violation then
      raise exception using
        errcode = '40001',
        constraint = 'cmd_profile_patch_revision_conflict',
        message = 'profile was created concurrently; refresh current profile before retry';
  end;

  return next;
end;
$$;

revoke all on function public.cmd_patch_profile_v1(uuid, timestamptz, jsonb) from public;
