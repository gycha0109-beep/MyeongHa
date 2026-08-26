-- User-owned revocation commands for public share artifacts and push installations.
--
-- Authority:
-- - API_CONTRACT §12 DELETE /api/share-artifacts/:id => revoke
-- - API_CONTRACT §15 POST /api/device-installations/:id/revoke
-- - NOTIFICATION_RETURN_LOOP_SPEC: revoked installation cannot receive new provider attempts
-- - share/device historical provenance remains intact; no destructive privacy delete here
--
-- P0-AUTH-01 remains unresolved: SECURITY INVOKER + PUBLIC EXECUTE revoked.

create or replace function public.cmd_revoke_share_artifact_v1(
  p_subject_id uuid,
  p_share_artifact_id uuid
)
returns table (
  share_artifact_id uuid,
  effective_status text,
  revoked_at timestamptz,
  replayed boolean
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_revoked_at timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  if p_subject_id is null or p_share_artifact_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_share_revoke_ids_required',
      message = 'subject and share artifact ids are required';
  end if;

  select sa.status, sa.revoked_at
    into v_status, v_revoked_at
  from public.share_artifacts sa
  where sa.id = p_share_artifact_id
    and sa.subject_id = p_subject_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_share_revoke_not_found',
      message = 'share artifact was not found for this subject';
  end if;

  if v_status = 'revoked' then
    return query select p_share_artifact_id, v_status, v_revoked_at, true;
    return;
  end if;

  -- Expired is already a terminal non-public state. Existing lifecycle authority forbids
  -- changing one terminal state into another, so DELETE/revoke is an idempotent no-op.
  if v_status = 'expired' then
    return query select p_share_artifact_id, v_status, v_revoked_at, true;
    return;
  end if;

  if v_status is distinct from 'active' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_share_revoke_state_invalid',
      message = 'share artifact is not in a revocable state';
  end if;

  update public.share_artifacts sa
  set status = 'revoked',
      revoked_at = v_now
  where sa.id = p_share_artifact_id
    and sa.subject_id = p_subject_id;

  return query select p_share_artifact_id, 'revoked'::text, v_now, false;
end;
$$;

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
  v_revoked_at timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  if p_subject_id is null or p_installation_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_device_revoke_ids_required',
      message = 'subject and installation ids are required';
  end if;

  select di.revoked_at
    into v_revoked_at
  from public.device_installations di
  where di.id = p_installation_id
    and di.subject_id = p_subject_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_device_revoke_not_found',
      message = 'device installation was not found for this subject';
  end if;

  if v_revoked_at is not null then
    return query select p_installation_id, v_revoked_at, true;
    return;
  end if;

  -- Revocation is the immediate authorization boundary. Token ciphertext/fingerprint and
  -- historical delivery provenance remain stored until a governed retention/deletion phase.
  update public.device_installations di
  set revoked_at = v_now
  where di.id = p_installation_id
    and di.subject_id = p_subject_id;

  return query select p_installation_id, v_now, false;
end;
$$;

revoke all on function public.cmd_revoke_share_artifact_v1(uuid, uuid) from public;
revoke all on function public.cmd_revoke_device_installation_v1(uuid, uuid) from public;
