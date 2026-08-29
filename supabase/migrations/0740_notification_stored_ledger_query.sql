-- MyeongHa source-stored logical notification ledger projection.
--
-- ERD v0.6 defines `notifications` as the subject-owned logical notification /
-- inbox-item authority and fully defines its stored fields and lifecycle values.
-- The source does NOT define which lifecycle states/timestamps belong in the
-- final GET /api/notifications inbox membership (SRC-13). This projection
-- therefore returns the subject's stored rows exactly as persisted and does not
-- apply status membership, scheduled-time visibility, unread selection, paging,
-- ranking, or presentation ordering semantics.
--
-- Provider delivery/open state remains separate in notification_deliveries and
-- notification_delivery_attempts and is intentionally not joined here.
-- Notification preference defaults/materialization remain blocked by SRC-12 and
-- are not synthesized by this query.
--
-- P0-AUTH-01 remains unresolved. SECURITY INVOKER is retained and PUBLIC EXECUTE
-- is revoked until the API -> PostgreSQL execution identity is fixed.

create or replace function public.qry_notification_stored_ledger_v1(
  p_subject_id uuid
)
returns table (
  notification_id uuid,
  category text,
  character_id text,
  content_bundle_id uuid,
  source_world_event_id uuid,
  template_key text,
  payload_jsonb jsonb,
  dedupe_key text,
  notification_status text,
  scheduled_at timestamptz,
  read_at timestamptz,
  created_at timestamptz
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
      constraint = 'qry_notification_stored_ledger_subject_required',
      message = 'notification ledger subject is required';
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
      constraint = 'qry_notification_stored_ledger_subject_ineligible',
      message = 'notification ledger read requires an active canonical subject';
  end if;

  return query
  select
    n.id,
    n.category,
    n.character_id,
    n.content_bundle_id,
    n.source_world_event_id,
    n.template_key,
    n.payload_jsonb,
    n.dedupe_key,
    n.status,
    n.scheduled_at,
    n.read_at,
    n.created_at
  from public.notifications n
  where n.subject_id = p_subject_id;
end;
$$;

revoke execute on function public.qry_notification_stored_ledger_v1(uuid) from public;
