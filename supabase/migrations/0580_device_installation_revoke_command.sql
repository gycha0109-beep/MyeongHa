-- MyeongHa Device Installation standalone revoke authority.
--
-- API_CONTRACT §15 exposes POST /api/device-installations/:id/revoke.
-- NOTIFICATION_RETURN_LOOP_SPEC §5 defines revoked installations as ineligible for new
-- delivery, while AUTH_RLS_PRIVACY_SPEC keeps installation ownership subject-scoped.
--
-- This command is intentionally a revocation boundary only: encrypted token material,
-- existing notification deliveries, and provider-attempt provenance are not rewritten.
-- Account deletion retains its own broader lifecycle transaction. P0-AUTH-01 remains open.

create or replace function public.cmd_revoke_device_installation_v1(
  p_subject_id uuid,
  p_installation_id uuid
)
returns table (
  installation_id uuid,
  revoked_at timestamptz,
  replayed boolean
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_subject_status text;
  v_merged_into_subject_id uuid;
  v_existing_revoked_at timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  if p_subject_id is null or p_installation_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_device_installation_revoke_ids_required',
      message = 'subject and installation ids are required';
  end if;

  -- A standalone user command only operates on an active canonical owner. Account deletion
  -- performs its own installation revocation inside the deletion lifecycle transaction.
  select s.status, s.merged_into_subject_id
    into v_subject_status, v_merged_into_subject_id
  from public.subjects s
  where s.id = p_subject_id
  for share;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_device_installation_revoke_subject_not_found',
      message = 'subject was not found';
  end if;

  if v_subject_status <> 'active' or v_merged_into_subject_id is not null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_device_installation_revoke_subject_not_canonical',
      message = 'device installation revoke requires an active canonical subject';
  end if;

  select di.revoked_at
    into v_existing_revoked_at
  from public.device_installations di
  where di.id = p_installation_id
    and di.subject_id = p_subject_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_device_installation_revoke_not_found',
      message = 'device installation was not found for this subject';
  end if;

  if v_existing_revoked_at is not null then
    return query select p_installation_id, v_existing_revoked_at, true;
    return;
  end if;

  update public.device_installations di
  set revoked_at = v_now
  where di.id = p_installation_id
    and di.subject_id = p_subject_id;

  return query select p_installation_id, v_now, false;
end;
$$;

revoke all on function public.cmd_revoke_device_installation_v1(uuid, uuid) from public;
