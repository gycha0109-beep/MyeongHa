-- Transactional outbox successful-publication completion boundary.
--
-- Source authority:
-- - ERD v0.6 outbox_events defines processing ownership/lease state and
--   `status='processed' -> processed_at IS NOT NULL`.
-- - ERD negative test requires expired processing leases to be reclaimable.
-- - Use Case §21.6 requires an async publisher after the domain transaction.
--
-- This command intentionally covers only successful publication completion.
-- It does NOT define failed-event retry/backoff, attempt_count increment,
-- failure transition, dead-letter threshold/policy, or batch discovery order.
--
-- Completion preserves the claim's lock/lease fields as provenance. A stale
-- worker whose lease has expired cannot finalize the event; the row remains
-- reclaimable by cmd_claim_outbox_event_v1.
--
-- P0-AUTH-01 remains unresolved: SECURITY INVOKER + PUBLIC EXECUTE revoked.

create or replace function public.cmd_complete_outbox_event_v1(
  p_outbox_event_id uuid,
  p_lock_owner text
)
returns table (
  outbox_event_id uuid,
  status text,
  processed_at timestamptz,
  lock_owner text,
  lease_expires_at timestamptz,
  replayed boolean
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_owner text;
  v_row public.outbox_events%rowtype;
begin
  if p_outbox_event_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_outbox_complete_event_id_required',
      message = 'outbox event id is required';
  end if;

  if p_lock_owner is null or btrim(p_lock_owner) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_outbox_complete_owner_required',
      message = 'outbox lock owner is required';
  end if;

  v_owner := btrim(p_lock_owner);

  select oe.*
    into v_row
  from public.outbox_events oe
  where oe.id = p_outbox_event_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_outbox_complete_not_found',
      message = 'outbox event was not found';
  end if;

  -- Response-loss replay after a successful completion is read-only and may
  -- occur after the original lease clock has elapsed. Ownership still has to
  -- match the worker that held the successful claim.
  if v_row.status = 'processed' then
    if v_row.lock_owner is distinct from v_owner then
      raise exception using
        errcode = 'P0001',
        constraint = 'cmd_outbox_complete_owner_mismatch',
        message = 'outbox event is not owned by this worker';
    end if;

    if v_row.processed_at is null then
      raise exception using
        errcode = '23514',
        constraint = 'cmd_outbox_complete_processed_state_invalid',
        message = 'processed outbox event is missing processed_at';
    end if;

    return query
    select
      v_row.id,
      v_row.status,
      v_row.processed_at,
      v_row.lock_owner,
      v_row.lease_expires_at,
      true;
    return;
  end if;

  if v_row.status is distinct from 'processing' then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_outbox_complete_state_ineligible',
      message = 'outbox event state is not completable by this command';
  end if;

  if v_row.lock_owner is null or v_row.lease_expires_at is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_outbox_complete_processing_lease_invalid',
      message = 'processing outbox event has invalid lease state';
  end if;

  if v_row.lock_owner is distinct from v_owner then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_outbox_complete_owner_mismatch',
      message = 'outbox event is not owned by this worker';
  end if;

  if v_row.lease_expires_at <= v_now then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_outbox_complete_lease_expired',
      message = 'outbox event lease has expired';
  end if;

  update public.outbox_events oe
  set status = 'processed',
      processed_at = v_now
  where oe.id = p_outbox_event_id
  returning oe.* into v_row;

  return query
  select
    v_row.id,
    v_row.status,
    v_row.processed_at,
    v_row.lock_owner,
    v_row.lease_expires_at,
    false;
end;
$$;

revoke execute on function public.cmd_complete_outbox_event_v1(uuid, text) from public;
