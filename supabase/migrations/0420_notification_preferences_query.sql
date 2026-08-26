-- MyeongHa notification preference current-read authority.
--
-- API_CONTRACT §15 exposes GET /api/notification-preferences. The persistent
-- preference model is split across notification_settings (global/quiet-hours/
-- preview) and notification_preferences (bounded category overrides). These
-- queries expose only those stored current projections.
--
-- The schema defines no row-creation/default materialization contract, so a
-- missing settings row or missing category preference is returned as missing;
-- no default is fabricated here. Provider/OS permission state participates in
-- delivery eligibility but is not stored in these tables and is not invented.
--
-- P0-AUTH-01 remains unresolved. SECURITY INVOKER is retained and PUBLIC EXECUTE
-- is revoked until the API -> PostgreSQL execution identity is fixed.

create or replace function public.qry_notification_settings_v1(
  p_subject_id uuid
)
returns table (
  timezone_override text,
  quiet_start time,
  quiet_end time,
  preview_mode text,
  global_enabled boolean,
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
      constraint = 'qry_notification_settings_subject_required',
      message = 'notification settings subject is required';
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
      constraint = 'qry_notification_settings_subject_ineligible',
      message = 'notification preference read requires an active canonical subject';
  end if;

  return query
  select
    ns.timezone_override,
    ns.quiet_start,
    ns.quiet_end,
    ns.preview_mode,
    ns.global_enabled,
    ns.updated_at
  from public.notification_settings ns
  where ns.subject_id = p_subject_id;
end;
$$;

create or replace function public.qry_notification_preferences_v1(
  p_subject_id uuid
)
returns table (
  category text,
  enabled boolean,
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
      constraint = 'qry_notification_preferences_subject_required',
      message = 'notification preferences subject is required';
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
      constraint = 'qry_notification_preferences_subject_ineligible',
      message = 'notification preference read requires an active canonical subject';
  end if;

  return query
  select
    np.category,
    np.enabled,
    np.updated_at
  from public.notification_preferences np
  where np.subject_id = p_subject_id
  order by np.category;
end;
$$;

revoke execute on function public.qry_notification_settings_v1(uuid) from public;
revoke execute on function public.qry_notification_preferences_v1(uuid) from public;
