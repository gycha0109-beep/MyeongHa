-- MyeongHa notification inbox read-state authority.
--
-- Implements API_CONTRACT §15 and NOTIFICATION_RETURN_LOOP_SPEC §12 only.
-- `notifications.status=read` means the user read the logical inbox item; it is
-- intentionally independent from provider delivery/open analytics and does not
-- mutate notification_deliveries or provider-attempt provenance.
--
-- P0-AUTH-01 remains unresolved. SECURITY INVOKER is retained and PUBLIC EXECUTE
-- is revoked until the API -> PostgreSQL execution identity is fixed.

create or replace function public.cmd_mark_notification_read_v1(
  p_subject_id uuid,
  p_notification_id uuid
)
returns table (
  notification_id uuid,
  notification_status text,
  read_at timestamptz,
  replayed boolean
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_status text;
  v_read_at timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  if p_subject_id is null or p_notification_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_notification_read_identity_required',
      message = 'notification read subject/id is required';
  end if;

  select n.status,
         n.read_at
    into v_status,
         v_read_at
  from public.notifications n
  where n.id = p_notification_id
    and n.subject_id = p_subject_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_notification_read_not_found',
      message = 'notification was not found for this subject';
  end if;

  if v_status = 'read' then
    return query
      select p_notification_id,
             'read'::text,
             v_read_at,
             true;
    return;
  end if;

  if v_status in ('cancelled', 'expired') then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_notification_read_terminal',
      message = 'cancelled or expired notification cannot be marked read';
  end if;

  if v_status not in ('queued', 'ready') then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_notification_read_state_invalid',
      message = 'notification is not in a readable lifecycle state';
  end if;

  update public.notifications n
  set status = 'read',
      read_at = v_now
  where n.id = p_notification_id
    and n.subject_id = p_subject_id;

  return query
    select p_notification_id,
           'read'::text,
           v_now,
           false;
end;
$$;

revoke execute on function public.cmd_mark_notification_read_v1(uuid, uuid) from public;
