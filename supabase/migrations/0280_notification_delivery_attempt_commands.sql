-- MyeongHa notification provider-send attempt authority.
--
-- Implements SERVER_COMMAND_TRANSACTION_SPEC §19 and NOTIFICATION_RETURN_LOOP_SPEC §11.
-- Provider calls remain outside DB transactions. This ledger does not claim provider
-- exactly-once delivery: an ambiguous crash after a provider accepted a send can still
-- require transport-specific reconciliation outside this DB command boundary.
--
-- P0-AUTH-01 remains unresolved. SECURITY INVOKER is retained and PUBLIC EXECUTE is
-- revoked until the API/worker -> PostgreSQL execution identity is fixed.

create or replace function public.cmd_prepare_notification_delivery_attempt_v1(
  p_subject_id uuid,
  p_delivery_id uuid,
  p_attempt_id uuid,
  p_provider text
)
returns table (
  attempt_id uuid,
  attempt_no integer,
  attempt_status text,
  replayed boolean
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_delivery_status text;
  v_next_attempt_no integer;
  v_notification_id uuid;
  v_installation_id uuid;
  v_subject_status text;
  v_notification_status text;
  v_installation_revoked_at timestamptz;
  v_push_token_encrypted text;
  v_existing_delivery_id uuid;
  v_existing_subject_id uuid;
  v_existing_attempt_no integer;
  v_existing_status text;
  v_existing_provider text;
  v_running_attempt_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if p_subject_id is null or p_delivery_id is null or p_attempt_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_notification_delivery_attempt_identity_required',
      message = 'notification delivery attempt subject/delivery/id is required';
  end if;

  if p_provider is null or btrim(p_provider) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_notification_delivery_provider_required',
      message = 'notification delivery provider identity is required';
  end if;

  -- notification_delivery is the allocator/serialization authority.
  select nd.status,
         nd.next_attempt_no,
         nd.notification_id,
         nd.installation_id
    into v_delivery_status,
         v_next_attempt_no,
         v_notification_id,
         v_installation_id
  from public.notification_deliveries nd
  where nd.id = p_delivery_id
    and nd.subject_id = p_subject_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_notification_delivery_not_found',
      message = 'notification delivery was not found for this subject';
  end if;

  -- Exact caller retry replays the already-authoritative attempt and never allocates again.
  select nda.delivery_id,
         nda.subject_id,
         nda.attempt_no,
         nda.status,
         nda.provider
    into v_existing_delivery_id,
         v_existing_subject_id,
         v_existing_attempt_no,
         v_existing_status,
         v_existing_provider
  from public.notification_delivery_attempts nda
  where nda.id = p_attempt_id;

  if found then
    if v_existing_delivery_id is distinct from p_delivery_id
       or v_existing_subject_id is distinct from p_subject_id
       or v_existing_provider is distinct from p_provider then
      raise exception using
        errcode = '23505',
        constraint = 'cmd_notification_delivery_attempt_replay_conflict',
        message = 'notification attempt id already represents a different provider send';
    end if;

    return query
      select p_attempt_id,
             v_existing_attempt_no,
             v_existing_status,
             true;
    return;
  end if;

  if v_delivery_status = 'sent' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_notification_delivery_already_sent',
      message = 'sent logical notification delivery cannot allocate another provider attempt';
  end if;

  if v_delivery_status = 'cancelled' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_notification_delivery_cancelled',
      message = 'cancelled logical notification delivery cannot allocate another provider attempt';
  end if;

  if v_delivery_status = 'sending' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_notification_delivery_attempt_in_flight',
      message = 'another provider send attempt is already running for this delivery';
  end if;

  select s.status
    into v_subject_status
  from public.subjects s
  where s.id = p_subject_id;

  if v_subject_status is distinct from 'active' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_notification_delivery_subject_ineligible',
      message = 'notification provider send requires an active canonical subject';
  end if;

  select n.status
    into v_notification_status
  from public.notifications n
  where n.id = v_notification_id
    and n.subject_id = p_subject_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_notification_delivery_notification_not_found',
      message = 'notification authority row was not found';
  end if;

  if v_notification_status in ('cancelled', 'expired') then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_notification_delivery_notification_ineligible',
      message = 'cancelled or expired notification cannot allocate another provider attempt';
  end if;

  select di.revoked_at,
         di.push_token_encrypted
    into v_installation_revoked_at,
         v_push_token_encrypted
  from public.device_installations di
  where di.id = v_installation_id
    and di.subject_id = p_subject_id;

  if not found
     or v_installation_revoked_at is not null
     or v_push_token_encrypted is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_notification_delivery_installation_ineligible',
      message = 'notification installation is revoked or has no active push credential';
  end if;

  select nda.id
    into v_running_attempt_id
  from public.notification_delivery_attempts nda
  where nda.delivery_id = p_delivery_id
    and nda.subject_id = p_subject_id
    and nda.status = 'running'
  order by nda.attempt_no desc
  limit 1;

  if found then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_notification_delivery_attempt_in_flight',
      message = 'another provider send attempt is already running for this delivery';
  end if;

  insert into public.notification_delivery_attempts(
    id,
    delivery_id,
    subject_id,
    attempt_no,
    provider,
    status,
    provider_message_ref,
    error_code,
    started_at,
    finished_at
  ) values (
    p_attempt_id,
    p_delivery_id,
    p_subject_id,
    v_next_attempt_no,
    p_provider,
    'running',
    null,
    null,
    v_now,
    null
  );

  update public.notification_deliveries nd
  set status = 'sending',
      next_attempt_no = v_next_attempt_no + 1,
      updated_at = v_now
  where nd.id = p_delivery_id
    and nd.subject_id = p_subject_id;

  return query
    select p_attempt_id,
           v_next_attempt_no,
           'running'::text,
           false;
end;
$$;

create or replace function public.cmd_finalize_notification_delivery_attempt_sent_v1(
  p_subject_id uuid,
  p_delivery_id uuid,
  p_attempt_id uuid,
  p_provider_message_ref text
)
returns table (
  attempt_id uuid,
  attempt_no integer,
  delivery_status text,
  replayed boolean
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_delivery_status text;
  v_next_attempt_no integer;
  v_last_provider_message_ref text;
  v_attempt_no integer;
  v_attempt_status text;
  v_attempt_provider_message_ref text;
  v_now timestamptz := clock_timestamp();
begin
  select nd.status,
         nd.next_attempt_no,
         nd.last_provider_message_ref
    into v_delivery_status,
         v_next_attempt_no,
         v_last_provider_message_ref
  from public.notification_deliveries nd
  where nd.id = p_delivery_id
    and nd.subject_id = p_subject_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_notification_delivery_not_found',
      message = 'notification delivery was not found for this subject';
  end if;

  select nda.attempt_no,
         nda.status,
         nda.provider_message_ref
    into v_attempt_no,
         v_attempt_status,
         v_attempt_provider_message_ref
  from public.notification_delivery_attempts nda
  where nda.id = p_attempt_id
    and nda.delivery_id = p_delivery_id
    and nda.subject_id = p_subject_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_notification_delivery_attempt_not_found',
      message = 'notification delivery attempt was not found for this delivery';
  end if;

  if v_attempt_status <> 'running' then
    if v_attempt_status is distinct from 'sent'
       or v_attempt_provider_message_ref is distinct from p_provider_message_ref
       or v_delivery_status is distinct from 'sent'
       or v_last_provider_message_ref is distinct from p_provider_message_ref then
      raise exception using
        errcode = '23505',
        constraint = 'cmd_notification_delivery_sent_replay_conflict',
        message = 'terminal provider attempt does not match this sent result';
    end if;

    return query
      select p_attempt_id,
             v_attempt_no,
             'sent'::text,
             true;
    return;
  end if;

  if v_delivery_status <> 'sending'
     or v_attempt_no <> v_next_attempt_no - 1 then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_notification_delivery_attempt_not_current',
      message = 'only the current running provider attempt can mark delivery sent';
  end if;

  update public.notification_delivery_attempts nda
  set status = 'sent',
      provider_message_ref = p_provider_message_ref,
      error_code = null,
      finished_at = v_now
  where nda.id = p_attempt_id;

  update public.notification_deliveries nd
  set status = 'sent',
      last_provider_message_ref = p_provider_message_ref,
      last_error_code = null,
      sent_at = v_now,
      updated_at = v_now
  where nd.id = p_delivery_id
    and nd.subject_id = p_subject_id;

  return query
    select p_attempt_id,
           v_attempt_no,
           'sent'::text,
           false;
end;
$$;

create or replace function public.cmd_finalize_notification_delivery_attempt_failed_v1(
  p_subject_id uuid,
  p_delivery_id uuid,
  p_attempt_id uuid,
  p_error_code text,
  p_provider_message_ref text
)
returns table (
  attempt_id uuid,
  attempt_no integer,
  delivery_status text,
  replayed boolean
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_delivery_status text;
  v_next_attempt_no integer;
  v_last_error_code text;
  v_last_provider_message_ref text;
  v_attempt_no integer;
  v_attempt_status text;
  v_attempt_error_code text;
  v_attempt_provider_message_ref text;
  v_now timestamptz := clock_timestamp();
begin
  if p_error_code is null or btrim(p_error_code) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_notification_delivery_failure_code_required',
      message = 'notification provider failure code is required';
  end if;

  select nd.status,
         nd.next_attempt_no,
         nd.last_error_code,
         nd.last_provider_message_ref
    into v_delivery_status,
         v_next_attempt_no,
         v_last_error_code,
         v_last_provider_message_ref
  from public.notification_deliveries nd
  where nd.id = p_delivery_id
    and nd.subject_id = p_subject_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_notification_delivery_not_found',
      message = 'notification delivery was not found for this subject';
  end if;

  select nda.attempt_no,
         nda.status,
         nda.error_code,
         nda.provider_message_ref
    into v_attempt_no,
         v_attempt_status,
         v_attempt_error_code,
         v_attempt_provider_message_ref
  from public.notification_delivery_attempts nda
  where nda.id = p_attempt_id
    and nda.delivery_id = p_delivery_id
    and nda.subject_id = p_subject_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_notification_delivery_attempt_not_found',
      message = 'notification delivery attempt was not found for this delivery';
  end if;

  if v_attempt_status <> 'running' then
    if v_attempt_status is distinct from 'failed'
       or v_attempt_error_code is distinct from p_error_code
       or v_attempt_provider_message_ref is distinct from p_provider_message_ref
       or v_delivery_status is distinct from 'failed'
       or v_last_error_code is distinct from p_error_code
       or v_last_provider_message_ref is distinct from p_provider_message_ref then
      raise exception using
        errcode = '23505',
        constraint = 'cmd_notification_delivery_failed_replay_conflict',
        message = 'terminal provider attempt does not match this failed result';
    end if;

    return query
      select p_attempt_id,
             v_attempt_no,
             'failed'::text,
             true;
    return;
  end if;

  if v_delivery_status <> 'sending'
     or v_attempt_no <> v_next_attempt_no - 1 then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_notification_delivery_attempt_not_current',
      message = 'only the current running provider attempt can mark delivery failed';
  end if;

  update public.notification_delivery_attempts nda
  set status = 'failed',
      provider_message_ref = p_provider_message_ref,
      error_code = p_error_code,
      finished_at = v_now
  where nda.id = p_attempt_id;

  update public.notification_deliveries nd
  set status = 'failed',
      last_provider_message_ref = p_provider_message_ref,
      last_error_code = p_error_code,
      updated_at = v_now
  where nd.id = p_delivery_id
    and nd.subject_id = p_subject_id;

  return query
    select p_attempt_id,
           v_attempt_no,
           'failed'::text,
           false;
end;
$$;

revoke all on function public.cmd_prepare_notification_delivery_attempt_v1(
  uuid, uuid, uuid, text
) from public;

revoke all on function public.cmd_finalize_notification_delivery_attempt_sent_v1(
  uuid, uuid, uuid, text
) from public;

revoke all on function public.cmd_finalize_notification_delivery_attempt_failed_v1(
  uuid, uuid, uuid, text, text
) from public;
