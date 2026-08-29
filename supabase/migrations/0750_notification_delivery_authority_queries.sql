-- MyeongHa source-stored notification delivery authority projections.
--
-- ERD v0.6 defines `notification_deliveries` as the current logical delivery
-- state for one notification x installation and `notification_delivery_attempts`
-- as the provenance ledger for actual provider send attempts.
--
-- These projections expose only those persisted authorities. They do NOT infer
-- whether a failed delivery is retriable, compute retry/backoff/dead-letter
-- policy, claim provider exactly-once delivery, synthesize device eligibility,
-- or decide final notification inbox membership (SRC-13).
-- Revoked installations and terminal/cancelled historical delivery rows are not
-- hidden: lifecycle interpretation remains with the governed caller.
--
-- P0-AUTH-01 remains unresolved. SECURITY INVOKER is retained and PUBLIC EXECUTE
-- is revoked until the API/worker -> PostgreSQL execution identity is fixed.

create or replace function public.qry_notification_deliveries_v1(
  p_subject_id uuid,
  p_notification_id uuid
)
returns table (
  delivery_id uuid,
  notification_id uuid,
  installation_id uuid,
  delivery_status text,
  next_attempt_no integer,
  last_provider_message_ref text,
  last_error_code text,
  sent_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_subject_id is null or p_notification_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_notification_deliveries_identity_required',
      message = 'notification delivery subject and notification are required';
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
      constraint = 'qry_notification_deliveries_subject_ineligible',
      message = 'notification delivery read requires an active canonical subject';
  end if;

  if not exists (
    select 1
    from public.notifications n
    where n.id = p_notification_id
      and n.subject_id = p_subject_id
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_notification_deliveries_notification_not_found',
      message = 'notification was not found for this subject';
  end if;

  return query
  select
    nd.id,
    nd.notification_id,
    nd.installation_id,
    nd.status,
    nd.next_attempt_no,
    nd.last_provider_message_ref,
    nd.last_error_code,
    nd.sent_at,
    nd.created_at,
    nd.updated_at
  from public.notification_deliveries nd
  where nd.subject_id = p_subject_id
    and nd.notification_id = p_notification_id;
end;
$$;

create or replace function public.qry_notification_delivery_attempts_v1(
  p_subject_id uuid,
  p_delivery_id uuid
)
returns table (
  attempt_id uuid,
  delivery_id uuid,
  attempt_no integer,
  provider text,
  attempt_status text,
  provider_message_ref text,
  error_code text,
  started_at timestamptz,
  finished_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_subject_id is null or p_delivery_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_notification_delivery_attempts_identity_required',
      message = 'notification delivery attempt subject and delivery are required';
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
      constraint = 'qry_notification_delivery_attempts_subject_ineligible',
      message = 'notification delivery attempt read requires an active canonical subject';
  end if;

  if not exists (
    select 1
    from public.notification_deliveries nd
    where nd.id = p_delivery_id
      and nd.subject_id = p_subject_id
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_notification_delivery_attempts_delivery_not_found',
      message = 'notification delivery was not found for this subject';
  end if;

  return query
  select
    nda.id,
    nda.delivery_id,
    nda.attempt_no,
    nda.provider,
    nda.status,
    nda.provider_message_ref,
    nda.error_code,
    nda.started_at,
    nda.finished_at
  from public.notification_delivery_attempts nda
  where nda.subject_id = p_subject_id
    and nda.delivery_id = p_delivery_id;
end;
$$;

revoke execute on function public.qry_notification_deliveries_v1(uuid, uuid) from public;
revoke execute on function public.qry_notification_delivery_attempts_v1(uuid, uuid) from public;
