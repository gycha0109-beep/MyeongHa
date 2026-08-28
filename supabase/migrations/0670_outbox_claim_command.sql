-- Transactional outbox worker lease claim/reclaim boundary.
--
-- Source authority:
-- - ERD v0.6 outbox_events: pending/processing states, available_at, lock ownership,
--   lease expiry, and explicit negative test `expired outbox processing lease -> reclaim`.
-- - Use Case §21.6: domain transaction + outbox_event -> async publisher.
--
-- Deliberately NOT defined here because source does not specify those policies:
-- - failed-event retry/backoff
-- - attempt_count increment point
-- - processed/failure finalization
-- - dead-letter threshold/policy
-- - batch discovery/ordering
--
-- P0-AUTH-01 remains unresolved: SECURITY INVOKER + PUBLIC EXECUTE revoked.

create or replace function public.cmd_claim_outbox_event_v1(
  p_outbox_event_id uuid,
  p_lock_owner text,
  p_lease_expires_at timestamptz
)
returns table (
  outbox_event_id uuid,
  aggregate_type text,
  aggregate_id text,
  event_type text,
  event_schema_version text,
  dedupe_key text,
  payload_jsonb jsonb,
  status text,
  locked_at timestamptz,
  lock_owner text,
  lease_expires_at timestamptz,
  attempt_count integer,
  reclaimed boolean
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_row public.outbox_events%rowtype;
  v_reclaimed boolean := false;
begin
  if p_outbox_event_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_outbox_claim_event_id_required',
      message = 'outbox event id is required';
  end if;

  if p_lock_owner is null or btrim(p_lock_owner) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_outbox_claim_owner_required',
      message = 'outbox lock owner is required';
  end if;

  if p_lease_expires_at is null or p_lease_expires_at <= v_now then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_outbox_claim_future_lease_required',
      message = 'outbox lease expiry must be in the future';
  end if;

  select oe.*
    into v_row
  from public.outbox_events oe
  where oe.id = p_outbox_event_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_outbox_claim_not_found',
      message = 'outbox event was not found';
  end if;

  if v_row.status = 'pending' then
    if v_row.available_at > v_now then
      raise exception using
        errcode = 'P0001',
        constraint = 'cmd_outbox_claim_not_available',
        message = 'outbox event is not available yet';
    end if;
    v_reclaimed := false;
  elsif v_row.status = 'processing' then
    if v_row.lock_owner is null or v_row.lease_expires_at is null then
      raise exception using
        errcode = '23514',
        constraint = 'cmd_outbox_claim_processing_lease_invalid',
        message = 'processing outbox event has invalid lease state';
    end if;

    if v_row.lease_expires_at > v_now then
      raise exception using
        errcode = 'P0001',
        constraint = 'cmd_outbox_claim_lease_active',
        message = 'outbox event lease is still active';
    end if;
    v_reclaimed := true;
  else
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_outbox_claim_state_ineligible',
      message = 'outbox event state is not claimable by this command';
  end if;

  update public.outbox_events oe
  set status = 'processing',
      locked_at = v_now,
      lock_owner = btrim(p_lock_owner),
      lease_expires_at = p_lease_expires_at
  where oe.id = p_outbox_event_id
  returning oe.* into v_row;

  return query
  select
    v_row.id,
    v_row.aggregate_type,
    v_row.aggregate_id,
    v_row.event_type,
    v_row.event_schema_version,
    v_row.dedupe_key,
    v_row.payload_jsonb,
    v_row.status,
    v_row.locked_at,
    v_row.lock_owner,
    v_row.lease_expires_at,
    v_row.attempt_count,
    v_reclaimed;
end;
$$;

revoke execute on function public.cmd_claim_outbox_event_v1(uuid, text, timestamptz) from public;
